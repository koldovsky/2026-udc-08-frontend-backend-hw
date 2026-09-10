# Task C — авторизація

## C2. Засіяна діра: відтворення

Маршрут `GET /api/notes/:id` у засіяному коді (`app/src/app.js`):

```js
const note = db
  .prepare("SELECT id, user_id, title, body, created_at FROM notes WHERE id = ?")
  .get(Number(req.params.id));
```

Межа даних, які поверне цей маршрут, береться **з `id` в URL і більше
нізвідки**. `req.userId` тут не використовується взагалі — middleware
`currentUser` знає, хто дзвонить, але запит цим не цікавиться.

### Відтворено власними руками

Живий сервер, `http://localhost:3080`. Оля — `x-user-id: 1`, нотатка №3
належить Тарасу (`user_id: 2`).

```http
GET /api/notes/3
x-user-id: 1
```

Повернулось **200 OK**:

```json
{
  "id": 3,
  "user_id": 2,
  "title": "Приватна нотатка Тараса",
  "body": "пароль від сейфа: 1234",
  "created_at": "2026-09-10 18:59:45"
}
```

Оля прочитала **пароль від сейфа Тараса**. Показово, що в цей самий момент
`GET /api/notes` віддавав їй список **без** цієї нотатки: список скоупився
правильно, а читання одного запису — ні. Саме тому дірка й не помітна з UI.

Це IDOR — Insecure Direct Object Reference. Додатково маршрут віддавав
`user_id`, тобто ще й підтверджував, **кому** належить нотатка.

### Чому 9 засіяних тестів лишались зеленими

Набір ніколи не ставив це питання. `will not delete someone else's note` —
крос-юзерний тест, але **на видалення**: `DELETE` мав `AND user_id = ?` і був
коректний від початку. Читання ніхто не питав, тож дірка спокійно жила під
зеленим прапорцем.

## Тест, який червонів до правки

`app/test/authorization.test.js`. Запуск **на коді до фіксу**:

```text
❯ test/authorization.test.js (13 tests | 4 failed)
  × will not let one user read another user's note
    → expected 404 "Not Found", got 200 "OK"
  × does not leak the contents of someone else's note
    → expected '{"id":3,"user_id":2,"title":"Приватна…' not to contain 'пароль'
  × answers the same way for a missing note and for someone else's
    → expected 200 to be 404
  × does not expose user_id on the caller's own note either
    → expected { id: 1, user_id: 1, …(3) } to not have property "user_id"

Tests  4 failed | 33 passed (37)
```

Другий тест буквально впіймав рядок «пароль» у відповіді, призначеній Олі.

## Правка

```js
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
```

Три зміни:

1. **`AND user_id = ?` — в самому запиті.** Не `if (note.user_id !== req.userId)`
   після вибірки. Різниця не косметична: при перевірці постфактум чужий рядок
   уже лежить у памʼяті процесу, і будь-який наступний рефакторинг —
   логування, кеш, новий `return` вище — знову його випускає. Рядок, який не
   вибрано, витекти не може.
2. **`user_id` прибрано з `SELECT`.** Внутрішня колонка; клієнт і так знає,
   ким увійшов.
3. **Валідація `id`** — узгоджено з новим ендпоінтом архівування.

**404, а не 403.** Відповідь «403, це чужа нотатка» все одно підтверджує, що
нотатка існує. Наявність запису — теж інформація про іншого користувача, тож
чужа й неіснуюча нотатка мають бути невідрізняльними. Закріплено тестом
`answers the same way for a missing note and for someone else's`, який звіряє
і статус, і тіло.

## C1. Власний ендпоінт

`PATCH /api/notes/:id/archive` писався з цією ж умовою від початку:

```sql
UPDATE notes SET archived = ? WHERE id = ? AND user_id = ?
```

Власник — частина `UPDATE`. Якщо нотатка чужа, `info.changes === 0` і
маршрут відповідає 404: чужий рядок не вибирається й не змінюється.

Тести не обмежуються кодом відповіді — `leaves the other user's note
untouched after a refused archive` перевіряє, що після відмови нотатка
**справді** не змінила стан. 404 на виході ще не доводить, що нічого не
сталося дорогою.

## Прохід кожним маршрутом «не тим користувачем»

Живий сервер, Оля стукає в нотатку №3 (Тарасову):

| Запит | Очікувано | Отримано |
|---|---|---|
| `GET /api/notes/3` | 404 | ✅ 404 |
| `PATCH /api/notes/3/archive` | 404 | ✅ 404 |
| `DELETE /api/notes/3` | 404 | ✅ 404 |
| `GET /api/notes/1` без заголовка | 401 | ✅ 401 |
| `GET /api/notes` без заголовка | 401 | ✅ 401 |

Нотатка Тараса після всіх спроб на місці.

`POST /api/notes` перевірено окремо: `user_id` у тілі запиту ігнорується —
власник береться з заголовка, підкинути нотатку в чужий акаунт не вийде.

### Зведення по маршрутах

| Маршрут | Звідки межа даних |
|---|---|
| `GET /api/notes` | `WHERE user_id = ?` — було коректно |
| `GET /api/notes/:id` | ❌ лише `id` → ✅ **виправлено** |
| `POST /api/notes` | `req.userId` при вставці — коректно |
| `PATCH /api/notes/:id/archive` | `AND user_id = ?` — наш, з умовою від початку |
| `DELETE /api/notes/:id` | `AND user_id = ?` — було коректно |

## Результат

```text
Test Files  3 passed (3)
     Tests  37 passed (37)
```

9 засіяних + 15 на фічу + 13 на авторизацію. Тести на авторизацію лежать
окремим файлом навмисно: коли «фіча працює» і «чуже недосяжне» змішані в
одному зеленому наборі, перше починає читатись як доказ другого — рівно так
засіяна діра й пережила девʼять зелених тестів.
