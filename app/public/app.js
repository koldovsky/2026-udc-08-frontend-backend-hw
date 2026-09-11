// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const filterActive = document.querySelector("#filter-active");
const filterArchived = document.querySelector("#filter-archived");

let showArchived = false;

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

function setFilter(archived) {
  showArchived = archived;
  filterActive.setAttribute("aria-pressed", String(!archived));
  filterArchived.setAttribute("aria-pressed", String(archived));
  form.hidden = archived;
  load();
}

function noteCard(n) {
  const archived = Boolean(n.archived);
  const li = document.createElement("li");
  if (archived) li.classList.add("archived");

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
    archived ? `Повернути з архіву «${n.title}»` : `Архівувати «${n.title}»`,
  );
  archiveBtn.addEventListener("click", async () => {
    await fetch(`/api/notes/${n.id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ archived: !archived }),
    });
    load();
  });

  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "Видалити";
  del.setAttribute("aria-label", `Видалити «${n.title}»`);
  del.addEventListener("click", async () => {
    await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
    load();
  });

  actions.append(archiveBtn, del);
  li.append(grow, actions);
  return li;
}

async function load() {
  const res = await fetch("/api/notes", { headers: headers() });
  const notes = await res.json();
  const visible = notes.filter((n) => Boolean(n.archived) === showArchived);

  list.replaceChildren(...visible.map(noteCard));

  empty.hidden = visible.length > 0;
  empty.textContent = showArchived
    ? "Архівованих нотаток немає."
    : "Нотаток поки немає.";
}

filterActive.addEventListener("click", () => setFilter(false));
filterArchived.addEventListener("click", () => setFilter(true));

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

userSelect.addEventListener("change", load);
load();
