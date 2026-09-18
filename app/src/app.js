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

// SQLite has no boolean type; `archived` is stored as 0/1. Cast it to a
// real boolean at the API boundary instead of leaking the storage detail.
function toNoteResponse(row) {
  return { ...row, archived: Boolean(row.archived) };
}

export function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(resolve(here, "../public")));

  app.use("/api", currentUser);

  // List the caller's own notes (active and archived alike; the client
  // decides which to show — see the Активні/Архів toggle in the UI).
  app.get("/api/notes", (req, res) => {
    const rows = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE user_id = ? ORDER BY id")
      .all(req.userId);
    res.json(rows.map(toNoteResponse));
  });

  // Read one of the caller's own notes. The owner check belongs in the
  // query itself — "does this id exist" is not the question; "may this
  // caller see it" is.
  app.get("/api/notes/:id", (req, res) => {
    const note = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE id = ? AND user_id = ?")
      .get(Number(req.params.id), req.userId);
    if (!note) return res.status(404).json({ error: "not found" });
    res.json(toNoteResponse(note));
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
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json(toNoteResponse(created));
  });

  // Archive or restore one of the caller's own notes. The client sends the
  // state it wants (not just "toggle") so the request is self-describing
  // and idempotent.
  app.patch("/api/notes/:id/archive", (req, res) => {
    const archived = req.body?.archived;
    if (typeof archived !== "boolean") {
      return res.status(400).json({ error: "archived must be a boolean" });
    }

    const info = db
      .prepare("UPDATE notes SET archived = ? WHERE id = ? AND user_id = ?")
      .run(archived ? 1 : 0, Number(req.params.id), req.userId);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });

    const updated = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE id = ? AND user_id = ?")
      .get(Number(req.params.id), req.userId);
    res.json(toNoteResponse(updated));
  });

  // Delete one of the caller's own notes.
  app.delete("/api/notes/:id", (req, res) => {
    const info = db
      .prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
      .run(Number(req.params.id), req.userId);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  return app;
}
