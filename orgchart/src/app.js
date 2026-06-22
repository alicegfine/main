// OrgDraft controller: state, persistence, and all UI wiring.
import { peopleFromCsv, peopleToCsv } from "./csv.js";
import {
  newPerson,
  newScenario,
  clonePeople,
  removePerson,
  wouldCreateCycle,
  summarize,
  diffAgainst,
} from "./model.js";
import { renderOrgSvg } from "./render.js";
import { downloadPng, downloadSvg, copyPngToClipboard } from "./exporter.js";
import { brandingForRender } from "./brand.js";

const STORE_KEY = "orgdraft.v1";
const $ = (sel) => document.querySelector(sel);

// ---------------- state ----------------
let state = {
  scenarios: [],
  activeId: null,
  spacing: "normal",
  compare: { on: false, ids: [] },
};
let zoom = null; // null => fit-to-width on next render

const activeScenario = () => state.scenarios.find((s) => s.id === state.activeId) || state.scenarios[0];
const currentOrg = () => state.scenarios[0]; // first scenario is "the current org"

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage may be unavailable; the app still works in-memory */
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed.scenarios || !parsed.scenarios.length) return false;
    state = { compare: { on: false, ids: [] }, spacing: "normal", ...parsed };
    state.compare = state.compare || { on: false, ids: [] };
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
  const csv = `Name,Title,Reports To,Proposed
Dr. Maya Okonkwo,Executive Director,,
Reuben Hart,Director of Programs,Dr. Maya Okonkwo,
Lena Strand,Director of Policy,Dr. Maya Okonkwo,
Theo Park,Director of Operations,Dr. Maya Okonkwo,
Priya Anand,Senior Program Officer,Reuben Hart,
Sam Whitfield,Program Officer,Reuben Hart,
Nadia Cole,Policy Analyst,Lena Strand,
Marcus Bell,Finance & Grants Lead,Theo Park,`;
  const people = peopleFromCsv(csv).people;
  const base = newScenario("Current org", people);

  // A second scenario illustrating the "what if we hired a Managing Director" idea.
  const variantPeople = clonePeople(people);
  const md = newPerson({ name: "", title: "Managing Director", proposed: true });
  const ed = variantPeople.find((p) => p.title === "Executive Director");
  md.managerId = ed.id;
  variantPeople.push(md);
  for (const p of variantPeople) {
    if (/^Director of/.test(p.title)) p.managerId = md.id;
  }
  const variant = newScenario("With a Managing Director", variantPeople);

  state.scenarios = [base, variant];
  state.activeId = base.id;
  save();
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

