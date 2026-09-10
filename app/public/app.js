// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const form = document.querySelector("#new-note");
const showArchived = document.querySelector("#show-archived");

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

async function load() {
  const scope = showArchived.checked ? "all" : "0";
  const res = await fetch(`/api/notes?archived=${scope}`, { headers: headers() });
  const notes = await res.json();

  list.replaceChildren(
    ...notes.map((n) => {
      const archived = Boolean(n.archived);
      const li = document.createElement("li");
      if (archived) li.className = "archived";

      const grow = document.createElement("div");
      grow.className = "grow";
      const title = document.createElement("strong");
      title.textContent = n.title;
      grow.append(title);

      if (archived) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Архів";
        grow.append(" ", badge);
      }

      const body = document.createElement("span");
      body.textContent = n.body;
      const when = document.createElement("small");
      when.textContent = n.created_at;
      grow.append(document.createElement("br"), body, document.createElement("br"), when);

      // A real <button> with real text: reachable by keyboard and announced
      // by a screen reader without an aria-label crutch.
      const archive = document.createElement("button");
      archive.type = "button";
      archive.textContent = archived ? "Повернути з архіву" : "Архівувати";
      archive.setAttribute(
        "aria-label",
        `${archived ? "Повернути з архіву" : "Архівувати"}: ${n.title}`,
      );
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
      del.setAttribute("aria-label", `Видалити: ${n.title}`);
      del.addEventListener("click", async () => {
        await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
        load();
      });

      li.append(grow, archive, del);
      return li;
    }),
  );

  empty.textContent = showArchived.checked
    ? "Нотаток поки немає."
    : "Активних нотаток немає — можливо, вони в архіві.";
  empty.hidden = notes.length > 0;
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
showArchived.addEventListener("change", load);
load();
