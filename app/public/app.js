// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const viewButtons = document.querySelectorAll("[data-view]");
let currentView = "active";
let notes = [];

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

function render() {
  const visibleNotes = notes.filter((note) =>
    currentView === "archived" ? note.archived : !note.archived,
  );

  list.replaceChildren(
    ...visibleNotes.map((note) => {
      const li = document.createElement("li");
      const isArchived = note.archived;

      const grow = document.createElement("div");
      grow.className = "grow";
      const title = document.createElement("strong");
      title.textContent = note.title;
      const body = document.createElement("span");
      body.textContent = note.body;
      const when = document.createElement("small");
      when.textContent = note.created_at;
      grow.append(title, body, document.createElement("br"), when);

      if (isArchived) {
        const status = document.createElement("span");
        status.className = "status";
        status.textContent = "Archived";
        grow.append(document.createElement("br"), status);
      }

      const actions = document.createElement("div");
      actions.className = "actions";

      const archive = document.createElement("button");
      archive.type = "button";
      archive.textContent = isArchived ? "Restore" : "Archive";
      archive.addEventListener("click", async () => {
        await fetch(`/api/notes/${note.id}/archive`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ archived: !isArchived }),
        });
        load();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Видалити";
      del.addEventListener("click", async () => {
        await fetch(`/api/notes/${note.id}`, { method: "DELETE", headers: headers() });
        load();
      });

      actions.append(archive, del);
      li.append(grow, actions);
      return li;
    }),
  );

  empty.textContent = currentView === "archived" ? "No archived notes yet." : "No active notes yet.";
  empty.hidden = visibleNotes.length > 0;
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

userSelect.addEventListener("change", load);
viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    viewButtons.forEach((viewButton) => {
      viewButton.setAttribute("aria-pressed", String(viewButton === button));
    });
    render();
  });
});
load();
