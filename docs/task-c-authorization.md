# Task C — авторизація

Записано під час виконання ДЗ до воркшопу 8. Порядок дій саме той, який просить
`docs/walkthrough.md`: спочатку **відтворити** витік руками, потім **тест, який
червоніє на коді до правки**, і лише потім сама правка.

## 1. Аудит усіх маршрутів

Питання до кожного маршруту: **звідки береться межа даних, які він повертає?**

| Маршрут | Межа даних | Висновок |
|---|---|---|
| `GET /api/notes` | `WHERE user_id = ?` | обмежено власником |
| `GET /api/notes/:id` | **`WHERE id = ?` — лише id із запиту** | **діра** |
| `POST /api/notes` | вставляє `req.userId` | обмежено власником |
| `PATCH /api/notes/:id/archive` | `WHERE id = ? AND user_id = ?` | обмежено власником (перевірено п. 5) |
| `DELETE /api/notes/:id` | `WHERE id = ? AND user_id = ?` | обмежено власником |

Одна діра — `GET /api/notes/:id`. Вона вижила з двох причин: **UI ніколи не
викликає цей маршрут**, а засіяний набір тестів читає лише *власну* нотатку,
тобто питання авторизації на читанні не ставить узагалі.

## 2. Відтворення витоку (до будь-яких змін на сервері)

Оля (`x-user-id: 1`) просить нотатку 3, яка належить Тарасові (`user_id: 2`):

```console
$ curl -s -i -H 'x-user-id: 1' http://localhost:3080/api/notes/3
HTTP/1.1 200 OK
{"id":3,"user_id":2,"title":"Приватна нотатка Тараса",
 "body":"пароль від сейфа: 1234","created_at":"2026-09-22 18:50:38"}
```

**Що саме повернулось:** чужий заголовок, чужий текст (зі «паролем від сейфа»)
і внутрішнє поле `user_id` — тобто і вміст, і підказка про те, кому нотатка
належить.

Для контрасту, на тих самих даних:

```console
$ curl -s -H 'x-user-id: 1' http://localhost:3080/api/notes
[{"id":1,...},{"id":2,...}]          # нотатки 3 у списку Олі немає

$ curl -s -o /dev/null -w '%{http_code}\n' -X DELETE \
    -H 'x-user-id: 1' http://localhost:3080/api/notes/3
404                                   # видалити чуже — не дає
```

Той самий ресурс: список приховує, видалення забороняє, читання **віддає**.

## 3. Тест, який червоніє до правки

Додано до `app/test/api.test.js` за зразком засіяного
`will not delete someone else's note`, але **на читання**:

```js
it("will not read someone else's note", async () => {
  await asOlya(request(app).get("/api/notes/3")).expect(404);

  const owner = await asTaras(request(app).get("/api/notes/3")).expect(200);
  expect(owner.body.title).toBe("Приватна нотатка Тараса");
});

it("does not expose internal fields on the caller's own note", async () => {
  const res = await asOlya(request(app).get("/api/notes/1")).expect(200);
  expect(res.body).not.toHaveProperty("user_id");
});
```

Запуск **на коді до правки** — обидва падають, решта 21 зелена:

```console
 ❯ test/api.test.js (23 tests | 2 failed)
   × GET /api/notes/:id > will not read someone else's note
     → expected 404 "Not Found", got 200 "OK"
   × GET /api/notes/:id > does not expose internal fields on the caller's own note
     → expected { id: 1, user_id: 1, …(3) } to not have property "user_id"

 Tests  2 failed | 21 passed (23)
```

## 4. Правка

`app/src/app.js` — власник **усередині запиту**, а не перевіркою після того, як
рядок уже дістали:

```js
const note = db
  .prepare(
    "SELECT id, title, body, created_at, archived FROM notes WHERE id = ? AND user_id = ?",
  )
  .get(id, req.userId);
if (!note) return res.status(404).json({ error: "not found" });
res.json(publicNote(note));
```

Три речі за одну правку:

- **`AND user_id = ?`** — межа даних більше не залежить лише від id у запиті;
- **404, а не 403** — сам факт існування чужої нотатки теж не справа того, хто
  питає;
- **`publicNote()`** (з Task B) — у відповіді немає `user_id`; функція перелічує
  поля явно, тож майбутній `SELECT` не розширить відповідь випадково.

Ідентифікатор проходить через `noteId()`, тому `/api/notes/abc` — це `400`, а не
`NaN`, що тихо перетворювався на `404`.

Після правки: **24 тести зелені** (включно з новими).

## 5. Чи має тест зуби? Мутаційна перевірка

Мій власний ендпоінт із Task B (`PATCH /api/notes/:id/archive`) від початку
написаний з умовою по власнику, тому крос-юзерний тест на нього зелений і
доводить сам собою нічого. Тому — тимчасово прибрано `AND user_id = ?` з
`UPDATE` і запущено набір:

```console
 ❯ test/api.test.js (24 tests | 1 failed)
   × PATCH /api/notes/:id/archive > will not archive someone else's note
     → expected 404 "Not Found", got 200 "OK"

 Tests  1 failed | 23 passed (24)
```

Рядок повернуто на місце, набір знову зелений. Тепер відомо, що тест перевіряє
саме авторизацію, а не просто «щось повертається».

## 6. Перевірка руками після правки

```
as Оля   GET /api/notes/3        → 404 {"error":"not found"}
as Тарас GET /api/notes/3        → 200 без user_id (власник читає своє)
as Оля   GET /api/notes/1        → 200 без user_id
as Оля   GET /api/notes/abc      → 400 {"error":"invalid note id"}
as Оля   GET /api/notes/999      → 404
без заголовка GET /api/notes/3   → 401 {"error":"not authenticated"}
as Оля   PATCH /api/notes/3/archive → 404, нотатка Тараса лишилась неархівованою
as Оля   DELETE /api/notes/abc   → 400
```

UI не зачеплено: він цим маршрутом не користується. Архівування, повернення з
архіву та збереження стану після перезавантаження сторінки перевірені окремо —
поводяться так само, як у кінці Task B.

> ⚠️ Під час цієї перевірки перший прогін `curl` дав старі відповіді: другий
> `npm run dev` упав з конфліктом порту, і запити обслуговував **старий процес
> із кодом до правки**. Тобто «перевірка» показувала стару поведінку і могла б
> легко стати хибним висновком в обидва боки. Правильні числа вище — з
> перезапущеного сервера. Запис про це — у `docs/ai-mistakes.md`.
