// -----------------------------
// Persistance
// status: 0=neutre, 1=à acheter, 2=acheté
// Custom items: state.__custom[catId] = ["item", ...]
// -----------------------------
const LS_KEY = "courses_bring_like_v3";
const state = loadState();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  toast("Sauvegardé");
}

let toastT = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 650);
}

// -----------------------------
// Données (JSON externe + fallback)
// -----------------------------
const FALLBACK_DATA = {
  schema_version: 1,
  store_aisle_order: ["droguerie", "bazar", "animalerie", "hygiène", "liquides", "apéro", "épicerie", "crèmerie", "charcuterie", "fruits et légumes", "poissonnerie", "boucherie", "surgelés"],
  categories: []
};

async function loadData() {
  try {
    const r = await fetch("./grocery_data.json", { cache: "no-store" });
    if (!r.ok) throw new Error("fetch failed");
    return await r.json();
  } catch (e) {
    return FALLBACK_DATA;
  }
}

// -----------------------------
// Helpers
// -----------------------------
const app = {
  q: document.getElementById("q"),
  meta: document.getElementById("meta"),
  selected: document.getElementById("selected"),
  bought: document.getElementById("bought"),
  catalog: document.getElementById("catalog"),
  qaText: document.getElementById("qaText"),
  qaCat: document.getElementById("qaCat"),
  qaBtn: document.getElementById("qaBtn"),
};

