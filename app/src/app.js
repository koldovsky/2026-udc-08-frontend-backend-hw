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
function currentUser(db) {
  return (req, res, next) => {
    const id = Number(req.header("x-user-id"));
    if (!Number.isInteger(id) || id <= 0 || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) {
      return res.status(401).json({ error: "not authenticated" });
    }
    req.userId = id;
    next();
  };
}

export function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(resolve(here, "../public")));

  app.use("/api", currentUser(db));

  // List the caller's own notes.
  app.get("/api/notes", (req, res) => {
    const rows = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE user_id = ? ORDER BY id")
      .all(req.userId);
    res.json(rows.map((n) => ({ ...n, archived: !!n.archived })));
  });

  // Read one of the caller's own notes.
  app.get("/api/notes/:id", (req, res) => {
    const note = db
      .prepare("SELECT id, title, body, archived, created_at FROM notes WHERE id = ? AND user_id = ?")
      .get(Number(req.params.id), req.userId);
    if (!note) return res.status(404).json({ error: "not found" });
    res.json({ ...note, archived: !!note.archived });
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
    res.status(201).json({ ...created, archived: !!created.archived });
  });

  // Archive/unarchive one of the caller's own notes.
  app.patch("/api/notes/:id/archive", (req, res) => {
    const { archived } = req.body ?? {};
    if (typeof archived !== "boolean") {
      return res.status(400).json({ error: "archived must be a boolean" });
    }
    const note = db
      .prepare(
        "UPDATE notes SET archived = ? WHERE id = ? AND user_id = ? " +
          "RETURNING id, title, body, archived, created_at",
      )
      .get(archived ? 1 : 0, Number(req.params.id), req.userId);
    if (!note) return res.status(404).json({ error: "not found" });
    res.json({ ...note, archived: !!note.archived });
  });

  // Delete one of the caller's own notes.
  app.delete("/api/notes/:id", (req, res) => {
    const info = db
      .prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
      .run(Number(req.params.id), req.userId);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  // Catch-all: never let an error's message/stack (file paths, SQL, etc.)
  // reach the client. Log it server-side, send a generic JSON body.
  app.use((err, req, res, next) => {
    console.error(err);
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: status === 400 ? "bad request" : "internal server error" });
  });

  return app;
}
