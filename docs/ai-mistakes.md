# Task D — AI review log

**Tool** Codex

## 1. The seeded detail endpoint exposed another user's note

- **Task** Reproduce the authorization leak and add a regression test.
- **Observed** `GET /api/notes/3` as Olya (`x-user-id: 1`) returned HTTP 200 with `id: 3`, `user_id: 2`, the title «Приватна нотатка Тараса», the seeded synthetic body, and `created_at`.
- **Evidence** The new test failed with “expected 404, got 200” before the fix, while all nine original tests passed.
- **Fix** `app/src/app.js` now scopes the SELECT by note ID and caller ID and excludes `user_id` from the response.

## 2. The archive update passed validation and ownership checks

- **Task** Make archiving and restoring safe to retry and validate input on the server.
- **Observed** `PATCH /api/notes/:id/archive` accepts a boolean and returns an empty 204 on success.
- **Evidence** The tests send `true`, `true`, and `false` and read the saved state after each request. Invalid IDs and non-boolean values receive 400. A foreign ID and a missing ID both receive the same 404 response, and the foreign note stays active.
- **Fix** The archive implementation passed these checks as written.

## 3. The browser exposed both actions and the empty state

- **Task** Check the actual archive and restore flow and inspect the controls in the browser.
- **Observed** The DOM exposed both actions as named native buttons. They measured approximately 105 × 44 and 163 × 44 CSS pixels, with white text on `#164679` (about 9.6:1 contrast).
- **Evidence** Enter on «Архівувати» removed the note from the active list, and the archive displayed it with «Повернути з архіву». Switching to Taras showed «Архів порожній.». Restoring as Olya showed the same empty status, and the note reappeared under «Активні».
- **Fix** The archive controls passed these checks as written.

## Schema migration

`createDb` checks the table schema inside an immediate transaction and adds `archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))` when needed. Existing rows start active, and subsequent starts preserve their archive state.

A temporary database with the original schema retained the note's ID, owner, title, body, and timestamp after migration. SQLite rejected `archived = 2`, and the note remained archived after reopening the file.
