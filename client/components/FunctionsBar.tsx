"use client";

import { useState, useRef, useEffect } from "react";

interface FunctionItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
}

interface Props {
  onSummarize: () => void;
  summarizing: boolean;
  onVibeSearch: () => void;
}

export default function FunctionsBar({ onSummarize, summarizing, onVibeSearch }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleShareLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
    setOpen(false);
  }

  const functions: FunctionItem[] = [
    {
      label: "Vibe Search",
      onClick: () => { onVibeSearch(); setOpen(false); },
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      label: "Summarize",
      loading: summarizing,
      onClick: () => { onSummarize(); setOpen(false); },
      icon: summarizing ? (
        <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      label: "Share Link",
      onClick: handleShareLink,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.475l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="relative flex items-center gap-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-4 py-2" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
        </svg>
        Functions
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className={`h-3 w-3 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-4 mb-2 w-48 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-1 shadow-xl">
          {functions.map((fn) => (
            <button
              key={fn.label}
              onClick={fn.onClick}
              disabled={fn.loading}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40 transition-colors"
            >
              <span className="text-gray-500">{fn.icon}</span>
              {fn.label}
            </button>
          ))}
        </div>
      )}
      {copied && (
        <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs text-green-600 dark:text-green-400 ring-1 ring-green-500/30">
          Link copied!
        </span>
      )}
    </div>
  );
}
