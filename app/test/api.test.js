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

  it("will not read someone else's note", async () => {
    await asOlya(request(app).get("/api/notes/3")).expect(404);
  });
});

describe("PATCH /api/notes/:id/archive", () => {
  it("archives the caller's own note", async () => {
    const res = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: true })
      .expect(200);
    expect(res.body.archived).toBe(true);

    const list = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(list.body.find((n) => n.id === 1).archived).toBe(true);
  });

  it("unarchives it back", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: true }).expect(200);
    const res = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: false })
      .expect(200);
    expect(res.body.archived).toBe(false);
  });

  it("rejects a non-boolean archived value", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: "yes" })
      .expect(400);
  });

  it("does not leak the owner's user_id in the response", async () => {
    const res = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: true })
      .expect(200);
    expect(res.body).not.toHaveProperty("user_id");
  });

  it("will not archive someone else's note", async () => {
    await asOlya(request(app).patch("/api/notes/3/archive"))
      .send({ archived: true })
      .expect(404);

    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body.find((n) => n.id === 3).archived).toBe(false);
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
