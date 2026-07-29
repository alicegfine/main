"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DupeContact } from "@/lib/dedupe";

function Group({ group }: { group: DupeContact[] }) {
  const router = useRouter();
  const [keepId, setKeepId] = useState(group[0].id);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group.map((c) => c.id)),
  );
  const [busy, setBusy] = useState(false);

  const mergeIds = group
    .map((c) => c.id)
    .filter((id) => id !== keepId && selected.has(id));

  async function merge() {
    setBusy(true);
    try {
      await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, mergeIds }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <ul className="space-y-1.5">
        {group.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`keep-${group[0].id}`}
              checked={keepId === c.id}
              onChange={() => {
                setKeepId(c.id);
                setSelected((prev) => new Set(prev).add(c.id));
              }}
              title="Keep this one"
            />
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              disabled={keepId === c.id}
              onChange={(e) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(c.id);
                  else next.delete(c.id);
                  return next;
                })
              }
              title="Include in the merge (uncheck if this is actually a different person)"
            />
            <span className="font-medium">{c.name}</span>
            {c.isCoworker && <span title="coworker">🏢</span>}
            {c.archived && <span className="text-xs text-amber-600">archived</span>}
            <span className="text-xs text-slate-400">
              {c.email ?? "no email"}
              {c.company ? ` · ${c.company}` : ""} · {c.interactions} interaction
              {c.interactions === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={merge}
          disabled={busy || mergeIds.length === 0}
          className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Merging…" : `Merge ${mergeIds.length} into ${group.find((c) => c.id === keepId)?.name}`}
        </button>
        <span className="text-xs text-slate-400">
          ⦿ = keep · uncheck anyone who&apos;s actually a different person
        </span>
      </div>
    </div>
  );
}

export function DuplicatesCard({ groups }: { groups: DupeContact[][] }) {
  const [open, setOpen] = useState(true);
  if (groups.length === 0) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-baseline justify-between text-left"
      >
        <h2 className="text-sm font-semibold">
          🧹 Possible duplicates ({groups.length} group{groups.length === 1 ? "" : "s"})
        </h2>
        <span className="text-xs text-slate-400">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {groups.map((g) => (
            <Group key={g[0].id} group={g} />
          ))}
        </div>
      )}
    </section>
  );
}