// ---------------- scenario tabs ----------------
function renderTabs() {
  const nav = $("#scenarioTabs");
  nav.innerHTML = "";
  state.scenarios.forEach((s, i) => {
    const tab = document.createElement("button");
    tab.className = "tab" + (s.id === state.activeId ? " active" : "");
    tab.title = "Double-click to rename";
    const label = document.createElement("span");
    label.textContent = s.name;
    tab.appendChild(label);

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
  const copy = newScenario(`${src.name} (copy)`, src.people);
  state.scenarios.push(copy);
  state.activeId = copy.id;
  zoom = null;
  save();
  renderAll();
  toast(`Created “${copy.name}”`);
}

function deleteScenario(id) {
  if (state.scenarios.length <= 1) {
    toast("Keep at least one scenario.", true);
    return;
  }
  const idx = state.scenarios.findIndex((s) => s.id === id);
  const wasActive = state.activeId === id;
  state.scenarios.splice(idx, 1);
  state.compare.ids = state.compare.ids.filter((x) => x !== id);
  if (wasActive) state.activeId = state.scenarios[Math.max(0, idx - 1)].id;
  save();
  renderAll();
}

// ---------------- roster editor ----------------
function managerOptions(people, selfId, selectedId) {
  const frag = document.createDocumentFragment();
  const top = document.createElement("option");
  top.value = "";
  top.textContent = "— Top of chart —";
  if (!selectedId) top.selected = true;
  frag.appendChild(top);
  for (const p of people) {
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
  $("#spacingSelect").value = state.spacing;
  $("#rosterCount").textContent = `${s.people.length} ${s.people.length === 1 ? "person" : "people"}`;

  const isCurrent = s.id === currentOrg().id;
  $("#scenarioHint").textContent = isCurrent
    ? "This is your live org. Import a CSV to load real staff, or edit below."
    : "A what-if copy. Edits here don’t touch your current org.";
  $("#resetToCurrent").style.display = isCurrent ? "none" : "";

  renderBulk();

  const list = $("#peopleList");
  list.innerHTML = "";

  if (s.people.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-roster";
    empty.innerHTML =
      "No one here yet.<br />Add a person or import a CSV with <b>Name, Title, Reports To</b>.";
    list.appendChild(empty);
    return;
  }

  for (const person of s.people) {
    list.appendChild(personCard(person, s));
  }
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
    renderRail();
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

  const meta = document.createElement("div");
  meta.className = "meta";
  const mgr = document.createElement("select");
  mgr.title = "Reports to";
  mgr.appendChild(managerOptions(scenario.people, person.id, person.managerId));
  mgr.addEventListener("change", () => {
    const newMgr = mgr.value || null;
    if (wouldCreateCycle(scenario.people, person.id, newMgr)) {
      toast("That would create a reporting loop.", true);
      mgr.value = person.managerId || "";
      return;
    }
    person.managerId = newMgr;
    save();
    renderRail();
    renderCanvas();
  });
  const prop = document.createElement("button");
  prop.className = "icon-toggle";
  prop.innerHTML = "◇";
  prop.title = "Mark as a proposed / not-yet-hired role";
  prop.setAttribute("aria-pressed", String(!!person.proposed));
  prop.addEventListener("click", () => {
    person.proposed = !person.proposed;
    save();
    renderRail();
    renderCanvas();
    renderTabs();
  });
  meta.append(mgr, prop);

  card.append(nameRow, titleRow, meta);
  return card;
}

function addPerson() {
  const s = activeScenario();
  const top = s.people.find((p) => !p.managerId);
  const p = newPerson({ title: "New role", managerId: top ? top.id : null, proposed: !isCurrentActive() });
  s.people.push(p);
  save();
  renderRail();
  renderCanvas();
  renderTabs();
  const card = document.querySelector(`.person-card[data-id="${p.id}"]`);
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
  for (const p of s.people) {
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
function buildChartFrame(people, opts) {
  const frame = document.createElement("div");
  frame.className = "chart-frame";
  const { svg } = renderOrgSvg(people, { spacing: state.spacing, branding: brandingForRender(), ...opts });
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

  const { frame, svg } = buildChartFrame(s.people);
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
      const { frame, svg } = buildChartFrame(s.people);
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

// ---------------- CSV ----------------
function importCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const { people, warnings } = peopleFromCsv(String(reader.result));
    if (!people.length) {
      toast(warnings[0] || "No people found in that file.", true);
      return;
    }
    const s = activeScenario();
    s.people = people;
    zoom = null;
    save();
    renderAll();
    if (warnings.length) toast(`Imported ${people.length}. Heads up: ${warnings[0]}`);
    else toast(`Imported ${people.length} people.`);
  };
  reader.onerror = () => toast("Couldn't read that file.", true);
  reader.readAsText(file);
}

function exportCsv() {
  const s = activeScenario();
  const blob = new Blob([peopleToCsv(s.people)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(s.name)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const slug = (s) => (s || "org-chart").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org-chart";

// ---------------- export image ----------------
function exportSvgForActive() {
  // Render a fresh, natural-size SVG (independent of on-screen zoom).
  const s = activeScenario();
  return renderOrgSvg(s.people, { spacing: state.spacing, branding: brandingForRender() }).svg;
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
  $("#addPersonBtn").addEventListener("click", addPerson);
  $("#importBtn").addEventListener("click", () => $("#csvInput").click());
  $("#csvInput").addEventListener("change", (e) => {
    if (e.target.files[0]) importCsv(e.target.files[0]);
    e.target.value = "";
  });
  $("#exportCsvBtn").addEventListener("click", exportCsv);

  $("#scenarioName").addEventListener("input", (e) => {
    activeScenario().name = e.target.value;
    save();
    renderTabs();
    if (!state.compare.on) $("#canvasTitle").textContent = e.target.value;
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

  $("#spacingSelect").addEventListener("change", (e) => {
    state.spacing = e.target.value;
    zoom = null;
    save();
    renderCanvas();
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

// ---------------- boot ----------------
if (!load()) seed();
wire();
renderAll();
