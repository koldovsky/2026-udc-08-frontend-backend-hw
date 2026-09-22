import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Pretend session. A real app would verify a signed cookie or a JWT here;
 * that is deliberately out of scope — this workshop is about what happens
 * AFTER you know who the caller is.
 *
 * The caller identifies itself with the `x-user-id` header. Seeded users are
 * 1 (Оля) and 2 (Тарас).
 */
function currentUser(req, res, next) {
  const id = Number(req.header("x-user-id"));
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(401).json({ error: "not authenticated" });
  }
  req.userId = id;
  next();
}

/**
 * One place decides what a note looks like on the wire. Fields are picked
 * explicitly so a future SELECT cannot widen the response by accident, and
 * SQLite's 0/1 becomes a real boolean.
 */
function publicNote(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    archived: Boolean(row.archived),
  };
}

/** Path params are caller-controlled: "abc", "-1" and "1.5" are not ids. */
function noteId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(resolve(here, "../public")));

  app.use("/api", currentUser);

  // List the caller's own notes, archived ones included: the client needs the
  // flag to split them into views and to count each one.
  app.get("/api/notes", (req, res) => {
    const rows = db
      .prepare(
        "SELECT id, title, body, created_at, archived FROM notes WHERE user_id = ? ORDER BY id",
      )
      .all(req.userId);
    res.json(rows.map(publicNote));
  });

  // Read one of the caller's own notes.
  app.get("/api/notes/:id", (req, res) => {
    const id = noteId(req.params.id);
    if (id === null) return res.status(400).json({ error: "invalid note id" });

    // The owner belongs in the statement. Selecting on the id alone and
    // checking afterwards would mean the database had already handed over
    // someone else's row — and one forgotten `if` would leak it.
    const note = db
      .prepare(
        "SELECT id, title, body, created_at, archived FROM notes WHERE id = ? AND user_id = ?",
      )
      .get(id, req.userId);
    // 404 rather than 403: that a note exists at all is not the caller's business.
    if (!note) return res.status(404).json({ error: "not found" });
    res.json(publicNote(note));
  });

  // Create a note for the caller.
  app.post("/api/notes", (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body : "";
    if (!title) return res.status(400).json({ error: "title is required" });

    const info = db
      .prepare("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)")
      .run(req.userId, title, body);
    const created = db
      .prepare("SELECT id, title, body, created_at, archived FROM notes WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json(publicNote(created));
  });

  // Archive or restore one of the caller's own notes. The body says which state
  // it should end up in rather than "flip whatever is there", so a retried
  // request is harmless.
  app.patch("/api/notes/:id/archive", (req, res) => {
    const id = noteId(req.params.id);
    if (id === null) return res.status(400).json({ error: "invalid note id" });

    // Strictly a boolean: "true", 1 and a missing field are all rejected. What
    // the UI happens to send is not evidence — the client is user-controlled.
    if (typeof req.body?.archived !== "boolean") {
      return res.status(400).json({ error: "archived must be a boolean" });
    }

    // The owner is part of the statement, not a check after the fact.
    const info = db
      .prepare("UPDATE notes SET archived = ? WHERE id = ? AND user_id = ?")
      .run(req.body.archived ? 1 : 0, id, req.userId);
    // Someone else's note is indistinguishable from one that does not exist.
    if (info.changes === 0) return res.status(404).json({ error: "not found" });

    const note = db
      .prepare("SELECT id, title, body, created_at, archived FROM notes WHERE id = ?")
      .get(id);
    res.json(publicNote(note));
  });

  // Delete one of the caller's own notes.
  app.delete("/api/notes/:id", (req, res) => {
    const id = noteId(req.params.id);
    if (id === null) return res.status(400).json({ error: "invalid note id" });

    const info = db
      .prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
      .run(id, req.userId);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  return app;
}
