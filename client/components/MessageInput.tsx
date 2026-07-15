"use client";

import { useRef, useState, useCallback, useMemo } from "react";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

interface Member {
  id: string;
  username: string;
}

interface Props {
  onSend: (content: string) => void;
  onTyping?: () => void;
  onStopTyping?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  members?: Member[];
}

export default function MessageInput({ onSend, onTyping, onStopTyping, disabled, disabledReason, members = [] }: Props) {
  const [value, setValue] = useState("");
  const [imageError, setImageError] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = closed, string = partial username
  const [mentionIndex, setMentionIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const results: { id: string; username: string; isAI: boolean }[] = [];
    // @Claude always first if query matches
    if ("claude".startsWith(q)) results.push({ id: "claude", username: "Claude", isAI: true });
    // Then room members
    for (const m of members) {
      if (m.username.toLowerCase().startsWith(q) && results.length < 6) {
        results.push({ id: m.id, username: m.username, isAI: false });
      }
    }
    return results;
  }, [mentionQuery, members]);

  function checkMention(text: string, cursorPos: number) {
    const before = text.slice(0, cursorPos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(suggestion: { username: string; isAI: boolean }) {
    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursorPos);
    const after = value.slice(cursorPos);
    const newBefore = before.replace(/@\w*$/, `@${suggestion.username} `);
    const newValue = newBefore + after;
    setValue(newValue);
    setMentionQuery(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = newBefore.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    isTyping.current = false;
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    onStopTyping?.();
    onSend(trimmed);
    setValue("");
    setMentionQuery(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionSuggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        isTyping.current = false;
        if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
        onStopTyping?.();
        onSend(trimmed);
        setValue("");
        setMentionQuery(null);
      }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    if (v) emitTyping();
    checkMention(v, e.target.selectionStart ?? v.length);
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

  if (disabled) {
    return (
      <div className="pb-safe border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-4 py-4">
        <div className="flex items-center gap-3 rounded-xl bg-gray-100/60 dark:bg-gray-800/60 px-4 py-3 ring-1 ring-gray-300/40 dark:ring-gray-700/40">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Zm-5 2a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-gray-500 dark:text-gray-400">{disabledReason ?? "Waiting for your turn…"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-safe border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      {imageError && (
        <p className="px-4 pt-2 text-xs text-red-600 dark:text-red-400">{imageError}</p>
      )}
      <form onSubmit={submit} className="relative flex items-end gap-3 px-4 py-4">
        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* @mention autocomplete dropdown */}
        {mentionQuery !== null && mentionSuggestions.length > 0 && (
          <div className="absolute bottom-full left-16 mb-2 w-56 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 py-1 shadow-xl">
            {mentionSuggestions.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 transition-colors ${i === mentionIndex ? "bg-violet-100 dark:bg-violet-950/60" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              >
                {s.isAI ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">C</span>
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-[11px] font-bold text-gray-700 dark:text-gray-300">
                    {s.username[0]?.toUpperCase()}
                  </span>
                )}
                <span>
                  <span className={`font-medium ${s.isAI ? "text-violet-700 dark:text-violet-300" : "text-gray-800 dark:text-gray-200"}`}>@{s.username}</span>
                  {s.isAI && <span className="ml-1.5 text-xs text-gray-500">· AI assistant</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Photo button */}
        <button
          type="button"
          onClick={() => { setImageError(""); fileRef.current?.click(); }}
          className="shrink-0 rounded-xl p-2.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="Send image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-.48-.480a.75.75 0 0 0-1.06 0L6.75 13.09l-1.96-1.96a.75.75 0 0 0-1.06 0L2.5 11.06Zm9.25-7.56a.75.75 0 0 0-.75.75v.008l.008.007A.75.75 0 0 0 11.75 9a.75.75 0 0 0 .742-.635V8.25a.75.75 0 0 0-.742-.75ZM11 5.25a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" clipRule="evenodd" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Enter to send, @ to mention)"
          rows={1}
          className="flex-1 resize-none rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-base md:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-indigo-500"
          style={{ maxHeight: "8rem", overflowY: "auto" }}
        />
        <button
          type="submit"
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40"
          disabled={!value.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
