// Org-chart layout. Two modes:
//   "tree"     - classic top-down: children spread horizontally, parent centered above.
//   "indented" - compact outline: each report sits one indent under its manager, one
//                row per person, with a line that ticks into the left edge of each box.
// Pure geometry: takes a people list, returns node boxes + connector geometry.

import { buildForest } from "./model.js";

export const SPACING = {
  normal: { nodeW: 208, nodeH: 64, hGap: 22, vGap: 52, rootGap: 48, indentX: 34, rowGap: 14, spineInset: 18 },
  compact: { nodeW: 184, nodeH: 56, hGap: 14, vGap: 38, rootGap: 34, indentX: 28, rowGap: 10, spineInset: 15 },
  airy: { nodeW: 224, nodeH: 72, hGap: 34, vGap: 72, rootGap: 72, indentX: 42, rowGap: 18, spineInset: 20 },
};

export const MARGIN = 36;

function bounds(nodes, sp) {
  let maxRight = 0;
  let maxBottom = 0;
  for (const n of nodes) {
    maxRight = Math.max(maxRight, n.x + n.w);
    maxBottom = Math.max(maxBottom, n.y + n.h);
  }
  return {
    width: Math.max(maxRight, sp.nodeW) + MARGIN * 2,
    height: Math.max(maxBottom, sp.nodeH) + MARGIN * 2,
  };
}

// Classic top-down tree.
function layoutTree(roots, kidsOf, byId, sp) {
  const nodes = [];
  const placed = new Set();

  function measure(id, depth) {
    placed.add(id);
    const node = { id, person: byId.get(id), depth, w: sp.nodeW, h: sp.nodeH, x: 0, y: 0, kids: [] };
    nodes.push(node);
    node.kids = kidsOf(id, placed).map((k) => measure(k, depth + 1));
    if (node.kids.length === 0) {
      node.subW = sp.nodeW;
    } else {
      const totalW = node.kids.reduce((a, k) => a + k.subW, 0) + (node.kids.length - 1) * sp.hGap;
      node.subW = Math.max(sp.nodeW, totalW);
    }
    return node;
  }

  function assign(node, x, y) {
    node.y = y;
    if (node.kids.length === 0) {
      node.x = x + (node.subW - sp.nodeW) / 2;
      return;
    }
    let cx = x;
    for (const k of node.kids) {
      assign(k, cx, y + sp.nodeH + sp.vGap);
      cx += k.subW + sp.hGap;
    }
    const first = node.kids[0];
    const last = node.kids[node.kids.length - 1];
    node.x = (first.x + sp.nodeW / 2 + last.x + sp.nodeW / 2) / 2 - sp.nodeW / 2;
  }

  let originX = 0;
  for (const r of roots) {
    if (placed.has(r)) continue;
    const root = measure(r, 0);
    assign(root, originX, 0);
    originX += root.subW + sp.rootGap;
  }

  const links = [];
  for (const parent of nodes) {
    if (!parent.kids.length) continue;
    const px = parent.x + parent.w / 2;
    const pBottom = parent.y + parent.h;
    const busY = pBottom + sp.vGap / 2;
    for (const k of parent.kids) {
      links.push({ type: "bus", from: parent.id, to: k.id, px, pBottom, busY, cx: k.x + k.w / 2, cTop: k.y });
    }
  }
  return { nodes, links };
}

// Compact indented outline.
function layoutIndented(roots, kidsOf, byId, sp) {
  const nodes = [];
  const nodeById = new Map();
  const placed = new Set();
  let row = 0;

  function walk(id, depth) {
    placed.add(id);
    const node = {
      id,
      person: byId.get(id),
      depth,
      w: sp.nodeW,
      h: sp.nodeH,
      x: depth * sp.indentX,
      y: row * (sp.nodeH + sp.rowGap),
      kids: [],
    };
    row += 1;
    nodes.push(node);
    nodeById.set(id, node);
    for (const k of kidsOf(id, placed)) {
      const child = walk(k, depth + 1);
      if (child) node.kids.push(child);
    }
    return node;
  }

  for (const r of roots) {
    if (!placed.has(r)) walk(r, 0);
  }

  const links = [];
  for (const parent of nodes) {
    if (!parent.kids.length) continue;
    const spineX = parent.x + sp.spineInset;
    const spineTop = parent.y + parent.h;
    for (const k of parent.kids) {
      links.push({ type: "indent", from: parent.id, to: k.id, spineX, spineTop, stubY: k.y + k.h / 2, childLeft: k.x });
    }
  }
  return { nodes, links };
}

export function layoutOrg(people, opts = {}) {
  const sp = SPACING[opts.spacing] || SPACING.normal;
  const { roots, childrenOf, byId, issues } = buildForest(people);
  const kidsOf = (id, placed) => (childrenOf.get(id) || []).filter((k) => k !== id && !placed.has(k));

  const { nodes, links } = opts.report === "indented"
    ? layoutIndented(roots, kidsOf, byId, sp)
    : layoutTree(roots, kidsOf, byId, sp);

  return { nodes, links, ...bounds(nodes, sp), margin: MARGIN, spacing: sp, issues };
}
