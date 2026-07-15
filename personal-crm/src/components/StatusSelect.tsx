"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUSES, STATUS_LABELS } from "@/lib/status";

export function StatusSelect({
  contactId,
  status,
}: {
  contactId: string;
  status: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    setValue(next);
    setSaving(true);
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
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
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-accent focus:outline-none dark:border-slate-700 dark:bg-slate-900"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
