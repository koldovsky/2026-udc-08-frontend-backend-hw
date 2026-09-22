// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const heading = document.querySelector("#list-heading");
const empty = document.querySelector("#empty");
const status = document.querySelector("#status");
const errorBox = document.querySelector("#error");
const form = document.querySelector("#new-note");
const titleInput = document.querySelector("#title");
const bodyInput = document.querySelector("#body");
const submitButton = form.querySelector('button[type="submit"]');
const filterButtons = [...document.querySelectorAll(".filter")];

/** Який список показуємо: "active" або "archived". */
let filter = "active";
/** Усі нотатки поточного користувача — фільтруємо локально. */
let notes = [];
/**
 * Лічильник завантажень: відповідь на старий запит (користувача вже
 * перемкнули) не має перезаписати свіжий список.
 */
let loadSeq = 0;

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

/**
 * Один шлях для всіх запитів: мережева помилка та відповідь не-2xx стають
 * винятком із текстом для людини. Сервер — джерело правди: якщо він
 * відмовив, не вдаємо, що вийшло.
 */
async function api(url, options = {}) {
  let res;
  try {
    res = await fetch(url, { ...options, headers: headers() });
  } catch {
    throw Object.assign(new Error("Немає зв'язку з сервером."), { status: 0 });
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* не JSON — нижче віддамо лише статус */
  }
  if (!res.ok) {
    const detail = data?.error ? `: ${data.error}` : ".";
    throw Object.assign(new Error(`Сервер відповів ${res.status}${detail}`), { status: res.status });
  }
  return data;
}

const announce = (text) => { status.textContent = text; };
const showError = (text) => {
  errorBox.textContent = text;
  if (text) status.textContent = "";
};

function formatWhen(createdAt) {
  // SQLite datetime('now') — UTC без зони: "2026-09-22 11:24:03".
  const date = new Date(createdAt.replace(" ", "T") + "Z");
  const time = document.createElement("time");
  time.dateTime = date.toISOString();
  time.textContent = Number.isNaN(date.getTime()) ? createdAt : date.toLocaleString("uk-UA");
  return time;
}

/** Кнопка зі справжнім текстом і зрозумілою назвою для скрінрідера. */
function actionButton({ kind, label, ariaLabel, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.kind = kind;
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  button.addEventListener("click", onClick);
  return button;
}

function noteItem(note) {
  const li = document.createElement("li");
  li.dataset.id = note.id;
  if (note.archived) li.classList.add("is-archived");

  const grow = document.createElement("div");
  grow.className = "grow";
  const title = document.createElement("strong");
  title.textContent = note.title;
  if (note.archived) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "В архіві";
    title.append(badge);
  }
  grow.append(title);
  if (note.body) {
    const body = document.createElement("span");
    body.textContent = note.body;
    grow.append(body, document.createElement("br"));
  }
  const when = document.createElement("small");
  when.append(formatWhen(note.created_at));
  grow.append(when);

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    actionButton({
      kind: "archive",
      label: note.archived ? "Повернути з архіву" : "Архівувати",
      ariaLabel: note.archived
        ? `Повернути з архіву нотатку «${note.title}»`
        : `Архівувати нотатку «${note.title}»`,
      onClick: (event) =>
        mutate(li, "archive", event, {
          run: () =>
            api(`/api/notes/${note.id}/archive`, {
              method: "PATCH",
              body: JSON.stringify({ archived: !note.archived }),
            }),
          done: note.archived
            ? `Нотатку «${note.title}» повернуто з архіву.`
            : `Нотатку «${note.title}» переміщено в архів.`,
          failed: "Не вдалося змінити стан архіву.",
        }),
    }),
    actionButton({
      kind: "delete",
      label: "Видалити",
      ariaLabel: `Видалити нотатку «${note.title}»`,
      onClick: (event) =>
        mutate(li, "delete", event, {
          run: () => api(`/api/notes/${note.id}`, { method: "DELETE" }),
          done: `Нотатку «${note.title}» видалено.`,
          failed: "Не вдалося видалити нотатку.",
        }),
    }),
  );

  li.append(grow, actions);
  return li;
}

