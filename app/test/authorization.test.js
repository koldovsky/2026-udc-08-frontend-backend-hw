import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createDb } from "../src/db.js";
import { createApp } from "../src/app.js";

// Cross-user checks for every route that touches a specific note by id: the
// question each of these asks is not "does this note exist" but "may this
// user touch this note". Kept in their own file so the authorization surface
// can be reviewed as one unit, separate from each route's own behaviour
// tests in api.test.js.

let app;
beforeEach(() => {
  app = createApp(createDb(":memory:"));
});

const asOlya = (r) => r.set("x-user-id", "1");
const asTaras = (r) => r.set("x-user-id", "2");

describe("authorization", () => {
  it("will not read someone else's note", async () => {
    await asOlya(request(app).get("/api/notes/3")).expect(404);
  });

  it("will not archive someone else's note", async () => {
    await asOlya(request(app).patch("/api/notes/3/archive"))
      .send({ archived: true })
      .expect(404);

    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body[0].archived).toBe(false);
  });

  it("will not delete someone else's note", async () => {
    await asOlya(request(app).delete("/api/notes/3")).expect(404);
    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body).toHaveLength(1);
  });
});
