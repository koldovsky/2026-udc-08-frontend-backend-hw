import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createDb } from "../src/db.js";
import { createApp, TITLE_MAX, BODY_MAX } from "../src/app.js";

let app;
beforeEach(() => {
  app = createApp(createDb(":memory:"));
});

const asOlya = (r) => r.set("x-user-id", "1");

describe("архівування", () => {
  it("прибирає нотатку з активних і показує її в архіві", async () => {
    const res = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: true })
      .expect(200);
    expect(res.body).toMatchObject({ id: 1, title: "Список покупок", archived: true });

    const active = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(active.body.map((n) => n.id)).toEqual([2]);

    const archived = await asOlya(request(app).get("/api/notes?archived=true")).expect(200);
    expect(archived.body.map((n) => n.id)).toEqual([1]);

    const all = await asOlya(request(app).get("/api/notes?archived=all")).expect(200);
    expect(all.body.map((n) => [n.id, n.archived])).toEqual([[1, true], [2, false]]);
  });

  it("повертає нотатку з архіву", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: true });
    await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: false }).expect(200);

    const active = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(active.body.map((n) => n.id)).toEqual([1, 2]);
  });

  it("ідемпотентне: повторне архівування — 200 з тим самим станом", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: true }).expect(200);
    const again = await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: true }).expect(200);
    expect(again.body.archived).toBe(true);
  });

  it("нова нотатка створюється неархівованою", async () => {
    const res = await asOlya(request(app).post("/api/notes")).send({ title: "Нова" }).expect(201);
    expect(res.body.archived).toBe(false);
  });

  it("архівована нотатка досі читається і видаляється власником", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: true });
    const one = await asOlya(request(app).get("/api/notes/1")).expect(200);
    expect(one.body.archived).toBe(true);
    await asOlya(request(app).delete("/api/notes/1")).expect(204);
    await asOlya(request(app).get("/api/notes/1")).expect(404);
  });
});

describe("серверна валідація тіла", () => {
  it.each([["yes"], [1], [null], ["true"]])("archived = %j — 400 і нотатка не змінюється", async (value) => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: value }).expect(400);
    const one = await asOlya(request(app).get("/api/notes/1")).expect(200);
    expect(one.body.archived).toBe(false);
  });

  it("без поля archived — 400", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({}).expect(400);
  });

  it("тіло-масив — 400", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send([true]).expect(400);
  });

  it("зайві поля в тілі — 400 з назвою поля", async () => {
    const res = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: true, user_id: 2 })
      .expect(400);
    expect(res.body.error).toContain("user_id");
  });

  it("зламаний JSON — 400 у JSON, без stack trace", async () => {
    const res = await asOlya(request(app).patch("/api/notes/1/archive"))
      .set("content-type", "application/json")
      .send("{oops")
      .expect(400);
    expect(res.body).toEqual({ error: "malformed JSON body" });
    expect(res.text).not.toMatch(/SyntaxError|node_modules|at .*:\d+:\d+/);
  });

  it("POST: title/body лише рядки, з лімітами довжини", async () => {
    await asOlya(request(app).post("/api/notes")).send({ title: "x", body: 5 }).expect(400);
    await asOlya(request(app).post("/api/notes")).send({ title: "x".repeat(TITLE_MAX) }).expect(201);
    await asOlya(request(app).post("/api/notes")).send({ title: "x".repeat(TITLE_MAX + 1) }).expect(400);
    await asOlya(request(app).post("/api/notes")).send({ title: "x", body: "y".repeat(BODY_MAX) }).expect(201);
    await asOlya(request(app).post("/api/notes")).send({ title: "x", body: "y".repeat(BODY_MAX + 1) }).expect(400);
  });
});

describe("серверна валідація id", () => {
  const bad = ["abc", "0", "-1", "1.5", "01", "1e0", "0x1", "+1", "99999999999999999999"];

  it.each(bad)("id = %j — 400 на GET, PATCH і DELETE, а не мовчазний 404", async (id) => {
    await asOlya(request(app).get(`/api/notes/${encodeURIComponent(id)}`)).expect(400);
    await asOlya(request(app).patch(`/api/notes/${encodeURIComponent(id)}/archive`))
      .send({ archived: true })
      .expect(400);
    await asOlya(request(app).delete(`/api/notes/${encodeURIComponent(id)}`)).expect(400);
  });

  it("DELETE /api/notes/1e0 не видаляє нотатку 1", async () => {
    await asOlya(request(app).delete("/api/notes/1e0")).expect(400);
    await asOlya(request(app).get("/api/notes/1")).expect(200);
  });

  it("неіснуюча нотатка — 404", async () => {
    await asOlya(request(app).patch("/api/notes/999/archive")).send({ archived: true }).expect(404);
  });
});

describe("фільтр списку", () => {
  it("?archived=maybe — 400", async () => {
    await asOlya(request(app).get("/api/notes?archived=maybe")).expect(400);
  });

  it("?archived[]=1 (масив від qs) — 400, а не виняток", async () => {
    await asOlya(request(app).get("/api/notes?archived[]=1")).expect(400);
  });

  it("невідомий параметр (?ARCHIVED=1) — 400, а не мовчазний активний список", async () => {
    const res = await asOlya(request(app).get("/api/notes?ARCHIVED=1")).expect(400);
    expect(res.body.error).toContain("ARCHIVED");
  });
});

describe("гігієна HTTP", () => {
  it("інший метод на /archive — 405 з Allow: PATCH", async () => {
    const res = await asOlya(request(app).put("/api/notes/1/archive")).send({ archived: true }).expect(405);
    expect(res.headers.allow).toBe("PATCH");
  });

  it("невідомий шлях під /api — 404 у JSON", async () => {
    const res = await asOlya(request(app).get("/api/nope")).expect(404);
    expect(res.body).toEqual({ error: "not found" });
  });

  it("не розкриває X-Powered-By", async () => {
    const res = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
