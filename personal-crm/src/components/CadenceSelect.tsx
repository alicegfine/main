"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CADENCE_OPTIONS } from "@/lib/cadence";

/** Inline "how often do I want to talk to this person" dropdown. */
export function CadenceSelect({
  contactId,
  cadenceDays,
}: {
  contactId: string;
  cadenceDays: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(cadenceDays === null ? "" : String(cadenceDays));
  const [saving, setSaving] = useState(false);

  const isPreset = value === "" || CADENCE_OPTIONS.some((o) => String(o.days ?? "") === value);

  async function change(next: string) {
    setValue(next);
    setSaving(true);
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadenceDays: next === "" ? null : Number(next) }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => change(e.target.value)}
      title="How often you want to be in touch"
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-accent focus:outline-none dark:border-slate-700 dark:bg-slate-900"
    >
      {CADENCE_OPTIONS.map((o) => (
        <option key={o.label} value={o.days === null ? "" : String(o.days)}>
          {o.label}
        </option>
      ))}
      {!isPreset && <option value={value}>Every {value} days</option>}
    </select>
  );
}
