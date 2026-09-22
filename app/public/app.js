// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const filterActiveBtn = document.querySelector("#filter-active");
const filterArchivedBtn = document.querySelector("#filter-archived");

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

let view = "active";

function setView(next) {
  view = next;
  filterActiveBtn.setAttribute("aria-pressed", String(view === "active"));
  filterArchivedBtn.setAttribute("aria-pressed", String(view === "archived"));
  load();
}

async function load() {
  const res = await fetch("/api/notes", { headers: headers() });
  const notes = await res.json();
  const shown = notes.filter((n) => n.archived === (view === "archived"));

  list.replaceChildren(
    ...shown.map((n) => {
      const isArchived = n.archived;
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
      archiveBtn.textContent = isArchived ? "Повернути з архіву" : "Архівувати";
      archiveBtn.setAttribute("aria-label", `${archiveBtn.textContent} нотатку «${n.title}»`);
      archiveBtn.addEventListener("click", async () => {
        await fetch(`/api/notes/${n.id}/archive`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ archived: !isArchived }),
        });
        load();
      });

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
  empty.hidden = shown.length > 0;
  empty.textContent = view === "archived" ? "В архіві поки немає нотаток." : "Нотаток поки немає.";
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
filterActiveBtn.addEventListener("click", () => setView("active"));
filterArchivedBtn.addEventListener("click", () => setView("archived"));
load();
