// OrgDraft controller: state, persistence, and all UI wiring.
import {
  newPerson,
  newScenario,
  clonePeople,
  removePerson,
  wouldCreateCycle,
  summarize,
  diffAgainst,
} from "./model.js";
import { renderOrgSvg, themeFromBranding, CATEGORIES, HIRING_STAGES } from "./render.js";
import { downloadPng, downloadSvg, copyPngToClipboard } from "./exporter.js";
import { BRAND, brandingForRender } from "./brand.js";

const STORE_KEY = "orgdraft.v1";
const $ = (sel) => document.querySelector(sel);

// ---------------- state ----------------
// The chart layout is fixed to a slide-fit grid of compact cards (the layout
// controls were removed), so these never change at runtime.
const DEFAULT_BG = "#ecefff";
let state = {
  scenarios: [],
  activeId: null,
  spacing: "compact",
  report: "grid",
  bg: DEFAULT_BG,
  // Global logo settings (shared across everyone on the link, baked into exports).
  // The chart title lives per-scenario (scenario.title), so each tab has its own.
  //   logo       = a custom uploaded { dataURL, w, h }, or null to use the default.
  //   logoHidden = true to show no logo at all.
  branding: { logo: null, logoCorner: "br", logoHidden: false },
  compare: { on: false, ids: [] },
};

// The Blueprint Biosecurity logo ships as the default on every chart.
const DEFAULT_LOGO = BRAND.logo ? { dataURL: BRAND.logo, w: BRAND.logoW, h: BRAND.logoH } : null;
let zoom = null; // null => fit-to-width on next render
let rosterFilter = ""; // roster search text

const activeScenario = () => state.scenarios.find((s) => s.id === state.activeId) || state.scenarios[0];
const currentOrg = () => state.scenarios[0]; // first scenario is "the current org"

// Ensure every scenario has a valid per-scenario layout. `legacy` is an older
// doc-wide layout value (from before layout moved onto scenarios), used as the
// fallback so existing docs keep their setting.
function normalizeLayouts(legacy) {
  const fallback = legacy === "wide" ? "wide" : "stacked";
  for (const s of state.scenarios) {
    if (s.layout !== "wide" && s.layout !== "stacked") s.layout = fallback;
  }
}

// Left-to-right ordering anchor: rank each person by their position in the current
// org so every scenario draws siblings in the same order. People not in the current
// org (e.g. a proposed new role) aren't ranked and fall in after the ones that are.
function baselineOrder() {
  const m = new Map();
  const base = currentOrg();
  if (base) base.people.forEach((p, i) => m.set(p.id, i));
  return m;
}

// Shared options for every chart render/export. Layout is per-scenario; everything
// else (ordering, background) is shared.
function chartOpts(scenario, extra) {
  return {
    spacing: state.spacing,
    report: state.report,
    branding: chartBranding(scenario),
    background: state.bg,
    stack: (scenario && scenario.layout) !== "wide",
    order: baselineOrder(),
    ...extra,
  };
}

// Read a chosen logo image, size it to a small display height, and store a compact,
// self-contained data URL (so it exports and syncs without any network reference).
function loadLogoFile(file) {
  if (file.size > 4 * 1024 * 1024) {
    toast("That image is too large (max 4 MB).", true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const src = reader.result;
    const isSvg = /^data:image\/svg\+xml/i.test(src);
    const img = new Image();
    img.onload = () => {
      let h = 40;
      let w = Math.round((img.naturalWidth || h) * (h / (img.naturalHeight || h)));
      const MAXW = 220;
      if (w > MAXW) {
        h = Math.round(h * (MAXW / w));
        w = MAXW;
      }
      let dataURL = src;
      if (!isSvg) {
        // Rasterize at 2x the display size for crisp exports while keeping data small.
        const c = document.createElement("canvas");
        c.width = w * 2;
        c.height = h * 2;
        try {
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          dataURL = c.toDataURL("image/png");
        } catch (e) {
          dataURL = src;
        }
      }
      state.branding.logo = { dataURL, w, h };
      state.branding.logoHidden = false;
      save();
      renderRail();
      renderCanvas();
      toast("Logo updated.");
    };
    img.onerror = () => toast("Couldn't read that image.", true);
    img.src = src;
  };
  reader.onerror = () => toast("Couldn't read that file.", true);
  reader.readAsDataURL(file);
}

// Fixed brand colors, the per-scenario title, and the logo (custom, default, or off).
function chartBranding(scenario) {
  const b = state.branding || {};
  const custom = b.logo && b.logo.dataURL ? b.logo : null;
  return {
    accent: BRAND.accent,
    proposed: BRAND.proposed,
    title: scenario ? (scenario.title || "").trim() : "",
    logo: b.logoHidden ? null : custom || DEFAULT_LOGO,
    logoCorner: b.logoCorner || "br",
  };
}

function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage may be unavailable; the app still works in-memory */
  }
}

function save() {
  saveLocal();
  scheduleRemotePush();
}

// ---------------- shared server state ----------------
// When the backend is reachable, the org lives at the URL and everyone edits one copy.
const remote = { available: false, rev: 0, dirty: false, pushing: false, pushTimer: null };

// Private scenarios never leave the browser, so the shared copy excludes them.
function snapshot() {
  return {
    scenarios: state.scenarios.filter((s) => !s.private),
    spacing: state.spacing,
    report: state.report,
    bg: state.bg,
    branding: normalizedBranding(),
  };
}

// A safe (global) branding object with defaults filled in. Title is per-scenario.
function normalizedBranding() {
  const b = state.branding || {};
  return { logo: b.logo || null, logoCorner: b.logoCorner || "br", logoHidden: !!b.logoHidden };
}

