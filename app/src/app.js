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

export function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(resolve(here, "../public")));

  app.use("/api", currentUser);

  // SQLite has no boolean type; `archived` is stored as 0/1. Never leak that
  // storage detail to the client — always hand back a real boolean.
  const asNote = (row) => ({ ...row, archived: Boolean(row.archived) });

  // List the caller's own notes. Defaults to the active ones; pass
  // `?archived=true` to see the archived ones instead. Any other value for
  // the query param (missing, "false", garbage) is treated as "active" —
  // this is a display filter over the caller's own rows, not a security
  // boundary, so there is nothing unsafe about defaulting it.
  app.get("/api/notes", (req, res) => {
    const archived = req.query.archived === "true" ? 1 : 0;
    const rows = db
      .prepare(
        "SELECT id, title, body, archived, created_at FROM notes WHERE user_id = ? AND archived = ? ORDER BY id",
      )
      .all(req.userId, archived);
    res.json(rows.map(asNote));
  });

  // Read one of the caller's own notes. The ownership check is part of the
  // SELECT itself (WHERE id = ? AND user_id = ?), not a check performed on
  // the row after fetching it — a mismatched id and a mismatched owner both
  // come back as "not found", so the response never reveals which one it was.
  app.get("/api/notes/:id", (req, res) => {
    const note = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE id = ? AND user_id = ?")
      .get(Number(req.params.id), req.userId);
    if (!note) return res.status(404).json({ error: "not found" });
    res.json(asNote(note));
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
    res.status(201).json(asNote(created));
  });

  // Archive or unarchive one of the caller's own notes.
  app.patch("/api/notes/:id/archive", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid note id" });
    }

    const archived = req.body?.archived;
    if (typeof archived !== "boolean") {
      return res.status(400).json({ error: "archived must be a boolean" });
    }

    // The ownership check lives in the WHERE clause of the write itself —
    // not as a lookup-then-check afterwards — so there is no window where a
    // row is fetched before we know the caller is allowed to touch it.
    const info = db
      .prepare("UPDATE notes SET archived = ? WHERE id = ? AND user_id = ?")
      .run(archived ? 1 : 0, id, req.userId);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });

    const note = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE id = ?")
      .get(id);
    res.json(asNote(note));
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
