"use client";

import { useEffect } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ title, message, confirmLabel = "Confirm", danger = true, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onConfirm, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} autoFocus
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white transition-colors ${
              danger ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500"
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
