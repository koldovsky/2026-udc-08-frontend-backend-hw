import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createDb } from "../src/db.js";

// Simulates a notes.db written before the archived column existed, to prove
// createDb() migrates an existing file in place rather than only handling a
// fresh CREATE TABLE.
let dir;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

it("adds the archived column to a pre-existing db without losing data", () => {
  dir = mkdtempSync(join(tmpdir(), "notes-db-migration-"));
  const file = join(dir, "notes.db");

  const legacy = new Database(file);
  legacy.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  legacy.prepare("INSERT INTO users (id, name) VALUES (1, 'Оля')").run();
  legacy.prepare("INSERT INTO notes (user_id, title, body) VALUES (1, 'Стара нотатка', 'до міграції')").run();
  legacy.close();

  const migrated = createDb(file);

  const columns = migrated.prepare("PRAGMA table_info(notes)").all().map((c) => c.name);
  expect(columns).toContain("archived");

  const note = migrated.prepare("SELECT title, archived FROM notes WHERE title = ?").get("Стара нотатка");
  expect(note.archived).toBe(0);

  migrated.close();
});
