// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const filterActiveBtn = document.querySelector("#filter-active");
const filterArchivedBtn = document.querySelector("#filter-archived");

// Task B wires this up server-side (column + endpoint). Until then the
// archived flag lives only in this tab's memory, so it resets on reload or
// on switching users.
let notes = [];
let filter = "active"; // "active" | "archived"

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

function setFilter(next) {
  filter = next;
  filterActiveBtn.setAttribute("aria-pressed", String(next === "active"));
  filterArchivedBtn.setAttribute("aria-pressed", String(next === "archived"));
  render();
}

function toggleArchive(note) {
  const previous = note.archived;
  note.archived = !previous;
  render();
  fetch(`/api/notes/${note.id}/archive`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ archived: note.archived }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`archive request failed: ${res.status}`);
    })
    .catch(() => {
      note.archived = previous;
      render();
    });
}

function render() {
  const filtered = notes.filter((n) => (filter === "archived" ? n.archived : !n.archived));

  list.replaceChildren(
    ...filtered.map((n) => {
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

      const actions = document.createElement("div");
      actions.className = "actions";

      const archiveLabel = n.archived ? "Повернути з архіву" : "Архівувати";
      const archive = document.createElement("button");
      archive.type = "button";
      archive.textContent = archiveLabel;
      archive.setAttribute("aria-label", `${archiveLabel}: «${n.title}»`);
      archive.addEventListener("click", () => toggleArchive(n));

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Видалити";
      del.setAttribute("aria-label", `Видалити нотатку «${n.title}»`);
      del.addEventListener("click", async () => {
        await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
        load();
      });

      actions.append(archive, del);
      li.append(grow, actions);
      return li;
    }),
  );

  empty.hidden = filtered.length > 0;
  empty.textContent = filter === "archived" ? "Архів порожній." : "Активних нотаток немає.";
}

async function load() {
  try {
    const res = await fetch("/api/notes", { headers: headers() });
    if (!res.ok) return;
    const fresh = await res.json();
    notes = fresh.map((n) => ({ ...n, archived: Boolean(n.archived) }));
    render();
  } catch {
    // Network error: leave the previously loaded list on screen.
  }
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

filterActiveBtn.addEventListener("click", () => setFilter("active"));
filterArchivedBtn.addEventListener("click", () => setFilter("archived"));
userSelect.addEventListener("change", load);
load();
