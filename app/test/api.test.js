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

  it("does not include another user's seeded note", async () => {
    const res = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(res.body.map((note) => note.id)).not.toContain(3);
  });

  it("gives a different user a different list", async () => {
    const res = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("POST /api/notes", () => {
  it("creates a note owned by the caller", async () => {
    const res = await asOlya(request(app).post("/api/notes"))
      .send({ title: "Нова", body: "текст" })
      .expect(201);
    expect(res.body.title).toBe("Нова");

    expect(res.body.archived).toBe(false);

    const list = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(list.body).toHaveLength(3);
  });

  it("rejects an empty title", async () => {
    await asOlya(request(app).post("/api/notes")).send({ title: "  " }).expect(400);
  });

  it("ignores a client-supplied user_id when creating a note", async () => {
    const created = await asOlya(request(app).post("/api/notes"))
      .send({ title: "Spoof attempt", body: "owned by Olya", user_id: 2 })
      .expect(201);

    const olya = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(olya.body.some((note) => note.id === created.body.id)).toBe(true);

    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body.some((note) => note.id === created.body.id)).toBe(false);
  });
});

describe("PATCH /api/notes/:id/archive", () => {
  it("archives and restores a note, and lists the persisted state", async () => {
    const archived = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: true })
      .expect(200);
    expect(archived.body).toEqual({ id: 1, archived: true });

    const afterArchive = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(afterArchive.body.find((note) => note.id === 1).archived).toBe(true);

    const restored = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: false })
      .expect(200);
    expect(restored.body).toEqual({ id: 1, archived: false });

    const afterRestore = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(afterRestore.body.find((note) => note.id === 1).archived).toBe(false);
  });

  it("rejects a missing or non-boolean archive state", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({}).expect(400);
    await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: "true" })
      .expect(400);
  });

  it("rejects invalid ids and returns 404 for a missing note", async () => {
    await asOlya(request(app).patch("/api/notes/nope/archive"))
      .send({ archived: true })
      .expect(400);
    await asOlya(request(app).patch("/api/notes/999/archive"))
      .send({ archived: true })
      .expect(404);
  });

  it("will not change another user's note", async () => {
    await asOlya(request(app).patch("/api/notes/3/archive"))
      .send({ archived: true })
      .expect(404);

    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body[0].archived).toBe(false);
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

  it("will not read someone else's note", async () => {
    await asOlya(request(app).get("/api/notes/3")).expect(404);
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
