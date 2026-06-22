// Renders a laid-out org into an SVG element.
// All visual attributes are inlined (not CSS classes) so the SVG exports faithfully
// as a standalone file and rasterizes to PNG with no external dependencies.

import { layoutOrg } from "./layout.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Node text uses a neutral system sans on purpose: guarantees identical preview
// and export with zero web-font loading (no blank text in slides).
const NODE_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const THEME = {
  ink: "#16212B",
  muted: "#5A6B78",
  accent: "#2C6E68",
  ochre: "#B07419",
  nodeFill: "#FFFFFF",
  nodeStroke: "#C7D0D8",
  proposedFill: "#FCF6EA",
  proposedStroke: "#B07419",
  link: "#A7B4BD",
  canvas: "#FFFFFF",
};

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

// Build the connector path: parent down to a bus line, across, and down to each child.
function connectorPath(links) {
  // Group by parent so each parent draws one clean bus.
  const byParent = new Map();
  for (const l of links) {
    if (!byParent.has(l.from)) byParent.set(l.from, []);
    byParent.get(l.from).push(l);
  }
  let d = "";
  for (const group of byParent.values()) {
    const { px, pBottom, busY } = group[0];
    const childXs = group.map((g) => g.cx);
    const minX = Math.min(px, ...childXs);
    const maxX = Math.max(px, ...childXs);
    // stem from parent to bus
    d += `M ${px} ${pBottom} L ${px} ${busY} `;
    // horizontal bus
    d += `M ${minX} ${busY} L ${maxX} ${busY} `;
    // drop to each child
    for (const g of group) {
      d += `M ${g.cx} ${busY} L ${g.cx} ${g.cTop} `;
    }
  }
  return d.trim();
}

function drawNode(g, node, theme, margin) {
  const p = node.person || {};
  const proposed = !!p.proposed;
  const x = node.x + margin;
  const y = node.y + margin;
  const grp = el("g", { transform: `translate(${x},${y})`, "data-id": node.id, class: "node-hit" }, g);

  // card
  el(
    "rect",
    {
      x: 0,
      y: 0,
      width: node.w,
      height: node.h,
      rx: 9,
      ry: 9,
      fill: proposed ? theme.proposedFill : theme.nodeFill,
      stroke: proposed ? theme.proposedStroke : theme.nodeStroke,
      "stroke-width": proposed ? 1.6 : 1.2,
      "stroke-dasharray": proposed ? "5 4" : "0",
    },
    grp
  );
  // accent spine on the left edge for identity
  el(
    "rect",
    {
      x: 0,
      y: 0,
      width: 4,
      height: node.h,
      rx: 2,
      ry: 2,
      fill: proposed ? theme.ochre : theme.accent,
    },
    grp
  );

  const padL = 16;
  const maxChars = Math.floor((node.w - padL - 14) / 7.2);
  const primaryText = p.name ? p.name : p.title || "Untitled role";
  const secondaryText = p.name ? p.title : proposed ? "Proposed role" : "";

  const t1 = el(
    "text",
    {
      x: padL,
      y: secondaryText ? node.h / 2 - 4 : node.h / 2 + 5,
      "font-family": NODE_FONT,
      "font-size": 14,
      "font-weight": 600,
      fill: theme.ink,
    },
    grp
  );
  t1.textContent = truncate(primaryText, maxChars);

  if (secondaryText) {
    const t2 = el(
      "text",
      {
        x: padL,
        y: node.h / 2 + 14,
        "font-family": NODE_FONT,
        "font-size": 12,
        "font-weight": 400,
        fill: theme.muted,
      },
      grp
    );
    t2.textContent = truncate(secondaryText, maxChars + 3);
  }

  // "Proposed" pill in the top-right corner
  if (proposed) {
    const pillW = 64;
    el(
      "rect",
      {
        x: node.w - pillW - 8,
        y: 8,
        width: pillW,
        height: 16,
        rx: 8,
        ry: 8,
        fill: theme.ochre,
        opacity: 0.12,
      },
      grp
    );
    const pt = el(
      "text",
      {
        x: node.w - pillW / 2 - 8,
        y: 19.5,
        "font-family": NODE_FONT,
        "font-size": 9.5,
        "font-weight": 700,
        "letter-spacing": "0.06em",
        "text-anchor": "middle",
        fill: theme.ochre,
      },
      grp
    );
    pt.textContent = "PROPOSED";
  }

  if (p.note) {
    const title = el("title", {}, grp);
    title.textContent = p.note;
  }
}

// Returns an <svg> element. opts: { spacing, theme }
export function renderOrgSvg(people, opts = {}) {
  const theme = opts.theme || THEME;
  const lay = layoutOrg(people, opts);

  const svg = el("svg", {
    xmlns: SVG_NS,
    width: lay.width,
    height: lay.height,
    viewBox: `0 0 ${lay.width} ${lay.height}`,
    "font-family": NODE_FONT,
  });
  // white background so PNG/SVG drops onto any slide cleanly
  el("rect", { x: 0, y: 0, width: lay.width, height: lay.height, fill: theme.canvas }, svg);

  // connectors first (under the cards)
  const linksG = el("g", {}, svg);
  el(
    "path",
    {
      d: connectorPath(lay.links),
      fill: "none",
      stroke: theme.link,
      "stroke-width": 1.5,
      "stroke-linecap": "round",
    },
    linksG
  );

  const nodesG = el("g", {}, svg);
  for (const node of lay.nodes) drawNode(nodesG, node, theme, lay.margin);

  return { svg, layout: lay };
}
