"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { parseAIContent } from "@/lib/types";

const BoltIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
  </svg>
);

const SparkleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684Z" />
  </svg>
);

const ChevronIcon = ({ rotated }: { rotated: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
    className={`h-4 w-4 text-gray-500 transition-transform ${rotated ? "rotate-180" : ""}`}>
    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
  </svg>
);

interface StreamingProps {
  text: string;
  sarcasm: boolean;
  isMention?: boolean;
}

export function AIStreamingCard({ text, sarcasm, isMention }: StreamingProps) {
  if (isMention) {
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-lg rounded-2xl border border-violet-500/30 bg-violet-950/40 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-violet-400"><SparkleIcon /></span>
            <span className="font-semibold text-violet-300">@Claude</span>
          </div>
          <p className="mt-2 leading-relaxed text-gray-200 whitespace-pre-wrap">
            {text}
            <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-violet-400 align-middle" />
          </p>
        </div>
      </div>
    );
  }

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

interface Props {
  message: ChatMessage;
}

export default function AIInterjectionCard({ message }: Props) {
  const payload = parseAIContent(message.content);
  const isMention = payload.type === "mention_response";
  const isSarcasm = payload.type === "factual" && payload.sarcasm === true;
  const [expanded, setExpanded] = useState(true);
  const [headerOnly, setHeaderOnly] = useState(false);

  const text = (payload.type === "factual" || payload.type === "mention_response") ? payload.text : "";
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  function toggle() {
    if (headerOnly) {
      setHeaderOnly(false);
    } else {
      setExpanded((v) => !v);
    }
  }

  if (isMention) {
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-lg rounded-2xl border border-violet-500/30 bg-violet-950/40 px-4 py-3 text-sm">
          <button onClick={toggle} className="flex w-full items-center gap-2 text-left">
            <span className="text-violet-400"><SparkleIcon /></span>
            <span className="font-semibold text-violet-300">@Claude</span>
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
