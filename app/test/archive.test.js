import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createDb } from "../src/db.js";
import { createApp } from "../src/app.js";

// Task B — the archive feature: the column, the endpoint and the server-side
// validation. Authorization for this endpoint has its own file
// (authorization.test.js) so that a green run here never gets mistaken for
// "and nobody can touch someone else's note".

let app;
beforeEach(() => {
  app = createApp(createDb(":memory:"));
});

const asOlya = (r) => r.set("x-user-id", "1");

// Seeded: notes 1 and 2 belong to Оля, note 3 to Тарас. Nothing starts archived.
const archive = (id, archived) =>
  asOlya(request(app).patch(`/api/notes/${id}/archive`)).send({ archived });

describe("PATCH /api/notes/:id/archive", () => {
  it("archives the caller's own note", async () => {
    const res = await archive(1, true).expect(200);
    expect(res.body.id).toBe(1);
    expect(res.body.archived).toBe(1);
  });

  it("unarchives it again", async () => {
    await archive(1, true).expect(200);
    const res = await archive(1, false).expect(200);
    expect(res.body.archived).toBe(0);
  });

  it("404s for a note that does not exist", async () => {
    await archive(999, true).expect(404);
  });

  // Guardrail: "do not widen the response". user_id is an internal column —
  // the caller already knows who they are.
  it("does not leak internal columns", async () => {
    const res = await archive(1, true).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ["archived", "body", "created_at", "id", "title"].sort(),
    );
  });
});

describe("PATCH /api/notes/:id/archive — server-side validation", () => {
  // The UI only ever sends a boolean. The UI is not the one being tested:
  // a client is attacker-controlled, so the server has to say no itself.
  it("rejects a non-boolean archived value", async () => {
    await archive(1, "yes").expect(400);
  });

  it("rejects a missing archived field", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive")).send({}).expect(400);
  });

  it("rejects a non-numeric id", async () => {
    await asOlya(request(app).patch("/api/notes/abc/archive"))
      .send({ archived: true })
      .expect(400);
  });

  it("requires authentication", async () => {
    await request(app).patch("/api/notes/1/archive").send({ archived: true }).expect(401);
  });

  it("leaves the note untouched when the request is rejected", async () => {
    await archive(1, "yes").expect(400);
    const list = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(list.body.map((n) => n.id)).toContain(1);
  });
});

describe("GET /api/notes — archived filter", () => {
  it("hides archived notes by default", async () => {
    await archive(1, true).expect(200);
    const res = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(res.body.map((n) => n.id)).toEqual([2]);
  });

  it("returns only archived notes with ?archived=1", async () => {
    await archive(1, true).expect(200);
    const res = await asOlya(request(app).get("/api/notes?archived=1")).expect(200);
    expect(res.body.map((n) => n.id)).toEqual([1]);
  });

  it("returns both with ?archived=all", async () => {
    await archive(1, true).expect(200);
    const res = await asOlya(request(app).get("/api/notes?archived=all")).expect(200);
    expect(res.body.map((n) => n.id)).toEqual([1, 2]);
  });

  it("rejects an unknown filter value", async () => {
    await asOlya(request(app).get("/api/notes?archived=maybe")).expect(400);
  });

  it("exposes archived so the UI can render the state", async () => {
    const res = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(res.body[0].archived).toBe(0);
    expect(res.body[0]).not.toHaveProperty("user_id");
  });
});

describe("new notes", () => {
  it("start out active", async () => {
    const created = await asOlya(request(app).post("/api/notes"))
      .send({ title: "Свіжа" })
      .expect(201);
    const res = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(res.body.map((n) => n.id)).toContain(created.body.id);
  });
});
