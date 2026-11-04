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
      .send({ title: "Нова", body: "текст", user_id: 2, archived: true })
      .expect(201);
    expect(res.body.title).toBe("Нова");

    const list = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(list.body).toHaveLength(3);
    expect(list.body.find((note) => note.id === res.body.id).archived).toBe(false);
    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body.map((note) => note.id)).toEqual([3]);
  });

  it("rejects an empty title", async () => {
    await asOlya(request(app).post("/api/notes")).send({ title: "  " }).expect(400);
  });
});

describe("GET /api/notes/:id", () => {
  it("will not read someone else's note", async () => {
    await asOlya(request(app).get("/api/notes/3")).expect(404, { error: "not found" });
  });

  it("returns the caller's own note", async () => {
    const res = await asOlya(request(app).get("/api/notes/1")).expect(200);
    expect(res.body.title).toBe("Список покупок");
    expect(res.body).not.toHaveProperty("user_id");
  });

  it("404s for a note that does not exist", async () => {
    await asOlya(request(app).get("/api/notes/999")).expect(404);
  });
});

describe("PATCH /api/notes/:id/archive", () => {
  it("archives and restores the caller's own note, including on retry", async () => {
    for (const archived of [true, true, false]) {
      await asOlya(request(app).patch("/api/notes/1/archive"))
        .send({ archived })
        .expect(204, "");
      const list = await asOlya(request(app).get("/api/notes")).expect(200);
      expect(list.body.find((note) => note.id === 1).archived).toBe(archived);
    }
  });

  it("will not change someone else's note and uses the same response as a missing note", async () => {
    for (const id of [3, 999]) {
      await asOlya(request(app).patch(`/api/notes/${id}/archive`))
        .send({ archived: true })
        .expect(404, { error: "not found" });
    }
    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body[0].archived).toBe(false);
  });

  it.each([{}, { archived: "false" }, { archived: 1 }, { archived: null }])(
    "rejects an invalid archive body %j",
    async (body) => {
      await asOlya(request(app).patch("/api/notes/1/archive"))
        .send(body)
        .expect(400, { error: "archived must be a boolean" });
    },
  );

  it.each(["0", "-1", "1.5", "1e0", "9007199254740992"])("rejects invalid id %s", async (id) => {
    await asOlya(request(app).patch(`/api/notes/${id}/archive`))
      .send({ archived: true })
      .expect(400, { error: "invalid note id" });
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
