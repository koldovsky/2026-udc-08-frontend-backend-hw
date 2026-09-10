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

  // List the caller's own notes. `?archived=` filters: "0" active only,
  // "1" archived only, "all" both. Anything else is a client mistake.
  app.get("/api/notes", (req, res) => {
    const filter = req.query.archived === undefined ? "0" : String(req.query.archived);
    if (!["0", "1", "all"].includes(filter)) {
      return res.status(400).json({ error: "archived must be 0, 1 or all" });
    }

    const rows =
      filter === "all"
        ? db
            .prepare(
              "SELECT id, title, body, created_at, archived FROM notes WHERE user_id = ? ORDER BY id",
            )
            .all(req.userId)
        : db
            .prepare(
              "SELECT id, title, body, created_at, archived FROM notes WHERE user_id = ? AND archived = ? ORDER BY id",
            )
            .all(req.userId, Number(filter));

    res.json(rows);
  });

  // Read one of the caller's own notes.
  //
  // The owner is part of the WHERE clause, not an if-statement afterwards:
  // a note belonging to somebody else is never loaded in the first place, so
  // there is no row sitting in memory for a later refactor to leak. A note
  // that exists but belongs to another user is answered exactly like one that
  // does not exist — "403, wrong owner" would still confirm it is there, and
  // that existence is itself somebody else's business.
  app.get("/api/notes/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid note id" });
    }

    const note = db
      .prepare(
        "SELECT id, title, body, created_at, archived FROM notes WHERE id = ? AND user_id = ?",
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
      .prepare("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)")
      .run(req.userId, title, body);
    const created = db
      .prepare("SELECT id, title, body, created_at FROM notes WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json(created);
  });

  // Archive or unarchive one of the caller's own notes. The owner condition
  // lives in the UPDATE itself: a note belonging to someone else is never
  // fetched, so there is no row to accidentally act on.
  app.patch("/api/notes/:id/archive", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid note id" });
    }
    if (typeof req.body?.archived !== "boolean") {
      return res.status(400).json({ error: "archived must be a boolean" });
    }

    const info = db
      .prepare("UPDATE notes SET archived = ? WHERE id = ? AND user_id = ?")
      .run(req.body.archived ? 1 : 0, id, req.userId);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });

    const updated = db
      .prepare("SELECT id, title, body, created_at, archived FROM notes WHERE id = ? AND user_id = ?")
      .get(id, req.userId);
    res.json(updated);
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
