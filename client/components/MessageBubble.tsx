"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/types";
import type { Annotation } from "@/app/room/[roomId]/page";

interface Props {
  message: ChatMessage;
  isSelf: boolean;
  annotation?: Annotation;
  highlighted?: boolean;
}

function HighlightedContent({ content, annotation }: { content: string; annotation: Annotation }) {
  const [hovered, setHovered] = useState(false);
  const idx = content.toLowerCase().indexOf(annotation.pronoun.toLowerCase());

  if (idx === -1) return <span>{content}</span>;

  const before = content.slice(0, idx);
  const match = content.slice(idx, idx + annotation.pronoun.length);
  const after = content.slice(idx + annotation.pronoun.length);

  return (
    <span>
      {before}
      <span className="relative inline-block">
        <span
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="cursor-help rounded bg-amber-400/30 px-0.5 text-amber-200 underline decoration-dotted decoration-amber-400"
        >
          {match}
        </span>
        {hovered && (
          <span className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-amber-200 shadow-lg ring-1 ring-amber-500/40">
            → {annotation.referent}
          </span>
        )}
      </span>
      {after}
    </span>
  );
}

export default function MessageBubble({ message, isSelf, annotation, highlighted }: Props) {
  const username = message.user?.username ?? "unknown";
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"} ${highlighted ? "animate-pulse" : ""}`}>
      <span className="mb-1 text-xs text-gray-500">
        {isSelf ? "You" : username} · {time}
      </span>
      <div
        className={`max-w-prose rounded-2xl px-4 py-2 text-sm leading-relaxed transition-all duration-300 ${
          highlighted ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-950" : ""
        } ${
          isSelf
            ? "rounded-tr-sm bg-indigo-600 text-white"
            : "rounded-tl-sm bg-gray-800 text-gray-100"
        }`}
      >
        {annotation
          ? <HighlightedContent content={message.content} annotation={annotation} />
          : message.content
        }
      </div>
    </div>
  );
}
