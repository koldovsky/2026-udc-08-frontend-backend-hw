# AI observations and mistakes (Task D)

**Tool/model:** Codex

## 1. Task A stayed within the requested UI-only scope

- **What we asked:** Implement Archive/Restore UI without implementing Task B's database or API work.
- **What the AI produced:** An in-memory archive state keyed by note ID, Active/Archived controls, Archive/Restore buttons, empty states, and accessibility styling. It did not change backend routes or schema.
- **How we verified it:** In the browser, we checked Active/Archived views, archiving and restoring, empty states, native buttons in the DOM, approximately 44px targets, and visible keyboard focus.
- **Fix:** No fix needed. The temporary in-memory implementation was intentionally replaced later in Task B.
- **Evidence:** Task A browser verification; Task A changes were limited to `app/public/`.

## 2. Initial test failure was an environment/tooling problem, not generated-code failure

- **What we asked:** Run the existing test suite after Task A.
- **What the AI produced:** It ran the suite, which initially could not load `better-sqlite3`.
- **How we verified it:** The initial test failure reported a native-module ABI mismatch: the installed module was built for ABI 127, while the runtime expected ABI 137. A subsequent clean `npm install` failed because NVM was still selecting Node `24.16.0` despite an earlier Node 22 installation. Its installation log confirmed Node `24.16.0` and that no prebuilt binary was available.
- **Fix:** No application-code fix was needed. We switched NVM to Node `22.23.2`, removed `node_modules`, and reinstalled dependencies. The 9 baseline tests then passed.
- **Evidence:** The original test error named `better_sqlite3.node` and the incompatible ABI versions; after the Node/dependency correction, `npm test` reported 9 passing tests.

## 3. Task B persistence and API integration worked end to end

- **What we asked:** Add persistent archive state, a conditional SQLite migration, validated archive/restore API, tests, and replace Task A's temporary UI state.
- **What the AI produced:** An `archived` SQLite column with default `0`, a conditional migration for existing `notes.db`, `PATCH /api/notes/:id/archive` accepting a boolean, API-backed frontend behavior, and archive tests.
- **How we verified it:** The automated suite passed with 13 tests. In the browser, we archived a note, refreshed the page, and confirmed it remained archived.
- **Fix:** No fix needed.
- **Evidence:** `npm test` reported 13 passing tests; browser refresh retained the archived note, demonstrating server/database persistence.

## 4. Seeded cross-user read vulnerability was reproduced, tested, and fixed

- **What we asked:** Inspect authorization without prematurely fixing the seeded vulnerable endpoint; then add a failing regression test and apply the minimal SQL fix.
- **What the AI produced:** It identified `GET /api/notes/:id` as querying only by note ID, added a regression test expecting a 404 for Olya reading Taras's note, and later scoped the lookup by both note ID and caller ID.
- **How we verified it:** The vulnerability was intentionally seeded in the starter repository; it was not introduced by the AI. Before the fix:

  ```bash
  curl -i -H "x-user-id: 1" http://localhost:3080/api/notes/3
  ```

  returned `200 OK` with user 2's private synthetic seeded note, including:

  ```json
  {
    "id": 3,
    "user_id": 2,
    "title": "Приватна нотатка Тараса",
    "body": "пароль від сейфа: 1234"
  }
  ```

  The added test failed with `expected 404 "Not Found", got 200 "OK"`.
- **Fix:** Changed the lookup from `WHERE id = ?` to `WHERE id = ? AND user_id = ?`, binding the requested ID and `req.userId`.
- **Evidence:** After the fix, all 14 tests passed. Repeating the same curl returned `404` with `{"error":"not found"}`.
