import { fuzzyThreshold, levenshtein, normalizeName } from "./match";

export interface DupeContact {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  isCoworker: boolean;
  archived: boolean;
  interactions: number;
}

// (company is display-only; matching uses name/email)

/**
 * Find likely-duplicate groups: same email, same normalized name, close
 * spelling, or a single-token name matching another contact's first name
 * ("Lesley" vs "Lesley Smith"). Groups are merged transitively (union-find)
 * and sorted with the best keeper first (has email, then most interactions).
 */
export function findDuplicateGroups(contacts: DupeContact[]): DupeContact[][] {
  const n = contacts.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const norms = contacts.map((c) => normalizeName(c.name));
  const tokens = norms.map((s) => s.split(" "));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = contacts[i];
      const b = contacts[j];

      if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) {
        union(i, j);
        continue;
      }
      if (!norms[i] || !norms[j]) continue;

      // Same normalized name.
      if (norms[i] === norms[j]) {
        union(i, j);
        continue;
      }
      // Close spelling on the full name.
      if (levenshtein(norms[i], norms[j]) <= fuzzyThreshold(Math.min(norms[i].length, norms[j].length))) {
        union(i, j);
        continue;
      }
      // Single-token name vs another contact's first name ("lesley" / "lesley smith").
      const ti = tokens[i];
      const tj = tokens[j];
      if (ti.length === 1 && ti[0].length >= 3 && tj[0] === ti[0]) union(i, j);
      else if (tj.length === 1 && tj[0].length >= 3 && ti[0] === tj[0]) union(i, j);
    }
  }

  const groups = new Map<number, DupeContact[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const g = groups.get(root) ?? [];
    g.push(contacts[i]);
    groups.set(root, g);
  }

  const score = (c: DupeContact) =>
    (c.email ? 1000 : 0) + c.interactions * 10 + (c.archived ? -500 : 0);

  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => score(b) - score(a)))
    .sort((a, b) => b.length - a.length);
}
