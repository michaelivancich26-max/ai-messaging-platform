"use client";

import { useEffect } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ title, message, confirmLabel = "Confirm", danger = true, onConfirm, onCancel }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onConfirm, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-elevated animate-fadeInUp"
        onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-modal-title" className="mb-2 font-display text-base font-bold text-gray-900 dark:text-white">{title}</h2>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} autoFocus
            className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors active:scale-[0.98] motion-reduce:active:scale-100 ${
              danger ? "bg-red-600 hover:bg-red-500" : "bg-orange-700 hover:bg-orange-600 shadow-glow"
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
