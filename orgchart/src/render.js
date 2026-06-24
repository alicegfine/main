// Renders a laid-out org into an SVG element (modern card style).
// All visual attributes are inlined (not CSS classes) so the SVG exports faithfully
// as a standalone file and rasterizes to PNG with no external dependencies.

import { layoutOrg, MARGIN } from "./layout.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const THEME = {
  ink: "#16212B",
  muted: "#5A6B78",
  accent: "#04103f",
  link: "#9AAAB6",
  canvas: "#FFFFFF",
  cardBorder: "#E4E9EF",
  // header band color by depth (exec -> director -> team -> deeper). White text on all.
  levels: ["#04103f", "#274b73", "#3f6c9c", "#6285a8"],
};

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function mixWithWhite(hex, weight) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#FFFFFF";
  const mix = rgb.map((c) => Math.round(c + (255 - c) * weight));
  return "#" + mix.map((c) => c.toString(16).padStart(2, "0")).join("");
}

export function themeFromBranding(branding = {}) {
  const accent = branding.accent || THEME.accent;
  const levels = [accent, mixWithWhite(accent, 0.28), mixWithWhite(accent, 0.46), mixWithWhite(accent, 0.6)];
  return { ...THEME, accent, proposed: branding.proposed || "#057eb6", levels };
}

