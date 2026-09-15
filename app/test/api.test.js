import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
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
    expect(res.body.every((n) => !("user_id" in n))).toBe(true);
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

  it("does not leak a stack trace or file path on malformed JSON", async () => {
    const res = await asOlya(request(app).post("/api/notes"))
      .set("content-type", "application/json")
      .send("{oops")
      .expect(400);
    expect(res.body).toHaveProperty("error");
    expect(res.text).not.toMatch(/node_modules|SyntaxError|at .*:\d+:\d+/);
  });
});

describe("GET /api/notes/:id", () => {
  it("returns the caller's own note", async () => {
    const res = await asOlya(request(app).get("/api/notes/1")).expect(200);
    expect(res.body.title).toBe("Список покупок");
    expect(res.body).not.toHaveProperty("user_id");
  });

  it("404s for a note that does not exist", async () => {
    await asOlya(request(app).get("/api/notes/999")).expect(404);
  });

  it("will not read someone else's note", async () => {
    await asOlya(request(app).get("/api/notes/3")).expect(404);
  });
});

describe("createDb migration", () => {
  let dir;
  let file;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws08-db-"));
    file = join(dir, "pre-archive.db");

    // Build a db file on the ORIGINAL schema (no `archived` column), the
    // shape notes.db would have had before this migration existed.
    const legacy = new Database(file);
    legacy.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE notes (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id   INTEGER NOT NULL REFERENCES users(id),
        title     TEXT NOT NULL,
        body      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    legacy.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(1, "Оля");
    legacy
      .prepare("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)")
      .run(1, "Стара нотатка", "написана до міграції");
    legacy.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("adds `archived` without losing pre-existing rows", () => {
    const db = createDb(file);
    const rows = db.prepare("SELECT * FROM notes ORDER BY id").all();

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Стара нотатка");
    expect(rows[0].body).toBe("написана до міграції");
    expect(rows[0].archived).toBe(0);
    db.close();
  });

  it("is idempotent — reopening does not duplicate seed rows", () => {
    createDb(file).close();
    const db = createDb(file);
    const rows = db.prepare("SELECT * FROM notes ORDER BY id").all();

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Стара нотатка");
    db.close();
  });
});

describe("PATCH /api/notes/:id/archive", () => {
  it("archives and unarchives the caller's own note", async () => {
    const archived = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: true })
      .expect(200);
    expect(archived.body.archived).toBe(true);
    expect(archived.body).not.toHaveProperty("user_id");

    const restored = await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: false })
      .expect(200);
    expect(restored.body.archived).toBe(false);
  });

  it("rejects a non-boolean archived value", async () => {
    await asOlya(request(app).patch("/api/notes/1/archive"))
      .send({ archived: "yes" })
      .expect(400);
  });

  it("will not archive someone else's note", async () => {
    await asOlya(request(app).patch("/api/notes/3/archive"))
      .send({ archived: true })
      .expect(404);
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
