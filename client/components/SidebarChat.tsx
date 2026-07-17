"use client";

import { useRef, useEffect } from "react";
import type { ChatMessage } from "@/lib/types";
import { Avatar } from "./MessageBubble";

interface Props {
  messages: ChatMessage[];
  currentUsername: string;
  onSend: (content: string) => void;
  onClose: () => void;
  variant?: "side" | "spectator";
  readOnly?: boolean;
}

function SidebarBubble({ msg, isSelf }: { msg: ChatMessage; isSelf: boolean }) {
  const username = msg.user?.username ?? "unknown";
  const avatarUrl = (msg.user as any)?.avatarUrl ?? null;
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex items-end gap-1.5 ${isSelf ? "flex-row-reverse" : "flex-row"}`}>
      {!isSelf && <Avatar username={username} avatarUrl={avatarUrl} size={6} />}
      <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
        <span className="mb-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          {isSelf ? "You" : username} · {time}
        </span>
        <div className={`max-w-[200px] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${
          isSelf ? "rounded-tr-sm bg-orange-700 text-white" : "rounded-tl-sm bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        }`}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

export default function SidebarChat({ messages, currentUsername, onSend, onClose, variant = "side", readOnly = false }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSpectator = variant === "spectator";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const val = (e.target as HTMLInputElement).value.trim();
      if (!val) return;
      onSend(val);
      (e.target as HTMLInputElement).value = "";
    }
  }

  function handleSendClick() {
    const val = inputRef.current?.value.trim();
    if (!val) return;
    onSend(val);
    inputRef.current!.value = "";
  }

  const accentClass = isSpectator ? "bg-brand-green" : "bg-gray-400 dark:bg-gray-500";
  const ringFocus = "focus-within:ring-brand-green";
  const sendBtnClass = "bg-orange-700 hover:bg-orange-600";

  return (
    <div className="flex w-full md:w-72 shrink-0 flex-col border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 dark:border-gray-800 px-3 py-2.5">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${accentClass}`} />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
            {isSpectator ? "Spectator chat" : "Side chat"}
          </span>
          <span className="ml-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {isSpectator ? "· audience only" : "· free from floor rules"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
          title={isSpectator ? "Close spectator chat" : "Close side chat"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-[11px] text-gray-500 dark:text-gray-400 pt-4">
            {isSpectator
              ? "Spectator chat — audience reactions and commentary"
              : "Side chat — say anything while the debate is in progress"}
          </p>
        )}
        {messages.map(msg => (
          <SidebarBubble
            key={msg.id}
            msg={msg}
            isSelf={msg.user?.username === currentUsername}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pb-safe shrink-0 border-t border-gray-200 dark:border-gray-800 px-2 py-2">
        {readOnly ? (
          <p className="px-2 py-1.5 text-[11px] text-gray-500 dark:text-gray-400 text-center">
            Only spectators can write here
          </p>
        ) : (
          <div className={`flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-2.5 py-1.5 ring-1 ring-gray-300 dark:ring-gray-700 ${ringFocus} transition-colors`}>
            <input
              ref={inputRef}
              type="text"
              placeholder={isSpectator ? "Spectator chat…" : "Side chat…"}
              onKeyDown={handleKey}
              className="flex-1 bg-transparent text-base md:text-xs text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none"
            />
            <button
              onClick={handleSendClick}
              className={`shrink-0 rounded-md ${sendBtnClass} px-2 py-0.5 text-[11px] font-semibold text-white transition-colors active:scale-[0.98] motion-reduce:active:scale-100`}
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