/**
 * Дія над рядком: кнопки рядка вимкнені, поки триває запит (подвійний клік
 * шле один запит); після відповіді список перечитується з сервера — і при
 * успіху, і при помилці, щоб екран показував реальний стан.
 */
async function mutate(li, kind, event, { run, done, failed }) {
  const buttons = [...li.querySelectorAll("button")];
  for (const b of buttons) b.disabled = true;
  const index = [...list.children].indexOf(li);
  // event.detail === 0 — активовано з клавіатури; мишці фокус не чіпаємо.
  const fromKeyboard = event.detail === 0;
  const seqBefore = loadSeq;
  showError("");

  let failure = null;
  try {
    await run();
  } catch (err) {
    failure = err;
  }
  // Поки чекали, користувача перемкнули — наш рядок уже не на екрані.
  const pageChanged = seqBefore !== loadSeq;
  const loaded = await load();
  if (pageChanged) return;
  if (failure) {
    for (const b of buttons) b.disabled = false;
    showError(`${failed} ${failure.message}`);
    return;
  }
  if (!loaded) return;
  announce(done);
  if (fromKeyboard) restoreFocus(index, kind);
}

/**
 * Рядок зник — фокус не має впасти на <body>. Ставимо його на кнопку того ж
 * типу в тому ж місці списку (або на останню), інакше — на активний фільтр.
 * Саме «того ж типу»: після «Видалити» фокус на сусідньому «Архівувати» +
 * випадковий пробіл = заархівована не та нотатка.
 */
function restoreFocus(index, kind) {
  const same = [...list.querySelectorAll(`button[data-kind="${kind}"]`)];
  const target =
    same[Math.min(index, same.length - 1)] ??
    filterButtons.find((b) => b.dataset.filter === filter);
  target?.focus();
}

function render() {
  const active = notes.filter((n) => !n.archived);
  const archived = notes.filter((n) => n.archived);
  for (const button of filterButtons) {
    const own = button.dataset.filter === "archived" ? archived : active;
    button.textContent = `${button.dataset.filter === "archived" ? "Архів" : "Активні"} (${own.length})`;
    button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
  }
  heading.textContent = filter === "archived" ? "Архів" : "Активні нотатки";

  const visible = filter === "archived" ? archived : active;
  list.replaceChildren(...visible.map(noteItem));
  empty.textContent = visible.length
    ? ""
    : filter === "archived"
      ? "В архіві порожньо."
      : "Активних нотаток поки немає — можливо, вони в архіві.";
}

/** Перечитує всі нотатки користувача. Повертає true, якщо список свіжий. */
async function load() {
  const seq = ++loadSeq;
  try {
    const rows = await api("/api/notes?archived=all");
    if (seq !== loadSeq) return false;
    notes = rows;
    render();
    return true;
  } catch (err) {
    if (seq !== loadSeq) return false;
    notes = [];
    render();
    empty.textContent = "";
    showError(`Не вдалося завантажити нотатки. ${err.message}`);
    return false;
  }
}

function setFilter(next) {
  if (next === filter) return;
  filter = next;
  render();
}

for (const button of filterButtons) {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showError("");
  try {
    await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: titleInput.value, body: bodyInput.value }),
    });
    titleInput.value = "";
    bodyInput.value = "";
    titleInput.removeAttribute("aria-invalid");
    // Нова нотатка завжди активна — показуємо список, у який вона потрапила.
    setFilter("active");
    if (await load()) announce("Нотатку створено.");
  } catch (err) {
    // Введене лишаємо: користувач не має набирати все заново.
    showError(`Не вдалося створити нотатку. ${err.message}`);
    if (err.status === 400) {
      titleInput.setAttribute("aria-invalid", "true");
      titleInput.focus();
    }
  } finally {
    submitButton.disabled = false;
  }
});

userSelect.addEventListener("change", () => {
  filter = "active";
  showError("");
  announce("");
  load();
});

load();