// Apply a data payload (from server or file) into state, keeping a valid active tab.
// Private scenarios currently in state (loaded from this browser) are preserved and
// re-appended, since they aren't part of the shared payload.
function applyData(data) {
  if (!data || !Array.isArray(data.scenarios) || !data.scenarios.length) return false;
  const privates = state.scenarios.filter((s) => s && s.private);
  const sharedIds = new Set(data.scenarios.map((s) => s.id));
  state.scenarios = data.scenarios.concat(privates.filter((p) => !sharedIds.has(p.id)));
  state.spacing = "compact"; // layout is fixed
  state.report = "grid";
  state.bg = data.bg || DEFAULT_BG;
  if (data.branding && typeof data.branding === "object") {
    state.branding = {
      logo: data.branding.logo || null,
      logoCorner: data.branding.logoCorner || "br",
      logoHidden: !!data.branding.logoHidden,
    };
  }
  normalizeLayouts(data.layout);
  if (!state.activeId || !state.scenarios.some((s) => s.id === state.activeId)) {
    state.activeId = state.scenarios[0].id;
  }
  state.compare.ids = state.compare.ids.filter((id) => state.scenarios.some((s) => s.id === id));
  return true;
}

async function remoteGet() {
  try {
    const res = await fetch("/api/org", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json(); // { rev, data }
  } catch (e) {
    return null; // backend not available (e.g. plain static host)
  }
}

function scheduleRemotePush() {
  if (!remote.available) return;
  remote.dirty = true;
  clearTimeout(remote.pushTimer);
  remote.pushTimer = setTimeout(remotePush, 800);
}

async function remotePush() {
  if (!remote.available || remote.pushing) return;
  remote.pushing = true;
  try {
    const res = await fetch("/api/org", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rev: remote.rev, data: snapshot() }),
    });
    if (res.status === 200) {
      const j = await res.json();
      remote.rev = j.rev;
      remote.dirty = false;
    } else if (res.status === 409) {
      const j = await res.json();
      remote.pushing = false;
      handleConflict(j);
      return;
    }
  } catch (e) {
    /* offline; local cache holds the change and the next save retries */
  }
  remote.pushing = false;
}

function handleConflict(serverState) {
  const adopt = confirm(
    "Someone else just saved changes to this org.\n\n" +
      "OK = load their version (your last unsaved tweak is dropped)\n" +
      "Cancel = keep yours and overwrite theirs on your next change"
  );
  if (adopt) {
    applyData(serverState.data);
    remote.rev = serverState.rev;
    remote.dirty = false;
    saveLocal();
    renderAll();
    toast("Loaded the latest shared version.");
  } else {
    remote.rev = serverState.rev; // re-base so our next push wins
    scheduleRemotePush();
  }
}

function startPolling() {
  if (!remote.available) return;
  setInterval(async () => {
    if (remote.dirty || remote.pushing) return; // don't clobber in-progress local edits
    const got = await remoteGet();
    if (got && got.rev > remote.rev && got.data) {
      applyData(got.data);
      remote.rev = got.rev;
      saveLocal();
      renderAll();
      toast("Updated with the latest changes.");
    }
  }, 15000);
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed.scenarios || !parsed.scenarios.length) return false;
    state = { compare: { on: false, ids: [] }, ...parsed };
    state.compare = state.compare || { on: false, ids: [] };
    state.spacing = "compact"; // layout is fixed
    state.report = "grid";
    state.bg = state.bg || DEFAULT_BG;
    state.branding = { logo: null, logoCorner: "br", logoHidden: false, ...(parsed.branding || {}) };
    normalizeLayouts(parsed.layout);
    if (!state.activeId || !state.scenarios.some((s) => s.id === state.activeId)) {
      state.activeId = state.scenarios[0].id;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// A small, realistic seed so the first run shows what the tool does.
function seed() {
  // [name, title, manager-name (or null), category]
  const def = [
    ["Dr. Maya Okonkwo", "Executive Director", null, "executive"],
    ["Reuben Hart", "Director of Programs", "Dr. Maya Okonkwo", "director"],
    ["Lena Strand", "Director of Policy", "Dr. Maya Okonkwo", "director"],
    ["Theo Park", "Director of Operations", "Dr. Maya Okonkwo", "director"],
    ["Priya Anand", "Senior Program Officer", "Reuben Hart", "manager"],
    ["Sam Whitfield", "Program Officer", "Reuben Hart", "ic"],
    ["Nadia Cole", "Policy Analyst", "Lena Strand", "ic"],
    ["Marcus Bell", "Finance & Grants Lead", "Theo Park", "manager"],
  ];
  const byName = new Map();
  const people = def.map(([name, title, , category]) => {
    const p = newPerson({ name, title, category });
    byName.set(name, p);
    return p;
  });
  def.forEach(([, , manager], i) => {
    if (manager) people[i].managerId = byName.get(manager).id;
  });
  const base = newScenario("Current org", people);

  // A second scenario illustrating the "what if we hired a Managing Director" idea.
  const variantPeople = clonePeople(people);
  const md = newPerson({ name: "", title: "Managing Director", proposed: true, category: "director" });
  const ed = variantPeople.find((p) => p.title === "Executive Director");
  md.managerId = ed.id;
  variantPeople.push(md);
  for (const p of variantPeople) {
    if (/^Director of/.test(p.title)) p.managerId = md.id;
  }
  const variant = newScenario("With a Managing Director", variantPeople);

  state.scenarios = [base, variant];
  state.activeId = base.id;
  saveLocal(); // never auto-publish the sample to the shared version
}

// ---------------- toast ----------------
let toastTimer;
function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " err" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// A toast with an "Undo" action, shown a bit longer so there's time to click it.
function toastUndo(msg, onUndo) {
  const t = $("#toast");
  t.className = "toast";
  t.textContent = "";
  const span = document.createElement("span");
  span.textContent = msg;
  const btn = document.createElement("button");
  btn.className = "toast-undo";
  btn.textContent = "Undo";
  btn.addEventListener("click", () => {
    t.hidden = true;
    clearTimeout(toastTimer);
    onUndo();
  });
  t.append(span, btn);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 8000);
}

// ---------------- scenario tabs ----------------
let dragId = null; // scenario id currently being dragged

// Move the dragged scenario to before/after the target tab.
function reorderScenario(sourceId, targetId, after) {
  if (sourceId === targetId) return;
  const from = state.scenarios.findIndex((s) => s.id === sourceId);
  if (from < 0) return;
  const [moved] = state.scenarios.splice(from, 1);
  let to = state.scenarios.findIndex((s) => s.id === targetId);
  if (to < 0) {
    state.scenarios.splice(from, 0, moved); // target vanished; put it back
    return;
  }
  if (after) to += 1;
  state.scenarios.splice(to, 0, moved);
  save();
  renderAll(); // scenarios[0] ("current org") may have changed
}

