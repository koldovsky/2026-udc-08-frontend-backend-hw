import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** Ліміти на сервері; ті самі числа стоять у `maxlength` в index.html. */
export const TITLE_MAX = 200;
export const BODY_MAX = 10_000;

/**
 * Поля, які бачить клієнт. `user_id` сюди не входить навмисно: власник
 * нотатки — це деталь зберігання, клієнту він не потрібен, а віддавати його
 * означає розповідати про чужі рядки більше, ніж треба. Усі маршрути
 * віддають рівно цей набір — і тільки через `toNote`.
 */
const NOTE_COLUMNS = "id, title, body, archived, created_at";
const toNote = (row) => (row ? { ...row, archived: row.archived === 1 } : row);

/**
 * Канонічний додатний цілий id: "12" — так; "0", "012", "1e3", "0x1", " 1",
 * "+1", "1.0" — ні. `Number()` приймає всі ці варіанти, і тоді
 * `DELETE /api/notes/1e0` видаляє нотатку 1. Плюс `isSafeInteger`: 20 цифр
 * мовчки перетворюються на float.
 */
function parseId(raw) {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Ключі тіла, яких маршрут не просив. Обрізаємо список, щоб не відлунювати сміття. */
function unexpectedFields(body, allowed) {
  return Object.keys(body)
    .filter((k) => !allowed.includes(k))
    .slice(0, 5);
}

/**
 * Pretend session. A real app would verify a signed cookie or a JWT here;
 * that is deliberately out of scope — this workshop is about what happens
 * AFTER you know who the caller is. (CWE-862: заголовок контролює клієнт —
 * так задумано умовою; авторизація забезпечується `user_id` у КОЖНОМУ
 * запиті до бази, а не довірою до заголовка.)
 *
 * The caller identifies itself with the `x-user-id` header. Seeded users are
 * 1 (Оля) and 2 (Тарас). Користувач має існувати: інакше перший же POST
 * падає на FOREIGN KEY із 500 замість 401.
 */
function currentUser(db) {
  const exists = db.prepare("SELECT 1 FROM users WHERE id = ?");
  return (req, res, next) => {
    const id = parseId(req.header("x-user-id"));
    if (id === null || !exists.get(id)) {
      return res.status(401).json({ error: "not authenticated" });
    }
    req.userId = id;
    next();
  };
}

/** `?archived=` → умова для списку. Значення поза цим списком — 400. */
const LIST_FILTERS = new Map([
  ["false", "AND archived = 0"],
  ["0", "AND archived = 0"],
  ["true", "AND archived = 1"],
  ["1", "AND archived = 1"],
  ["all", ""],
]);

export function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(express.static(resolve(here, "../public")));

  // Prepared statements — один раз на застосунок.
  const q = {
    list: new Map(
      [...LIST_FILTERS].map(([key, where]) => [
        key,
        db.prepare(`SELECT ${NOTE_COLUMNS} FROM notes WHERE user_id = ? ${where} ORDER BY id`),
      ]),
    ),
    one: db.prepare(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ? AND user_id = ?`),
    insert: db.prepare("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)"),
    // Перевірка власника і читання результату — одним запитом: окремий
    // SELECT після UPDATE міг би не знайти рядок, якби його паралельно
    // видалили, і відповісти 500 замість 404.
    archive: db.prepare(
      `UPDATE notes SET archived = ? WHERE id = ? AND user_id = ? RETURNING ${NOTE_COLUMNS}`,
    ),
    remove: db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?"),
  };

  app.use("/api", currentUser(db));

  // List the caller's own notes. `?archived=true|false|all`, за замовчуванням
  // активні. Невідомі параметри — 400, щоб `?ARCHIVED=1` не повертав мовчки
  // активний список.
  app.get("/api/notes", (req, res) => {
    const unknown = Object.keys(req.query).filter((k) => k !== "archived");
    if (unknown.length) {
      return res.status(400).json({ error: `unknown query parameters: ${unknown.join(", ")}` });
    }
    const raw = req.query.archived ?? "false";
    if (typeof raw !== "string" || !LIST_FILTERS.has(raw)) {
      return res.status(400).json({ error: "archived must be true, false or all" });
    }
    res.json(q.list.get(raw).all(req.userId).map(toNote));
  });

  // Read one note — тільки свою. Межа даних задана в самому запиті
  // (`AND user_id = ?`), а не перевіркою вже дістаного рядка. Чужа нотатка
  // відповідає так само, як неіснуюча (404, не 403): 403 підтверджувало б,
  // що чужий рядок існує.
  app.get("/api/notes/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "id must be a positive integer" });

    const note = q.one.get(id, req.userId);
    if (!note) return res.status(404).json({ error: "not found" });
    res.json(toNote(note));
  });

  // Create a note for the caller. Власник — із сесії; `user_id` чи
  // `archived` у тілі — не «ігноруємо», а відхиляємо: клієнт має дізнатися,
  // що надіслав не те.
  app.post("/api/notes", (req, res) => {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: "body must be a JSON object" });
    }
    const extra = unexpectedFields(req.body, ["title", "body"]);
    if (extra.length) {
      return res.status(400).json({ error: `unexpected fields: ${extra.join(", ")}` });
    }
    if (typeof req.body.title !== "string" || !req.body.title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    const title = req.body.title.trim();
    const body = req.body.body ?? "";
    if (typeof body !== "string") {
      return res.status(400).json({ error: "body must be a string" });
    }
    if (title.length > TITLE_MAX) {
      return res.status(400).json({ error: `title must be at most ${TITLE_MAX} characters` });
    }
    if (body.length > BODY_MAX) {
      return res.status(400).json({ error: `body must be at most ${BODY_MAX} characters` });
    }

    const info = q.insert.run(req.userId, title, body);
    const created = q.one.get(info.lastInsertRowid, req.userId);
    res.status(201).json(toNote(created));
  });

  // Архівувати / повернути з архіву власну нотатку.
  // Тіло: { "archived": true | false }. Ідемпотентно: повторне архівування
  // вже архівованої — 200 з тим самим станом.
  app.patch("/api/notes/:id/archive", (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "id must be a positive integer" });

    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: "body must be a JSON object" });
    }
    const extra = unexpectedFields(req.body, ["archived"]);
    if (extra.length) {
      return res.status(400).json({ error: `unexpected fields: ${extra.join(", ")}` });
    }
    if (typeof req.body.archived !== "boolean") {
      return res.status(400).json({ error: "archived must be a boolean" });
    }

    const note = q.archive.get(req.body.archived ? 1 : 0, id, req.userId);
    if (!note) return res.status(404).json({ error: "not found" });
    res.json(toNote(note));
  });

  // Інші методи на /archive — 405 з Allow, а не «маршруту немає».
  app.all("/api/notes/:id/archive", (req, res) => {
    res.set("Allow", "PATCH").status(405).json({ error: "method not allowed" });
  });

  // Delete one of the caller's own notes.
  app.delete("/api/notes/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "id must be a positive integer" });

    const info = q.remove.run(id, req.userId);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  // Невідомий шлях під /api — JSON, а не HTML-сторінка Express.
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "not found" });
  });

  // Помилки — теж JSON і без stack trace: зламаний JSON у тілі → 400,
  // завелике тіло → 413, решта → 500 з коротким текстом (деталі в лог).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "malformed JSON body" });
    }
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "body too large" });
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
