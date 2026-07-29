// Name matching used by AI extraction and duplicate detection.
//
// Philosophy: only an exact, multi-token full-name match (or a saved alias)
// counts as confident. Everything else — first-name-only mentions, fuzzy
// spelling matches — is a *candidate* the user confirms once; the confirmed
// mapping is stored as a ContactAlias so it never has to be asked again.

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic Levenshtein edit distance. Inputs are expected pre-normalized. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Edit-distance budget scaled to name length: tight for short names. */
export function fuzzyThreshold(len: number): number {
  if (len <= 5) return 1;
  if (len <= 12) return 2;
  return 3;
}

export interface Matchable {
  id: string;
  name: string;
}

export interface MatchResult<T extends Matchable> {
  /** Confident: exact normalized multi-token full-name match to exactly one contact. */
  exact: T | null;
  /** Plausible but unconfirmed: first-name matches and close-spelling matches. */
  candidates: T[];
}

/**
 * Match a mentioned name against contacts.
 * - Exact multi-token full-name equality with exactly one contact → `exact`.
 * - Otherwise, candidates: contacts whose first name equals the mention
 *   (handles "Lesley" — possibly several Lesleys, never auto-picked), plus
 *   contacts within a small edit distance (handles Granola misspellings).
 */
export function matchName<T extends Matchable>(rawName: string, contacts: T[]): MatchResult<T> {
  const norm = normalizeName(rawName);
  if (!norm) return { exact: null, candidates: [] };
  const tokens = norm.split(" ");

  const exactMatches = contacts.filter((c) => normalizeName(c.name) === norm);
  if (tokens.length >= 2 && exactMatches.length === 1) {
    return { exact: exactMatches[0], candidates: [] };
  }

  const seen = new Set<string>();
  const candidates: T[] = [];
  const add = (c: T) => {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      candidates.push(c);
    }
  };

  // Exact same normalized name but ambiguous (or single-token) — candidates.
  exactMatches.forEach(add);

  for (const c of contacts) {
    const cNorm = normalizeName(c.name);
    if (!cNorm) continue;
    const cTokens = cNorm.split(" ");

    // First-name mention: "lesley" vs "lesley smith" (either direction).
    if (tokens.length === 1 && tokens[0].length >= 3 && cTokens[0] === tokens[0]) add(c);
    if (cTokens.length === 1 && cTokens[0].length >= 3 && cTokens[0] === tokens[0]) add(c);

    // Close spelling on the full name ("Siobhan Riley" vs "Shivon Reilly").
    if (levenshtein(norm, cNorm) <= fuzzyThreshold(Math.min(norm.length, cNorm.length))) add(c);

    // Close spelling on first names when the mention is a single token.
    if (
      tokens.length === 1 &&
      tokens[0].length >= 4 &&
      levenshtein(tokens[0], cTokens[0]) <= 1
    ) {
      add(c);
    }
  }

  return { exact: null, candidates: candidates.slice(0, 4) };
}