function renderTabs() {
  const nav = $("#scenarioTabs");
  nav.innerHTML = "";
  const clearDropHints = () =>
    nav.querySelectorAll(".tab").forEach((t) => t.classList.remove("drop-before", "drop-after", "dragging"));
  state.scenarios.forEach((s, i) => {
    const tab = document.createElement("button");
    tab.className = "tab" + (s.id === state.activeId ? " active" : "");
    tab.title = "Drag to reorder · double-click to rename";
    tab.draggable = true;
    if (s.private) {
      const lock = document.createElement("span");
      lock.className = "tab-lock";
      lock.textContent = "🔒";
      lock.title = "Private — only visible in this browser";
      tab.appendChild(lock);
    }
    const label = document.createElement("span");
    label.textContent = s.name;
    tab.appendChild(label);

    tab.addEventListener("dragstart", (e) => {
      dragId = s.id;
      e.dataTransfer.effectAllowed = "move";
      tab.classList.add("dragging");
    });
    tab.addEventListener("dragend", () => {
      dragId = null;
      clearDropHints();
    });
    tab.addEventListener("dragover", (e) => {
      if (dragId === null || dragId === s.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const r = tab.getBoundingClientRect();
      const after = e.clientX - r.left > r.width / 2;
      tab.classList.toggle("drop-after", after);
      tab.classList.toggle("drop-before", !after);
    });
    tab.addEventListener("dragleave", () => tab.classList.remove("drop-before", "drop-after"));
    tab.addEventListener("drop", (e) => {
      if (dragId === null || dragId === s.id) return;
      e.preventDefault();
      const r = tab.getBoundingClientRect();
      const after = e.clientX - r.left > r.width / 2;
      const src = dragId;
      clearDropHints();
      reorderScenario(src, s.id, after);
    });

    const proposedCount = s.people.filter((p) => p.proposed).length;
    if (proposedCount) {
      const badge = document.createElement("span");
      badge.className = "tab-badge";
      badge.textContent = `+${proposedCount}`;
      badge.title = `${proposedCount} proposed role${proposedCount > 1 ? "s" : ""}`;
      tab.appendChild(badge);
    }

    if (state.scenarios.length > 1) {
      const close = document.createElement("button");
      close.className = "tab-close";
      close.textContent = "×";
      close.title = "Delete scenario";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteScenario(s.id);
      });
      tab.appendChild(close);
    }

    tab.addEventListener("click", () => setActive(s.id));
    tab.addEventListener("dblclick", () => renameScenario(s.id));
    nav.appendChild(tab);
  });

  const add = document.createElement("button");
  add.className = "tab-add";
  add.textContent = "+";
  add.title = "New scenario (copies the one you're on)";
  add.addEventListener("click", duplicateScenario);
  nav.appendChild(add);
}

function setActive(id) {
  state.activeId = id;
  zoom = null;
  save();
  renderAll();
}

function renameScenario(id) {
  const s = state.scenarios.find((x) => x.id === id);
  if (!s) return;
  const name = prompt("Rename scenario", s.name);
  if (name && name.trim()) {
    s.name = name.trim();
    save();
    renderTabs();
    renderRail();
  }
}

function duplicateScenario() {
  const src = activeScenario();
  const copy = newScenario(`${src.name} (copy)`, src.people, src.layout);
  copy.private = !!src.private; // a copy of a private draft stays private
  copy.title = src.title || ""; // and keeps its chart title
  state.scenarios.push(copy);
  state.activeId = copy.id;
  zoom = null;
  save();
  renderAll();
  toast(`Created “${copy.name}”`);
}

let lastDeleted = null; // { scenario, index, wasActive, compareIds }

function deleteScenario(id) {
  if (state.scenarios.length <= 1) {
    toast("Keep at least one scenario.", true);
    return;
  }
  const idx = state.scenarios.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const scenario = state.scenarios[idx];
  if (!confirm(`Delete “${scenario.name}”?`)) return;
  const wasActive = state.activeId === id;
  lastDeleted = { scenario, index: idx, wasActive, compareIds: state.compare.ids.includes(id) };
  state.scenarios.splice(idx, 1);
  state.compare.ids = state.compare.ids.filter((x) => x !== id);
  if (wasActive) state.activeId = state.scenarios[Math.max(0, idx - 1)].id;
  save();
  renderAll();
  toastUndo(`Deleted “${scenario.name}”.`, undoDelete);
}

function undoDelete() {
  if (!lastDeleted) return;
  const { scenario, index, wasActive, compareIds } = lastDeleted;
  state.scenarios.splice(Math.min(index, state.scenarios.length), 0, scenario);
  if (compareIds && !state.compare.ids.includes(scenario.id)) state.compare.ids.push(scenario.id);
  if (wasActive) state.activeId = scenario.id;
  lastDeleted = null;
  zoom = null;
  save();
  renderAll();
  toast(`Restored “${scenario.name}”.`);
}

// ---------------- roster editor ----------------
// A label for a person, used in the manager picker and search.
function personLabel(p) {
  if (!p) return "";
  return p.name ? `${p.name}${p.title ? " · " + p.title : ""}` : p.title || "(untitled role)";
}

// Sort key: first name, case-insensitive. Open seats (no name) fall back to their
// title; anything with neither sinks to the bottom.
function firstNameKey(p) {
  const name = (p.name || "").trim();
  const first = name ? name.split(/\s+/)[0] : "";
  return (first || p.title || "￿").toLowerCase();
}
const byFirstName = (a, b) => firstNameKey(a).localeCompare(firstNameKey(b));
const sortedPeople = (people) => [...people].sort(byFirstName);

// True when at least one other person reports to `id`.
function hasDirectReports(people, id) {
  return people.some((p) => p.managerId === id);
}

