"use client";

import { useState } from "react";
import ConfirmModal from "./ConfirmModal";

interface Member { userId: string; username: string; avatarUrl?: string | null; }
interface RoomMeta {
  id: string; name: string; description: string | null; proposition: string | null; isPrivate: boolean;
  maxMembers: number | null; creatorId: string | null; aiPersona: string | null; stances?: string[] | null;
  isOpinionated?: boolean; stanceCooldown?: number;
}
interface Settings { factualCorrection: boolean; ambiguityResolution: boolean; }

interface Props {
  open: boolean;
  onClose: () => void;
  tab?: "room" | "settings" | "ai";
  roomId: string;
  meta: RoomMeta | null;
  onlineMembers: Member[];
  currentUserId: string;
  isOwner: boolean;
  isAdmin: boolean;
  onKick: (userId: string) => void;
  onMetaUpdate: (meta: RoomMeta) => void;
  onDelete?: () => void;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean; onChange: (v: boolean) => void; label: string; description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        <p className="text-xs text-gray-500 leading-snug">{description}</p>
      </div>
      <button onClick={() => onChange(!enabled)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-indigo-600" : "bg-gray-700"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

export default function RoomPanel({
  open, onClose, tab: initialTab = "room",
  roomId, meta, onlineMembers, currentUserId, isOwner, isAdmin,
  onKick, onMetaUpdate, onDelete, settings, onSettingsChange,
}: Props) {
  const canEdit = isOwner || isAdmin;
  const [tab, setTab] = useState<"room" | "settings" | "ai">(initialTab);

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
        stances: editStances,
        isOpinionated: editOpinionated,
        stanceCooldown: editCooldown,
      };
      if (editPrivate && editPassword) body.password = editPassword;
      const res = await fetch(`${SERVER}/api/rooms/${meta.name}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) { onMetaUpdate(data); setSaveMsg("Saved."); setEditPassword(""); }
      else setSaveMsg(data.error ?? "Failed to save.");
    } catch { setSaveMsg("Could not reach server."); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(""), 3000); }
  }

  if (!open) return null;

  const tabs = [
    { id: "room" as const, label: "Room" },
    ...(canEdit ? [{ id: "settings" as const, label: "Settings" }] : []),
    { id: "ai" as const, label: "AI" },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="relative flex h-full w-full md:w-72 flex-col bg-gray-950 border-l border-gray-800 shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 shrink-0">
          <span className="text-sm font-semibold text-gray-100">#{meta?.name ?? roomId}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 shrink-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === t.id
                  ? "border-b-2 border-indigo-500 text-indigo-400"
                  : "text-gray-500 hover:text-gray-300"
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
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                        <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
                      </svg>
                      private
                    </span>
                  )}
                  {meta?.maxMembers && (
                    <span className="text-[10px] text-gray-600">max {meta.maxMembers}</span>
                  )}
                </div>
                {meta?.proposition && (
                  <div className="mb-2 rounded-lg bg-indigo-950/50 px-3 py-2 ring-1 ring-indigo-800/40">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 mb-0.5">Proposition</p>
                    <p className="text-xs text-indigo-200 leading-relaxed italic">&ldquo;{meta.proposition}&rdquo;</p>
                  </div>
                )}
                {meta?.description && <p className="text-xs text-gray-400 leading-relaxed">{meta.description}</p>}
              </div>

              {/* Online members */}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                  Online · {onlineMembers.length}
                </p>
                {onlineMembers.length === 0 ? (
                  <p className="text-xs text-gray-600">Nobody online</p>
                ) : (
                  <ul className="space-y-1">
                    {onlineMembers.map(m => (
                      <li key={m.userId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                          {m.avatarUrl
                            ? <img src={m.avatarUrl} alt={m.username} className="h-6 w-6 rounded-full object-cover shrink-0" />
                            : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-gray-300 shrink-0">{m.username[0].toUpperCase()}</span>
                          }
                          <span className="text-xs text-gray-200 truncate">{m.username}</span>
                          {m.userId === currentUserId && <span className="text-[10px] text-gray-600 shrink-0">(you)</span>}
                        </div>
                        {canEdit && m.userId !== currentUserId && (
                          <button onClick={() => setConfirmKick(m)}
                            className="ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                            kick
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ── Settings tab ── */}
          {tab === "settings" && canEdit && (
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="mb-1 block text-[10px] text-gray-500 uppercase tracking-wider">Proposition</label>
                <textarea value={editProposition} onChange={e => setEditProposition(e.target.value)}
                  maxLength={300} rows={2} placeholder="The statement being debated…"
                  className="w-full resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
              </div>
              {/* Stance editor */}
              <div className="pt-2 border-t border-gray-800">
                <p className="text-sm text-gray-200 mb-1">Debate stances</p>
                <p className="text-xs text-gray-500 mb-3">Define up to 6 positions participants can take. Leave empty for the default FOR / AGAINST.</p>
                <div className="space-y-1.5 mb-2">
                  {editStances.map((s, i) => (
                    <div key={i} className="flex gap-1.5">
                      <input
                        value={s}
                        onChange={e => setEditStances(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                        maxLength={40}
                        className="flex-1 rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-100 outline-none ring-1 ring-gray-700 focus:ring-indigo-500/60"
                        placeholder={`Stance ${i + 1}`}
                      />
                      <button
                        onClick={() => setEditStances(prev => prev.filter((_, j) => j !== i))}
                        className="rounded-lg px-2 text-gray-600 hover:text-red-400 transition-colors"
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
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    + Add stance
                  </button>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[10px] text-gray-500 uppercase tracking-wider">Description</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  maxLength={200} rows={2} placeholder="What's this debate about?"
                  className="w-full resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="mb-1 block text-[10px] text-gray-500 uppercase tracking-wider">Max participants</label>
                <input type="number" value={editMax} onChange={e => setEditMax(e.target.value)}
                  placeholder="Unlimited" min={2} max={500}
                  className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-gray-800/60 px-3 py-2">
                <div>
                  <p className="text-sm text-gray-200">Opinionated chat</p>
                  <p className="text-[10px] text-gray-500">Subjective discussion — no Veritas impact</p>
                </div>
                <button type="button" onClick={() => setEditOpinionated(v => !v)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${editOpinionated ? "bg-amber-500" : "bg-gray-700"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editOpinionated ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-gray-800/60 px-3 py-2">
                <div>
                  <p className="text-sm text-gray-200">Stance cooldown</p>
                  <p className="text-[10px] text-gray-500">Seconds before a user can switch stances again (0 = off)</p>
                </div>
                <input
                  type="number"
                  value={editCooldown}
                  onChange={e => setEditCooldown(Math.max(0, Math.round(parseFloat(e.target.value) || 0)))}
                  min={0} max={3600}
                  className="w-16 rounded-lg bg-gray-700 px-2 py-1 text-sm text-center text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-gray-800/60 px-3 py-2">
                <div>
                  <p className="text-sm text-gray-200">Private</p>
                  <p className="text-[10px] text-gray-500">Password required</p>
                </div>
                <button type="button" onClick={() => setEditPrivate(v => !v)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${editPrivate ? "bg-indigo-600" : "bg-gray-700"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editPrivate ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>

              {editPrivate && (
                <div>
                  <label className="mb-1 block text-[10px] text-gray-500 uppercase tracking-wider">
                    {meta?.isPrivate ? "Change password" : "Set password"}
                  </label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={editPassword}
                      onChange={e => setEditPassword(e.target.value)} placeholder="New password"
                      className="w-full rounded-lg bg-gray-800 px-3 py-2 pr-9 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      {showPw
                        ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" /><path d="M10.748 13.93l2.523 2.523a10.013 10.013 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" /></svg>
                      }
                    </button>
                  </div>
                </div>
              )}

              {saveMsg && (
                <p className={`text-xs ${saveMsg === "Saved." ? "text-green-400" : "text-red-400"}`}>{saveMsg}</p>
              )}

              <button onClick={saveChanges}
                disabled={saving || (editPrivate && !meta?.isPrivate && !editPassword)}
                className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
                {saving ? "Saving…" : "Save changes"}
              </button>

              {onDelete && (
                <div className="border-t border-gray-800 pt-3 mt-1">
                  <button onClick={() => setConfirmDelete(true)}
                    className="w-full rounded-lg border border-red-900/50 bg-red-950/20 py-2 text-sm font-semibold text-red-400 hover:bg-red-950/50 transition-colors">
                    Delete room
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── AI tab ── */}
          {tab === "ai" && (
            <div className="px-4 py-2">
              <p className="pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Interjections</p>
              <div className="divide-y divide-gray-800/60">
                <Toggle enabled={settings.factualCorrection}
                  onChange={v => onSettingsChange({ ...settings, factualCorrection: v })}
                  label="Factual correction"
                  description="Flags demonstrably wrong claims with a one-sentence fact." />
                <Toggle enabled={settings.ambiguityResolution}
                  onChange={v => onSettingsChange({ ...settings, ambiguityResolution: v })}
                  label="Ambiguity resolution"
                  description="Highlights pronouns with unclear referents on hover." />
              </div>

              {canEdit && (
                <>
                  <p className="pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Persona</p>
                  <textarea value={editPersona} onChange={e => setEditPersona(e.target.value)}
                    maxLength={500} rows={3}
                    placeholder="e.g. A Victorian professor who quotes Shakespeare when disappointed."
                    className="w-full resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
                  <p className="mt-1 mb-3 text-[10px] text-gray-600">The AI adopts this voice when flagging issues.</p>
                  {saveMsg && (
                    <p className={`mb-2 text-xs ${saveMsg === "Saved." ? "text-green-400" : "text-red-400"}`}>{saveMsg}</p>
                  )}
                  <button onClick={saveChanges} disabled={saving}
                    className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
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
    </div>
  );
}

export type { Settings, RoomMeta };
