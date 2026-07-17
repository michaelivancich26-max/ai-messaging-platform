"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  messageContent: string;
  onConfirm: (proposition: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function SubDebateModal({ messageContent, onConfirm, onClose, loading }: Props) {
  const [proposition, setProposition] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
  }

  function submit() {
    const p = proposition.trim();
    if (!p || loading) return;
    onConfirm(p);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 shadow-elevated animate-fadeIn"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-orange-700 dark:text-orange-400">
              <path fillRule="evenodd" d="M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 0 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              <path d="M3 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM11.5 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM3 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM11.5 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
            </svg>
            <span className="font-display text-sm font-bold text-gray-900 dark:text-gray-100">Start a sub-debate</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Parent message context */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Branching from</p>
            <div className="rounded-lg border-l-2 border-orange-700/60 bg-gray-100 dark:bg-gray-800/60 px-3 py-2">
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed italic">"{messageContent.slice(0, 200)}{messageContent.length > 200 ? "…" : ""}"</p>
            </div>
          </div>

          {/* Proposition input */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              State the contention
            </label>
            <textarea
              ref={inputRef}
              value={proposition}
              onChange={e => setProposition(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="e.g. The claim that X implies Y is disputed…"
              className="w-full resize-none rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-brand-green transition-colors"
            />
            <p className="mt-1 text-right text-[11px] text-gray-500 dark:text-gray-400">{proposition.length}/300</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!proposition.trim() || loading}
              className="flex-1 rounded-xl bg-orange-700 py-2 text-sm font-semibold text-white shadow-glow hover:bg-orange-600 disabled:opacity-40 disabled:shadow-none transition-colors"
            >
              {loading ? "Creating…" : "Branch debate"}
            </button>
          </div>
          <p className="text-center text-[11px] text-gray-500 dark:text-gray-400">Ctrl+Enter to confirm</p>
        </div>
      </div>
    </div>
  );
}