// Who may appear in a "Reports to" / "New manager" picker: people who already have a
// direct report, plus anyone explicitly flagged as a manager. This is exactly the set
// whose "Manager" box is ticked in the roster, so the two always agree.
function managerCandidates(people) {
  const hasReport = new Set(people.filter((p) => p.managerId).map((p) => p.managerId));
  return people.filter((p) => p.isManager || hasReport.has(p.id));
}

// A "reports to" combobox: shows the full, scrollable candidate list on click and
// filters as you type. Picking an option sets the manager; "Top of chart" clears it.
function createManagerCombo(person, scenario) {
  const wrap = document.createElement("div");
  wrap.className = "combo";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "combo-input";
  input.placeholder = "Reports to (top of chart)";
  const panel = document.createElement("div");
  panel.className = "combo-panel";
  panel.hidden = true;
  wrap.append(input, panel);

  const labelFor = () => personLabel(scenario.people.find((p) => p.id === person.managerId));
  input.value = labelFor();
  let open = false;

  function build(filter) {
    panel.innerHTML = "";
    const f = (filter || "").trim().toLowerCase();
    const items = [{ id: null, label: "— Top of chart —", top: true }];
    for (const p of sortedPeople(managerCandidates(scenario.people))) {
      if (p.id === person.id) continue;
      if (wouldCreateCycle(scenario.people, person.id, p.id)) continue; // can't report to a report
      items.push({ id: p.id, label: personLabel(p) });
    }
    const shown = f ? items.filter((it) => it.label.toLowerCase().includes(f)) : items;
    if (!shown.length) {
      const e = document.createElement("div");
      e.className = "combo-empty";
      e.textContent = "No matches";
      panel.appendChild(e);
      return;
    }
    for (const it of shown) {
      const row = document.createElement("div");
      row.className = "combo-opt" + (it.top ? " top" : "") + (it.id === person.managerId ? " sel" : "");
      row.textContent = it.label;
      row.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus; fires before blur
        choose(it.id);
      });
      panel.appendChild(row);
    }
  }
  function choose(id) {
    person.managerId = id || null;
    save();
    close(true);
    renderRoster(); // the new manager now "has reports" -> tick their box & list them
    renderBulk();
    renderCanvas();
  }
  function openPanel() {
    open = true;
    input.value = ""; // empty filter => the whole list shows
    build("");
    panel.hidden = false;
  }
  function close(picked) {
    open = false;
    panel.hidden = true;
    input.value = labelFor();
  }
  input.addEventListener("focus", openPanel);
  input.addEventListener("click", () => { if (!open) openPanel(); });
  input.addEventListener("input", () => build(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) { e.stopPropagation(); input.blur(); }
  });
  input.addEventListener("blur", () => setTimeout(() => { if (open) close(false); }, 120));
  return wrap;
}

function managerOptions(people, selfId, selectedId) {
  const frag = document.createDocumentFragment();
  const top = document.createElement("option");
  top.value = "";
  top.textContent = "— Top of chart —";
  if (!selectedId) top.selected = true;
  frag.appendChild(top);
  for (const p of sortedPeople(managerCandidates(people))) {
    if (p.id === selfId) continue;
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name ? `${p.name}${p.title ? " · " + p.title : ""}` : p.title || "(untitled)";
    if (p.id === selectedId) o.selected = true;
    frag.appendChild(o);
  }
  return frag;
}

function renderRail() {
  const s = activeScenario();
  $("#scenarioName").value = s.name;
  $("#rosterCount").textContent = `${s.people.length} ${s.people.length === 1 ? "person" : "people"}`;

  const isCurrent = s.id === currentOrg().id;
  $("#scenarioHint").textContent = isCurrent
    ? "Your live org. Click Edit people to add or change staff."
    : "A what-if copy. Edits here don’t touch your current org.";
  $("#resetToCurrent").style.display = isCurrent ? "none" : "";

  // The current org is the shared baseline, so it can't be made private.
  const privRow = $("#scenarioPrivateRow");
  const priv = $("#scenarioPrivate");
  if (privRow) privRow.style.display = isCurrent ? "none" : "block";
  if (priv) priv.checked = !isCurrent && !!s.private;

  const layoutSel = $("#layoutSelect");
  if (layoutSel) layoutSel.value = s.layout === "wide" ? "wide" : "stacked";
  const bgInput = $("#bgColor");
  if (bgInput) bgInput.value = state.bg;
  const bgSwatch = $("#bgSwatch");
  if (bgSwatch) bgSwatch.style.background = state.bg;

  // title (per tab) + logo (global) controls
  const b = state.branding || {};
  const titleInput = $("#brandTitle");
  if (titleInput && document.activeElement !== titleInput) titleInput.value = (s && s.title) || "";
  const effectiveLogo = b.logoHidden ? null : b.logo && b.logo.dataURL ? b.logo : DEFAULT_LOGO;
  const preview = $("#logoPreview");
  const clearBtn = $("#logoClearBtn");
  const cornerRow = $("#logoCornerRow");
  if (preview) {
    preview.textContent = "";
    if (effectiveLogo) {
      const im = document.createElement("img");
      im.src = effectiveLogo.dataURL;
      im.alt = "Logo";
      preview.appendChild(im);
      preview.classList.add("has-logo");
    } else {
      preview.textContent = "No logo";
      preview.classList.remove("has-logo");
    }
  }
  if (clearBtn) {
    clearBtn.hidden = false;
    clearBtn.textContent = effectiveLogo ? "Hide" : "Show";
  }
  if (cornerRow) cornerRow.hidden = !effectiveLogo;
  const cornerSel = $("#logoCorner");
  if (cornerSel) cornerSel.value = b.logoCorner || "br";

  renderBulk();
  renderRoster();
}

