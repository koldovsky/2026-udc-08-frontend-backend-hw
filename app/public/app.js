// Minimal UI. No framework and no build step on purpose: the point of this
// homework is the seam between UI, API, database and authorization, not the
// view layer. Keep it that way — do not introduce a bundler.

const userSelect = document.querySelector("#user");
const list = document.querySelector("#notes");
const empty = document.querySelector("#empty");
const emptyArchived = document.querySelector("#empty-archived");
const form = document.querySelector("#new-note");
const tabActive = document.querySelector("#tab-active");
const tabArchived = document.querySelector("#tab-archived");

let currentTab = "active";

function headers() {
  return { "content-type": "application/json", "x-user-id": userSelect.value };
}

function switchTab(tab) {
  currentTab = tab;
  tabActive.classList.toggle("active", tab === "active");
  tabArchived.classList.toggle("active", tab === "archived");

  if (tab === "active") {
    tabActive.setAttribute("aria-current", "page");
    tabArchived.removeAttribute("aria-current");
  } else {
    tabArchived.setAttribute("aria-current", "page");
    tabActive.removeAttribute("aria-current");
  }

  form.hidden = tab === "archived";
  load();
}

tabActive.addEventListener("click", () => switchTab("active"));
tabArchived.addEventListener("click", () => switchTab("archived"));

async function load() {
  const requestedTab = currentTab;
  const url = requestedTab === "archived" ? "/api/notes?archived=true" : "/api/notes";
  const res = await fetch(url, { headers: headers() });
  const notes = await res.json();

  if (currentTab !== requestedTab) {
    return;
  }

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

      const toggleArchiveBtn = document.createElement("button");
      toggleArchiveBtn.type = "button";
      if (currentTab === "active") {
        toggleArchiveBtn.textContent = "Архівувати";
        toggleArchiveBtn.className = "btn-archive";
        toggleArchiveBtn.setAttribute("aria-label", `Архівувати нотатку «${n.title}»`);
        toggleArchiveBtn.addEventListener("click", async () => {
          await fetch(`/api/notes/${n.id}/archive`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({ archived: true }),
          });
          load();
        });
      } else {
        toggleArchiveBtn.textContent = "Відновити";
        toggleArchiveBtn.className = "btn-restore";
        toggleArchiveBtn.setAttribute("aria-label", `Відновити нотатку «${n.title}» з архіву`);
        toggleArchiveBtn.addEventListener("click", async () => {
          await fetch(`/api/notes/${n.id}/archive`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({ archived: false }),
          });
          load();
        });
      }

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-delete";
      del.textContent = "Видалити";
      del.setAttribute("aria-label", `Видалити нотатку «${n.title}»`);
      del.addEventListener("click", async () => {
        await fetch(`/api/notes/${n.id}`, { method: "DELETE", headers: headers() });
        load();
      });

      actions.append(toggleArchiveBtn, del);
      li.append(grow, actions);
      return li;
    }),
  );

  if (currentTab === "active") {
    empty.hidden = notes.length > 0;
    emptyArchived.hidden = true;
  } else {
    empty.hidden = true;
    emptyArchived.hidden = notes.length > 0;
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

userSelect.addEventListener("change", load);
load();
