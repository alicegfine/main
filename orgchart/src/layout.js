// Tidy org-chart layout. Two report styles:
//   "spread"  - children laid out horizontally; parent centered above them (classic).
//   "stacked" - when a manager's reports are all leaves, they stack in a vertical
//               column under the manager. Far narrower + taller — good for flat orgs.
// Pure geometry: takes a people list, returns node boxes + connector geometry.

import { buildForest } from "./model.js";

export const SPACING = {
  normal: { nodeW: 212, nodeH: 66, hGap: 30, vGap: 58, rootGap: 60, stackIndent: 34, stackVGap: 24, stackGap: 12 },
  compact: { nodeW: 188, nodeH: 56, hGap: 18, vGap: 40, rootGap: 40, stackIndent: 26, stackVGap: 18, stackGap: 9 },
  airy: { nodeW: 230, nodeH: 74, hGap: 44, vGap: 78, rootGap: 80, stackIndent: 42, stackVGap: 32, stackGap: 16 },
};

export const MARGIN = 36;

export function layoutOrg(people, opts = {}) {
  const sp = SPACING[opts.spacing] || SPACING.normal;
  const stacked = opts.report === "stacked";
  const { roots, childrenOf, byId, issues } = buildForest(people);

  const nodes = [];
  const nodeById = new Map();
  const placed = new Set();

  const kidsOf = (id) => (childrenOf.get(id) || []).filter((k) => !placed.has(k) && k !== id);

  // Pass 1: measure each subtree's bounding box (and decide stack vs spread per node).
  function measure(id, depth = 0) {
    placed.add(id);
    const node = { id, person: byId.get(id), depth, w: sp.nodeW, h: sp.nodeH, x: 0, y: 0, kids: [], stacked: false };
    nodes.push(node);
    nodeById.set(id, node);

    const kids = kidsOf(id).map((k) => measure(k, depth + 1));
    node.kids = kids;
    if (kids.length === 0) {
      node.subW = sp.nodeW;
      node.subH = sp.nodeH;
      return node;
    }

    const allLeaves = kids.every((k) => k.kids.length === 0);
    if (stacked && allLeaves) {
      node.stacked = true;
      const stackH = kids.reduce((a, k) => a + k.h, 0) + (kids.length - 1) * sp.stackGap;
      node.subW = sp.stackIndent + sp.nodeW;
      node.subH = sp.nodeH + sp.stackVGap + stackH;
    } else {
      const totalW = kids.reduce((a, k) => a + k.subW, 0) + (kids.length - 1) * sp.hGap;
      const maxChildH = Math.max(...kids.map((k) => k.subH));
      node.subW = Math.max(sp.nodeW, totalW);
      node.subH = sp.nodeH + sp.vGap + maxChildH;
    }
    return node;
  }

  // Pass 2: assign absolute positions given each subtree's top-left origin.
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
      const center = (first.x + sp.nodeW / 2 + last.x + sp.nodeW / 2) / 2;
      node.x = center - sp.nodeW / 2;
    }
  }

  // Place each root tree left-to-right.
  let originX = 0;
  for (const r of roots) {
    if (placed.has(r)) continue;
    const root = measure(r);
    assign(root, originX, 0);
    originX += root.subW + sp.rootGap;
  }

  // Connectors.
  const links = [];
  for (const parent of nodes) {
    const kids = parent.kids;
    if (!kids.length) continue;
    if (parent.stacked) {
      const spineX = parent.x + Math.min(20, sp.stackIndent / 2);
      const spineTop = parent.y + parent.h;
      for (const k of kids) {
        links.push({ type: "stack", from: parent.id, to: k.id, spineX, spineTop, stubY: k.y + k.h / 2, childLeft: k.x });
      }
    } else {
      const px = parent.x + parent.w / 2;
      const pBottom = parent.y + parent.h;
      const busY = pBottom + sp.vGap / 2;
      for (const k of kids) {
        links.push({ type: "bus", from: parent.id, to: k.id, px, pBottom, busY, cx: k.x + k.w / 2, cTop: k.y });
      }
    }
  }

  let maxRight = 0;
  let maxBottom = 0;
  for (const n of nodes) {
    maxRight = Math.max(maxRight, n.x + n.w);
    maxBottom = Math.max(maxBottom, n.y + n.h);
  }

  return {
    nodes,
    links,
    width: Math.max(maxRight, sp.nodeW) + MARGIN * 2,
    height: Math.max(maxBottom, sp.nodeH) + MARGIN * 2,
    margin: MARGIN,
    spacing: sp,
    issues,
  };
}
