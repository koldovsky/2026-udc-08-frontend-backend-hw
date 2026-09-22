import Database from "better-sqlite3";

/**
 * Schema + seed data. In-memory by default so tests are isolated and nobody
 * has to run a migration to get started; `server.js` uses a file so the UI
 * keeps its data between restarts.
 *
 * Everything here is synthetic.
 */

const NOTES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS notes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL REFERENCES users(id),
    title     TEXT NOT NULL,
    body      TEXT NOT NULL DEFAULT '',
    archived  INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

export function createDb(file = ":memory:") {
  const db = new Database(file);
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id    INTEGER PRIMARY KEY,
      name  TEXT NOT NULL
    );
    ${NOTES_SCHEMA};
  `);

  migrateArchivedColumn(db);

  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_notes_user_archived ON notes (user_id, archived, id)",
  );

  const seeded = db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0;
  if (!seeded) {
    // Одна транзакція: напівзасіяна база (є users, немає notes) інакше
    // назавжди виглядала б як «уже засіяна».
    db.transaction(() => {
      db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(1, "Оля");
      db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(2, "Тарас");
      const ins = db.prepare("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)");
      ins.run(1, "Список покупок", "хліб, кава");
      ins.run(1, "Ідеї для відпустки", "Карпати восени");
      ins.run(2, "Приватна нотатка Тараса", "пароль від сейфа: 1234");
    })();
  }

  return db;
}

/**
 * Міграція для баз, створених до появи колонки `archived` (наприклад,
 * `notes.db` з попереднього запуску). Три випадки:
 *
 *  - колонки немає → `ALTER TABLE ... ADD COLUMN` з тим самим означенням;
 *  - колонка є і означення збігається (INTEGER NOT NULL DEFAULT 0 + CHECK) →
 *    нічого не робимо;
 *  - колонка є, але означення розійшлося (інший тип, nullable, без CHECK —
 *    наприклад, від ранішої версії міграції) → перебудовуємо таблицю з
 *    нормалізацією значень. Перевіряти лише ім'я колонки замало: `archived
 *    TEXT` мовчки зробила б усі нотатки «не 0 і не 1».
 *
 * Наявні рядки в усіх випадках зберігаються; старі нотатки стають
 * неархівованими.
 */
function migrateArchivedColumn(db) {
  const col = db
    .prepare(
      "SELECT type, [notnull] AS not_null, dflt_value FROM pragma_table_info('notes') WHERE name = 'archived'",
    )
    .get();

  if (!col) {
    db.exec(
      "ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))",
    );
    return "added";
  }

  const sql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notes'")
    .get().sql;
  const hasCheck = /archived\s+IN\s*\(\s*0\s*,\s*1\s*\)/i.test(sql);
  const matches =
    String(col.type).toUpperCase() === "INTEGER" &&
    col.not_null === 1 &&
    col.dflt_value === "0" &&
    hasCheck;
  if (matches) return "ok";

  db.transaction(() => {
    db.exec(NOTES_SCHEMA.replace("notes", "notes_migrated"));
    db.exec(`
      INSERT INTO notes_migrated (id, user_id, title, body, archived, created_at)
      SELECT id, user_id, title, body,
             CASE WHEN archived IN (1, '1', 'true', 'TRUE') THEN 1 ELSE 0 END,
             created_at
      FROM notes;
      DROP TABLE notes;
      ALTER TABLE notes_migrated RENAME TO notes;
    `);
  })();
  return "rebuilt";
}
