// Org-chart layout ("hybrid"): a manager whose reports are all individuals (no reports
// of their own) stacks them in a vertical, indented list with elbow connectors;
// managers who themselves have managers under them spread their reports across a row.
// The top of the chart (depth < horizontalDepth) always spreads. This keeps leadership
// readable while collapsing wide leaf teams into narrow columns.
// Pure geometry: takes a people list, returns node boxes + connector geometry.

import { buildForest } from "./model.js";

// Cards are portrait (taller than wide): a thicker header band holds the wrapped
// title, and the body stacks first name over last name. The app fixes the layout to
// "compact"; the other presets are kept for completeness but aren't selectable.
//   horizontalDepth - top levels that always spread horizontally (1 = just the root).
//   indent          - how far each stacked child sits right of its parent.
//   stackTopGap     - vertical gap from a parent to its first stacked child.
//   stackRowGap     - vertical gap between stacked siblings.
//   spineX          - x offset of the vertical connector spine inside the parent.
export const SPACING = {
  normal: { nodeW: 140, nodeH: 148, hGap: 26, vGap: 46, rootGap: 42, horizontalDepth: 1, indent: 34, stackTopGap: 16, stackRowGap: 14, spineX: 20 },
  compact: { nodeW: 116, nodeH: 134, hGap: 14, vGap: 26, rootGap: 24, horizontalDepth: 1, indent: 30, stackTopGap: 14, stackRowGap: 12, spineX: 18 },
  airy: { nodeW: 156, nodeH: 168, hGap: 36, vGap: 64, rootGap: 60, horizontalDepth: 1, indent: 40, stackTopGap: 20, stackRowGap: 18, spineX: 22 },
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

function layoutTopDown(roots, kidsOf, byId, sp) {
  const nodes = [];
  const placed = new Set();
  const hDepth = sp.horizontalDepth || 1;

  function measure(id, depth) {
    placed.add(id);
    const node = { id, person: byId.get(id), depth, w: sp.nodeW, h: sp.nodeH, x: 0, y: 0, kids: [], vertical: false };
    nodes.push(node);
    node.kids = kidsOf(id, placed).map((k) => measure(k, depth + 1));

    if (node.kids.length === 0) {
      node.subW = sp.nodeW;
      node.subH = sp.nodeH;
      return node;
    }
    // Stack a team vertically when every report is an individual (a leaf); spread
    // across a row when reports have their own reports. The very top always spreads.
    const allLeaves = node.kids.every((k) => k.kids.length === 0);
    node.vertical = depth >= hDepth && allLeaves;
    if (node.vertical) {
      // Reports stacked in an indented vertical list below the parent.
      const childrenH = node.kids.reduce((a, k) => a + k.subH, 0) + (node.kids.length - 1) * sp.stackRowGap;
      node.subH = sp.nodeH + sp.stackTopGap + childrenH;
      node.subW = Math.max(sp.nodeW, sp.indent + Math.max(...node.kids.map((k) => k.subW)));
    } else {
      // Reports spread across a horizontal row.
      const n = node.kids.length;
      const totalW = node.kids.reduce((a, k) => a + k.subW, 0) + (n - 1) * sp.hGap;
      node.subW = Math.max(sp.nodeW, totalW);
      node.subH = sp.nodeH + sp.vGap + Math.max(...node.kids.map((k) => k.subH));
    }
    return node;
  }

  function assign(node, x, y) {
    node.y = y;
    if (node.kids.length === 0) {
      node.x = x;
      return;
    }
    if (node.vertical) {
      node.x = x;
      const childX = x + sp.indent;
      let cy = y + sp.nodeH + sp.stackTopGap;
      for (const k of node.kids) {
        assign(k, childX, cy);
        cy += k.subH + sp.stackRowGap;
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

  // Connectors: a horizontal "bus" for spread levels, an indented spine + elbow stubs
  // for stacked levels.
  const links = [];
  for (const parent of nodes) {
    if (!parent.kids.length) continue;
    if (parent.vertical) {
      const spineX = parent.x + sp.spineX;
      const spineTop = parent.y + parent.h;
      for (const k of parent.kids) {
        links.push({ type: "indent", from: parent.id, spineX, spineTop, stubY: k.y + k.h / 2, childLeft: k.x });
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

  const { nodes, links } = layoutTopDown(roots, kidsOf, byId, sp);

  return { nodes, links, ...bounds(nodes, sp), margin: MARGIN, spacing: sp, issues };
}
