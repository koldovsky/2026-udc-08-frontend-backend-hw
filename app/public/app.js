// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const showArchivedCheckbox = document.querySelector("#show-archived");

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

async function load() {
  const res = await fetch("/api/notes", { headers: headers() });
  const notes = await res.json();
  const showArchived = showArchivedCheckbox.checked;

  const filtered = showArchived ? notes.filter((n) => n.archived) : notes.filter((n) => !n.archived);

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

      const buttons = document.createElement("div");
      buttons.className = "buttons";

      if (showArchived) {
        const unarchive = document.createElement("button");
        unarchive.textContent = "Повернути з архіву";
        unarchive.addEventListener("click", async () => {
          await fetch(`/api/notes/${n.id}`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({ archived: false }),
          });
          load();
        });
        buttons.append(unarchive);
      } else {
        const archive = document.createElement("button");
        archive.textContent = "Архівувати";
        archive.addEventListener("click", async () => {
          await fetch(`/api/notes/${n.id}`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({ archived: true }),
          });
          load();
        });
        buttons.append(archive);
      }

      const del = document.createElement("button");
      del.textContent = "Видалити";
      del.addEventListener("click", async () => {
        await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
        load();
      });

      buttons.append(del);
      li.append(grow, buttons);
      return li;
    }),
  );

  if (filtered.length === 0) {
    if (showArchived) {
      empty.textContent = "Архівованих нотаток немає.";
    } else {
      empty.textContent = "Нотаток поки немає.";
    }
  }
  empty.hidden = filtered.length > 0;
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
showArchivedCheckbox.addEventListener("change", load);
load();
