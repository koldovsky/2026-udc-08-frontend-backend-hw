# Task E — Authorization tests

The Supertest suite exercises each API route as Olya or Taras against a fresh database.

| Endpoint | Cross-user check | Expected and observed |
|---|---|---|
| `GET /api/notes` | List as each seeded user | 200 with only that user's notes |
| `GET /api/notes/:id` | Olya requests Taras's note 3 | 404 |
| `POST /api/notes` | Olya submits `user_id: 2` with the new note | 201, with the new note in Olya's list and only the original note in Taras's list |
| `DELETE /api/notes/:id` | Olya deletes Taras's note 3 | 404, with Taras's note still present |
| `PATCH /api/notes/:id/archive` | Olya archives Taras's note 3 | 404, with Taras's note still active |

The seeded detail read was the only cross-user leak found. Creation takes ownership from the caller header and returns its projected fields directly from the insert.