// Fills the roster modal's list (search + scrollable grid of editable cards).
function renderRoster() {
  const s = activeScenario();
  const list = $("#modalPeopleList");
  if (!list) return;
  const search = $("#rosterSearch");
  if (search && search.value !== rosterFilter) search.value = rosterFilter;
  $("#modalTitle").textContent = `Roster — ${s.people.length} ${s.people.length === 1 ? "person" : "people"}`;
  list.innerHTML = "";

  if (s.people.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-roster";
    empty.style.gridColumn = "1 / -1";
    empty.innerHTML = "No one here yet.<br />Click <b>+ Add person</b> to start building your org.";
    list.appendChild(empty);
    return;
  }

  const q = rosterFilter.trim().toLowerCase();
  const matched = q ? s.people.filter((p) => `${p.name} ${p.title}`.toLowerCase().includes(q)) : s.people;
  const shown = sortedPeople(matched); // alphabetized by first name
  if (q && shown.length === 0) {
    const none = document.createElement("div");
    none.className = "empty-roster";
    none.style.gridColumn = "1 / -1";
    none.textContent = `No one matches “${rosterFilter}”.`;
    list.appendChild(none);
    return;
  }
  for (const person of shown) list.appendChild(personCard(person, s));
}

function openRosterModal() {
  $("#rosterModal").hidden = false;
  renderRoster();
}
function closeRosterModal() {
  $("#rosterModal").hidden = true;
}

function personCard(person, scenario) {
  const card = document.createElement("div");
  card.className = "person-card" + (person.proposed ? " is-proposed" : "");
  card.dataset.id = person.id;

  const nameRow = document.createElement("div");
  nameRow.className = "row";
  const name = document.createElement("input");
  name.type = "text";
  name.placeholder = "Name (leave blank if unfilled)";
  name.value = person.name;
  name.addEventListener("input", () => {
    person.name = name.value;
    save();
    renderCanvas();
  });
  const del = document.createElement("button");
  del.className = "icon-del";
  del.innerHTML = "🗑";
  del.title = "Remove (their reports move up a level)";
  del.addEventListener("click", () => {
    scenario.people = removePerson(scenario.people, person.id);
    save();
    renderRoster();
    renderBulk();
    renderCanvas();
    renderTabs();
  });
  nameRow.append(name, del);

  const titleRow = document.createElement("div");
  titleRow.className = "row";
  const title = document.createElement("input");
  title.type = "text";
  title.placeholder = "Title";
  title.value = person.title;
  title.addEventListener("input", () => {
    person.title = title.value;
    save();
    renderCanvas();
  });
  titleRow.append(title);

  // Category drives the card color. Chosen by hand here (never auto-assigned).
  const catRow = document.createElement("label");
  catRow.className = "cat-row";
  const catLabel = document.createElement("span");
  catLabel.textContent = "Category";
  const cat = document.createElement("select");
  cat.className = "cat-select";
  for (const c of CATEGORIES) {
    const o = document.createElement("option");
    o.value = c.key;
    o.textContent = c.label;
    if ((person.category || "ic") === c.key) o.selected = true;
    cat.appendChild(o);
  }
  cat.addEventListener("change", () => {
    person.category = cat.value;
    save();
    renderCanvas();
  });
  catRow.append(catLabel, cat);

  // Status: a filled role, or a proposed hire bucketed by how soon it's being hired.
  const statusRow = document.createElement("label");
  statusRow.className = "cat-row";
  const statusLabel = document.createElement("span");
  statusLabel.textContent = "Status";
  const status = document.createElement("select");
  status.className = "cat-select";
  const filledOpt = document.createElement("option");
  filledOpt.value = "filled";
  filledOpt.textContent = "Filled";
  status.appendChild(filledOpt);
  for (const s of HIRING_STAGES) {
    const o = document.createElement("option");
    o.value = s.key;
    o.textContent = s.label;
    status.appendChild(o);
  }
  status.value = person.proposed ? person.hiringStage || "soon" : "filled";
  status.addEventListener("change", () => {
    if (status.value === "filled") {
      person.proposed = false;
    } else {
      person.proposed = true;
      person.hiringStage = status.value;
    }
    save();
    renderRoster();
    renderCanvas();
    renderTabs();
  });
  statusRow.append(statusLabel, status);

  const meta = document.createElement("div");
  meta.className = "meta";
  const mgr = createManagerCombo(person, scenario);
  meta.append(mgr);

  // Manager flag: marks this person as someone reports can be pointed at, which is
  // what populates the "Reports to" picker (so it doesn't list the whole org).
  // Anyone who already has direct reports is a manager by definition — their box is
  // ticked and locked; you can only toggle people who don't yet have reports.
  const hasReports = hasDirectReports(scenario.people, person.id);
  const mgrRow = document.createElement("label");
  mgrRow.className = "mgr-flag" + (hasReports ? " locked" : "");
  const mgrCb = document.createElement("input");
  mgrCb.type = "checkbox";
  mgrCb.checked = hasReports || !!person.isManager;
  mgrCb.disabled = hasReports;
  const mgrText = document.createElement("span");
  mgrText.textContent = "Manager (appears in “Reports to”)";
  mgrRow.title = hasReports
    ? "Already has direct reports, so always a manager."
    : "Tick to list this person in the “Reports to” picker.";
  mgrCb.addEventListener("change", () => {
    person.isManager = mgrCb.checked;
    save();
    renderRoster(); // re-render so picker membership stays in sync
    renderBulk(); // refresh the "New manager" dropdown
  });
  mgrRow.append(mgrCb, mgrText);

  card.append(nameRow, titleRow, catRow, statusRow, meta, mgrRow);

  // Co-leader: draw this person side by side with their manager at the same tier
  // (keeping the reporting line), offered only when they're the same organizational
  // level — i.e. their Category matches their manager's. Grounded in title/level,
  // not a manual nudge.
  const mgrPerson = scenario.people.find((p) => p.id === person.managerId);
  const sameLevel = mgrPerson && (person.category || "ic") === (mgrPerson.category || "ic");
  if (sameLevel) {
    const mgrName = mgrPerson.name || mgrPerson.title || "their manager";
    const coRow = document.createElement("label");
    coRow.className = "mgr-flag";
    const coCb = document.createElement("input");
    coCb.type = "checkbox";
    coCb.checked = !!person.coLead;
    const coText = document.createElement("span");
    coText.textContent = `Co-leader — same tier as ${mgrName}`;
    coRow.title = "Draw side by side with their manager at the same level, keeping the line between them.";
    coCb.addEventListener("change", () => {
      person.coLead = coCb.checked;
      save();
      renderCanvas();
      renderRoster();
    });
    coRow.append(coCb, coText);
    card.append(coRow);
  } else if (person.coLead) {
    // Category no longer matches the manager -> the pairing isn't principled anymore;
    // clear the stale flag so it doesn't apply invisibly.
    person.coLead = false;
  }
  return card;
}

