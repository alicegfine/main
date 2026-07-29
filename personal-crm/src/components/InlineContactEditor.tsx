"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface EditorValues {
  name: string;
  email: string;
  company: string;
  role: string;
  linkedinUrl: string;
  howMet: string;
  tags: string;
  notes: string;
  lastContactAt: string; // yyyy-mm-dd or ""
  nextFollowUpAt: string; // yyyy-mm-dd or ""
}

const field =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-700 dark:bg-slate-900";
const label = "block text-xs font-medium text-slate-500 mb-1";

/**
 * Edit-in-place: the contact's fields are always editable right on the detail
 * page. Save appears once anything changes; Cmd/Ctrl+Enter also saves.
 */
export function InlineContactEditor({ id, initial }: { id: string; initial: EditorValues }) {
  const router = useRouter();
  const [values, setValues] = useState<EditorValues>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // After a save + router.refresh, the server sends fresh initial values.
  useEffect(() => {
    setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial)]);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  function set<K extends keyof EditorValues>(key: K, v: EditorValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setSaved(false);
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  }

  return (
    <div onKeyDown={onKeyDown} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={label}>Name</label>
          <input className={field} value={values.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className={label}>Company</label>
          <input className={field} value={values.company} onChange={(e) => set("company", e.target.value)} />
        </div>
        <div>
          <label className={label}>Role</label>
          <input className={field} value={values.role} onChange={(e) => set("role", e.target.value)} />
        </div>
        <div>
          <label className={label}>Email</label>
          <input type="email" className={field} value={values.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className={label}>LinkedIn URL</label>
          <input
            className={field}
            value={values.linkedinUrl}
            onChange={(e) => set("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/in/…"
          />
        </div>
        <div>
          <label className={label}>Tags (comma-separated)</label>
          <input className={field} value={values.tags} onChange={(e) => set("tags", e.target.value)} />
        </div>
        <div>
          <label className={label}>How you met</label>
          <input className={field} value={values.howMet} onChange={(e) => set("howMet", e.target.value)} />
        </div>
        <div>
          <label className={label}>Last contact</label>
          <input
            type="date"
            className={field}
            value={values.lastContactAt}
            onChange={(e) => set("lastContactAt", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Queued for (one-off due date)</label>
          <input
            type="date"
            className={field}
            value={values.nextFollowUpAt}
            onChange={(e) => set("nextFollowUpAt", e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className={label}>Notes</label>
        <textarea
          className={`${field} min-h-28`}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Context, what they care about, what you owe them…"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {dirty && !saving && <span className="text-xs text-slate-400">unsaved changes — ⌘⏎ to save</span>}
        {saved && !dirty && <span className="text-xs text-emerald-600">Saved ✓</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
