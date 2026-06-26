"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { parseAIContent } from "@/lib/types";

const BoltIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
  </svg>
);

const ChevronIcon = ({ rotated }: { rotated: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
    className={`h-4 w-4 text-gray-500 transition-transform ${rotated ? "rotate-180" : ""}`}>
    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
  </svg>
);

// Streaming version — same card shell, text types in live
interface StreamingProps {
  text: string;
  sarcasm: boolean;
}

export function AIStreamingCard({ text, sarcasm }: StreamingProps) {
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-amber-400"><BoltIcon /></span>
          <span className="font-semibold text-amber-300">AI Note</span>
          {sarcasm && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">sarcasm detected</span>
          )}
        </div>
        <p className="mt-2 leading-relaxed text-gray-200 whitespace-pre-wrap">
          {text}
          <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-amber-400 align-middle" />
        </p>
      </div>
    </div>
  );
}

// Final settled card
interface Props {
  message: ChatMessage;
}

export default function AIInterjectionCard({ message }: Props) {
  const payload = parseAIContent(message.content);
  const isSarcasm = payload.type === "factual" && payload.sarcasm === true;
  const [expanded, setExpanded] = useState(true); // start expanded since user just watched it type
  const [headerOnly, setHeaderOnly] = useState(false);

  const text = payload.type === "factual" ? payload.text : "";
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  function toggle() {
    if (headerOnly) {
      setHeaderOnly(false);
    } else {
      setExpanded((v) => !v);
    }
  }

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm">
        <button onClick={toggle} className="flex w-full items-center gap-2 text-left">
          <span className="text-amber-400"><BoltIcon /></span>
          <span className="font-semibold text-amber-300">AI Note</span>
          {isSarcasm && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">sarcasm detected</span>
          )}
          <span className="ml-auto text-xs text-gray-500">{time}</span>
          <ChevronIcon rotated={!headerOnly && expanded} />
        </button>

        {!headerOnly && expanded && (
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-gray-200">{text}</p>
        )}
      </div>
    </div>
  );
}
