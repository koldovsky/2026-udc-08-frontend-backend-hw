# Task E (bonus) — Path 3: Authorization test suite

**What we did:** Added and retained tests that exercise each API endpoint as a different authenticated user (Olya, user ID 1) against Taras's seeded data (user ID 2, note ID 3), or that try to spoof ownership during creation.

| Endpoint | Cross-user or spoofing scenario | Expected | Actual automated result |
|---|---|---|---|
| `GET /api/notes` | User 1 lists notes; user 2's seeded note ID `3` must not appear. | `200` containing only user 1's collection, without ID `3`. | Passed: `does not include another user's seeded note` asserts the returned IDs do not contain `3`. |
| `GET /api/notes/:id` | User 1 requests user 2's note: `GET /api/notes/3`. | `404` without the note data. | Passed: `will not read someone else's note` expects `404`. |
| `POST /api/notes` | User 1 posts valid note data plus a spoofed `user_id: 2`. | `201`; the new note belongs to user 1, appears in user 1's list, and is absent from user 2's list. | Passed: `ignores a client-supplied user_id when creating a note` verifies the new ID is present only in user 1's list. |
| `DELETE /api/notes/:id` | User 1 attempts to delete user 2's note ID `3`. | `404`; user 2's note remains available to user 2. | Passed: `will not delete someone else's note` expects `404` and confirms user 2 still has one note. |
| `PATCH /api/notes/:id/archive` | User 1 sends valid `{ "archived": true }` for user 2's note ID `3`. | `404`; user 2's archive state remains `false`. | Passed: `will not change another user's note` expects `404` and confirms user 2's note remains unarchived. |

## Test result

`npm.cmd test` completed with **16 / 16 passing tests**.

## Earlier manual reproduction, separate from automated evidence

Before the Task C fix, we manually ran:

```bash
curl -i -H "x-user-id: 1" http://localhost:3080/api/notes/3
```

It returned `200 OK` with Taras's synthetic seeded private note. After the ownership condition was added to the read query, the same curl returned `404` with `{"error":"not found"}`. The automated `GET /api/notes/:id` regression test above preserves this scenario.

## What these tests verify

These tests verify the listed cross-user read, list-isolation, delete, archive, and create-ownership-spoofing scenarios. They do not prove the entire application is secure or cover every possible authorization, authentication, validation, or deployment scenario.
