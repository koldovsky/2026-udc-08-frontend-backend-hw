import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Pretend session. A real app would verify a signed cookie or a JWT here;
 * that is deliberately out of scope — this workshop is about what happens
 * AFTER you know who the caller is.
 *
 * The caller identifies itself with the `x-user-id` header. Seeded users are
 * 1 (Оля) and 2 (Тарас).
 */
function currentUser(req, res, next) {
  const id = Number(req.header("x-user-id"));
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(401).json({ error: "not authenticated" });
  }
  req.userId = id;
  next();
}

export function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(resolve(here, "../public")));

  app.use("/api", currentUser);

  // List the caller's own notes.
  app.get("/api/notes", (req, res) => {
    const rows = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE user_id = ? ORDER BY id")
      .all(req.userId);
    res.json(rows.map((n) => ({ ...n, archived: Boolean(n.archived) })));
  });

  // Read one of the caller's own notes.
  app.get("/api/notes/:id", (req, res) => {
    const note = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE id = ? AND user_id = ?")
      .get(Number(req.params.id), req.userId);
    if (!note) return res.status(404).json({ error: "not found" });
    res.json({ ...note, archived: Boolean(note.archived) });
  });

  // Create a note for the caller.
  app.post("/api/notes", (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body : "";
    if (!title) return res.status(400).json({ error: "title is required" });

    const info = db
      .prepare("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)")
      .run(req.userId, title, body);
    const created = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json({ ...created, archived: Boolean(created.archived) });
  });

  // Flip the archived state of one of the caller's own notes.
  //
  // Toggle, not an explicit `{ archived: boolean }` body: the client always
  // knows the note's current state (it just fetched the list), so it always
  // wants the opposite of that, and there's nothing else for the caller to
  // supply — accepting a body here would just be an unused surface to guard.
  // The tradeoff: a toggle isn't idempotent, so a blind retry of this exact
  // request would flip it twice. The UI never auto-retries, so that's fine
  // here; an endpoint another client might retry would want the explicit
  // form instead.
  app.patch("/api/notes/:id/archive", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "invalid id" });

    const current = db
      .prepare("SELECT archived FROM notes WHERE id = ? AND user_id = ?")
      .get(id, req.userId);
    if (!current) return res.status(404).json({ error: "not found" });

    db.prepare("UPDATE notes SET archived = ? WHERE id = ? AND user_id = ?").run(
      current.archived ? 0 : 1,
      id,
      req.userId,
    );
    const updated = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE id = ?")
      .get(id);
    res.json({ ...updated, archived: Boolean(updated.archived) });
  });

  // Delete one of the caller's own notes.
  app.delete("/api/notes/:id", (req, res) => {
    const info = db
      .prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
      .run(Number(req.params.id), req.userId);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  return app;
}
