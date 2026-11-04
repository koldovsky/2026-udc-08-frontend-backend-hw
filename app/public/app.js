// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const noteView = document.querySelector("#note-view");
const error = document.querySelector("#error");
let loadVersion = 0;

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

async function load() {
  const version = ++loadVersion;
  const requestHeaders = headers();
  const archived = noteView.value === "archived";
  let notes;
  try {
    const res = await fetch("/api/notes", { headers: requestHeaders });
    if (!res.ok) throw new Error();
    notes = (await res.json()).filter((note) => note.archived === archived);
  } catch {
    if (version === loadVersion) error.textContent = "Не вдалося завантажити нотатки.";
    return;
  }
  if (version !== loadVersion) return;

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
      actions.className = "note-actions";
      const archive = document.createElement("button");
      archive.type = "button";
      archive.className = "archive-note";
      archive.textContent = archived ? "Повернути з архіву" : "Архівувати";
      archive.addEventListener("click", async () => {
        archive.disabled = true;
        error.textContent = "";
        try {
          const res = await fetch(`/api/notes/${n.id}/archive`, {
            method: "PATCH",
            headers: requestHeaders,
            body: JSON.stringify({ archived: !archived }),
          });
          if (!res.ok) throw new Error();
          await load();
        } catch {
          if (archive.isConnected) error.textContent = "Не вдалося змінити стан архіву.";
        } finally {
          archive.disabled = false;
        }
      });

      const del = document.createElement("button");
      del.textContent = "Видалити";
      del.addEventListener("click", async () => {
        await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: requestHeaders });
        load();
      });

      actions.append(archive, del);
      li.append(grow, actions);
      return li;
    }),
  );
  empty.hidden = notes.length > 0;
  empty.textContent = archived ? "Архів порожній." : "Активних нотаток поки немає.";
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

function changeView() {
  list.replaceChildren();
  empty.hidden = true;
  error.textContent = "";
  load();
}

userSelect.addEventListener("change", changeView);
noteView.addEventListener("change", changeView);
load();
