// Org-chart layout. Two modes:
//   "tree" - classic top-down: every level spreads in a single horizontal row.
//   "grid" - top-down, but a manager whose reports are all individuals arranges them
//            in a compact two-row "brick": a top row, then the rest tucked into the
//            gaps below, lines dropping between the upper boxes. Keeps the chart from
//            becoming one very wide row.
// Pure geometry: takes a people list, returns node boxes + connector geometry.

import { buildForest } from "./model.js";

// Cards are portrait (taller than wide): a thicker header band holds the wrapped
// title, and the body stacks first name over last name. The app fixes the layout to
// "compact"; the other presets are kept for completeness but aren't selectable.
export const SPACING = {
  normal: { nodeW: 140, nodeH: 148, hGap: 26, vGap: 46, rootGap: 42, gridVGap: 44, gridRowGap: 26 },
  compact: { nodeW: 116, nodeH: 134, hGap: 14, vGap: 26, rootGap: 24, gridVGap: 26, gridRowGap: 14 },
  airy: { nodeW: 156, nodeH: 168, hGap: 36, vGap: 64, rootGap: 60, gridVGap: 60, gridRowGap: 34 },
};

export const MARGIN = 24;

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

function layoutTopDown(roots, kidsOf, byId, sp, gridLeaves) {
  const nodes = [];
  const placed = new Set();
  const step = sp.nodeW + sp.hGap;

  function measure(id, depth) {
    placed.add(id);
    const node = { id, person: byId.get(id), depth, w: sp.nodeW, h: sp.nodeH, x: 0, y: 0, kids: [], grid: null };
    nodes.push(node);
    node.kids = kidsOf(id, placed).map((k) => measure(k, depth + 1));

    if (node.kids.length === 0) {
      node.subW = sp.nodeW;
      node.subH = sp.nodeH;
      return node;
    }
    const n = node.kids.length;
    const allLeaves = node.kids.every((k) => k.kids.length === 0);
    if (gridLeaves && allLeaves) {
      // cols chosen so the second row has at most (cols-1) boxes -> each fits a top-row gap
      const cols = n <= 1 ? 1 : Math.ceil((n + 1) / 2);
      const r1 = Math.min(n, cols);
      const r2 = n - r1;
      const rows = r2 > 0 ? 2 : 1;
      const blockW = (r1 - 1) * step + sp.nodeW;
      node.grid = { cols, r1, r2, blockW };
      node.subW = Math.max(sp.nodeW, blockW);
      node.subH = sp.nodeH + sp.gridVGap + rows * sp.nodeH + (rows - 1) * sp.gridRowGap;
    } else {
      const totalW = node.kids.reduce((a, k) => a + k.subW, 0) + (n - 1) * sp.hGap;
      node.subW = Math.max(sp.nodeW, totalW);
      node.subH = sp.nodeH + sp.vGap + Math.max(...node.kids.map((k) => k.subH));
    }
    return node;
  }

  function assign(node, x, y) {
    node.y = y;
    if (node.kids.length === 0) {
      node.x = x + (node.subW - sp.nodeW) / 2;
      return;
    }
    if (node.grid) {
      const { r1, r2, blockW } = node.grid;
      const blockLeft = x + (node.subW - blockW) / 2;
      node.x = blockLeft + (blockW - sp.nodeW) / 2;
      const blockTop = y + sp.nodeH + sp.gridVGap;
      for (let i = 0; i < r1; i++) {
        const k = node.kids[i];
        k.x = blockLeft + i * step;
        k.y = blockTop;
      }
      const startGap = Math.floor((r1 - 1 - r2) / 2);
      for (let j = 0; j < r2; j++) {
        const k = node.kids[r1 + j];
        k.x = blockLeft + (startGap + j) * step + step / 2;
        k.y = blockTop + sp.nodeH + sp.gridRowGap;
      }
    } else {
      let cx = x;
      for (const k of node.kids) {
        assign(k, cx, y + sp.nodeH + sp.vGap);
        cx += k.subW + sp.hGap;
      }
      const first = node.kids[0];
      const last = node.kids[node.kids.length - 1];
      node.x = (first.x + sp.nodeW / 2 + last.x + sp.nodeW / 2) / 2 - sp.nodeW / 2;
    }
  }

  let originX = 0;
  for (const r of roots) {
    if (placed.has(r)) continue;
    const root = measure(r, 0);
    assign(root, originX, 0);
    originX += root.subW + sp.rootGap;
  }

  // Connectors: one bus per parent. The grid's second-row boxes just have a longer
  // drop that falls cleanly in the gaps between the top-row boxes.
  const links = [];
  for (const parent of nodes) {
    if (!parent.kids.length) continue;
    const px = parent.x + parent.w / 2;
    const pBottom = parent.y + parent.h;
    const gap = parent.grid ? sp.gridVGap : sp.vGap;
    const busY = pBottom + gap / 2;
    for (const k of parent.kids) {
      links.push({ type: "bus", from: parent.id, to: k.id, px, pBottom, busY, cx: k.x + k.w / 2, cTop: k.y });
    }
  }
  return { nodes, links };
}

export function layoutOrg(people, opts = {}) {
  const sp = SPACING[opts.spacing] || SPACING.normal;
  const { roots, childrenOf, byId, issues } = buildForest(people);

  // Optional stable left-to-right ordering: sort every sibling group by a caller-
  // supplied rank (e.g. position in the current org) so scenarios stay aligned.
  // Unranked people keep their existing relative order and fall in after ranked ones.
  if (opts.order) {
    const rank = (id) => (opts.order.has(id) ? opts.order.get(id) : Number.MAX_SAFE_INTEGER);
    const cmp = (a, b) => rank(a) - rank(b); // stable sort keeps ties in insertion order
    roots.sort(cmp);
    for (const arr of childrenOf.values()) arr.sort(cmp);
  }

  const kidsOf = (id, placed) => (childrenOf.get(id) || []).filter((k) => k !== id && !placed.has(k));

  const { nodes, links } = layoutTopDown(roots, kidsOf, byId, sp, opts.report !== "tree");

  return { nodes, links, ...bounds(nodes, sp), margin: MARGIN, spacing: sp, issues };
}
