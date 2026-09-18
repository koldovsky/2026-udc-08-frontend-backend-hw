// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const viewActiveBtn = document.querySelector("#view-active");
const viewArchivedBtn = document.querySelector("#view-archived");

let notes = [];
let view = "active"; // "active" | "archived"

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

function emptyMessage() {
  return view === "archived" ? "В архіві поки нічого немає." : "Нотаток поки немає.";
}

function renderNote(n) {
  const archived = n.archived;

  const li = document.createElement("li");
  li.className = "note" + (archived ? " note--archived" : "");

  const grow = document.createElement("div");
  grow.className = "grow";
  const title = document.createElement("strong");
  title.textContent = n.title;
  const body = document.createElement("span");
  body.textContent = n.body;
  const when = document.createElement("small");
  when.textContent = n.created_at;
  grow.append(title, body, document.createElement("br"), when);

  const actions = document.createElement("div");
  actions.className = "actions";

  const archiveBtn = document.createElement("button");
  archiveBtn.type = "button";
  archiveBtn.textContent = archived ? "Повернути з архіву" : "Архівувати";
  archiveBtn.setAttribute(
    "aria-label",
    archived
      ? `Повернути нотатку «${n.title}» з архіву`
      : `Архівувати нотатку «${n.title}»`,
  );
  archiveBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`/api/notes/${n.id}/archive`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ archived: !archived }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      load();
    } catch (err) {
      alert("Не вдалося оновити статус архіву. Спробуйте ще раз.");
    }
  });

  const del = document.createElement("button");
  del.textContent = "Видалити";
  del.setAttribute("aria-label", `Видалити нотатку «${n.title}»`);
  del.addEventListener("click", async () => {
    await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
    load();
  });

  actions.append(archiveBtn, del);
  li.append(grow, actions);
  return li;
}

function render() {
  const visible = notes.filter((n) => (view === "archived" ? n.archived : !n.archived));
  list.replaceChildren(...visible.map(renderNote));
  empty.textContent = emptyMessage();
  empty.hidden = visible.length > 0;
}

function setView(next) {
  view = next;
  viewActiveBtn.setAttribute("aria-pressed", String(view === "active"));
  viewArchivedBtn.setAttribute("aria-pressed", String(view === "archived"));
  render();
}

async function load() {
  const res = await fetch("/api/notes", { headers: headers() });
  notes = await res.json();
  render();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.querySelector("#title");
  const body = document.querySelector("#body");
  await fetch("/api/notes", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title: title.value, body: body.value }),
  });
  title.value = "";
  body.value = "";
  load();
});

viewActiveBtn.addEventListener("click", () => setView("active"));
viewArchivedBtn.addEventListener("click", () => setView("archived"));
userSelect.addEventListener("change", load);
load();
