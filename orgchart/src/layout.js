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

function layoutTopDown(roots, kidsOf, byId, sp, stack, rankOf) {
  const nodes = [];
  const placed = new Set();
  const hDepth = sp.horizontalDepth || 1;

  function measure(id, depth) {
    placed.add(id);
    const node = { id, person: byId.get(id), depth, w: sp.nodeW, h: sp.nodeH, x: 0, y: 0, kids: [], coKids: [], vertical: false };
    nodes.push(node);

    // A co-leader is a direct report drawn at the SAME tier as their manager (side by
    // side), not below — but only when they're the same organizational level (matching
    // Category), so the rule stays principled rather than an arbitrary placement.
    const parentCat = (node.person && node.person.category) || "ic";
    const normalIds = [];
    const coIds = [];
    for (const c of kidsOf(id, placed)) {
      const cp = byId.get(c);
      const isCo = cp && cp.coLead && ((cp.category || "ic") === parentCat);
      (isCo ? coIds : normalIds).push(c);
    }
    node.kids = normalIds.map((k) => measure(k, depth + 1));
    node.coKids = coIds.map((k) => measure(k, depth)); // peers: same depth as their manager

    // --- self column: the node plus its normal reports below it ---
    if (node.kids.length === 0) {
      node.selfW = sp.nodeW;
      node.selfH = sp.nodeH;
    } else {
      // Stack a team vertically when every report is an individual (a leaf); spread
      // across a row when reports have their own reports. The very top always spreads.
      // When stacking is off, every level spreads (the classic wide tree).
      const allLeaves = node.kids.every((k) => k.kids.length === 0 && k.coKids.length === 0);
      node.vertical = stack && depth >= hDepth && allLeaves;
      if (node.vertical) {
        // Reports stacked in an indented vertical list below the parent.
        const childrenH = node.kids.reduce((a, k) => a + k.subH, 0) + (node.kids.length - 1) * sp.stackRowGap;
        node.selfH = sp.nodeH + sp.stackTopGap + childrenH;
        node.selfW = Math.max(sp.nodeW, sp.indent + Math.max(...node.kids.map((k) => k.subW)));
      } else {
        // Reports spread across a horizontal row.
        const n = node.kids.length;
        const totalW = node.kids.reduce((a, k) => a + k.subW, 0) + (n - 1) * sp.hGap;
        node.selfW = Math.max(sp.nodeW, totalW);
        node.selfH = sp.nodeH + sp.vGap + Math.max(...node.kids.map((k) => k.subH));
      }
    }

    // --- extend the subtree to the right for any co-leaders on the same tier ---
    if (node.coKids.length) {
      node.subW = node.selfW + node.coKids.reduce((a, k) => a + sp.hGap + k.subW, 0);
      node.subH = Math.max(node.selfH, ...node.coKids.map((k) => k.subH));
    } else {
      node.subW = node.selfW;
      node.subH = node.selfH;
    }
    return node;
  }

  // Place just the node and its normal reports (the "self column"), within [x, x+selfW].
  function assignSelf(node, x, y) {
    node.y = y;
    if (node.kids.length === 0) {
      node.x = x;
    } else if (node.vertical) {
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

  function assign(node, x, y) {
    node.y = y;
    if (!node.coKids.length) {
      assignSelf(node, x, y);
      return;
    }
    // Co-leaders flank the manager on the same tier: earlier-ranked ones sit to the
    // left, later-ranked ones to the right, so the manager ends up in the middle of
    // the leadership row.
    const cos = node.coKids.slice().sort((a, b) => rankOf(a.id) - rankOf(b.id));
    const half = Math.floor(cos.length / 2);
    const members = [];
    for (let i = 0; i < half; i++) members.push({ node: cos[i], w: cos[i].subW });
    members.push({ self: true, w: node.selfW });
    for (let i = half; i < cos.length; i++) members.push({ node: cos[i], w: cos[i].subW });
    let cx = x;
    members.forEach((m, i) => {
      if (m.self) assignSelf(node, cx, y);
      else assign(m.node, cx, y);
      cx += m.w + (i < members.length - 1 ? sp.hGap : 0);
    });
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
  // Co-leader connectors: a horizontal line joining a manager to each same-tier peer,
  // drawn from whichever inner edges face each other (peer may sit left or right).
  for (const parent of nodes) {
    for (const k of parent.coKids || []) {
      const onLeft = k.x < parent.x;
      links.push({
        type: "co",
        from: parent.id,
        to: k.id,
        x1: onLeft ? parent.x : parent.x + parent.w,
        y1: parent.y + parent.h / 2,
        x2: onLeft ? k.x + k.w : k.x,
        y2: k.y + k.h / 2,
      });
    }
  }
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
  // The same rank decides which side of a manager each co-leader lands on.
  const rankOf = opts.order
    ? (id) => (opts.order.has(id) ? opts.order.get(id) : Number.MAX_SAFE_INTEGER)
    : () => 0;
  if (opts.order) {
    const cmp = (a, b) => rankOf(a) - rankOf(b); // stable sort keeps ties in insertion order
    roots.sort(cmp);
    for (const arr of childrenOf.values()) arr.sort(cmp);
  }

  const kidsOf = (id, placed) => (childrenOf.get(id) || []).filter((k) => k !== id && !placed.has(k));

  const { nodes, links } = layoutTopDown(roots, kidsOf, byId, sp, opts.stack !== false, rankOf);

  return { nodes, links, ...bounds(nodes, sp), margin: MARGIN, spacing: sp, issues };
}
