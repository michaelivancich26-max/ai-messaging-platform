"use client";

import { useState, useRef } from "react";
import type { ChatMessage, ClaimInfo, CredScore, Reaction } from "@/lib/types";
import { getStancePalette, NEUTRAL_PALETTE } from "@/lib/stances";
import CredibilityBadge from "./CredibilityBadge";
import ClaimBadge from "./ClaimBadge";
import AvatarSprite from "./AvatarSprite";
import { useAvatar } from "@/lib/avatarStore";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "👎", "🤔"];

interface Props {
  message: ChatMessage;
  isSelf: boolean;
  highlighted?: boolean;
  claim?: ClaimInfo;
  credScore?: CredScore;
  senderPosition?: string;
  stances?: string[];
  onStakeClaim?: (messageId: string) => void;
  onChallengeClaim?: (claimId: string) => void;
  onUserClick?: (userId: string, username: string) => void;
  onSubDebate?: (messageId: string, content: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  currentUserId?: string;
  isAdmin?: boolean;
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

function ReactionPills({ reactions, messageId, currentUserId, onReact }: {
  reactions: Reaction[];
  messageId: string;
  currentUserId?: string;
  onReact?: (messageId: string, emoji: string) => void;
}) {
  const grouped: Record<string, { count: number; iMine: boolean }> = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, iMine: false };
    grouped[r.emoji].count++;
    if (r.userId === currentUserId) grouped[r.emoji].iMine = true;
  }
  const entries = Object.entries(grouped);
  if (entries.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([emoji, { count, iMine }]) => (
        <button
          key={emoji}
          onClick={() => onReact?.(messageId, emoji)}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
            iMine
              ? "bg-indigo-900/60 text-indigo-300 ring-1 ring-indigo-500/50 hover:bg-indigo-800/60"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          }`}
        >
          <span>{emoji}</span>
          <span>{count}</span>
        </button>
      ))}
    </div>
  );
}

export default function MessageBubble({ message, isSelf, highlighted, claim, credScore, senderPosition, stances, onStakeClaim, onChallengeClaim, onUserClick, onSubDebate, onReact, onEdit, onDelete, currentUserId, isAdmin }: Props) {
  const username = message.user?.username ?? "unknown";
  const avatarUrl = (message.user as any)?.avatarUrl ?? null;
  const senderApp = useAvatar(message.userId, username);
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const imagePayload = message.type !== "deleted" ? parseImageContent(message.content) : null;
  const isHuman = message.type === "human";
  const isDeleted = message.type === "deleted";
  const isTemp = message.id.startsWith("temp-");
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const stanceList = stances ?? ["FOR", "AGAINST"];
  const posConfig = senderPosition ? getStancePalette(senderPosition, stanceList) : null;
  const selfBubble  = posConfig ? posConfig.self  : "bg-indigo-600 text-white";
  const otherBubble = posConfig ? posConfig.other : "bg-gray-800 text-gray-100";

  const canEdit = isHuman && !isTemp && isSelf && !isDeleted && !!onEdit;
  const canDelete = isHuman && !isTemp && (isSelf || isAdmin) && !isDeleted && !!onDelete;

  function submitEdit() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === message.content) { setEditMode(false); return; }
    onEdit!(message.id, trimmed);
    setEditMode(false);
  }

  // Derive which actions are available for the unified toolbar
  const canStakeThis  = isHuman && !isTemp && !claim && !!onStakeClaim;
  const canChallenge  = isHuman && !isTemp && !!claim && claim.status !== "PENDING" && !isSelf && !!onChallengeClaim;
  const canBranch     = isHuman && !isTemp && !!onSubDebate && !isDeleted;
  const hasActions    = canStakeThis || canChallenge || canBranch || canEdit || canDelete || (!!onReact && !isDeleted);

  const actionBar = hasActions && (
    <>
      {/* ─ Desktop: all buttons inline, appear on hover ─ */}
      <div className="relative hidden md:flex shrink-0 items-center gap-0.5 self-center opacity-0 group-hover:opacity-100 transition-opacity">
        {onReact && !isDeleted && (
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowReactPicker(v => !v)}
              title="React"
              className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-800 hover:text-yellow-400 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7-1a1 1 0 1 0-2 0 1 1 0 0 0 2 0ZM5.5 10a.5.5 0 0 0-.5.5C5 11.4 6.343 12.5 8 12.5s3-1.1 3-2a.5.5 0 0 0-.5-.5h-5Z" />
              </svg>
            </button>
            {showReactPicker && (
              <div className={`absolute z-20 flex gap-0.5 rounded-xl border border-gray-700 bg-gray-900 p-1.5 shadow-xl ${isSelf ? "right-0 bottom-8" : "left-0 bottom-8"}`}>
                {REACTION_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => { onReact(message.id, emoji); setShowReactPicker(false); }}
                    className="rounded-lg p-1.5 text-base leading-none hover:bg-gray-800 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {canStakeThis && (
          <button
            onClick={() => onStakeClaim!(message.id)}
            title="Stake claim"
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-800 hover:text-indigo-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M8 1a.75.75 0 0 1 .697.473l1.203 2.859 3.144.415a.75.75 0 0 1 .415 1.28l-2.275 2.218.537 3.132a.75.75 0 0 1-1.088.79L8 10.56l-2.633 1.607a.75.75 0 0 1-1.088-.79l.537-3.132L2.54 6.027a.75.75 0 0 1 .416-1.28l3.144-.415L7.303 1.473A.75.75 0 0 1 8 1Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        {canChallenge && (
          <button
            onClick={() => onChallengeClaim!(claim!.id)}
            title={`Challenge${claim!.challengeCount > 0 ? ` · ${claim!.challengeCount}` : ""}`}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-800 hover:text-amber-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M3 2a1 1 0 0 0-1 1v10.586l2.293-2.293A1 1 0 0 1 5 11h8a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H3Z" />
            </svg>
          </button>
        )}
        {canBranch && (
          <button
            onClick={() => onSubDebate!(message.id, message.content)}
            title="Branch into sub-debate"
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-800 hover:text-amber-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M8.22 4.595a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L10.44 9H5a.75.75 0 0 1-.75-.75v-2.5a.75.75 0 0 1 1.5 0V7.5h4.44L8.22 5.655a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => { setEditValue(message.content); setEditMode(true); }}
            title="Edit"
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 14a.75.75 0 0 0 0-1.5h-1a.75.75 0 0 0-.75.75v.75h-.75A.75.75 0 0 0 2 14.75V15h-.75A.75.75 0 0 0 .5 15.75v1c0 .414.336.75.75.75H4.5a.25.25 0 0 0 .25-.25V14Z" />
            </svg>
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete"
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-800 hover:text-red-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* ─ Mobile: single ⋯ button → compact popup ─ */}
      <div className="relative md:hidden shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity" ref={moreMenuRef}>
        <button
          onClick={() => setShowMoreMenu(v => !v)}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          title="More options"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM8 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9.5 12.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
          </svg>
        </button>
        {showMoreMenu && (
          <div className={`absolute z-30 w-44 rounded-xl border border-gray-700 bg-gray-900 py-1 shadow-xl ${isSelf ? "right-0 bottom-8" : "left-0 bottom-8"}`}>
            {onReact && !isDeleted && (
              <div className="flex items-center justify-around border-b border-gray-800 px-2 py-1.5">
                {REACTION_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => { onReact(message.id, emoji); setShowMoreMenu(false); }}
                    className="rounded-lg p-1 text-base hover:bg-gray-800 transition-colors"
                  >{emoji}</button>
                ))}
              </div>
            )}
            {canStakeThis && (
              <button
                onClick={() => { onStakeClaim!(message.id); setShowMoreMenu(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-indigo-400">
                  <path fillRule="evenodd" d="M8 1a.75.75 0 0 1 .697.473l1.203 2.859 3.144.415a.75.75 0 0 1 .415 1.28l-2.275 2.218.537 3.132a.75.75 0 0 1-1.088.79L8 10.56l-2.633 1.607a.75.75 0 0 1-1.088-.79l.537-3.132L2.54 6.027a.75.75 0 0 1 .416-1.28l3.144-.415L7.303 1.473A.75.75 0 0 1 8 1Z" clipRule="evenodd" />
                </svg>
                Stake claim
              </button>
            )}
            {canChallenge && (
              <button
                onClick={() => { onChallengeClaim!(claim!.id); setShowMoreMenu(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-amber-400">
                  <path d="M3 2a1 1 0 0 0-1 1v10.586l2.293-2.293A1 1 0 0 1 5 11h8a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H3Z" />
                </svg>
                Challenge
              </button>
            )}
            {canBranch && (
              <button
                onClick={() => { onSubDebate!(message.id, message.content); setShowMoreMenu(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-amber-400">
                  <path fillRule="evenodd" d="M8.22 4.595a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L10.44 9H5a.75.75 0 0 1-.75-.75v-2.5a.75.75 0 0 1 1.5 0V7.5h4.44L8.22 5.655a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
                Branch
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => { setEditValue(message.content); setEditMode(true); setShowMoreMenu(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                  <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 14a.75.75 0 0 0 0-1.5h-1a.75.75 0 0 0-.75.75v.75h-.75A.75.75 0 0 0 2 14.75V15h-.75A.75.75 0 0 0 .5 15.75v1c0 .414.336.75.75.75H4.5a.25.25 0 0 0 .25-.25V14Z" />
                </svg>
                Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => { setShowDeleteConfirm(true); setShowMoreMenu(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-gray-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                  <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                </svg>
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (isDeleted) {
    return (
      <div className={`flex items-end gap-1.5 ${isSelf ? "flex-row-reverse" : "flex-row"}`}>
        {!isSelf && <span className="h-7 w-7 shrink-0" />}
        <span className="rounded-2xl px-4 py-2 text-sm italic text-gray-600 ring-1 ring-gray-800">
          Message deleted
        </span>
      </div>
    );
  }

  return (
    <div className={`group flex flex-col gap-1.5 md:flex-row md:items-end md:gap-2 ${isSelf ? "items-end md:justify-end" : "items-start"} ${highlighted ? "animate-pulse" : ""}`}>
      {/* Avatar — on the side (desktop), under the bubble (mobile) */}
      <button
        onClick={() => message.userId && onUserClick?.(message.userId, username)}
        className={`order-2 shrink-0 transition-opacity ${isSelf ? "md:order-3" : "md:order-1"} ${onUserClick && message.userId ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
        title={onUserClick && message.userId ? `View ${username}'s profile` : undefined}
      >
        <AvatarSprite appearance={senderApp} size={46} dir={isSelf ? "left" : "right"} />
      </button>

      {/* Action toolbar */}
      {hasActions && <div className={`order-3 self-center ${isSelf ? "md:order-1" : "md:order-3"}`}>{actionBar}</div>}

      <div className={`order-1 md:order-2 flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
        <span className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
          {isSelf ? "You" : username} · {time}
          {message.editedAt && <span className="text-[10px] text-gray-600 italic">edited</span>}
          {posConfig && senderPosition !== "NEUTRAL" && (
            <span className={`rounded-full px-1.5 py-0 text-[9px] font-bold ${posConfig.tag}`}>{senderPosition}</span>
          )}
          {credScore && <CredibilityBadge score={credScore} />}
        </span>

        {editMode ? (
          <div className="flex flex-col gap-2 w-full max-w-prose">
            <textarea
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                if (e.key === "Escape") { setEditMode(false); }
              }}
              rows={2}
              autoFocus
              className="rounded-xl bg-gray-800 px-4 py-2 text-sm text-gray-100 outline-none ring-1 ring-indigo-500 resize-none"
              style={{ maxHeight: "8rem", overflowY: "auto" }}
            />
            <div className="flex gap-2 text-xs">
              <button onClick={submitEdit} className="rounded-lg bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500">Save</button>
              <button onClick={() => setEditMode(false)} className="rounded-lg bg-gray-800 px-3 py-1 text-gray-400 hover:bg-gray-700">Cancel</button>
              <span className="text-gray-600 self-center">Esc to cancel · Enter to save</span>
            </div>
          </div>
        ) : imagePayload ? (
          <div className={`relative transition-all duration-300 ${highlighted ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-950 rounded-2xl" : ""}`}>
            <ImageMessage payload={imagePayload} isSelf={isSelf} />
          </div>
        ) : (
          <div className="relative">
            {/* speech-bubble tail pointing toward the avatar */}
            <span
              className={`pointer-events-none absolute bottom-1.5 hidden h-3 w-3 rotate-45 md:block ${isSelf ? `-right-1 ${selfBubble}` : `-left-1 ${otherBubble}`}`}
              aria-hidden
            />
            <div
              className={`relative max-w-prose rounded-2xl px-4 py-2 text-sm leading-relaxed transition-all duration-300 ${
                highlighted ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-950" : ""
              } ${isSelf ? `rounded-br-sm ${selfBubble}` : `rounded-bl-sm ${otherBubble}`}`}
            >
              {message.content}
            </div>
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <ReactionPills
            reactions={message.reactions}
            messageId={message.id}
            currentUserId={currentUserId}
            onReact={onReact}
          />
        )}

        {/* Claim status badge — purely informational */}
        {isHuman && claim && (
          <ClaimBadge claim={claim} canChallenge={false} onChallenge={() => {}} />
        )}
      </div>

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowDeleteConfirm(false)}>
          <div className="rounded-2xl bg-gray-900 p-6 shadow-xl ring-1 ring-gray-700 w-72" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-200 mb-4">Delete this message? This can&apos;t be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => { onDelete!(message.id); setShowDeleteConfirm(false); }}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg bg-gray-800 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
