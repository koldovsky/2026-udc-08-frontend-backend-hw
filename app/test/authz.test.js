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

describe("authorization as the other user", () => {
  it("GET /api/notes does not include the other user's notes", async () => {
    const res = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(res.body.map((n) => n.title)).not.toContain("Приватна нотатка Тараса");
    expect(res.body.some((n) => n.body?.includes("пароль"))).toBe(false);
  });

  it("GET /api/notes/:id refuses the other user's note (both directions)", async () => {
    const olyaReadsTaras = await asOlya(request(app).get("/api/notes/3")).expect(404);
    expect(olyaReadsTaras.body).not.toHaveProperty("body");

    const tarasReadsOlya = await asTaras(request(app).get("/api/notes/1")).expect(404);
    expect(tarasReadsOlya.body).not.toHaveProperty("title");
  });

  it("POST /api/notes ignores a spoofed user_id in the body", async () => {
    const res = await asTaras(request(app).post("/api/notes"))
      .send({ title: "Чужа", body: "спроба", user_id: 1 })
      .expect(201);
    expect(res.body).not.toHaveProperty("user_id");

    const olya = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(olya.body).toHaveLength(2);
    expect(olya.body.map((n) => n.title)).not.toContain("Чужа");

    const taras = await asTaras(request(app).get("/api/notes")).expect(200);
    expect(taras.body.map((n) => n.title)).toContain("Чужа");
  });

  it("DELETE /api/notes/:id will not delete the other user's note", async () => {
    await asTaras(request(app).delete("/api/notes/1")).expect(404);
    const olya = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(olya.body).toHaveLength(2);
  });

  it("PATCH /api/notes/:id will not archive the other user's note", async () => {
    await asTaras(request(app).patch("/api/notes/1"))
      .send({ archived: true })
      .expect(404);
    const olya = await asOlya(request(app).get("/api/notes")).expect(200);
    expect(olya.body.find((n) => n.id === 1).archived).toBe(false);
  });
});
