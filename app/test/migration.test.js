import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../src/db.js";

/**
 * Усі API-тести працюють із `:memory:`, тобто гілка міграції там ніколи не
 * виконується. Тут — файлова база зі старою схемою, як `notes.db` після
 * засіяного коду.
 */
const LEGACY = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE notes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL REFERENCES users(id),
    title     TEXT NOT NULL,
    body      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO users (id, name) VALUES (1, 'Оля');
  INSERT INTO notes (id, user_id, title, body, created_at)
    VALUES (7, 1, 'Стара нотатка', 'до міграції', '2026-01-01 00:00:00');
`;

let dir;
const open = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function legacyFile(extraSql = "") {
  dir = mkdtempSync(join(tmpdir(), "ws8-"));
  const file = join(dir, "notes.db");
  const raw = new Database(file);
  raw.exec(LEGACY + extraSql);
  raw.close();
  return file;
}

const archivedColumn = (db) =>
  db.prepare("SELECT type, [notnull] AS not_null, dflt_value FROM pragma_table_info('notes') WHERE name = 'archived'").get();

describe("міграція колонки archived", () => {
  it("додає колонку і не чіпає наявні рядки", () => {
    const db = createDb(legacyFile());
    open.push(db);
    expect(archivedColumn(db)).toEqual({ type: "INTEGER", not_null: 1, dflt_value: "0" });
    expect(db.prepare("SELECT id, title, archived, created_at FROM notes").all()).toEqual([
      { id: 7, title: "Стара нотатка", archived: 0, created_at: "2026-01-01 00:00:00" },
    ]);
    // Сід не дублюється: у базі вже був користувач.
    expect(db.prepare("SELECT COUNT(*) AS n FROM users").get().n).toBe(1);
  });

  it("CHECK не пускає нічого, крім 0 і 1", () => {
    const db = createDb(legacyFile());
    open.push(db);
    expect(() => db.prepare("UPDATE notes SET archived = 7").run()).toThrow();
  });

  it("ідемпотентна: повторне відкриття нічого не змінює", () => {
    const file = legacyFile();
    createDb(file).close();
    const db = createDb(file);
    open.push(db);
    expect(db.prepare("SELECT COUNT(*) AS n FROM notes").get().n).toBe(1);
    expect(archivedColumn(db)).toEqual({ type: "INTEGER", not_null: 1, dflt_value: "0" });
  });

  it("перебудовує колонку, якщо її означення розійшлося (archived TEXT без CHECK)", () => {
    const file = legacyFile(`
      ALTER TABLE notes ADD COLUMN archived TEXT;
      UPDATE notes SET archived = 'true';
      INSERT INTO notes (id, user_id, title, archived) VALUES (8, 1, 'Ще одна', '0');
    `);
    const db = createDb(file);
    open.push(db);
    expect(archivedColumn(db)).toEqual({ type: "INTEGER", not_null: 1, dflt_value: "0" });
    expect(db.prepare("SELECT id, archived FROM notes ORDER BY id").all()).toEqual([
      { id: 7, archived: 1 },
      { id: 8, archived: 0 },
    ]);
    expect(() => db.prepare("UPDATE notes SET archived = 7").run()).toThrow();
    // AUTOINCREMENT живе далі, а не починає з 1.
    const info = db.prepare("INSERT INTO notes (user_id, title) VALUES (1, 'нова')").run();
    expect(Number(info.lastInsertRowid)).toBeGreaterThan(8);
  });
});