export function levelColor(theme, depth) {
  const l = theme.levels || THEME.levels;
  return l[Math.min(depth, l.length - 1)];
}

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function truncate(s, max) {
  s = (s || "").trim();
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

// Wrap a name onto at most two lines that each fit `max` characters.
function wrapName(name, max) {
  name = (name || "").trim();
  if (!name) return [];
  if (name.length <= max) return [name];
  const words = name.split(/\s+/);
  let line1 = "";
  let i = 0;
  for (; i < words.length; i++) {
    const next = line1 ? line1 + " " + words[i] : words[i];
    if (next.length > max && line1) break;
    line1 = next;
  }
  const rest = words.slice(i).join(" ");
  if (!rest) return [truncate(line1, max)];
  return [truncate(line1, max), truncate(rest, max)];
}

// Rounded rectangle path with independent top/bottom radii (for the header band).
function roundRectPath(x, y, w, h, rTop, rBot) {
  return (
    `M ${x + rTop} ${y} H ${x + w - rTop} Q ${x + w} ${y} ${x + w} ${y + rTop} ` +
    `V ${y + h - rBot} Q ${x + w} ${y + h} ${x + w - rBot} ${y + h} ` +
    `H ${x + rBot} Q ${x} ${y + h} ${x} ${y + h - rBot} ` +
    `V ${y + rTop} Q ${x} ${y} ${x + rTop} ${y} Z`
  );
}

function connectorPath(links) {
  const byParent = new Map();
  for (const l of links) {
    if (!byParent.has(l.from)) byParent.set(l.from, []);
    byParent.get(l.from).push(l);
  }
  let d = "";
  for (const group of byParent.values()) {
    if (group[0].type === "indent") {
      const { spineX, spineTop } = group[0];
      const bottom = Math.max(...group.map((g) => g.stubY));
      d += `M ${spineX} ${spineTop} L ${spineX} ${bottom} `;
      for (const g of group) d += `M ${spineX} ${g.stubY} L ${g.childLeft} ${g.stubY} `;
    } else {
      const { px, pBottom, busY } = group[0];
      const xs = group.map((g) => g.cx);
      const minX = Math.min(px, ...xs);
      const maxX = Math.max(px, ...xs);
      d += `M ${px} ${pBottom} L ${px} ${busY} `;
      d += `M ${minX} ${busY} L ${maxX} ${busY} `;
      for (const g of group) d += `M ${g.cx} ${busY} L ${g.cx} ${g.cTop} `;
    }
  }
  return d.trim();
}

function drawNode(g, node, theme, margin) {
  const p = node.person || {};
  const proposed = !!p.proposed;
  const x = node.x + margin;
  const y = node.y + margin;
  const w = node.w;
  const h = node.h;
  const r = 11;
  const bandH = 24;
  const cx = w / 2;
  const lvl = levelColor(theme, node.depth || 0);
  const grp = el("g", { transform: `translate(${x},${y})`, "data-id": node.id, class: "node-hit" }, g);

  // card
  const card = el(
    "rect",
    {
      x: 0,
      y: 0,
      width: w,
      height: h,
      rx: r,
      ry: r,
      fill: proposed ? mixWithWhite(lvl, 0.93) : "#FFFFFF",
      stroke: proposed ? theme.proposed : theme.cardBorder,
      "stroke-width": proposed ? 1.6 : 1,
      "stroke-dasharray": proposed ? "5 4" : "0",
    },
    grp
  );
  if (!proposed) card.setAttribute("filter", "url(#cardShadow)");

  // header band (level color), rounded top corners only — holds the role
  el("path", { d: roundRectPath(0, 0, w, bandH, r, 2), fill: lvl, opacity: proposed ? 0.9 : 1 }, grp);
  const maxChars = Math.floor((w - 18) / 6.4);
  const role = el(
    "text",
    { x: cx, y: bandH / 2 + 4, "font-family": NODE_FONT, "font-size": 10.5, "font-weight": 600, "letter-spacing": "0.02em", "text-anchor": "middle", fill: "#FFFFFF" },
    grp
  );
  role.textContent = truncate(p.title || (proposed ? "Proposed role" : "Role"), maxChars);

  // name in the body, wrapped to up to two centered lines
  const nameMax = Math.floor((w - 16) / 7.2);
  const bodyMid = bandH + (h - bandH) / 2;
  if (p.name) {
    const lines = wrapName(p.name, nameMax);
    const startY = lines.length === 2 ? bodyMid - 6 : bodyMid + 5;
    lines.forEach((ln, i) => {
      const t = el(
        "text",
        { x: cx, y: startY + i * 18, "font-family": NODE_FONT, "font-size": 14, "font-weight": 700, "text-anchor": "middle", fill: theme.ink },
        grp
      );
      t.textContent = ln;
    });
  } else {
    const t = el(
      "text",
      { x: cx, y: bodyMid + 5, "font-family": NODE_FONT, "font-size": 12.5, "font-weight": 500, "font-style": "italic", "text-anchor": "middle", fill: theme.muted },
      grp
    );
    t.textContent = "Open seat";
  }

  // proposed pill, centered just under the band
  if (proposed) {
    const pillW = 62;
    el("rect", { x: cx - pillW / 2, y: bandH + 6, width: pillW, height: 15, rx: 7.5, ry: 7.5, fill: theme.proposed, opacity: 0.14 }, grp);
    const pt = el(
      "text",
      { x: cx, y: bandH + 16.5, "font-family": NODE_FONT, "font-size": 9, "font-weight": 700, "letter-spacing": "0.06em", "text-anchor": "middle", fill: theme.proposed },
      grp
    );
    pt.textContent = "PROPOSED";
  }

  if (p.note) el("title", {}, grp).textContent = p.note;
}

function drawHeader(svg, branding, theme, width) {
  const title = (branding.title || "").trim();
  const logo = branding.logo;
  if (!title && !logo) return 0;
  const padX = MARGIN;
  const logoH = 40;
  const headerH = 76;
  let cursorX = padX;
  const g = el("g", {}, svg);
  if (logo && logo.dataURL) {
    const img = el("image", { x: padX, y: (headerH - logoH) / 2, height: logoH, width: logo.w || logoH, preserveAspectRatio: "xMinYMid meet" }, g);
    img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", logo.dataURL);
    img.setAttribute("href", logo.dataURL);
    cursorX += (logo.w || logoH) + 16;
  }
  if (title) {
    const t = el("text", { x: cursorX, y: headerH / 2 + 6, "font-family": NODE_FONT, "font-size": 19, "font-weight": 700, fill: theme.ink }, g);
    t.textContent = title;
  }
  el("line", { x1: padX, y1: headerH, x2: width - padX, y2: headerH, stroke: theme.cardBorder, "stroke-width": 1 }, g);
  return headerH + 12;
}

// Returns an <svg> element. opts: { spacing, report, theme, branding }
export function renderOrgSvg(people, opts = {}) {
  const branding = opts.branding || {};
  const theme = opts.theme || (opts.branding ? themeFromBranding(branding) : THEME);
  const lay = layoutOrg(people, opts);

  const totalW = lay.width;
  const svg = el("svg", { xmlns: SVG_NS, width: totalW, height: lay.height, "font-family": NODE_FONT });

  // soft drop shadow for cards
  const defs = el("defs", {}, svg);
  const filter = el("filter", { id: "cardShadow", x: "-20%", y: "-20%", width: "140%", height: "150%" }, defs);
  el("feDropShadow", { dx: 0, dy: 1.5, stdDeviation: 3, "flood-color": "#0b1f3a", "flood-opacity": "0.16" }, filter);

  const bg = el("rect", { x: 0, y: 0, width: totalW, height: lay.height, fill: theme.canvas }, svg);

  const headerH = drawHeader(svg, branding, theme, totalW);
  const totalH = lay.height + headerH;
  svg.setAttribute("height", totalH);
  svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
  bg.setAttribute("height", totalH);

  const content = el("g", headerH ? { transform: `translate(0,${headerH})` } : {}, svg);

  // Connectors AND nodes share one origin (the margin offset) so lines always meet boxes.
  const plot = el("g", { transform: `translate(${lay.margin},${lay.margin})` }, content);

  el("path", { d: connectorPath(lay.links), fill: "none", stroke: theme.link, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, plot);

  const nodesG = el("g", {}, plot);
  for (const node of lay.nodes) drawNode(nodesG, node, theme, 0);

  return { svg, layout: lay };
}
