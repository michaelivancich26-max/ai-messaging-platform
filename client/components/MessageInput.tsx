"use client";

import { useRef, useState, useCallback } from "react";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

interface Props {
  onSend: (content: string) => void;
  onTyping?: () => void;
  onStopTyping?: () => void;
}

export default function MessageInput({ onSend, onTyping, onStopTyping }: Props) {
  const [value, setValue] = useState("");
  const [imageError, setImageError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);

  const emitTyping = useCallback(() => {
    if (!isTyping.current) { isTyping.current = true; onTyping?.(); }
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => {
      isTyping.current = false;
      onStopTyping?.();
    }, 2000);
  }, [onTyping, onStopTyping]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    isTyping.current = false;
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    onStopTyping?.();
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        isTyping.current = false;
        if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
        onStopTyping?.();
        onSend(trimmed);
        setValue("");
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImageError("");

    if (!file.type.startsWith("image/")) {
      setImageError("Only image files are supported.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Image must be under 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      onSend(JSON.stringify({ type: "image", src, filename: file.name }));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="border-t border-gray-800 bg-gray-950">
      {imageError && (
        <p className="px-4 pt-2 text-xs text-red-400">{imageError}</p>
      )}
      <form onSubmit={submit} className="flex items-end gap-3 px-4 py-4">
        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Photo button */}
        <button
          type="button"
          onClick={() => { setImageError(""); fileRef.current?.click(); }}
          className="shrink-0 rounded-xl p-2.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          title="Send image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-.48-.480a.75.75 0 0 0-1.06 0L6.75 13.09l-1.96-1.96a.75.75 0 0 0-1.06 0L2.5 11.06Zm9.25-7.56a.75.75 0 0 0-.75.75v.008l.008.007A.75.75 0 0 0 11.75 9a.75.75 0 0 0 .742-.635V8.25a.75.75 0 0 0-.742-.75ZM11 5.25a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" clipRule="evenodd" />
          </svg>
        </button>

        <textarea
          value={value}
          onChange={(e) => { setValue(e.target.value); if (e.target.value) emitTyping(); }}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="flex-1 resize-none rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
          style={{ maxHeight: "8rem", overflowY: "auto" }}
        />
        <button
          type="submit"
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40"
          disabled={!value.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
