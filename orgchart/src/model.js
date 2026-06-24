// Org data model: scenarios, people, and the operations the UI performs on them.
// A "scenario" is a self-contained variant of the org (a copy of people), so you
// can draft "what if we hired a Managing Director" without touching the current org.

let _seq = 0;
export function uid(prefix = "p") {
  _seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${_seq.toString(36)}`;
}

export function newPerson(partial = {}) {
  return {
    id: partial.id || uid(),
    name: partial.name || "",
    title: partial.title || "",
    managerId: partial.managerId ?? null,
    proposed: !!partial.proposed,
    isManager: !!partial.isManager,
    note: partial.note || "",
  };
}

export function newScenario(name, people = []) {
  return { id: uid("s"), name: name || "Scenario", people: people.map(newPerson) };
}

export function clonePeople(people) {
  return people.map((p) => ({ ...p }));
}

// Build a parent->children forest from a flat people list.
// Defensive against missing managers and cycles. Returns:
//   { roots:[id], childrenOf:Map(id->[id]), byId:Map, issues:[string] }
export function buildForest(people) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const childrenOf = new Map(people.map((p) => [p.id, []]));
  const issues = [];

  for (const p of people) {
    const m = p.managerId;
    if (m && byId.has(m) && m !== p.id) {
      childrenOf.get(m).push(p.id);
    }
  }

  // Roots = no valid manager.
  const roots = people
    .filter((p) => !(p.managerId && byId.has(p.managerId) && p.managerId !== p.id))
    .map((p) => p.id);

  // Cycle detection: any node not reachable from a root is part of a cycle.
  const reachable = new Set();
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const c of childrenOf.get(id) || []) stack.push(c);
  }
  for (const p of people) {
    if (!reachable.has(p.id)) {
      // break the cycle by promoting this node to a root
      roots.push(p.id);
      reachable.add(p.id);
      const stack2 = [p.id];
      while (stack2.length) {
        const id = stack2.pop();
        for (const c of childrenOf.get(id) || []) {
          if (!reachable.has(c)) { reachable.add(c); stack2.push(c); }
        }
      }
      issues.push(`"${p.name || p.title || p.id}" is part of a reporting loop — shown at the top.`);
    }
  }

  return { roots, childrenOf, byId, issues };
}

// Would setting person.managerId = newMgrId create a cycle? (manager can't be a descendant)
export function wouldCreateCycle(people, personId, newMgrId) {
  if (!newMgrId) return false;
  if (newMgrId === personId) return true;
  const byId = new Map(people.map((p) => [p.id, p]));
  let cur = newMgrId;
  const seen = new Set();
  while (cur) {
    if (cur === personId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = byId.get(cur)?.managerId ?? null;
  }
  return false;
}

// Remove a person; their direct reports are re-pointed to the removed person's manager.
export function removePerson(people, personId) {
  const target = people.find((p) => p.id === personId);
  if (!target) return people;
  const newMgr = target.managerId ?? null;
  return people
    .filter((p) => p.id !== personId)
    .map((p) => (p.managerId === personId ? { ...p, managerId: newMgr } : p));
}

// Counts for the scenario summary line.
export function summarize(people) {
  const total = people.length;
  const proposed = people.filter((p) => p.proposed).length;
  const { roots } = buildForest(people);
  return { total, proposed, current: total - proposed, roots: roots.length };
}

// Diff a scenario against the current org (by id), used for compare badges.
export function diffAgainst(basePeople, people) {
  const baseById = new Map(basePeople.map((p) => [p.id, p]));
  const added = [];
  const moved = [];
  for (const p of people) {
    const b = baseById.get(p.id);
    if (!b) { added.push(p.id); continue; }
    if ((b.managerId ?? null) !== (p.managerId ?? null)) moved.push(p.id);
  }
  const ids = new Set(people.map((p) => p.id));
  const removed = basePeople.filter((p) => !ids.has(p.id)).map((p) => p.id);
  return { added, moved, removed };
}
