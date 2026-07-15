"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteContactButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function del() {
    setDeleting(true);
    await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
    router.push("/contacts");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-sm text-slate-400 hover:text-red-600"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Sure?</span>
      <button onClick={del} disabled={deleting} className="font-medium text-red-600 hover:underline">
        {deleting ? "Deleting…" : "Yes, delete"}
      </button>
      <button onClick={() => setConfirming(false)} className="text-slate-400 hover:text-slate-700">
        No
      </button>
    </span>
  );
}
