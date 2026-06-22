// Tidy top-down tree layout for org charts.
// Pure geometry: takes a people list, returns node boxes + connector geometry.
// Approach: reserve a horizontal slot per leaf, then center each parent over the
// span of its children. Subtrees never overlap; parents sit centered above them.

import { buildForest } from "./model.js";

export const SPACING = {
  normal: { nodeW: 212, nodeH: 66, hGap: 30, vGap: 58, rootGap: 60 },
  compact: { nodeW: 188, nodeH: 56, hGap: 18, vGap: 40, rootGap: 40 },
  airy: { nodeW: 230, nodeH: 74, hGap: 44, vGap: 78, rootGap: 80 },
};

export const MARGIN = 36;

export function layoutOrg(people, opts = {}) {
  const sp = SPACING[opts.spacing] || SPACING.normal;
  const { roots, childrenOf, byId, issues } = buildForest(people);

  const nodes = [];
  const nodeById = new Map();
  const placed = new Set();
  let cursor = 0;

  const center = (n) => n.x + sp.nodeW / 2;

  function place(id, depth) {
    if (placed.has(id)) return nodeById.get(id);
    placed.add(id);
    const node = {
      id,
      person: byId.get(id),
      depth,
      w: sp.nodeW,
      h: sp.nodeH,
      x: 0,
      y: depth * (sp.nodeH + sp.vGap),
    };
    nodes.push(node);
    nodeById.set(id, node);

    const kids = (childrenOf.get(id) || []).filter((k) => !placed.has(k));
    if (kids.length === 0) {
      node.x = cursor;
      cursor += sp.nodeW + sp.hGap;
    } else {
      const childNodes = kids.map((k) => place(k, depth + 1));
      const first = center(childNodes[0]);
      const last = center(childNodes[childNodes.length - 1]);
      node.x = (first + last) / 2 - sp.nodeW / 2;
    }
    return node;
  }

  for (const r of roots) {
    place(r, 0);
    cursor += sp.rootGap - sp.hGap; // extra breathing room between separate trees
  }

  // Connectors: parent -> each child, routed as orthogonal elbows via a shared bus.
  const links = [];
  for (const parent of nodes) {
    const kids = (childrenOf.get(parent.id) || [])
      .map((k) => nodeById.get(k))
      .filter(Boolean);
    if (kids.length === 0) continue;
    const px = center(parent);
    const pBottom = parent.y + parent.h;
    const busY = pBottom + sp.vGap / 2;
    for (const k of kids) {
      links.push({
        from: parent.id,
        to: k.id,
        px,
        pBottom,
        busY,
        cx: center(k),
        cTop: k.y,
      });
    }
  }

  // Bounds
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
