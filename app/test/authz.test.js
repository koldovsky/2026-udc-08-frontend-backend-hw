// Task E (bonus), path 3 — an authorization sweep.
//
// The seeded suite asks the authorization question per feature, ad hoc. This
// file asks it systematically: every route that touches a specific note,
// walked by someone who does not own it — plus a guard that fails when a new
// route appears in app.js without a probe here.
//
// That guard is the point. The seeded hole survived nine green tests because
// nothing forced the question to be asked about GET /api/notes/:id. A list of
// routes that must each be answered for is harder to forget than a habit.

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createDb } from "../src/db.js";
import { createApp } from "../src/app.js";

const OLYA = 1;
const TARAS = 2;
const TARAS_NOTE = 3; // "Приватна нотатка Тараса" — body contains a password

let db;
let app;

beforeEach(() => {
  db = createDb();
  app = createApp(db);
});

const as = (id, req) => req.set("x-user-id", String(id));
const noteRow = () => db.prepare("SELECT * FROM notes WHERE id = ?").get(TARAS_NOTE);

// One row per route that reaches a *specific* note. `probe` builds the request
// an outsider would send.
const targeted = [
  {
    route: "GET /api/notes/:id",
    probe: () => request(app).get(`/api/notes/${TARAS_NOTE}`),
  },
  {
    route: "PATCH /api/notes/:id/archive",
    probe: () => request(app).patch(`/api/notes/${TARAS_NOTE}/archive`).send({ archived: true }),
  },
  {
    route: "DELETE /api/notes/:id",
    probe: () => request(app).delete(`/api/notes/${TARAS_NOTE}`),
  },
];

describe("authorization sweep — the wrong user", () => {
  it.each(targeted)("$route refuses a caller who does not own the note", async ({ probe }) => {
    const before = noteRow();

    const res = await as(OLYA, probe());

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("пароль");
    // The refusal must also be a no-op: nothing read, nothing written.
    expect(noteRow()).toEqual(before);
  });

  it("GET /api/notes never lists another user's note", async () => {
    const res = await as(OLYA, request(app).get("/api/notes")).expect(200);
    expect(res.body.map((n) => n.id)).not.toContain(TARAS_NOTE);
  });

  it("POST /api/notes cannot forge ownership from the request body", async () => {
    const res = await as(
      OLYA,
      request(app).post("/api/notes").send({
        title: "forged",
        body: "x",
        user_id: TARAS, // caller asks to create a note as someone else
        id: 999,
        archived: true,
      }),
    ).expect(201);

    const row = db.prepare("SELECT * FROM notes WHERE title = ?").get("forged");
    expect(row.user_id).toBe(OLYA); // owner comes from the session, not the body
    expect(row.archived).toBe(0); // and so does every other server-owned field
    expect(res.body).not.toHaveProperty("user_id");
  });
});

describe("authorization sweep — no session at all", () => {
  it.each(targeted)("$route rejects an unauthenticated caller", async ({ probe }) => {
    await probe().expect(401);
  });

  it("GET /api/notes rejects an unauthenticated caller", async () => {
    await request(app).get("/api/notes").expect(401);
  });

  it("POST /api/notes rejects an unauthenticated caller", async () => {
    await request(app).post("/api/notes").send({ title: "x" }).expect(401);
  });

  it.each(targeted)("$route rejects a well-formed but nonexistent user id", async ({ probe }) => {
    await as(99, probe()).expect(401);
  });

  it("POST /api/notes rejects a well-formed but nonexistent user id", async () => {
    await as(99, request(app).post("/api/notes").send({ title: "x" })).expect(401);
  });
});

describe("authorization sweep — coverage guard", () => {
  // Routes that do not reach a specific note, and so are covered by the
  // named tests above rather than by the `targeted` table.
  const collectionRoutes = ["GET /api/notes", "POST /api/notes"];

  it("every registered route is answered for by this file", () => {
    const registered = (app._router ?? app.router).stack
      .filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

    const answered = [...targeted.map((t) => t.route), ...collectionRoutes];

    // A new route in app.js with no probe here fails loudly, naming itself.
    expect(registered.filter((r) => !answered.includes(r))).toEqual([]);
    // And a probe for a route that no longer exists fails too, so the table
    // cannot rot into testing nothing.
    expect(answered.filter((r) => !registered.includes(r))).toEqual([]);
  });
});
