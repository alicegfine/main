// Org-chart layout. Two modes:
//   "tree"    - classic top-down: every level spreads horizontally (best for small orgs).
//   "compact" - top-down, but a manager whose reports are all individuals stacks them
//               in a vertical column beneath itself. Keeps the chart close to slide
//               proportions (landscape) instead of one very wide row.
// Pure geometry: takes a people list, returns node boxes + connector geometry.

import { buildForest } from "./model.js";

export const SPACING = {
  normal: { nodeW: 162, nodeH: 86, hGap: 26, vGap: 46, rootGap: 40, stackIndent: 30, stackVGap: 22, stackGap: 12, spineInset: 16 },
  compact: { nodeW: 146, nodeH: 76, hGap: 18, vGap: 34, rootGap: 30, stackIndent: 24, stackVGap: 16, stackGap: 9, spineInset: 13 },
  airy: { nodeW: 178, nodeH: 98, hGap: 36, vGap: 64, rootGap: 60, stackIndent: 38, stackVGap: 30, stackGap: 16, spineInset: 20 },
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

// stackLeaves=false -> pure top-down tree; true -> all-leaf report groups stack vertically.
function layoutTopDown(roots, kidsOf, byId, sp, stackLeaves) {
  const nodes = [];
  const placed = new Set();

  function measure(id, depth) {
    placed.add(id);
    const node = { id, person: byId.get(id), depth, w: sp.nodeW, h: sp.nodeH, x: 0, y: 0, kids: [], stacked: false };
    nodes.push(node);
    node.kids = kidsOf(id, placed).map((k) => measure(k, depth + 1));

    if (node.kids.length === 0) {
      node.subW = sp.nodeW;
      node.subH = sp.nodeH;
      return node;
    }
    const allLeaves = node.kids.every((k) => k.kids.length === 0);
    if (stackLeaves && allLeaves) {
      node.stacked = true;
      const stackH = node.kids.reduce((a, k) => a + k.h, 0) + (node.kids.length - 1) * sp.stackGap;
      node.subW = sp.stackIndent + sp.nodeW;
      node.subH = sp.nodeH + sp.stackVGap + stackH;
    } else {
      const totalW = node.kids.reduce((a, k) => a + k.subW, 0) + (node.kids.length - 1) * sp.hGap;
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
    if (node.stacked) {
      node.x = x;
      let cy = y + sp.nodeH + sp.stackVGap;
      for (const k of node.kids) {
        assign(k, x + sp.stackIndent, cy);
        cy += k.h + sp.stackGap;
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

  const links = [];
  for (const parent of nodes) {
    if (!parent.kids.length) continue;
    if (parent.stacked) {
      const spineX = parent.x + sp.spineInset;
      const spineTop = parent.y + parent.h;
      for (const k of parent.kids) {
        links.push({ type: "indent", from: parent.id, to: k.id, spineX, spineTop, stubY: k.y + k.h / 2, childLeft: k.x });
      }
    } else {
      const px = parent.x + parent.w / 2;
      const pBottom = parent.y + parent.h;
      const busY = pBottom + sp.vGap / 2;
      for (const k of parent.kids) {
        links.push({ type: "bus", from: parent.id, to: k.id, px, pBottom, busY, cx: k.x + k.w / 2, cTop: k.y });
      }
    }
  }
  return { nodes, links };
}

export function layoutOrg(people, opts = {}) {
  const sp = SPACING[opts.spacing] || SPACING.normal;
  const { roots, childrenOf, byId, issues } = buildForest(people);
  const kidsOf = (id, placed) => (childrenOf.get(id) || []).filter((k) => k !== id && !placed.has(k));

  const { nodes, links } = layoutTopDown(roots, kidsOf, byId, sp, opts.report === "compact");

  return { nodes, links, ...bounds(nodes, sp), margin: MARGIN, spacing: sp, issues };
}
