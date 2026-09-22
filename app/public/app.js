// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const status = document.querySelector("#status");

const viewButtons = {
  active: document.querySelector("#view-active"),
  archive: document.querySelector("#view-archive"),
};

// Archive state comes from the server (`archived` on each note), so it survives
// a reload and is scoped to the caller by the query behind /api/notes.
let view = "active";

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

function say(message) {
  status.textContent = message;
}

// Every row repeats the same wording, so the visible text alone never says
// which note a button belongs to — the accessible name has to.
function rowButton(text, accessibleName) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.setAttribute("aria-label", accessibleName);
  return button;
}

// A row's own button disappears when the note leaves the current view, which
// would drop focus to <body>. Hand focus to the view switcher instead.
function refocus() {
  viewButtons[view].focus();
}

function showView(next) {
  view = next;
  say("");
  load();
}

async function load() {
  const res = await fetch("/api/notes", { headers: headers() });
  const notes = await res.json();

  const archivedCount = notes.filter((n) => n.archived).length;
  viewButtons.active.textContent = `Активні (${notes.length - archivedCount})`;
  viewButtons.archive.textContent = `Архів (${archivedCount})`;
  for (const [name, button] of Object.entries(viewButtons)) {
    button.setAttribute("aria-pressed", String(name === view));
  }

  const shown = notes.filter((n) => n.archived === (view === "archive"));

  list.replaceChildren(
    ...shown.map((n) => {
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

      const archiveText = n.archived ? "Повернути з архіву" : "Архівувати";
      const archive = rowButton(archiveText, `${archiveText} «${n.title}»`);
      archive.addEventListener("click", async () => {
        const res = await fetch(`/api/notes/${n.id}/archive`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ archived: !n.archived }),
        });
        await load();
        refocus();
        // Never announce success without looking at the response.
        if (!res.ok) return say("Не вдалося змінити стан нотатки.");
        say(n.archived ? "Нотатку повернуто з архіву." : "Нотатку архівовано.");
      });

      const del = rowButton("Видалити", `Видалити «${n.title}»`);
      del.addEventListener("click", async () => {
        const res = await fetch(`/api/notes/${n.id}`, {
          method: "DELETE",
          headers: headers(),
        });
        await load();
        refocus();
        if (!res.ok) return say(`Не вдалося видалити нотатку «${n.title}».`);
        say(`Нотатку «${n.title}» видалено.`);
      });

      li.append(grow, archive, del);
      return li;
    }),
  );

  empty.textContent =
    view === "archive" ? "В архіві поки нічого немає." : "Нотаток поки немає.";
  empty.hidden = shown.length > 0;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.querySelector("#title");
  const body = document.querySelector("#body");
  const res = await fetch("/api/notes", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title: title.value, body: body.value }),
  });

  // `required` in the HTML lets a whitespace-only title through, and the server
  // is right to refuse it. Say so, and keep what was typed.
  if (!res.ok) {
    const problem = await res.json().catch(() => ({}));
    title.focus();
    return say(problem.error ? `Не вдалося додати нотатку: ${problem.error}` : "Не вдалося додати нотатку.");
  }

  title.value = "";
  body.value = "";
  // A new note is never archived, so showing the archive here would look like
  // the note was silently dropped.
  view = "active";
  await load();
  say("Нотатку додано.");
});

viewButtons.active.addEventListener("click", () => showView("active"));
viewButtons.archive.addEventListener("click", () => showView("archive"));

userSelect.addEventListener("change", () => {
  say("");
  load();
});

load();
