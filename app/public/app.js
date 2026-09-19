// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const filterInputs = document.querySelectorAll("#filter input[name=filter]");

let notes = [];
let filter = "active";

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
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

      const archiveBtn = document.createElement("button");
      archiveBtn.textContent = n.archived ? "Повернути з архіву" : "Архівувати";
      archiveBtn.setAttribute(
        "aria-label",
        n.archived ? `Повернути з архіву нотатку «${n.title}»` : `Архівувати нотатку «${n.title}»`,
      );
      archiveBtn.setAttribute("aria-pressed", String(n.archived));
      archiveBtn.addEventListener("click", () => toggleArchive(n));

      const del = document.createElement("button");
      del.textContent = "Видалити";
      del.setAttribute("aria-label", `Видалити нотатку «${n.title}»`);
      del.addEventListener("click", async () => {
        await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
        load();
      });

      li.append(grow, archiveBtn, del);
      return li;
    }),
  );

  empty.hidden = filtered.length > 0;
  empty.textContent = filter === "archived" ? "Архів порожній." : "Нотаток поки немає.";
}

async function load() {
  const res = await fetch("/api/notes", { headers: headers() });
  const data = await res.json();
  notes = data.map((n) => ({ ...n, archived: Boolean(n.archived) }));
  render();
}

async function toggleArchive(note) {
  const previous = note.archived;
  note.archived = !previous;
  render();

  try {
    const res = await fetch(`/api/notes/${note.id}/archive`, { method: "PATCH", headers: headers() });
    if (!res.ok) throw new Error("archive toggle failed");
    const updated = await res.json();
    note.archived = Boolean(updated.archived);
  } catch {
    note.archived = previous;
  }
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

userSelect.addEventListener("change", load);
filterInputs.forEach((input) =>
  input.addEventListener("change", () => {
    filter = input.value;
    render();
  }),
);
load();
