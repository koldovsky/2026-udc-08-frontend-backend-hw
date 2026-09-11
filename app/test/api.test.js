import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createDb } from "../src/db.js";
import { createApp } from "../src/app.js";

let app;
beforeEach(() => {
  app = createApp(createDb(":memory:"));
});

const asOlya = (r) => r.set("x-user-id", "1");
const asTaras = (r) => r.set("x-user-id", "2");

describe("authentication", () => {
  it("rejects a request with no user header", async () => {
    await request(app).get("/api/notes").expect(401);
  });
});

describe("GET /api/notes", () => {
  it("returns only the caller's own notes", async () => {
    const res = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((n) => n.title)).toEqual([
      "Список покупок",
      "Ідеї для відпустки",
    ]);
  });

  it("gives a different user a different list", async () => {
    const res = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(res.body).toHaveLength(1);
  });

  it("includes archived and omits user_id", async () => {
    const res = await asOlya(request(app).get("/api/notes")).expect(200);
    for (const note of res.body) {
      expect(typeof note.archived).toBe("boolean");
      expect(note).not.toHaveProperty("user_id");
    }
  });
});

describe("POST /api/notes", () => {
  it("creates a note owned by the caller", async () => {
    const res = await asOlya(request(app).post("/api/notes"))
      .send({ title: "Нова", body: "текст" })
      .expect(201);
    expect(res.body.title).toBe("Нова");

    const list = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(list.body).toHaveLength(3);
  });

  it("rejects an empty title", async () => {
    await asOlya(request(app).post("/api/notes")).send({ title: "  " }).expect(400);
  });
});

describe("GET /api/notes/:id", () => {
  it("returns the caller's own note", async () => {
    const res = await asOlya(request(app).get("/api/notes/1")).expect(200);
    expect(res.body.title).toBe("Список покупок");
  });

  it("404s for a note that does not exist", async () => {
    await asOlya(request(app).get("/api/notes/999")).expect(404);
  });

  // Red before the owner clause on GET /api/notes/:id: Olya received 200 with
  // Тарас's note { id: 3, user_id: 2, title: "Приватна нотатка Тараса",
  // body: "пароль від сейфа: 1234", ... }.
  it("will not read someone else's note", async () => {
    const res = await asOlya(request(app).get("/api/notes/3")).expect(404);
    expect(res.body).not.toHaveProperty("title");
    expect(res.body).not.toHaveProperty("body");
    expect(res.body).not.toHaveProperty("user_id");
  });
});

describe("DELETE /api/notes/:id", () => {
  it("deletes the caller's own note", async () => {
    await asOlya(request(app).delete("/api/notes/1")).expect(204);
    const list = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it("will not delete someone else's note", async () => {
    await asOlya(request(app).delete("/api/notes/3")).expect(404);
    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body).toHaveLength(1);
  });
});

describe("PATCH /api/notes/:id", () => {
  it("archives the caller's own note", async () => {
    const res = await asOlya(request(app).patch("/api/notes/1"))
      .send({ archived: true })
      .expect(200);
    expect(res.body.archived).toBe(true);
    expect(res.body.title).toBe("Список покупок");
    expect(res.body).not.toHaveProperty("user_id");
    expect(Object.keys(res.body).sort()).toEqual([
      "archived",
      "body",
      "created_at",
      "id",
      "title",
    ]);

    const list = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(list.body.find((n) => n.id === 1).archived).toBe(true);
  });

  it("restores the caller's own note from the archive", async () => {
    await asOlya(request(app).patch("/api/notes/1")).send({ archived: true }).expect(200);
    const res = await asOlya(request(app).patch("/api/notes/1"))
      .send({ archived: false })
      .expect(200);
    expect(res.body.archived).toBe(false);
  });

  it("will not archive someone else's note", async () => {
    await asOlya(request(app).patch("/api/notes/3"))
      .send({ archived: true })
      .expect(404);
    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body).toHaveLength(1);
    expect(taras.body[0].archived).toBe(false);
  });

  it("rejects a missing or non-boolean archived flag", async () => {
    await asOlya(request(app).patch("/api/notes/1")).send({}).expect(400);
    await asOlya(request(app).patch("/api/notes/1")).send({ archived: 1 }).expect(400);
    await asOlya(request(app).patch("/api/notes/1")).send({ archived: "true" }).expect(400);
  });

  it("404s for a note that does not exist", async () => {
    await asOlya(request(app).patch("/api/notes/999"))
      .send({ archived: true })
      .expect(404);
  });
});