function normalize(s) {
  return (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function makeKey(catId, name) {
  return ("i__" + catId + "__" + name).toLowerCase().replace(/\s+/g, "_");
}

function getItemState(key) {
  const it = state[key] || {};
  return { status: (it.status ?? 0), name: it.name, catId: it.catId };
}

function setItemState(key, patch) {
  state[key] = state[key] || {};
  Object.assign(state[key], patch);
  saveState();
}

function groupByCategory(keys, catOrder) {
  const map = new Map(catOrder.map(id => [id, []]));
  keys.forEach(k => {
    const it = state[k];
    if (!it) return;
    if (!map.has(it.catId)) map.set(it.catId, []);
    map.get(it.catId).push(k);
  });
  return catOrder.map(id => [id, map.get(id) || []]).filter(([, arr]) => arr.length > 0);
}

function categoryTitleById(data) {
  const m = new Map();
  data.categories.forEach(c => m.set(c.id, c.title));
  return m;
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function ensureCustomBucket() {
  if (!state.__custom) state.__custom = {}; // { catId: [name,...] }
}

// -----------------------------
// Custom items handling
// -----------------------------
function mergedItemsForCategory(cat) {
  // cat.items from JSON + custom in localStorage, dedup case-insensitive
  ensureCustomBucket();
  const base = (cat.items || []).slice();
  const extra = (state.__custom[cat.id] || []).slice();
  const seen = new Set(base.map(x => normalize(x)));
  extra.forEach(x => {
    if (x && !seen.has(normalize(x))) base.push(x);
  });
  return base;
}

function addCustomItem(catId, name) {
  ensureCustomBucket();
  const n = name.trim();
  if (!n) return false;
  const keyNorm = normalize(n);
  if (!state.__custom[catId]) state.__custom[catId] = [];

  // dedup against custom list
  if (state.__custom[catId].some(x => normalize(x) === keyNorm)) return true;

  state.__custom[catId].push(n);
  saveState();
  return true;
}

// -----------------------------
// Rendu
// -----------------------------
function renderSelected(data) {
  const titleMap = categoryTitleById(data);

  const selectedKeys = Object.keys(state).filter(k => state[k]?.status === 1);
  if (selectedKeys.length === 0) {
    app.selected.innerHTML = `
      <div class="card">
        <div class="tapHint">Tape un article dans le <b>Catalogue</b> (ou via <b>Ajout rapide</b>) pour l'ajouter ici. Re-tape ici pour le passer en <b>Acheté</b>.</div>
      </div>`;
    return;
  }

  const groups = groupByCategory(selectedKeys, data.store_aisle_order);
  
  // Nouveau rendu avec séparateurs simples (trait gras) au lieu de cartes séparées
  let html = '<div class="selectedContainer">';
  let firstGroup = true;
  
  groups.forEach(([catId, keys]) => {
    const catTitle = titleMap.get(catId) || catId;
    const lis = keys
      .sort((a, b) => (state[a].name || "").localeCompare(state[b].name || "", "fr"))
      .map(k => `
        <li class="item" data-key="${k}" data-action="markBought">
          <span class="pill">${escapeHtml(catTitle)}</span>
          <span class="name">${escapeHtml(state[k].name)}</span>
          <span class="muted">→ Acheté</span>
        </li>`).join("");

    // Ajouter un séparateur (trait gras) avant chaque catégorie sauf la première
    if (!firstGroup) {
      html += '<div class="categorySeparator"></div>';
    }
    firstGroup = false;
    
    html += `<ul class="selectedItems">${lis}</ul>`;
  });
  
  html += '</div>';
  app.selected.innerHTML = html;
}

function renderBought(data) {
  const titleMap = categoryTitleById(data);

  const boughtKeys = Object.keys(state).filter(k => state[k]?.status === 2);
  if (boughtKeys.length === 0) {
    app.bought.innerHTML = `
      <div class="card">
        <div class="tapHint">Les articles passés en <b>Acheté</b> apparaissent ici, triés par tes rayons.</div>
      </div>`;
    return;
  }

  const groups = groupByCategory(boughtKeys, data.store_aisle_order);
  app.bought.innerHTML = groups.map(([catId, keys]) => {
    const catTitle = titleMap.get(catId) || catId;
    const lis = keys
      .sort((a, b) => (state[a].name || "").localeCompare(state[b].name || "", "fr"))
      .map(k => `
        <li class="item" data-key="${k}" data-action="unbuy">
          <span class="pill">${escapeHtml(catTitle)}</span>
          <span class="name muted" style="text-decoration:line-through;">${escapeHtml(state[k].name)}</span>
          <span class="muted">↩︎</span>
        </li>`).join("");

    return `
      <div class="card">
        <div class="cardHeader">
          <div>
            <p class="catTitle">${escapeHtml(catTitle)}</p>
            <p class="catSub">${keys.length} acheté(s)</p>
          </div>
        </div>
        <ul class="items">${lis}</ul>
      </div>`;
  }).join("");
}

function renderCatalog(data) {
  const q = normalize(app.q.value);
  const titleMap = categoryTitleById(data);

  const byId = new Map(data.categories.map(c => [c.id, c]));
  const orderedCats = [
    ...data.store_aisle_order.filter(id => byId.has(id)).map(id => byId.get(id)),
    ...data.categories.filter(c => !data.store_aisle_order.includes(c.id))
  ];

  app.catalog.innerHTML = orderedCats.map(cat => {
    const mergedItems = mergedItemsForCategory(cat);

    const lines = mergedItems.map(name => {
      const key = makeKey(cat.id, name);

      // ensure metadata at least once
      if (!state[key]) state[key] = { status: 0, name, catId: cat.id };
      else {
        state[key].name = state[key].name || name;
        state[key].catId = state[key].catId || cat.id;
      }

      const st = getItemState(key).status;
      const badge = st === 1 ? "• À acheter" : (st === 2 ? "✓ Acheté" : "");
      const visible = !q || normalize(name).includes(q);
      if (!visible) return "";

      return `
        <li class="item" data-key="${key}" data-action="toggleSelect">
          <span class="name">${escapeHtml(name)} <span class="muted">${escapeHtml(badge)}</span></span>
        </li>`;
    }).join("");

    if (!lines.trim()) return "";

    const countSelected = Object.keys(state).filter(k => state[k]?.catId === cat.id && state[k]?.status === 1).length;

    return `
      <div class="card">
        <div class="cardHeader">
          <details open>
            <summary>
              <div>
                <p class="catTitle">${escapeHtml(cat.title || titleMap.get(cat.id) || cat.id)}</p>
                <p class="catSub">${countSelected ? countSelected + " à acheter" : "—"}</p>
              </div>
              <span class="muted">▼</span>
            </summary>
            <div class="tapHint">Tap = ajouter/enlever "À acheter".</div>
          </details>
        </div>
        <ul class="items">${lines}</ul>
      </div>`;
  }).join("");

  saveState(); // persist any metadata + custom merge bookkeeping
}

function renderAll(data) {
  app.meta.textContent = "Sauvegarde locale • Tap catalogue = À acheter • Tap À acheter = Acheté";
  renderSelected(data);
  renderBought(data);
  renderCatalog(data);
}

// -----------------------------
// Actions
// -----------------------------
function handleTap(e, data) {
  const li = e.target.closest(".item");
  if (!li) return;
  const key = li.getAttribute("data-key");
  const action = li.getAttribute("data-action");
  if (!key || !action) return;

  if (action === "toggleSelect") {
    const cur = getItemState(key).status;
    const next = (cur === 0) ? 1 : (cur === 1 ? 0 : 1); // 2->1
    setItemState(key, { status: next });
    renderAll(data);
    return;
  }
  if (action === "markBought") {
    setItemState(key, { status: 2 });
    renderAll(data);
    return;
  }
  if (action === "unbuy") {
    setItemState(key, { status: 1 });
    renderAll(data);
    return;
  }
}

function populateQuickAddCats(data) {
  // order = store aisles; label uses title; default = épicerie
  const titleMap = categoryTitleById(data);
  const byId = new Map(data.categories.map(c => [c.id, c]));
  const ids = data.store_aisle_order.filter(id => byId.has(id));
  app.qaCat.innerHTML = ids.map(id => {
    const t = (byId.get(id)?.title) || titleMap.get(id) || id;
    return `<option value="${escapeHtml(id)}">${escapeHtml(t)}</option>`;
  }).join("");

  const defaultId = ids.includes("épicerie") ? "épicerie" : (ids[0] || "");
  if (defaultId) app.qaCat.value = defaultId;
}

function handleQuickAdd(data) {
  const raw = app.qaText.value || "";
  const name = raw.trim();
  if (!name) return;

  const catId = app.qaCat.value || "épicerie";

  // If item exists in JSON or custom, fine. Otherwise create custom.
  addCustomItem(catId, name);

  // Add to "À acheter"
  const key = makeKey(catId, name);
  state[key] = state[key] || { status: 0, name, catId };
  state[key].name = name;
  state[key].catId = catId;
  state[key].status = 1;
  saveState();

  app.qaText.value = "";
  toast("Ajouté à \"À acheter\"");
  renderAll(data);
}

// -----------------------------
// Boot
// -----------------------------
(async function () {
  const data = await loadData();
  ensureCustomBucket();

  // ensure known items metadata
  for (const cat of (data.categories || [])) {
    for (const name of (cat.items || [])) {
      const key = makeKey(cat.id, name);
      if (!state[key]) state[key] = { status: 0, name, catId: cat.id };
      else {
        state[key].name = state[key].name || name;
        state[key].catId = state[key].catId || cat.id;
      }
    }
  }
  saveState();

  populateQuickAddCats(data);
  renderAll(data);

  app.q.addEventListener("input", () => renderAll(data));
  document.getElementById("btnReset").addEventListener("click", () => {
    localStorage.removeItem(LS_KEY);
    for (const k of Object.keys(state)) delete state[k];
    toast("Réinitialisé");
    // reload page to rebuild from json cleanly
    location.reload();
  });
  document.getElementById("btnClearBought").addEventListener("click", () => {
    Object.keys(state).forEach(k => {
      if (state[k]?.status === 2) state[k].status = 0;
    });
    saveState();
    renderAll(data);
  });

  // Quick add actions
  app.qaBtn.addEventListener("click", () => handleQuickAdd(data));
  app.qaText.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      handleQuickAdd(data);
    }
  });

  document.body.addEventListener("click", (e) => handleTap(e, data));
})();
