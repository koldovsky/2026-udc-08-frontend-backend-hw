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

  // List the caller's own notes.
  app.get("/api/notes", (req, res) => {
    const isArchived = req.query.archived === "true" || req.query.archived === "1" ? 1 : 0;
    const rows = db
      .prepare(
        "SELECT id, title, body, is_archived, created_at FROM notes WHERE user_id = ? AND is_archived = ? ORDER BY id"
      )
      .all(req.userId, isArchived);
    res.json(rows);
  });

  // Read one note owned by the caller.
  app.get("/api/notes/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid note id" });
    }
    const note = db
      .prepare(
        "SELECT id, title, body, is_archived, created_at FROM notes WHERE id = ? AND user_id = ?"
      )
      .get(id, req.userId);
    if (!note) return res.status(404).json({ error: "not found" });
    res.json(note);
  });

  // Create a note for the caller.
  app.post("/api/notes", (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body : "";
    if (!title) return res.status(400).json({ error: "title is required" });

    const info = db
      .prepare("INSERT INTO notes (user_id, title, body, is_archived) VALUES (?, ?, ?, 0)")
      .run(req.userId, title, body);
    const created = db
      .prepare("SELECT id, title, body, is_archived, created_at FROM notes WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json(created);
  });

  // Archive or unarchive one of caller's notes.
  app.patch("/api/notes/:id/archive", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid note id" });
    }
    if (typeof req.body?.archived !== "boolean") {
      return res.status(400).json({ error: "archived must be a boolean" });
    }

    const archivedVal = req.body.archived ? 1 : 0;
    const info = db
      .prepare("UPDATE notes SET is_archived = ? WHERE id = ? AND user_id = ?")
      .run(archivedVal, id, req.userId);

    if (info.changes === 0) {
      return res.status(404).json({ error: "not found" });
    }

    const updated = db
      .prepare(
        "SELECT id, title, body, is_archived, created_at FROM notes WHERE id = ? AND user_id = ?"
      )
      .get(id, req.userId);
    res.json(updated);
  });

  // Delete one of the caller's own notes.
  app.delete("/api/notes/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid note id" });
    }
    const info = db
      .prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
      .run(id, req.userId);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  return app;
}
