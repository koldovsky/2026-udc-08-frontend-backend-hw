import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createDb } from "../src/db.js";
import { createApp } from "../src/app.js";

/**
 * Тести, які ставлять питання авторизації: не «чи існує рядок», а «чи можна
 * саме цьому користувачеві саме цю нотатку».
 *
 * Нотатки 1–2 належать Олі (id 1), нотатка 3 — Тарасу (id 2). Перевіряємо в
 * обидва боки: односторонній тест мовчить, якщо сервер, скажімо, зашив
 * користувача 1 замість читання сесії.
 */
let app;
beforeEach(() => {
  app = createApp(createDb(":memory:"));
});

const as = (userId) => (r) => r.set("x-user-id", String(userId));
const PUBLIC_KEYS = ["archived", "body", "created_at", "id", "title"];

const users = [
  { me: 1, name: "Оля", mine: 1, theirs: 3, theirTitle: "Приватна нотатка Тараса", theirBody: "пароль від сейфа" },
  { me: 2, name: "Тарас", mine: 3, theirs: 1, theirTitle: "Список покупок", theirBody: "хліб, кава" },
];

const idRoutes = [
  { name: "GET /api/notes/:id", call: (id) => request(app).get(`/api/notes/${id}`) },
  {
    name: "PATCH /api/notes/:id/archive",
    call: (id) => request(app).patch(`/api/notes/${id}/archive`).send({ archived: true }),
  },
  { name: "DELETE /api/notes/:id", call: (id) => request(app).delete(`/api/notes/${id}`) },
];

describe.each(users)("як $name (id $me)", ({ me, mine, theirs, theirTitle, theirBody }) => {
  const other = me === 1 ? 2 : 1;

  describe.each(idRoutes)("$name на чужій нотатці", ({ call }) => {
    it("відповідає 404 і не витікає ані заголовок, ані текст", async () => {
      const res = await as(me)(call(theirs)).expect(404);
      expect(res.text).not.toContain(theirTitle);
      expect(res.text).not.toContain(theirBody);
    });

    it("відповідає так само, як на неіснуючу нотатку (без оракула існування)", async () => {
      const foreign = await as(me)(call(theirs));
      const missing = await as(me)(call(999));
      expect(foreign.status).toBe(missing.status);
      expect(foreign.body).toEqual(missing.body);
    });

    it("нічого не змінює: власник бачить нотатку як і раніше", async () => {
      await as(me)(call(theirs));
      const still = await as(other)(request(app).get(`/api/notes/${theirs}`)).expect(200);
      expect(still.body.archived).toBe(false);
    });
  });

  it("свою нотатку читає", async () => {
    await as(me)(request(app).get(`/api/notes/${mine}`)).expect(200);
  });

  it("у списку немає чужих нотаток — ні активних, ні архівних", async () => {
    await as(other)(request(app).patch(`/api/notes/${theirs}/archive`)).send({ archived: true }).expect(200);
    for (const filter of ["false", "true", "all"]) {
      const res = await as(me)(request(app).get(`/api/notes?archived=${filter}`)).expect(200);
      expect(res.body.map((n) => n.id)).not.toContain(theirs);
      expect(res.text).not.toContain(theirTitle);
    }
  });
});

describe("форма відповіді", () => {
  it("кожен маршрут віддає рівно публічні поля — без user_id", async () => {
    const list = await as(1)(request(app).get("/api/notes")).expect(200);
    for (const note of list.body) expect(Object.keys(note).sort()).toEqual(PUBLIC_KEYS);

    const one = await as(1)(request(app).get("/api/notes/1")).expect(200);
    expect(Object.keys(one.body).sort()).toEqual(PUBLIC_KEYS);

    const created = await as(1)(request(app).post("/api/notes")).send({ title: "Нова" }).expect(201);
    expect(Object.keys(created.body).sort()).toEqual(PUBLIC_KEYS);

    const archived = await as(1)(request(app).patch("/api/notes/1/archive")).send({ archived: true }).expect(200);
    expect(Object.keys(archived.body).sort()).toEqual(PUBLIC_KEYS);
  });
});

describe("власника не можна обрати з тіла запиту", () => {
  it("POST з user_id у тілі — 400, і в іншого користувача нічого не з'являється", async () => {
    await as(1)(request(app).post("/api/notes")).send({ title: "Підкинута", user_id: 2 }).expect(400);
    const taras = await as(2)(request(app).get("/api/notes?archived=all")).expect(200);
    expect(taras.body.map((n) => n.title)).not.toContain("Підкинута");
  });

  it("POST з archived у тілі — 400", async () => {
    await as(1)(request(app).post("/api/notes")).send({ title: "Х", archived: true }).expect(400);
  });
});

describe("псевдосесія", () => {
  const routes = [
    ["GET /api/notes", () => request(app).get("/api/notes")],
    ["GET /api/notes/:id", () => request(app).get("/api/notes/1")],
    ["POST /api/notes", () => request(app).post("/api/notes").send({ title: "x" })],
    ["PATCH /api/notes/:id/archive", () => request(app).patch("/api/notes/1/archive").send({ archived: true })],
    ["DELETE /api/notes/:id", () => request(app).delete("/api/notes/1")],
  ];

  it.each(routes)("%s без заголовка — 401", async (_name, call) => {
    await call().expect(401);
  });

  it.each(["", "abc", "0", "-1", "1.5", "01", "+1", "0x1", "1e0", "1 OR 1=1", "99"])(
    "x-user-id = %j — 401 (не канонічний id або такого користувача немає)",
    async (value) => {
      await request(app).get("/api/notes").set("x-user-id", value).expect(401);
      const res = await request(app).post("/api/notes").set("x-user-id", value).send({ title: "x" }).expect(401);
      // Неіснуючий користувач раніше падав на FOREIGN KEY із 500 і stack trace.
      expect(res.text).not.toMatch(/SqliteError|node_modules|at .*:\d+:\d+/);
    },
  );
});
