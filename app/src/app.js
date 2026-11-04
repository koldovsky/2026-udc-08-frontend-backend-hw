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
    const rows = db
      .prepare("SELECT id, title, body, created_at, archived FROM notes WHERE user_id = ? ORDER BY id")
      .all(req.userId);
    res.json(rows.map((note) => ({ ...note, archived: Boolean(note.archived) })));
  });

  // Read one note.
  app.get("/api/notes/:id", (req, res) => {
    const note = db
      .prepare("SELECT id, title, body, created_at FROM notes WHERE id = ? AND user_id = ?")
      .get(Number(req.params.id), req.userId);
    if (!note) return res.status(404).json({ error: "not found" });
    res.json(note);
  });

  // Create a note for the caller.
  app.post("/api/notes", (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body : "";
    if (!title) return res.status(400).json({ error: "title is required" });

    const created = db
      .prepare("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?) RETURNING id, title, body, created_at")
      .get(req.userId, title, body);
    res.status(201).json(created);
  });

  // Set the requested state so retrying the same request is safe.
  app.patch("/api/notes/:id/archive", (req, res) => {
    const id = Number(req.params.id);
    if (!/^[0-9]+$/.test(req.params.id) || !Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid note id" });
    }
    const archived = req.body?.archived;
    if (typeof archived !== "boolean") {
      return res.status(400).json({ error: "archived must be a boolean" });
    }

    const result = db
      .prepare("UPDATE notes SET archived = ? WHERE id = ? AND user_id = ?")
      .run(Number(archived), id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: "not found" });
    res.status(204).end();
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