function addPerson() {
  const s = activeScenario();
  const top = s.people.find((p) => !p.managerId);
  const p = newPerson({ title: "New role", managerId: top ? top.id : null, proposed: !isCurrentActive() });
  s.people.unshift(p); // add at the top of the list
  rosterFilter = ""; // clear any filter so the new card is visible
  if ($("#rosterModal").hidden) openRosterModal();
  save();
  renderRoster();
  renderBulk();
  renderCanvas();
  renderTabs();
  const card = document.querySelector(`#modalPeopleList .person-card[data-id="${p.id}"]`);
  if (card) {
    card.scrollIntoView({ block: "nearest" });
    card.querySelector('input[type="text"]').focus();
  }
}

const isCurrentActive = () => activeScenario().id === currentOrg().id;

// ---------------- bulk reassign ----------------
function renderBulk() {
  const s = activeScenario();
  const mgrSel = $("#bulkManager");
  const prev = mgrSel.value;
  mgrSel.innerHTML = "";
  mgrSel.appendChild(managerOptions(s.people, null, prev || null));

  const list = $("#bulkList");
  list.innerHTML = "";
  if (s.people.length === 0) {
    list.innerHTML = '<div class="bulk-empty">No people yet.</div>';
    return;
  }
  for (const p of sortedPeople(s.people)) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = p.id;
    const text = document.createElement("span");
    text.innerHTML = `${p.name || "(unfilled)"}${p.title ? ` <span class="bl-title">· ${p.title}</span>` : ""}`;
    label.append(cb, text);
    list.appendChild(label);
  }
}

function applyBulk() {
  const s = activeScenario();
  const targetId = $("#bulkManager").value || null;
  const checked = [...$("#bulkList").querySelectorAll("input:checked")].map((c) => c.value);
  if (checked.length === 0) {
    toast("Tick the people you want to move first.", true);
    return;
  }
  let moved = 0;
  let skipped = 0;
  for (const id of checked) {
    if (id === targetId) { skipped++; continue; }
    if (wouldCreateCycle(s.people, id, targetId)) { skipped++; continue; }
    const person = s.people.find((p) => p.id === id);
    if (person) { person.managerId = targetId; moved++; }
  }
  save();
  renderRail();
  renderCanvas();
  renderTabs();
  const mgr = targetId ? s.people.find((p) => p.id === targetId) : null;
  const where = mgr ? mgr.name || mgr.title || "that role" : "the top";
  toast(`Moved ${moved} to report to ${where}${skipped ? ` (${skipped} skipped to avoid a loop)` : ""}.`);
}

// ---------------- canvas ----------------
function buildChartFrame(scenario, opts) {
  const frame = document.createElement("div");
  frame.className = "chart-frame";
  const { svg } = renderOrgSvg(scenario.people, chartOpts(scenario, opts));
  // node click -> highlight roster card (single view only)
  svg.addEventListener("click", (e) => {
    const g = e.target.closest("[data-id]");
    if (!g) return;
    flashCard(g.getAttribute("data-id"));
  });
  frame.appendChild(svg);
  return { frame, svg };
}

function flashCard(id) {
  const card = document.querySelector(`.person-card[data-id="${id}"]`);
  if (!card) return;
  card.scrollIntoView({ block: "center", behavior: "smooth" });
  card.classList.remove("flash");
  void card.offsetWidth;
  card.classList.add("flash");
}

let lastSvg = null; // svg of the active scenario, used by export

function renderCanvas() {
  const stage = $("#stage");
  stage.innerHTML = "";

  if (state.compare.on) {
    renderCompare(stage);
    return;
  }

  const s = activeScenario();
  $("#canvasTitle").textContent = s.name;
  const sum = summarize(s.people);
  $("#summary").innerHTML =
    `<span class="stat"><b>${sum.current}</b> current</span>` +
    (sum.proposed ? `<span class="stat proposed"><b>${sum.proposed}</b> proposed</span>` : "") +
    `<span class="stat"><b>${sum.total}</b> total</span>`;

  if (s.people.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-roster";
    empty.style.margin = "60px auto";
    empty.innerHTML = "Add people in the roster to see the chart.";
    stage.appendChild(empty);
    lastSvg = null;
    applyZoom(null);
    return;
  }

  const { frame, svg } = buildChartFrame(s);
  lastSvg = svg;
  stage.appendChild(frame);
  applyZoom(svg);
}

function renderCompare(stage) {
  $("#canvasTitle").textContent = "Comparing scenarios";
  $("#summary").innerHTML = "";
  const ids = state.compare.ids.length ? state.compare.ids : state.scenarios.map((s) => s.id);
  const COL_W = 480;
  for (const id of ids) {
    const s = state.scenarios.find((x) => x.id === id);
    if (!s) continue;
    const col = document.createElement("div");
    col.className = "compare-col";

    const head = document.createElement("div");
    head.className = "col-head";
    const sum = summarize(s.people);
    const diff = diffAgainst(currentOrg().people, s.people);
    const changes =
      s.id === currentOrg().id
        ? "baseline"
        : [
            diff.added.length ? `+${diff.added.length} new` : "",
            diff.moved.length ? `${diff.moved.length} moved` : "",
            diff.removed.length ? `−${diff.removed.length}` : "",
          ]
            .filter(Boolean)
            .join(" · ") || "no changes";
    head.innerHTML = `<span>${s.name}</span><span class="col-meta">${sum.total} roles · ${changes}</span>`;
    col.appendChild(head);

    if (s.people.length) {
      // Compare tiles carry their own scenario header, so drop the title but keep
      // the (unobtrusive) logo so every chart still shows it.
      const { frame, svg } = buildChartFrame(s, { branding: { ...chartBranding(s), title: "" } });
      const natW = Number(svg.getAttribute("width"));
      const scale = Math.min(1, COL_W / natW);
      svg.style.width = natW * scale + "px";
      svg.style.height = Number(svg.getAttribute("height")) * scale + "px";
      col.appendChild(frame);
    }
    stage.appendChild(col);
  }
}

