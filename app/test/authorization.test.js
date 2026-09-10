import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createDb } from "../src/db.js";
import { createApp } from "../src/app.js";

// Task C — the authorization question, asked of every route that touches a
// single record. Not "does this note exist" but "may THIS user touch THIS
// note".
//
// These live apart from the feature tests on purpose. A suite where "the
// feature works" and "nobody can reach someone else's data" are mixed lets
// the first one's green tick stand in for the second — which is exactly how
// the seeded hole survived nine passing tests.

let app;
beforeEach(() => {
  app = createApp(createDb(":memory:"));
});

const asOlya = (r) => r.set("x-user-id", "1");
const asTaras = (r) => r.set("x-user-id", "2");

// Seeded: notes 1, 2 belong to Оля (id 1); note 3 to Тарас (id 2).
const TARAS_NOTE = 3;
const OLYA_NOTE = 1;

describe("GET /api/notes/:id — reading someone else's note", () => {
  // THE REGRESSION TEST for the seeded hole.
  //
  // Before the fix the route was:
  //   SELECT ... FROM notes WHERE id = ?
  // and this test failed with 200 instead of 404, handing Оля the body
  // "пароль від сейфа: 1234". The boundary of the data came from the id in
  // the URL and nowhere else — which is the whole bug.
  it("will not let one user read another user's note", async () => {
    await asOlya(request(app).get(`/api/notes/${TARAS_NOTE}`)).expect(404);
  });

  it("does not leak the contents of someone else's note", async () => {
    const res = await asOlya(request(app).get(`/api/notes/${TARAS_NOTE}`));
    expect(JSON.stringify(res.body)).not.toContain("пароль");
    expect(JSON.stringify(res.body)).not.toContain("Приватна");
  });

  // 404, not 403: a refusal that says "wrong owner" still confirms the note
  // exists. Existence is itself information about another user.
  it("answers the same way for a missing note and for someone else's", async () => {
    const foreign = await asOlya(request(app).get(`/api/notes/${TARAS_NOTE}`));
    const missing = await asOlya(request(app).get("/api/notes/999"));
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });

  it("still returns the caller's own note", async () => {
    const res = await asOlya(request(app).get(`/api/notes/${OLYA_NOTE}`)).expect(200);
    expect(res.body.title).toBe("Список покупок");
  });

  it("does not expose user_id on the caller's own note either", async () => {
    const res = await asOlya(request(app).get(`/api/notes/${OLYA_NOTE}`)).expect(200);
    expect(res.body).not.toHaveProperty("user_id");
  });

  it("lets the owner read it — the note is reachable, just not by Оля", async () => {
    const res = await asTaras(request(app).get(`/api/notes/${TARAS_NOTE}`)).expect(200);
    expect(res.body.title).toBe("Приватна нотатка Тараса");
  });
});

describe("PATCH /api/notes/:id/archive — archiving someone else's note", () => {
  it("will not archive another user's note", async () => {
    await asOlya(request(app).patch(`/api/notes/${TARAS_NOTE}/archive`))
      .send({ archived: true })
      .expect(404);
  });

  // The refusal has to be real, not just a 404 on the way out: check the
  // note itself did not move.
  it("leaves the other user's note untouched after a refused archive", async () => {
    await asOlya(request(app).patch(`/api/notes/${TARAS_NOTE}/archive`))
      .send({ archived: true })
      .expect(404);

    const taras = await asTaras(request(app).get("/api/notes?archived=all")).expect(200);
    const note = taras.body.find((n) => n.id === TARAS_NOTE);
    expect(note.archived).toBe(0);
  });

  it("does not let a refused request hide a note from its owner", async () => {
    await asOlya(request(app).patch(`/api/notes/${TARAS_NOTE}/archive`))
      .send({ archived: true })
      .expect(404);

    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body.map((n) => n.id)).toContain(TARAS_NOTE);
  });
});

describe("every route, walked with the wrong user", () => {
  // The hint in the homework: go down every route and ask where the boundary
  // of the returned data comes from. Same request, foreign header.
  it("GET /api/notes never returns another user's rows", async () => {
    const olya = await asOlya(request(app).get("/api/notes?archived=all")).expect(200);
    expect(olya.body.map((n) => n.id)).not.toContain(TARAS_NOTE);
  });

  it("DELETE /api/notes/:id will not delete another user's note", async () => {
    await asOlya(request(app).delete(`/api/notes/${TARAS_NOTE}`)).expect(404);
    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body).toHaveLength(1);
  });

  it("POST /api/notes cannot plant a note in someone else's account", async () => {
    // user_id in the body is ignored: ownership comes from the header.
    await asOlya(request(app).post("/api/notes"))
      .send({ title: "Підкинута", user_id: 2 })
      .expect(201);

    const taras = await asTaras(request(app).get("/api/notes?archived=all")).expect(200);
    expect(taras.body.map((n) => n.title)).not.toContain("Підкинута");
  });

  it("refuses every single-record route without a user header", async () => {
    await request(app).get(`/api/notes/${OLYA_NOTE}`).expect(401);
    await request(app).patch(`/api/notes/${OLYA_NOTE}/archive`).send({ archived: true }).expect(401);
    await request(app).delete(`/api/notes/${OLYA_NOTE}`).expect(401);
  });
});
