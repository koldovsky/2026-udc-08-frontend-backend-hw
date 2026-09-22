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
    // Note 3 is Taras's ("Приватна нотатка Тараса" — user_id 2). Olya asking
    // for it by id must be refused, not handed the row.
    await asOlya(request(app).get("/api/notes/3")).expect(404);
  });
});

describe("GET /api/notes?archived=", () => {
  it("excludes archived notes by default", async () => {
    const res = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(res.body.every((n) => n.archived === false)).toBe(true);
  });

  it("lists only archived notes when asked", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: true }).expect(200);

    const active = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(active.body).toHaveLength(1);

    const archived = await asOlya(request(app).get("/api/notes?archived=true")).expect(200);
    expect(archived.body).toHaveLength(1);
    expect(archived.body[0].title).toBe("Список покупок");
  });
});

describe("PATCH /api/notes/:id/archive", () => {
  it("archives the caller's own note", async () => {
    const res = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: true })
      .expect(200);
    expect(res.body).toEqual({
      id: 1,
      title: "Список покупок",
      body: "хліб, кава",
      archived: true,
      created_at: expect.any(String),
    });
  });

  it("unarchives it again", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: true }).expect(200);
    const res = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: false })
      .expect(200);
    expect(res.body.archived).toBe(false);
  });

  it("rejects a non-boolean archived value", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({ archived: "yes" }).expect(400);
    await asOlya(request(app).patch("/api/notes/1/archive")).send({}).expect(400);
  });

  it("404s for a note that does not exist", async () => {
    await asOlya(request(app).patch("/api/notes/999/archive")).send({ archived: true }).expect(404);
  });

  it("will not archive someone else's note", async () => {
    await asOlya(request(app).patch("/api/notes/3/archive")).send({ archived: true }).expect(404);

    // Confirm it truly wasn't touched, not just that the response was 404.
    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body).toHaveLength(1);
    expect(taras.body[0].archived).toBe(false);
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
