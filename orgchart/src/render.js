// Renders a laid-out org into an SVG element (modern card style).
// All visual attributes are inlined (not CSS classes) so the SVG exports faithfully
// as a standalone file and rasterizes to PNG with no external dependencies.

import { layoutOrg, MARGIN } from "./layout.js";

const SVG_NS = "http://www.w3.org/2000/svg";
// Brand fonts (Blueprint Biosecurity guide): Georgia for headers (the role band and
// the chart title), Inter for body (names, captions). Inter falls back to the system
// UI sans when it isn't installed, so exports stay self-contained.
const HEADER_FONT = "Georgia, 'Times New Roman', serif";
const BODY_FONT =
  "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const NODE_FONT = BODY_FONT;

export const THEME = {
  ink: "#1A1A1A", // brand "Ink" — primary body text
  muted: "#6B7280", // brand "Body Gray" — captions, metadata
  accent: "#0A1F44", // brand "Deep Navy" — headings / dark bands
  link: "#9AAAB6",
  canvas: "#FFFFFF",
  cardBorder: "#E4E9EF",
  // header band color by depth (exec -> director -> team -> deeper). White text on all.
  levels: ["#0A1F44", "#274b73", "#3f6c9c", "#6285a8"],
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

// The four manually-assigned role categories, darkest (executive) to lightest (IC),
// reusing the theme's level palette. Order here drives the legend and pickers.
export const CATEGORIES = [
  { key: "executive", label: "Executive" },
  { key: "director", label: "Director" },
  { key: "manager", label: "Manager" },
  { key: "ic", label: "IC" },
];
const CATEGORY_INDEX = { executive: 0, director: 1, manager: 2, ic: 3 };

export function categoryColor(theme, category) {
  const l = theme.levels || THEME.levels;
  const idx = CATEGORY_INDEX[category] ?? CATEGORY_INDEX.ic;
  return l[Math.min(idx, l.length - 1)];
}

// Proposed (unfilled) roles are colored by how soon they're being hired, mirroring the
// "hiring now / soon / later" buckets used in board decks.
export const HIRING_STAGES = [
  { key: "now", label: "Hiring now", short: "HIRING NOW", color: "#7ed957" },
  { key: "soon", label: "Hiring soon", short: "HIRING SOON", color: "#ffd400" },
  { key: "later", label: "Hiring later", short: "HIRING LATER", color: "#ff9f1c" },
];
const HIRING_BY_KEY = Object.fromEntries(HIRING_STAGES.map((s) => [s.key, s]));
export function hiringStage(key) {
  return HIRING_BY_KEY[key] || HIRING_BY_KEY.soon;
}

function mixWithBlack(hex, weight) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#000000";
  const mix = rgb.map((c) => Math.round(c * (1 - weight)));
  return "#" + mix.map((c) => c.toString(16).padStart(2, "0")).join("");
}

