"use client";

import { useState } from "react";
import type { ChatMessage, ClaimInfo, CredScore } from "@/lib/types";
import type { Annotation } from "@/app/room/[roomId]/page";
import CredibilityBadge from "./CredibilityBadge";
import ClaimBadge from "./ClaimBadge";

interface Props {
  message: ChatMessage;
  isSelf: boolean;
  annotation?: Annotation;
  highlighted?: boolean;
  claim?: ClaimInfo;
  credScore?: CredScore;
  onStakeClaim?: (messageId: string) => void;
  onChallengeClaim?: (claimId: string) => void;
}

interface ImagePayload {
  type: "image";
  src: string | null;
  filename: string;
  messageId?: string;
}

function parseImageContent(content: string): ImagePayload | null {
  if (!content.startsWith('{"type":"image"')) return null;
  try {
    const p = JSON.parse(content);
    if (p.type === "image" && typeof p.src === "string") return p as ImagePayload;
  } catch {}
  return null;
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

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

function ImageMessage({ payload, isSelf }: { payload: ImagePayload; isSelf: boolean }) {
  const [lightbox, setLightbox] = useState(false);
  const [src, setSrc] = useState<string | null>(payload.src);
  const [loading, setLoading] = useState(false);

  async function loadImage() {
    if (src || loading || !payload.messageId) return;
    setLoading(true);
    try {
      const res = await fetch(`${SERVER}/api/messages/${payload.messageId}/image`);
      const data = await res.json();
      if (data.src) setSrc(data.src);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        className={`overflow-hidden rounded-2xl ${isSelf ? "rounded-tr-sm" : "rounded-tl-sm"} ${src ? "cursor-zoom-in" : "cursor-pointer"}`}
        onClick={() => { if (src) setLightbox(true); else loadImage(); }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={payload.filename} className="max-h-64 max-w-xs object-cover transition-opacity hover:opacity-90" />
        ) : (
          <div className="flex h-24 w-48 items-center justify-center gap-2 rounded-2xl bg-gray-800 text-sm text-gray-400">
            {loading ? (
              <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-gray-500">
                <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-.48-.480a.75.75 0 0 0-1.06 0L6.75 13.09l-1.96-1.96a.75.75 0 0 0-1.06 0L2.5 11.06Zm9.25-7.56a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" clipRule="evenodd" />
              </svg>
            )}
            <span className="text-xs">{loading ? "Loading…" : "Tap to load"}</span>
          </div>
        )}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src ?? ""}
              alt={payload.filename}
              className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
            <a
              href={src ?? ""}
              download={payload.filename}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white hover:bg-black/80"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
              </svg>
              Download
            </a>
            <button
              className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
              onClick={() => setLightbox(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Avatar({ username, avatarUrl, size = 7 }: { username: string; avatarUrl?: string | null; size?: number }) {
  const sz = `h-${size} w-${size}`;
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={username} className={`${sz} rounded-full object-cover shrink-0`} />;
  }
  return (
    <span className={`${sz} flex items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300 shrink-0`}>
      {username[0]?.toUpperCase()}
    </span>
  );
}

export { Avatar };

export default function MessageBubble({ message, isSelf, annotation, highlighted, claim, credScore, onStakeClaim, onChallengeClaim }: Props) {
  const username = message.user?.username ?? "unknown";
  const avatarUrl = (message.user as any)?.avatarUrl ?? null;
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const imagePayload = parseImageContent(message.content);
  const isHuman = message.type === "human";
  const canStake = isHuman && !message.id.startsWith("temp-") && onStakeClaim;

  return (
    <div className={`group flex items-end gap-2 ${isSelf ? "flex-row-reverse" : "flex-row"} ${highlighted ? "animate-pulse" : ""}`}>
      {!isSelf && <Avatar username={username} avatarUrl={avatarUrl} size={7} />}

      <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
        <span className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
          {isSelf ? "You" : username} · {time}
          {credScore && <CredibilityBadge score={credScore} />}
        </span>

        {imagePayload ? (
          <div className={`transition-all duration-300 ${highlighted ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-950 rounded-2xl" : ""}`}>
            <ImageMessage payload={imagePayload} isSelf={isSelf} />
          </div>
        ) : (
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
        )}

        {/* Claim badge or stake button */}
        {isHuman && (
          claim
            ? <ClaimBadge claim={claim} canChallenge={!isSelf} onChallenge={(id) => onChallengeClaim?.(id)} />
            : canStake && (
              <button
                onClick={() => onStakeClaim!(message.id)}
                className="mt-1 flex items-center gap-1 rounded-full border border-gray-700/40 px-2 py-0.5 text-[10px] text-gray-600 opacity-40 hover:opacity-100 hover:border-gray-500 hover:text-gray-300 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path fillRule="evenodd" d="M8 1a.75.75 0 0 1 .697.473l1.203 2.859 3.144.415a.75.75 0 0 1 .415 1.28l-2.275 2.218.537 3.132a.75.75 0 0 1-1.088.79L8 10.56l-2.633 1.607a.75.75 0 0 1-1.088-.79l.537-3.132L2.54 6.027a.75.75 0 0 1 .416-1.28l3.144-.415L7.303 1.473A.75.75 0 0 1 8 1Z" clipRule="evenodd" />
                </svg>
                Stake claim
              </button>
            )
        )}
      </div>
    </div>
  );
}
