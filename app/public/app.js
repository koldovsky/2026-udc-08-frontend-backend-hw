// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const filterActive = document.querySelector("#filter-active");
const filterArchived = document.querySelector("#filter-archived");
const notesPanel = document.querySelector("#notes-panel");
const filterTabs = [filterActive, filterArchived];
const filterValues = ["active", "archived"];

let filter = "active";
let allNotes = [];

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

function isArchived(note) {
  return Boolean(note.archived);
}

function renderNote(n) {
  const archived = isArchived(n);
  const li = document.createElement("li");

  const grow = document.createElement("div");
  grow.className = "grow";
  const title = document.createElement("strong");
  title.textContent = n.title;
  const body = document.createElement("span");
  body.textContent = n.body;
  const when = document.createElement("small");
  when.textContent = n.created_at;
  grow.append(title, body, document.createElement("br"), when);
  if (archived) {
    const badge = document.createElement("small");
    badge.className = "note-status";
    badge.textContent = "В архіві";
    grow.append(document.createElement("br"), badge);
  }

  const actions = document.createElement("div");
  actions.className = "actions";

  const archive = document.createElement("button");
  archive.type = "button";
  archive.textContent = archived ? "Повернути з архіву" : "Архівувати";
  archive.addEventListener("click", async () => {
    await fetch(`/api/notes/${n.id}/archive`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ archived: !archived }),
    });
    load();
  });

  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "Видалити";
  del.addEventListener("click", async () => {
    await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
    load();
  });

  actions.append(archive, del);
  li.append(grow, actions);
  return li;
}

function filterIndex() {
  return filter === "archived" ? 1 : 0;
}

function activateFilter(index, { moveFocus = false } = {}) {
  filter = filterValues[index];
  renderList();
  if (moveFocus) filterTabs[index].focus();
}

function renderList() {
  const showingArchived = filter === "archived";
  const visible = allNotes.filter((note) => isArchived(note) === showingArchived);
  const archivedCount = allNotes.filter(isArchived).length;
  const activeCount = allNotes.length - archivedCount;
  const selected = filterIndex();

  filterActive.setAttribute("aria-selected", showingArchived ? "false" : "true");
  filterArchived.setAttribute("aria-selected", showingArchived ? "true" : "false");
  notesPanel.setAttribute("aria-labelledby", showingArchived ? "filter-archived" : "filter-active");
  filterActive.textContent = `Активні (${activeCount})`;
  filterArchived.textContent = `Архів (${archivedCount})`;
  filterTabs.forEach((tab, i) => {
    tab.tabIndex = i === selected ? 0 : -1;
  });

  list.replaceChildren(...visible.map(renderNote));
  empty.hidden = visible.length > 0;
  empty.textContent = showingArchived
    ? "В архіві поки порожньо. Натисніть «Архівувати» на нотатці, щоб вона з’явилась тут."
    : "Активних нотаток немає.";
}

async function load() {
  const res = await fetch("/api/notes", { headers: headers() });
  allNotes = await res.json();
  renderList();
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
  filter = "active";
  load();
});

filterActive.addEventListener("click", () => activateFilter(0));
filterArchived.addEventListener("click", () => activateFilter(1));
document.querySelector("#filters").addEventListener("keydown", (e) => {
  const last = filterTabs.length - 1;
  let index = filterIndex();
  if (e.key === "ArrowRight") index = index === last ? 0 : index + 1;
  else if (e.key === "ArrowLeft") index = index === 0 ? last : index - 1;
  else if (e.key === "Home") index = 0;
  else if (e.key === "End") index = last;
  else return;
  e.preventDefault();
  activateFilter(index, { moveFocus: true });
});

userSelect.addEventListener("change", () => {
  filter = "active";
  load();
});
load();