function applyZoom(svg) {
  if (!svg) {
    $("#zoomLevel").textContent = "—";
    return;
  }
  const natW = Number(svg.getAttribute("width"));
  const natH = Number(svg.getAttribute("height"));
  if (zoom === null) {
    const avail = $("#canvasScroll").clientWidth - 56 - 2;
    zoom = Math.max(0.2, Math.min(1, avail / natW));
  }
  svg.style.width = natW * zoom + "px";
  svg.style.height = natH * zoom + "px";
  $("#zoomLevel").textContent = Math.round(zoom * 100) + "%";
}

function setZoom(z) {
  zoom = Math.max(0.2, Math.min(2.5, z));
  if (lastSvg) applyZoom(lastSvg);
}

// ---------------- compare bar ----------------
function renderCompareBar() {
  const bar = $("#compareBar");
  const btn = $("#compareToggle");
  btn.setAttribute("aria-pressed", String(state.compare.on));
  bar.hidden = !state.compare.on;
  $("#zoomControls").style.visibility = state.compare.on ? "hidden" : "visible";
  if (!state.compare.on) return;

  bar.innerHTML = "<span>Show:</span>";
  if (!state.compare.ids.length) state.compare.ids = state.scenarios.map((s) => s.id);
  for (const s of state.scenarios) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.compare.ids.includes(s.id);
    cb.addEventListener("change", () => {
      if (cb.checked) state.compare.ids.push(s.id);
      else state.compare.ids = state.compare.ids.filter((x) => x !== s.id);
      save();
      renderCanvas();
    });
    label.append(cb, document.createTextNode(s.name));
    bar.appendChild(label);
  }
}

const slug = (s) => (s || "org-chart").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org-chart";

// ---------------- save / open project ----------------
function saveProject() {
  const data = {
    app: "orgdraft",
    version: 1,
    savedAt: new Date().toISOString(),
    scenarios: state.scenarios,
    spacing: state.spacing,
    report: state.report,
    bg: state.bg,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "orgdraft-project.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Saved a project file — keep it as a backup or send it to a colleague.");
}

function openProject(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (e) {
      toast("That doesn’t look like a saved project file.", true);
      return;
    }
    if (!parsed || !Array.isArray(parsed.scenarios) || !parsed.scenarios.length) {
      toast("No scenarios found in that file.", true);
      return;
    }
    if (!confirm("Open this file? It replaces what’s currently on screen (your work autosaves, but save a file first if unsure).")) return;
    state.scenarios = parsed.scenarios;
    state.spacing = "compact"; // layout is fixed
    state.report = "grid";
    state.bg = parsed.bg || DEFAULT_BG;
    normalizeLayouts(parsed.layout);
    state.activeId = state.scenarios[0].id;
    state.compare = { on: false, ids: [] };
    rosterFilter = "";
    zoom = null;
    save();
    renderAll();
    toast(`Opened ${state.scenarios.length} scenario${state.scenarios.length > 1 ? "s" : ""}.`);
  };
  reader.onerror = () => toast("Couldn’t read that file.", true);
  reader.readAsText(file);
}

// ---------------- export image ----------------
function exportSvgForActive() {
  // Render a fresh, natural-size SVG (independent of on-screen zoom).
  const s = activeScenario();
  return renderOrgSvg(s.people, chartOpts(s)).svg;
}

async function handleExport(kind) {
  const s = activeScenario();
  if (!s.people.length) {
    toast("Nothing to export yet.", true);
    return;
  }
  const svg = exportSvgForActive();
  const name = slug(s.name);
  try {
    if (kind === "png") {
      await downloadPng(svg, `${name}.png`, 2);
      toast("Saved PNG (2× for crisp slides).");
    } else if (kind === "svg") {
      downloadSvg(svg, `${name}.svg`);
      toast("Saved SVG — open it in PowerPoint or Figma to tweak.");
    } else if (kind === "copy") {
      await copyPngToClipboard(svg, 2);
      toast("Copied — paste straight into your slide.");
    }
  } catch (e) {
    toast(e.message || "Export failed.", true);
  }
}

// ---------------- render orchestration ----------------
function renderAll() {
  renderTabs();
  renderRail();
  renderCompareBar();
  renderCanvas();
}