// Black or white text, whichever reads better on the given background.
function readableText(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#FFFFFF";
  const [r, g, b] = rgb;
  const perceived = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return perceived > 0.62 ? "#16212B" : "#FFFFFF";
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

// Greedy word-wrap onto at most `maxLines` lines that each fit `max` characters.
// Any overflow past the last line is truncated with an ellipsis.
function wrapLines(text, max, maxLines = 2) {
  text = (text || "").trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  const usedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const rest = words.slice(usedWords).join(" ");
  if (rest) lines.push(truncate(rest, max));
  else if (line) lines.push(truncate(line, max));
  return lines.slice(0, maxLines);
}

// Word-wrap into at most `maxLines` lines of `cpl` chars, WITHOUT truncating. Returns
// the lines, or null if the text can't fit (a word is too wide, or it needs more
// lines) — the caller then tries a smaller font.
function wrapWithin(text, cpl, maxLines) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  for (const word of words) {
    if (word.length > cpl) return null; // single word wider than the box
    const next = line ? line + " " + word : word;
    if (next.length > cpl) {
      lines.push(line);
      if (lines.length >= maxLines) return null; // would overflow past the last line
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

// Pick the largest font size (down to a floor) at which the title fits the card width
// on at most two lines, with side padding — so long titles shrink to fit instead of
// being cut off with an ellipsis. ~0.553 is the observed width-per-point for the bold
// header face; padPx is reserved on each side.
function fitTitle(title, w, { maxFs = 17, minFs = 7.5, padPx = 9 } = {}) {
  const text = ((title || "").trim()) || "Role";
  const usable = w - padPx * 2;
  // Prefer the largest size that fits on two lines; only drop to three lines if even
  // the smallest two-line size can't hold it. Truncation is the last resort.
  for (const maxLines of [2, 3]) {
    for (let fs = maxFs; fs >= minFs; fs -= 0.5) {
      const cpl = Math.max(3, Math.floor(usable / (fs * 0.553)));
      const lines = wrapWithin(text, cpl, maxLines);
      if (lines) return { fs, lines };
    }
  }
  const cpl = Math.max(3, Math.floor(usable / (minFs * 0.553)));
  return { fs: minFs, lines: wrapLines(text, cpl, 3).map((ln) => truncate(ln, cpl)) };
}

// Split a name into first name (line 1) and the rest (line 2). Single-token names
// stay on one line.
function splitName(name) {
  const n = (name || "").trim();
  if (!n) return [];
  const parts = n.split(/\s+/);
  if (parts.length === 1) return [parts[0]];
  return [parts[0], parts.slice(1).join(" ")];
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
  // Co-leader links are peer-to-peer (drawn individually); the rest group by parent.
  const coLinks = links.filter((l) => l.type === "co");
  const byParent = new Map();
  for (const l of links) {
    if (l.type === "co") continue;
    if (!byParent.has(l.from)) byParent.set(l.from, []);
    byParent.get(l.from).push(l);
  }
  let d = "";
  for (const l of coLinks) {
    if (Math.abs(l.y1 - l.y2) < 0.5) {
      d += `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2} `; // same tier: straight horizontal
    } else {
      const midX = (l.x1 + l.x2) / 2;
      d += `M ${l.x1} ${l.y1} H ${midX} V ${l.y2} H ${l.x2} `;
    }
  }
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
  const stage = proposed ? hiringStage(p.hiringStage) : null;
  // Filled roles take their category color; proposed roles take their hiring-stage color.
  const bandColor = proposed ? stage.color : categoryColor(theme, p.category);
  const bandText = proposed ? readableText(stage.color) : "#FFFFFF";
  const x = node.x + margin;
  const y = node.y + margin;
  const w = node.w;
  const h = node.h;
  const r = 11;
  const cx = w / 2;
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
      fill: proposed ? mixWithWhite(bandColor, 0.9) : "#FFFFFF",
      stroke: proposed ? mixWithBlack(bandColor, 0.12) : theme.cardBorder,
      "stroke-width": proposed ? 1.6 : 1,
      "stroke-dasharray": proposed ? "5 4" : "0",
    },
    grp
  );
  if (!proposed) card.setAttribute("filter", "url(#cardShadow)");

  // header band, rounded top corners only — holds the role. The title carries the most
  // visual weight on the card (bold, slightly larger) and wraps onto up to two lines.
  // The band is a FIXED height so every card looks the same and names share a baseline.
  // The title band is a little under half the card height so the role reads as the
  // headline. (Card height is fixed; only the band/body split changes.)
  const BAND_REF = Math.round(h * 0.44);
  const bandH = BAND_REF;
  el("path", { d: roundRectPath(0, 0, w, bandH, r, 2), fill: bandColor }, grp);
  // Auto-fit: shrink the title until it fits the card width on up to two lines (with
  // padding) instead of truncating it. Line height and vertical centering scale with
  // the chosen size so the block stays centered in the band.
  const { fs: titleFs, lines: titleLines } = fitTitle(p.title || "Role", w);
  const titleLh = titleFs * 1.06;
  const blockTop = bandH / 2 - ((titleLines.length - 1) * titleLh) / 2;
  titleLines.forEach((ln, i) => {
    const role = el(
      "text",
      { x: cx, y: blockTop + i * titleLh + titleFs * 0.34, "font-family": HEADER_FONT, "font-size": titleFs, "font-weight": 700, "letter-spacing": "0.01em", "text-anchor": "middle", fill: bandText },
      grp
    );
    role.textContent = ln;
  });

  // body: first name on its own line, last name beneath it. Centered in the region
  // between the fixed band reference and the card bottom (minus the proposed pill), so
  // names line up across cards even when their title bands differ in height.
  const nameMax = Math.floor((w - 12) / 8.6);
  const bodyMid = (BAND_REF + (proposed ? h - 26 : h)) / 2;
  if (p.name) {
    const lines = splitName(p.name).map((ln) => truncate(ln, nameMax));
    const startY = lines.length === 2 ? bodyMid - 4 : bodyMid + 5;
    lines.forEach((ln, i) => {
      const t = el(
        "text",
        { x: cx, y: startY + i * 18, "font-family": NODE_FONT, "font-size": 16, "font-weight": 700, "text-anchor": "middle", fill: theme.ink },
        grp
      );
      t.textContent = ln;
    });
  } else {
    const t = el(
      "text",
      { x: cx, y: bodyMid + 4, "font-family": NODE_FONT, "font-size": 13, "font-weight": 500, "font-style": "italic", "text-anchor": "middle", fill: theme.muted },
      grp
    );
    t.textContent = "Open seat";
  }

  // hiring-stage pill, centered near the bottom
  if (proposed) {
    const pillW = Math.min(w - 8, stage.short.length * 6.2 + 16);
    el("rect", { x: cx - pillW / 2, y: h - 22, width: pillW, height: 15, rx: 7.5, ry: 7.5, fill: stage.color, opacity: 0.28 }, grp);
    const pt = el(
      "text",
      { x: cx, y: h - 11.5, "font-family": NODE_FONT, "font-size": 9, "font-weight": 700, "letter-spacing": "0.06em", "text-anchor": "middle", fill: mixWithBlack(stage.color, 0.55) },
      grp
    );
    pt.textContent = stage.short;
  }

  if (p.note) el("title", {}, grp).textContent = p.note;
}

const HEADER_BAND = 84; // reserved top strip for the title and/or a top-corner logo
const FOOTER_BAND = 60; // reserved bottom strip for a bottom-corner logo

// How much vertical space the branding reserves at the top and bottom of the image.
function brandBands(branding) {
  const hasTitle = !!(branding.title && branding.title.trim());
  const logo = branding.logo && branding.logo.dataURL ? branding.logo : null;
  const corner = branding.logoCorner || "tr";
  const topLogo = logo && (corner === "tl" || corner === "tr");
  const botLogo = logo && (corner === "bl" || corner === "br");
  return {
    top: hasTitle || topLogo ? HEADER_BAND : 0,
    bottom: botLogo ? FOOTER_BAND : 0,
    hasTitle,
    logo,
    corner,
  };
}

// Draw the optional chart title (top header) and the optional logo pinned to a corner.
function drawBranding(svg, branding, theme, width, totalH, bands) {
  const { top, bottom, hasTitle, logo, corner } = bands;
  if (!hasTitle && !logo) return;
  const pad = MARGIN;
  const g = el("g", {}, svg);

  if (logo) {
    const lw = logo.w || 120;
    const lh = logo.h || 40;
    const right = corner === "tr" || corner === "br";
    const lx = right ? width - lw - pad : pad;
    const ly = corner === "bl" || corner === "br" ? totalH - bottom + (bottom - lh) / 2 : (top - lh) / 2;
    const img = el("image", { x: lx, y: ly, width: lw, height: lh, preserveAspectRatio: "xMidYMid meet" }, g);
    img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", logo.dataURL);
    img.setAttribute("href", logo.dataURL);
  }

  if (hasTitle) {
    // Left-aligned in the header; nudged right if a top-left logo shares the corner.
    const tx = logo && corner === "tl" ? pad + (logo.w || 120) + 16 : pad;
    const t = el("text", { x: tx, y: top / 2 + 7, "font-family": HEADER_FONT, "font-size": 20, "font-weight": 700, fill: theme.ink }, g);
    t.textContent = branding.title.trim();
    el("line", { x1: pad, y1: top, x2: width - pad, y2: top, stroke: theme.cardBorder, "stroke-width": 1 }, g);
  }
}

// Minimum image width so the title and a top-corner logo don't collide on a narrow
// chart. ~11px/char is a generous estimate for the 20px Georgia-bold title.
function brandMinWidth(branding, bands) {
  const pad = MARGIN;
  const logoW = bands.logo ? bands.logo.w || 120 : 0;
  let need = 0;
  if (bands.hasTitle) {
    const titleW = branding.title.trim().length * 11 + 8;
    const topLogoW = bands.logo && (bands.corner === "tl" || bands.corner === "tr") ? logoW + 24 : 0;
    need = Math.max(need, pad + titleW + topLogoW + pad);
  }
  if (bands.logo) need = Math.max(need, logoW + pad * 2);
  return need;
}

// Returns an <svg> element. opts: { spacing, report, theme, branding, background }
export function renderOrgSvg(people, opts = {}) {
  const branding = opts.branding || {};
  const theme = opts.theme || (opts.branding ? themeFromBranding(branding) : THEME);
  const canvas = opts.background || theme.canvas;
  const lay = layoutOrg(people, opts);

  // Reserve top/bottom bands for the optional title and corner logo. Widen the image
  // (and center the chart under the header) if the branding needs more room than the
  // chart itself, so a title and corner logo never overlap.
  const bands = brandBands(branding);
  const totalW = Math.max(lay.width, brandMinWidth(branding, bands));
  const offsetX = Math.round((totalW - lay.width) / 2);
  const totalH = lay.height + bands.top + bands.bottom;

  const svg = el("svg", { xmlns: SVG_NS, width: totalW, height: totalH, viewBox: `0 0 ${totalW} ${totalH}`, "font-family": NODE_FONT });

  // soft drop shadow for cards
  const defs = el("defs", {}, svg);
  const filter = el("filter", { id: "cardShadow", x: "-20%", y: "-20%", width: "140%", height: "150%" }, defs);
  el("feDropShadow", { dx: 0, dy: 1.5, stdDeviation: 3, "flood-color": "#0b1f3a", "flood-opacity": "0.16" }, filter);

  el("rect", { x: 0, y: 0, width: totalW, height: totalH, fill: canvas }, svg);

  const content = el("g", bands.top ? { transform: `translate(0,${bands.top})` } : {}, svg);

  // Connectors AND nodes share one origin (the margin offset) so lines always meet boxes.
  const plot = el("g", { transform: `translate(${lay.margin + offsetX},${lay.margin})` }, content);

  el("path", { d: connectorPath(lay.links), fill: "none", stroke: theme.link, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, plot);

  const nodesG = el("g", {}, plot);
  for (const node of lay.nodes) drawNode(nodesG, node, theme, 0);

  drawBranding(svg, branding, theme, totalW, totalH, bands);

  return { svg, layout: lay };
}
