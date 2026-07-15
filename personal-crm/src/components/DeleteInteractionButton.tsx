"use client";

import { useRouter } from "next/navigation";

export function DeleteInteractionButton({ id }: { id: string }) {
  const router = useRouter();
  async function del() {
    await fetch(`/api/interactions/${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <button
      onClick={del}
      title="Delete interaction"
      className="text-xs text-slate-300 hover:text-red-500 dark:text-slate-600"
    >
      ✕
    </button>
  );
}
