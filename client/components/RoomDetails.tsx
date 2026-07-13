"use client";

import { useState } from "react";
import ConfirmModal from "./ConfirmModal";

interface Member {
  userId: string;
  username: string;
}

interface RoomMeta {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  maxMembers: number | null;
  creatorId: string | null;
  aiPersona: string | null;
}

interface Props {
  roomId: string;
  meta: RoomMeta | null;
  onlineMembers: Member[];
  currentUserId: string;
  isOwner: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onKick: (userId: string) => void;
  onMetaUpdate: (meta: RoomMeta) => void;
  onDelete?: () => void;
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export default function RoomDetails({ roomId, meta, onlineMembers, currentUserId, isOwner, isAdmin, onClose, onKick, onMetaUpdate, onDelete }: Props) {
  const canEdit = isOwner || isAdmin;

  const [editDesc, setEditDesc] = useState(meta?.description ?? "");
  const [editMax, setEditMax] = useState(meta?.maxMembers?.toString() ?? "");
  const [editPrivate, setEditPrivate] = useState(meta?.isPrivate ?? false);
  const [editPassword, setEditPassword] = useState("");
  const [editPersona, setEditPersona] = useState(meta?.aiPersona ?? "");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [confirmKick, setConfirmKick] = useState<Member | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync local state when meta changes from socket
  const [lastMetaId, setLastMetaId] = useState<string | null>(null);
  if (meta && meta.id !== lastMetaId) {
    setLastMetaId(meta.id);
    setEditDesc(meta.description ?? "");
    setEditMax(meta.maxMembers?.toString() ?? "");
    setEditPrivate(meta.isPrivate);
    setEditPersona(meta.aiPersona ?? "");
  }

  async function saveChanges() {
    if (!meta) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const body: any = {
        userId: currentUserId,
        description: editDesc,
        maxMembers: editMax ? parseInt(editMax) : null,
        isPrivate: editPrivate,
        aiPersona: editPersona.trim() || null,
      };
      if (editPrivate && editPassword) body.password = editPassword;
      const res = await fetch(`${SERVER}/api/rooms/${meta.name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onMetaUpdate(data);
        setSaveMsg("Saved.");
        setEditPassword("");
      } else {
        setSaveMsg(data.error ?? "Failed to save.");
      }
    } catch {
      setSaveMsg("Could not reach server.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="relative flex h-full w-full md:w-80 flex-col border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 py-3 shrink-0">
          <span className="font-semibold text-gray-900 dark:text-gray-100">Room details</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Room info */}
        <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">Room</p>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">#{meta?.name ?? roomId}</span>
            {meta?.isPrivate && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
                </svg>
                private
              </span>
            )}
          </div>
          {meta?.description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{meta.description}</p>}
          {meta?.maxMembers && <p className="mt-1 text-xs text-gray-500 dark:text-gray-600">Max {meta.maxMembers} members</p>}
        </div>

        {/* Online now */}
        <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
            Online — {onlineMembers.length}
          </p>
          {onlineMembers.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-600">Nobody online</p>
          ) : (
            <ul className="space-y-1">
              {onlineMembers.map((m) => (
                <li key={m.userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300">
                      {m.username[0].toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-800 dark:text-gray-200">{m.username}</span>
                    {m.userId === currentUserId && <span className="text-xs text-gray-500 dark:text-gray-600">(you)</span>}
                  </div>
                  {canEdit && m.userId !== currentUserId && (
                    <button
                      onClick={() => setConfirmKick(m)}
                      className="rounded px-2 py-0.5 text-xs text-gray-500 dark:text-gray-600 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      kick
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Edit settings — owner/admin only */}
        {canEdit && (
          <div className="px-4 py-4 space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Edit room</p>

            {/* Description */}
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="What's this room for?"
                className="w-full resize-none rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-600 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-indigo-500"
              />
            </div>

            {/* Max members */}
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Max members</label>
              <input
                type="number"
                value={editMax}
                onChange={(e) => setEditMax(e.target.value)}
                placeholder="Unlimited"
                min={2}
                max={500}
                className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-600 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-indigo-500"
              />
            </div>

            {/* Private toggle */}
            <div className="flex items-center justify-between rounded-xl bg-gray-100/60 dark:bg-gray-800/60 px-3 py-2.5">
              <div>
                <p className="text-sm text-gray-800 dark:text-gray-200">Private</p>
                <p className="text-xs text-gray-500">Requires password</p>
              </div>
              <button
                type="button"
                onClick={() => setEditPrivate((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors ${editPrivate ? "bg-indigo-600" : "bg-gray-200 dark:bg-gray-700"}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${editPrivate ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>

            {/* New password */}
            {editPrivate && (
              <div>
                <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
                  {meta?.isPrivate ? "Change password" : "Set password"} <span className={meta?.isPrivate ? "text-gray-500 dark:text-gray-600" : "text-red-600 dark:text-red-400"}>
                    {meta?.isPrivate ? "(leave blank to keep current)" : "*"}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-600 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-indigo-500"
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    {showPw ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                        <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                        <path d="M10.748 13.93l2.523 2.523a10.013 10.013 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* AI Moderator Persona */}
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
                AI moderator persona <span className="text-gray-500 dark:text-gray-600">(optional)</span>
              </label>
              <textarea
                value={editPersona}
                onChange={(e) => setEditPersona(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder={"e.g. A strict Victorian professor who corrects errors with dry wit and quotes Shakespeare when disappointed."}
                className="w-full resize-none rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-600 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-indigo-500"
              />
              <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-600">Describe a character. The AI will adopt this voice when flagging issues.</p>
            </div>

            {saveMsg && (
              <p className={`text-xs ${saveMsg === "Saved." ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{saveMsg}</p>
            )}

            <button
              onClick={saveChanges}
              disabled={saving || (editPrivate && !meta?.isPrivate && !editPassword)}
              className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>

            {onDelete && (
              <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Danger zone</p>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full rounded-lg border border-red-900/50 bg-red-100 dark:bg-red-950/30 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
                >
                  Delete room
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmKick && (
        <ConfirmModal
          title={`Kick ${confirmKick.username}?`}
          message={`${confirmKick.username} will be removed from the room immediately.`}
          confirmLabel="Kick"
          onConfirm={() => { onKick(confirmKick.userId); setConfirmKick(null); }}
          onCancel={() => setConfirmKick(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${meta?.name}"?`}
          message="All messages will be permanently deleted and everyone will be removed. This cannot be undone."
          confirmLabel="Delete room"
          onConfirm={() => { setConfirmDelete(false); onDelete?.(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