// ---------------- wiring ----------------
function wire() {
  $("#editPeopleBtn").addEventListener("click", openRosterModal);
  $("#modalAddPerson").addEventListener("click", addPerson);
  $("#rosterModalClose").addEventListener("click", closeRosterModal);
  $("#rosterModal").addEventListener("mousedown", (e) => {
    if (e.target.id === "rosterModal") closeRosterModal(); // click on backdrop
  });

  const closeHelp = () => ($("#helpModal").hidden = true);
  $("#helpBtn").addEventListener("click", () => ($("#helpModal").hidden = false));
  $("#helpModalClose").addEventListener("click", closeHelp);
  $("#helpModal").addEventListener("mousedown", (e) => {
    if (e.target.id === "helpModal") closeHelp(); // click on backdrop
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#helpModal").hidden) closeHelp();
    else if (!$("#rosterModal").hidden) closeRosterModal();
  });
  $("#layoutSelect").addEventListener("change", (e) => {
    activeScenario().layout = e.target.value === "wide" ? "wide" : "stacked";
    zoom = null;
    save();
    renderCanvas();
  });

  // Background takes a typed hex code (#rgb or #rrggbb); the swatch previews it live.
  const applyBg = (raw) => {
    let v = raw.trim();
    if (v && v[0] !== "#") v = "#" + v;
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return false;
    state.bg = v.toLowerCase();
    $("#bgSwatch").style.background = state.bg;
    save();
    renderCanvas();
    return true;
  };
  $("#bgColor").addEventListener("input", (e) => applyBg(e.target.value));
  $("#bgColor").addEventListener("blur", (e) => {
    if (!applyBg(e.target.value)) e.target.value = state.bg; // revert a bad entry
  });
  $("#bgReset").addEventListener("click", () => {
    state.bg = DEFAULT_BG;
    $("#bgColor").value = DEFAULT_BG;
    $("#bgSwatch").style.background = DEFAULT_BG;
    save();
    renderCanvas();
  });

  // --- per-tab chart title + global corner logo (baked into exports) ---
  $("#brandTitle").addEventListener("input", (e) => {
    activeScenario().title = e.target.value; // title is per-scenario (per tab)
    save();
    renderCanvas();
  });
  $("#logoUploadBtn").addEventListener("click", () => $("#logoInput").click());
  $("#logoInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) loadLogoFile(file);
    e.target.value = "";
  });
  $("#logoClearBtn").addEventListener("click", () => {
    // Toggle the logo off/on (the default Blueprint logo shows when not hidden).
    state.branding.logoHidden = !state.branding.logoHidden;
    save();
    renderRail();
    renderCanvas();
  });
  $("#logoCorner").addEventListener("change", (e) => {
    state.branding.logoCorner = e.target.value;
    save();
    renderCanvas();
  });

  $("#scenarioName").addEventListener("input", (e) => {
    activeScenario().name = e.target.value;
    save();
    renderTabs();
    if (!state.compare.on) $("#canvasTitle").textContent = e.target.value;
  });
  $("#scenarioPrivate").addEventListener("change", (e) => {
    const s = activeScenario();
    if (s.id === currentOrg().id) return; // can't privatize the shared baseline
    const goingPrivate = e.target.checked;
    s.private = goingPrivate;
    save();
    renderTabs();
    renderRail();
    toast(
      goingPrivate
        ? `“${s.name}” is now private — only visible in this browser.`
        : `“${s.name}” is now shared with everyone on the link.`
    );
  });
  $("#duplicateScenario").addEventListener("click", duplicateScenario);
  $("#deleteScenario").addEventListener("click", () => deleteScenario(state.activeId));
  $("#resetToCurrent").addEventListener("click", () => {
    if (isCurrentActive()) return;
    activeScenario().people = clonePeople(currentOrg().people);
    zoom = null;
    save();
    renderAll();
    toast("Reset to match the current org.");
  });

  $("#rosterSearch").addEventListener("input", (e) => {
    rosterFilter = e.target.value;
    renderRoster();
  });

  $("#copyViewLink").addEventListener("click", async () => {
    const url = location.origin + "/view";
    try {
      await navigator.clipboard.writeText(url);
      toast("View-only link copied — anyone with it can view the current org (not edit).");
    } catch (e) {
      window.prompt("Copy this read-only link:", url); // clipboard blocked; show it
    }
  });
  $("#openViewLink").addEventListener("click", () => window.open("/view", "_blank", "noopener"));

  $("#saveProject").addEventListener("click", saveProject);
  $("#openProjectBtn").addEventListener("click", () => $("#openProjectInput").click());
  $("#openProjectInput").addEventListener("change", (e) => {
    if (e.target.files[0]) openProject(e.target.files[0]);
    e.target.value = "";
  });

  $("#bulkApply").addEventListener("click", applyBulk);

  $("#compareToggle").addEventListener("click", () => {
    state.compare.on = !state.compare.on;
    zoom = null;
    save();
    renderAll();
  });

  $("#zoomIn").addEventListener("click", () => setZoom((zoom || 1) + 0.1));
  $("#zoomOut").addEventListener("click", () => setZoom((zoom || 1) - 0.1));
  $("#fitBtn").addEventListener("click", () => {
    zoom = null;
    if (lastSvg) applyZoom(lastSvg);
  });

  // export menu
  const panel = $("#exportPanel");
  const exportBtn = $("#exportBtn");
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    exportBtn.setAttribute("aria-expanded", String(open));
  });
  panel.querySelectorAll("[data-export]").forEach((b) =>
    b.addEventListener("click", () => {
      panel.hidden = true;
      exportBtn.setAttribute("aria-expanded", "false");
      handleExport(b.dataset.export);
    })
  );
  document.addEventListener("click", () => {
    if (!panel.hidden) {
      panel.hidden = true;
      exportBtn.setAttribute("aria-expanded", "false");
    }
  });

  $("#startFresh").addEventListener("click", () => {
    if (!confirm("Clear all scenarios and start with one empty chart? This can't be undone.")) return;
    state.scenarios = [newScenario("Current org", [])];
    state.activeId = state.scenarios[0].id;
    state.compare = { on: false, ids: [] };
    zoom = null;
    save();
    renderAll();
  });

  // re-fit on window resize when fitting
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!state.compare.on && lastSvg) applyZoom(lastSvg);
    }, 150);
  });
}

// Expose brand + level colors to CSS so the legend matches the chart.
function applyBrandVars() {
  const root = document.documentElement.style;
  root.setProperty("--brand-accent", BRAND.accent);
  root.setProperty("--brand-proposed", BRAND.proposed);
  const theme = themeFromBranding(brandingForRender());
  theme.levels.forEach((c, i) => root.setProperty(`--lvl${i}`, c));
  for (const s of HIRING_STAGES) root.setProperty(`--hire-${s.key}`, s.color);
}

// ---------------- boot ----------------
async function boot() {
  applyBrandVars();
  // Load this browser's cache first so any private (local-only) scenarios are in state
  // before shared data is applied — applyData preserves them.
  const hadLocal = load();
  const got = await remoteGet();

  if (got === null) {
    // No backend reachable -> local-only mode (still fully usable).
    remote.available = false;
    if (!hadLocal) seed();
  } else {
    remote.available = true;
    remote.rev = got.rev || 0;
    if (got.data && Array.isArray(got.data.scenarios) && got.data.scenarios.length) {
      // A shared version exists -> everyone loads it (keeping local private scenarios).
      applyData(got.data);
      saveLocal();
    } else if (hadLocal) {
      // Server is empty but THIS browser already has data -> promote it to the
      // shared version (private scenarios stay local; snapshot() filters them out).
      await remotePush();
    } else {
      // Brand-new everywhere: show the sample locally but DON'T push it, so a real
      // roster from another browser can claim the shared slot instead.
      seed();
    }
  }

  wire();
  renderAll();
  startPolling();
}

boot();
