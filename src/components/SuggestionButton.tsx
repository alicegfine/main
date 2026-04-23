"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export default function SuggestionButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(false);
  const [userName, setUserName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sut_name") || localStorage.getItem("unconference_name") || "";
    setUserName(stored);
  }, [open]);

  // Hide the button on the admin suggestions page itself
  if (pathname?.startsWith("/admin")) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.trim(),
        user_name: anon ? null : userName || null,
        is_anonymous: anon,
        page_path: pathname || "",
      }),
    });
    setSubmitting(false);
    setText("");
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setOpen(false);
    }, 1500);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 bg-navy-700 hover:bg-navy-800 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg transition-colors flex items-center gap-2"
        aria-label="Suggest something"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Suggest something
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm p-4">
          <div className="card p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-navy-800">Suggest something</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Feedback, bug reports, ideas &mdash; anything. Feedback is only visible to Alice, but may be shared as appropriate.
            </p>

            {submitted ? (
              <p className="text-sm text-emerald-600 font-medium py-6 text-center">
                Thanks! Sent.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <textarea
                  className="input min-h-[120px]"
                  placeholder="What's on your mind?"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoFocus
                  required
                />
                {!anon && userName && (
                  <p className="text-xs text-slate-500">
                    From <span className="font-medium text-navy-700">{userName}</span>
                  </p>
                )}
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300"
                    checked={anon}
                    onChange={(e) => setAnon(e.target.checked)}
                  />
                  Send anonymously
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="btn-primary flex-1"
                    disabled={submitting || !text.trim()}
                  >
                    {submitting ? "Sending..." : "Send"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
