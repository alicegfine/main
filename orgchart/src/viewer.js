// Read-only viewer: renders ONLY the current org (the first scenario) from the shared
// data, live. No rail, no tabs, no editing, and it never writes — it just GETs the
// shared state and re-renders when it changes. Served at /view for the whole team.

import { renderOrgSvg, themeFromBranding, categoryColor, CATEGORIES, HIRING_STAGES } from "./render.js";
import { BRAND } from "./brand.js";

const DEFAULT_LOGO = BRAND.logo ? { dataURL: BRAND.logo, w: BRAND.logoW, h: BRAND.logoH } : null;
const stage = document.getElementById("viewStage");
let lastRev = -1;

// Same branding rules as the editor: fixed brand colors, the current-org tab's title,
// and the logo (custom, the default Blueprint mark, or hidden).
function brandingFor(current, data) {
  const b = (data && data.branding) || {};
  const custom = b.logo && b.logo.dataURL ? b.logo : null;
  return {
    accent: BRAND.accent,
    proposed: BRAND.proposed,
    title: (current.title || "").trim(),
    logo: b.logoHidden ? null : custom || DEFAULT_LOGO,
    logoCorner: b.logoCorner || "br",
  };
}

function orderMap(people) {
  const m = new Map();
  people.forEach((p, i) => m.set(p.id, i));
  return m;
}

function fit(svg) {
  const natW = Number(svg.getAttribute("width"));
  const natH = Number(svg.getAttribute("height"));
  if (!natW || !natH) return;
  const availW = stage.clientWidth - 48;
  const availH = stage.clientHeight - 48;
  const scale = Math.max(0.1, Math.min(availW / natW, availH / natH, 2)); // contain; allow modest upscale
  svg.style.width = natW * scale + "px";
  svg.style.height = natH * scale + "px";
}

function buildLegend() {
  const legend = document.getElementById("viewLegend");
  const theme = themeFromBranding({ accent: BRAND.accent, proposed: BRAND.proposed });
  const parts = ['<span class="lg-label">Category</span>'];
  for (const c of CATEGORIES) {
    parts.push(`<span class="lg-item"><span class="lg-sw" style="background:${categoryColor(theme, c.key)}"></span>${c.label}</span>`);
  }
  parts.push('<span class="lg-label" style="margin-left:6px">Hiring</span>');
  for (const s of HIRING_STAGES) {
    parts.push(`<span class="lg-item"><span class="lg-sw dashed" style="background:${s.color}"></span>${s.label.replace(/^Hiring /, "")}</span>`);
  }
  legend.innerHTML = parts.join("");
}

function render(data) {
  const current = data && Array.isArray(data.scenarios) ? data.scenarios[0] : null;
  document.body.style.background = (data && data.bg) || "#eef1f5";
  if (!current || !Array.isArray(current.people) || !current.people.length) {
    stage.innerHTML = '<div class="view-empty">No org chart has been published yet.</div>';
    document.title = "Org Chart";
    return;
  }
  const { svg } = renderOrgSvg(current.people, {
    spacing: "compact",
    stack: current.layout !== "wide",
    order: orderMap(current.people),
    branding: brandingFor(current, data),
    background: (data && data.bg) || "#ffffff",
  });
  stage.innerHTML = "";
  stage.appendChild(svg);
  fit(svg);
  document.title = (current.title || "").trim() || "Org Chart";
}

async function poll() {
  try {
    const res = await fetch("/api/org", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    const rev = j.rev || 0;
    if (rev !== lastRev) {
      lastRev = rev;
      render(j.data);
    }
  } catch (e) {
    /* transient network hiccup; try again next tick */
  }
}

buildLegend();
poll();
setInterval(poll, 8000);
window.addEventListener("resize", () => {
  const svg = stage.querySelector("svg");
  if (svg) fit(svg);
});
