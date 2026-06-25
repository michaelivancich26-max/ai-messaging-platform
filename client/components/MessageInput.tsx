"use client";

import { useState } from "react";

interface Props {
  onSend: (content: string) => void;
}

export default function MessageInput({ onSend }: Props) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        onSend(trimmed);
        setValue("");
      }
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-3 border-t border-gray-800 bg-gray-950 px-4 py-4"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
  );
}
