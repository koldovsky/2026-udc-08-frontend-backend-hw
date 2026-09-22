// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const filterActiveBtn = document.querySelector("#filter-active");
const filterArchivedBtn = document.querySelector("#filter-archived");

let showArchived = false;

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

function setFilter(archived) {
  showArchived = archived;
  filterActiveBtn.setAttribute("aria-pressed", String(!archived));
  filterArchivedBtn.setAttribute("aria-pressed", String(archived));
  load();
}

function render(notes) {
  list.replaceChildren(
    ...notes.map((n) => {
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

      const archiveBtn = document.createElement("button");
      archiveBtn.type = "button";
      archiveBtn.textContent = n.archived ? "Повернути з архіву" : "Архівувати";
      archiveBtn.setAttribute(
        "aria-label",
        `${n.archived ? "Повернути з архіву" : "Архівувати"} нотатку «${n.title}»`,
      );
      archiveBtn.addEventListener("click", async () => {
        await fetch(`/api/notes/${n.id}/archive`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ archived: !n.archived }),
        });
        load();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Видалити";
      del.setAttribute("aria-label", `Видалити нотатку «${n.title}»`);
      del.addEventListener("click", async () => {
        await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
        load();
      });

      actions.append(archiveBtn, del);
      li.append(grow, actions);
      return li;
    }),
  );

  empty.hidden = notes.length > 0;
  empty.textContent = showArchived
    ? "В архіві поки немає нотаток."
    : "Активних нотаток немає.";
}

async function load() {
  const res = await fetch(`/api/notes?archived=${showArchived}`, { headers: headers() });
  const notes = await res.json();
  render(notes);
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

filterActiveBtn.addEventListener("click", () => setFilter(false));
filterArchivedBtn.addEventListener("click", () => setFilter(true));

userSelect.addEventListener("change", () => {
  setFilter(false);
});

load();
