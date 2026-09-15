// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const filterInputs = document.querySelectorAll('input[name="filter"]');

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

function currentFilter() {
  return document.querySelector('input[name="filter"]:checked').value;
}

let notes = [];
// Archive/delete destroy the button that was just activated, so focus would
// fall to <body>. Set only by those two handlers — never on load or filter.
let focusListAfterRender = false;

function render() {
  const showArchived = currentFilter() === "archived";
  const visible = notes.filter((n) => n.archived === showArchived);

  list.replaceChildren(
    ...visible.map((n) => {
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

      const archive = document.createElement("button");
      archive.type = "button";
      archive.textContent = showArchived ? "Повернути з архіву" : "Архівувати";
      archive.setAttribute("aria-label", `${archive.textContent}: ${n.title}`);
      archive.addEventListener("click", async () => {
        focusListAfterRender = true;
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
      del.setAttribute("aria-label", `Видалити: ${n.title}`);
      del.addEventListener("click", async () => {
        focusListAfterRender = true;
        await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
        load();
      });

      li.append(grow, archive, del);
      return li;
    }),
  );

  empty.hidden = visible.length > 0;
  empty.textContent = showArchived ? "В архіві порожньо." : "Активних нотаток немає.";

  if (focusListAfterRender) {
    list.focus();
    focusListAfterRender = false;
  }
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
filterInputs.forEach((input) => input.addEventListener("change", render));
load();
