"use client";

import { useState, useEffect } from "react";
import ConfirmModal from "./ConfirmModal";
import { api } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { ShieldCheck, ShieldOff, VolumeX, Volume2, Timer, Lock } from "@/lib/icons";

interface Member { userId: string; username: string; avatarUrl?: string | null; role?: string; }
interface RoomMeta {
  id: string; name: string; description: string | null; proposition: string | null; isPrivate: boolean;
  maxMembers: number | null; creatorId: string | null; aiPersona: string | null; stances?: string[] | null;
  isOpinionated?: boolean; stanceCooldown?: number; isFishbowl?: boolean; fishbowlSeats?: number | null;
  slowModeSeconds?: number; isLocked?: boolean; moderatorIds?: string[];
}
interface Props {
  open: boolean;
  onClose: () => void;
  tab?: "room" | "settings" | "ai" | "moderation";
  roomId: string;
  meta: RoomMeta | null;
  onlineMembers: Member[];
  currentUserId: string;
  isOwner: boolean;
  isAdmin: boolean;
  onKick: (userId: string) => void;
  onMetaUpdate: (meta: RoomMeta) => void;
  onDelete?: () => void;
  onGrantSeat?: (userId: string) => void;
  onRevokeSeat?: (userId: string) => void;
  // Moderation
  moderatorIds?: string[];
  mutedUserIds?: string[];
  canModerate?: boolean;
  slowModeSeconds?: number;
  isLocked?: boolean;
  onPromoteModerator?: (userId: string) => void;
  onDemoteModerator?: (userId: string) => void;
  onMute?: (userId: string, minutes: number) => void;
  onUnmute?: (userId: string) => void;
  onSetSlowMode?: (seconds: number) => void;
  onSetLock?: (locked: boolean) => void;
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";


export default function RoomPanel({
  open, onClose, tab: initialTab = "room",
  roomId, meta, onlineMembers, currentUserId, isOwner, isAdmin,
  onKick, onMetaUpdate, onDelete, onGrantSeat, onRevokeSeat,
  moderatorIds = [], mutedUserIds = [], canModerate = false,
  slowModeSeconds = 0, isLocked = false,
  onPromoteModerator, onDemoteModerator, onMute, onUnmute, onSetSlowMode, onSetLock,
}: Props) {
  const canEdit = isOwner || isAdmin;
  // `canModerate` is already scoped by the page to moderatable rooms (not DMs or
  // match rooms) and to owner/admin/moderator. Trust it — don't widen it here.
  const canMod = canModerate;                           // may wield moderation powers
  const canAppoint = canMod && (isOwner || isAdmin);    // may appoint/remove moderators (owner/admin only)
  const [tab, setTab] = useState<"room" | "settings" | "ai" | "moderation">(initialTab);
  const [muteTarget, setMuteTarget] = useState<Member | null>(null);

  const [editDesc, setEditDesc] = useState(meta?.description ?? "");
  const [editProposition, setEditProposition] = useState(meta?.proposition ?? "");
  const [editMax, setEditMax] = useState(meta?.maxMembers?.toString() ?? "");
  const [editPrivate, setEditPrivate] = useState(meta?.isPrivate ?? false);
  const [editPassword, setEditPassword] = useState("");
  const [editPersona, setEditPersona] = useState(meta?.aiPersona ?? "");
  const [editStances, setEditStances] = useState<string[]>(meta?.stances ?? []);
  const [editOpinionated, setEditOpinionated] = useState(meta?.isOpinionated ?? false);
  const [editCooldown, setEditCooldown] = useState(meta?.stanceCooldown ?? 0);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [confirmKick, setConfirmKick] = useState<Member | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [lastMetaId, setLastMetaId] = useState<string | null>(null);
  if (meta && meta.id !== lastMetaId) {
    setLastMetaId(meta.id);
    setEditDesc(meta.description ?? "");
    setEditProposition(meta.proposition ?? "");
    setEditMax(meta.maxMembers?.toString() ?? "");
    setEditPrivate(meta.isPrivate);
    setEditPersona(meta.aiPersona ?? "");
    setEditStances(meta.stances ?? []);
    setEditOpinionated(meta.isOpinionated ?? false);
    setEditCooldown(meta.stanceCooldown ?? 0);
  }

  async function saveChanges() {
    if (!meta) return;
    setSaving(true); setSaveMsg("");
    try {
      const body: any = {
        userId: currentUserId, description: editDesc,
        proposition: editProposition.trim() || null,
        maxMembers: editMax ? parseInt(editMax) : null,
        isPrivate: editPrivate, aiPersona: editPersona.trim() || null,
        // Drop blank/whitespace rows so they don't become empty position buttons.
        stances: editStances.map(s => s.trim()).filter(Boolean),
        isOpinionated: editOpinionated,
        stanceCooldown: editCooldown,
      };
      if (editPrivate && editPassword) body.password = editPassword;
      const res = await api(`${SERVER}/api/rooms/${meta.name}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) { onMetaUpdate(data); setSaveMsg("Saved."); setEditPassword(""); }
      else setSaveMsg(data.error ?? "Failed to save.");
    } catch { setSaveMsg("Could not reach server."); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(""), 3000); }
  }

  const trapRef = useFocusTrap<HTMLDivElement>(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tabs = [
    { id: "room" as const, label: "Room" },
    // Moderation controls (slow mode, lock) are open to moderators, not just the owner.
    ...(canMod ? [{ id: "moderation" as const, label: "Moderation" }] : []),
    ...(canEdit ? [{ id: "settings" as const, label: "Settings" }] : []),
    // The AI tab's body is entirely owner/admin-only, so hide the tab for others
    // rather than showing them a blank pane.
    ...(canEdit ? [{ id: "ai" as const, label: "AI" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Room settings"
        className="relative flex h-full w-full md:w-72 flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-elevated"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 py-3 shrink-0">
          <span className="font-display text-sm font-bold text-gray-900 dark:text-gray-100">#{meta?.name ?? roomId}</span>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 shrink-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 border-b-2 py-2 text-xs transition-colors ${
                tab === t.id
                  ? "border-brand-green text-brand-green-ink dark:text-brand-green font-semibold"
                  : "border-transparent font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Room tab ── */}
          {tab === "room" && (
            <div className="px-4 py-3 space-y-4">
              {/* Info */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {meta?.isPrivate && (
                    <span className="flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                        <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
                      </svg>
                      private
                    </span>
                  )}
                  {meta?.maxMembers && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">max {meta.maxMembers}</span>
                  )}
                </div>
                {meta?.proposition && (
                  <div className="mb-2 rounded-xl border border-brand-green/30 bg-brand-green/10 dark:bg-brand-green/15 px-3 py-2">
                    <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-green-ink dark:text-brand-green">Proposition</p>
                    <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed italic">&ldquo;{meta.proposition}&rdquo;</p>
                  </div>
                )}
                {meta?.description && <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{meta.description}</p>}
              </div>

              {/* Online members */}
              {(() => {
                const isFishbowl = meta?.isFishbowl;
                const participants = isFishbowl ? onlineMembers.filter(m => m.role !== "SPECTATOR") : onlineMembers;
                const spectators = isFishbowl ? onlineMembers.filter(m => m.role === "SPECTATOR") : [];
                const MemberRow = ({ m }: { m: Member }) => {
                  const targetIsOwner = m.userId === meta?.creatorId;
                  const targetIsMod = moderatorIds.includes(m.userId);
                  const targetMuted = mutedUserIds.includes(m.userId);
                  // Moderators may act on ordinary members; only the owner/admin may act
                  // on the owner or on a fellow moderator. Mirrors the server's guard.
                  const mayActOnTarget = canMod && m.userId !== currentUserId && !targetIsOwner && (canAppoint || !targetIsMod);
                  return (
                  <li key={m.userId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-green shrink-0" />
                      {m.avatarUrl
                        ? <img src={m.avatarUrl} alt={m.username} className="h-6 w-6 rounded-full object-cover shrink-0" />
                        : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] font-bold text-gray-700 dark:text-gray-300 shrink-0">{m.username[0].toUpperCase()}</span>
                      }
                      <span className="text-xs text-gray-800 dark:text-gray-200 truncate">{m.username}</span>
                      {m.userId === currentUserId && <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">(you)</span>}
                      {targetIsOwner ? (
                        <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">owner</span>
                      ) : targetIsMod ? (
                        <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-brand-green/15 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-brand-green-ink dark:text-brand-green">
                          <ShieldCheck className="h-2.5 w-2.5" /> mod
                        </span>
                      ) : null}
                      {targetMuted && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          <VolumeX className="h-2.5 w-2.5" /> muted
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 ml-2">
                      {isFishbowl && canMod && m.userId !== currentUserId && (
                        m.role === "SPECTATOR" ? (
                          <button onClick={() => onGrantSeat?.(m.userId)} title="Grant seat" aria-label={`Grant seat to ${m.username}`}
                            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-green-ink dark:text-brand-green hover:bg-brand-green/10 transition-colors">
                            grant seat
                          </button>
                        ) : mayActOnTarget ? (
                          <button onClick={() => onRevokeSeat?.(m.userId)} title="Move to spectators" aria-label={`Move ${m.username} to spectators`}
                            className="rounded px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            spectate
                          </button>
                        ) : null
                      )}
                      {canAppoint && m.userId !== currentUserId && !targetIsOwner && (
                        targetIsMod ? (
                          <button onClick={() => onDemoteModerator?.(m.userId)} title="Remove moderator" aria-label={`Remove ${m.username} as moderator`}
                            className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            <ShieldOff className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => onPromoteModerator?.(m.userId)} title="Make moderator" aria-label={`Make ${m.username} a moderator`}
                            className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-brand-green/10 hover:text-brand-green-ink dark:hover:text-brand-green transition-colors">
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </button>
                        )
                      )}
                      {mayActOnTarget && (
                        targetMuted ? (
                          <button onClick={() => onUnmute?.(m.userId)} title="Unmute" aria-label={`Unmute ${m.username}`}
                            className="rounded p-1 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors">
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => setMuteTarget(m)} title="Mute" aria-label={`Mute ${m.username}`}
                            className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                            <VolumeX className="h-3.5 w-3.5" />
                          </button>
                        )
                      )}
                      {mayActOnTarget && (
                        <button onClick={() => setConfirmKick(m)} title="Kick" aria-label={`Kick ${m.username}`}
                          className="rounded px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                          kick
                        </button>
                      )}
                    </div>
                  </li>
                  );
                };
                return (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {isFishbowl ? `Debaters · ${participants.length}${meta?.fishbowlSeats ? `/${meta.fishbowlSeats}` : ""}` : `Online · ${onlineMembers.length}`}
                      </p>
                      {participants.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Nobody online</p>
                      ) : (
                        <ul className="space-y-1">{participants.map(m => <MemberRow key={m.userId} m={m} />)}</ul>
                      )}
                    </div>
                    {isFishbowl && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Spectators · {spectators.length}
                        </p>
                        {spectators.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">No spectators</p>
                        ) : (
                          <ul className="space-y-1">{spectators.map(m => <MemberRow key={m.userId} m={m} />)}</ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Moderation tab ── */}
          {tab === "moderation" && canMod && (
            <div className="px-4 py-3 space-y-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Promote, mute, or kick individual members from the <span className="font-semibold">Room</span> tab. The controls below apply to the whole room.</p>

              {/* Slow mode */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 px-3 py-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <Timer className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">Slow mode</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Minimum time between each member&rsquo;s messages</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[0, 5, 10, 30, 60, 300].map(s => (
                    <button key={s} onClick={() => onSetSlowMode?.(s)} aria-pressed={slowModeSeconds === s}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        slowModeSeconds === s
                          ? "bg-brand-green text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      }`}>
                      {s === 0 ? "Off" : s < 60 ? `${s}s` : `${s / 60}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Room lock */}
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200">Lock room</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Only moderators can post while locked</p>
                  </div>
                </div>
                <button type="button" onClick={() => onSetLock?.(!isLocked)} aria-pressed={isLocked} aria-label="Lock room"
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${isLocked ? "bg-brand-green" : "bg-gray-200 dark:bg-gray-700"}`}>
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isLocked ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
          )}

          {/* ── Settings tab ── */}
          {tab === "settings" && canEdit && (
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Proposition</label>
                <textarea value={editProposition} onChange={e => setEditProposition(e.target.value)}
                  maxLength={300} rows={2} placeholder="The statement being debated…"
                  className="w-full resize-none rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-brand-green" />
              </div>
              {/* Stance editor */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-800 dark:text-gray-200 mb-1">Debate stances</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Define up to 6 positions participants can take. Leave empty for the default FOR / AGAINST.</p>
                <div className="space-y-1.5 mb-2">
                  {editStances.map((s, i) => (
                    <div key={i} className="flex gap-1.5">
                      <input
                        value={s}
                        onChange={e => setEditStances(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                        maxLength={40}
                        className="flex-1 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-brand-green/60"
                        placeholder={`Stance ${i + 1}`}
                      />
                      <button
                        onClick={() => setEditStances(prev => prev.filter((_, j) => j !== i))}
                        className="rounded-lg px-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                {editStances.length < 6 && (
                  <button
                    onClick={() => setEditStances(prev => [...prev, ""])}
                    className="text-xs font-semibold text-orange-700 dark:text-orange-400 hover:text-orange-600 transition-colors"
                  >
                    + Add stance
                  </button>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  maxLength={200} rows={2} placeholder="What's this debate about?"
                  className="w-full resize-none rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-brand-green" />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Max participants</label>
                <input type="number" value={editMax} onChange={e => setEditMax(e.target.value)}
                  placeholder="Unlimited" min={2} max={500}
                  className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-brand-green" />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 px-3 py-2.5">
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-200">Opinionated chat</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Subjective discussion — no Grounds impact</p>
                </div>
                <button type="button" onClick={() => setEditOpinionated(v => !v)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${editOpinionated ? "bg-brand-green" : "bg-gray-200 dark:bg-gray-700"}`}>
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editOpinionated ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 px-3 py-2.5">
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-200">Stance cooldown</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Seconds before a user can switch stances again (0 = off)</p>
                </div>
                <input
                  type="number"
                  value={editCooldown}
                  onChange={e => setEditCooldown(Math.max(0, Math.round(parseFloat(e.target.value) || 0)))}
                  min={0} max={3600}
                  className="w-16 shrink-0 rounded-lg bg-gray-200 dark:bg-gray-700 px-2 py-1 text-sm text-center text-gray-900 dark:text-gray-100 outline-none ring-1 ring-gray-300 dark:ring-gray-600 focus:ring-brand-green"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 px-3 py-2.5">
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-200">Private</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Password required</p>
                </div>
                <button type="button" onClick={() => setEditPrivate(v => !v)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${editPrivate ? "bg-brand-green" : "bg-gray-200 dark:bg-gray-700"}`}>
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editPrivate ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </div>

              {editPrivate && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {meta?.isPrivate ? "Change password" : "Set password"}
                  </label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={editPassword}
                      onChange={e => setEditPassword(e.target.value)} placeholder="New password"
                      className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 pr-9 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-brand-green" />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                      {showPw
                        ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" /><path d="M10.748 13.93l2.523 2.523a10.013 10.013 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" /></svg>
                      }
                    </button>
                  </div>
                </div>
              )}

              {saveMsg && (
                <p className={`text-xs ${saveMsg === "Saved." ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{saveMsg}</p>
              )}

              <button onClick={saveChanges}
                disabled={saving || (editPrivate && !meta?.isPrivate && !editPassword)}
                className="w-full rounded-xl bg-orange-700 py-2.5 text-sm font-semibold text-white shadow-glow hover:bg-orange-600 disabled:opacity-40 transition-colors active:scale-[0.98] motion-reduce:active:scale-100">
                {saving ? "Saving…" : "Save changes"}
              </button>

              {onDelete && (
                <div className="border-t border-gray-200 dark:border-gray-800 pt-3 mt-1">
                  <button onClick={() => setConfirmDelete(true)}
                    className="w-full rounded-xl border border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 py-2.5 text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors">
                    Delete room
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── AI tab ── */}
          {tab === "ai" && (
            <div className="px-4 py-2">
              {canEdit && (
                <>
                  <p className="pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">@Claude Persona</p>
                  <textarea value={editPersona} onChange={e => setEditPersona(e.target.value)}
                    maxLength={500} rows={3}
                    placeholder="e.g. A Victorian professor who quotes Shakespeare when disappointed."
                    className="w-full resize-none rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-brand-green" />
                  <p className="mt-1 mb-3 text-[11px] text-gray-500 dark:text-gray-400">The AI adopts this voice when flagging issues.</p>
                  {saveMsg && (
                    <p className={`mb-2 text-xs ${saveMsg === "Saved." ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{saveMsg}</p>
                  )}
                  <button onClick={saveChanges} disabled={saving}
                    className="w-full rounded-xl bg-orange-700 py-2.5 text-sm font-semibold text-white shadow-glow hover:bg-orange-600 disabled:opacity-40 transition-colors active:scale-[0.98] motion-reduce:active:scale-100">
                    {saving ? "Saving…" : "Save persona"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmKick && (
        <ConfirmModal title={`Kick ${confirmKick.username}?`}
          message={`${confirmKick.username} will be removed immediately.`}
          confirmLabel="Kick"
          onConfirm={() => { onKick(confirmKick.userId); setConfirmKick(null); }}
          onCancel={() => setConfirmKick(null)} />
      )}

      {confirmDelete && (
        <ConfirmModal title={`Delete "${meta?.name}"?`}
          message="All messages will be permanently deleted. This cannot be undone."
          confirmLabel="Delete room"
          onConfirm={() => { setConfirmDelete(false); onDelete?.(); }}
          onCancel={() => setConfirmDelete(false)} />
      )}

      {muteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setMuteTarget(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Mute ${muteTarget.username}`}
            className="relative w-full max-w-xs mx-4 rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 shadow-elevated p-5 animate-fadeIn"
            onClick={e => e.stopPropagation()}>
            <p className="font-display text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">Mute {muteTarget.username}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">They won&rsquo;t be able to send messages until the timeout ends or a moderator unmutes them.</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ label: "5 minutes", m: 5 }, { label: "1 hour", m: 60 }, { label: "24 hours", m: 1440 }, { label: "Until unmuted", m: 0 }].map(opt => (
                <button key={opt.m} onClick={() => { onMute?.(muteTarget.userId, opt.m); setMuteTarget(null); }}
                  className="rounded-xl border border-gray-300 dark:border-gray-700 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-amber-500/10 hover:border-amber-400 transition-colors">
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setMuteTarget(null)} className="mt-3 w-full rounded-xl py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { RoomMeta };
