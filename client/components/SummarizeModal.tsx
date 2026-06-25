"use client";

import { useState } from "react";

interface Props {
  onConfirm: (since: Date | null) => void;
  onClose: () => void;
}

const PRESETS = [
  { label: "Last 5 minutes",  minutes: 5 },
  { label: "Last 15 minutes", minutes: 15 },
  { label: "Last 30 minutes", minutes: 30 },
  { label: "Last hour",       minutes: 60 },
  { label: "All messages",    minutes: null },
];

export default function SummarizeModal({ onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<number | null | "custom">(null);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours">("minutes");

  function getSince(): Date | null {
    if (selected === null) return null; // all messages
    if (selected === "custom") {
      const n = parseFloat(customValue);
      if (!n || n <= 0) return null;
      const mins = customUnit === "hours" ? n * 60 : n;
      return new Date(Date.now() - mins * 60 * 1000);
    }
    return new Date(Date.now() - (selected as number) * 60 * 1000);
  }

  function isReady() {
    if (selected === "custom") return customValue.trim() !== "" && parseFloat(customValue) > 0;
    return selected !== undefined;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-gray-900 p-5 shadow-2xl ring-1 ring-gray-800">
        <h3 className="mb-1 text-sm font-semibold text-gray-100">Summarize conversation</h3>
        <p className="mb-4 text-xs text-gray-500">Choose a time frame to summarize.</p>

        <div className="space-y-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setSelected(p.minutes)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
                selected === p.minutes
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {p.label}
              {selected === p.minutes && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}

          {/* Custom option */}
          <button
            onClick={() => setSelected("custom")}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
              selected === "custom"
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Custom
            {selected === "custom" && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {selected === "custom" && (
            <div className="flex gap-2 pt-1">
              <input
                type="number"
                min="1"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="e.g. 45"
                className="w-24 rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
                autoFocus
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as "minutes" | "hours")}
                className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-gray-800 py-2 text-sm text-gray-400 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => { if (isReady()) onConfirm(getSince()); }}
            disabled={!isReady()}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Summarize
          </button>
        </div>
      </div>
    </>
  );
}
