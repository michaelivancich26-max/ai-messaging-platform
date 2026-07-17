"use client";

import { useState } from "react";

interface Props {
  suggestion: { question: string; options: string[] };
  onDismiss: () => void;
  onConfirm: (question: string, options: string[]) => void;
}

export default function PollBanner({ suggestion, onDismiss, onConfirm }: Props) {
  const [question, setQuestion] = useState(suggestion.question);
  const [options, setOptions] = useState<string[]>(suggestion.options);
  const [expanded, setExpanded] = useState(false);

  function updateOption(i: number, val: string) {
    setOptions(prev => prev.map((o, idx) => idx === i ? val : o));
  }

  function removeOption(i: number) {
    setOptions(prev => prev.filter((_, idx) => idx !== i));
  }

  function addOption() {
    if (options.length < 4) setOptions(prev => [...prev, ""]);
  }

  const canCreate = question.trim() && options.filter(o => o.trim()).length >= 2;

  return (
    <div className="mx-4 my-2 rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 p-3">
      <div className="flex items-start gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-ink dark:text-brand-green">
          <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.52 2.52 0 0 1 13 4.5Z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-green-ink dark:text-brand-green">AI suggests a poll</p>
          {!expanded && (
            <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200 truncate">{suggestion.question}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setExpanded(v => !v)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            {expanded ? "Collapse" : "Edit"}
          </button>
          <button
            onClick={() => canCreate && onConfirm(question.trim(), options.filter(o => o.trim()))}
            disabled={!canCreate}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold bg-orange-700 text-white shadow-glow hover:bg-orange-600 disabled:opacity-40 disabled:shadow-none transition-colors">
            Create poll
          </button>
          <button onClick={onDismiss} className="ml-1 rounded-lg p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          <input value={question} onChange={e => setQuestion(e.target.value)}
            maxLength={200} placeholder="Poll question"
            className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-brand-green" />
          <div className="space-y-1.5">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={opt} onChange={e => updateOption(i, e.target.value)}
                  maxLength={100} placeholder={`Option ${i + 1}`}
                  className="flex-1 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-brand-green" />
                {options.length > 2 && (
                  <button onClick={() => removeOption(i)}
                    className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 4 && (
            <button onClick={addOption}
              className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-green-ink dark:hover:text-brand-green transition-colors">
              + Add option
            </button>
          )}
        </div>
      )}
    </div>
  );
}
