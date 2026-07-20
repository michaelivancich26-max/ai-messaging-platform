"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Check } from "@/lib/icons";

export interface Channel {
  id: string;
  name: string;
  sectionId: string | null;
  order: number;
  isSubDebate?: boolean;
  isSidebar?: boolean;
  isOpinionated?: boolean;
  proposition?: string | null;
  parentMessagePreview?: string | null;
  parentChannelId?: string | null;
}

export interface Section {
  id: string;
  name: string;
  order: number;
}

interface Props {
  roomName: string;
  activeChannelId: string | null;
  canEdit: boolean;
  userId: string;
  onSelectChannel: (channel: Channel) => void;
  refreshTrigger?: number;
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export default function ChannelList({ roomName, activeChannelId, canEdit, userId, onSelectChannel, refreshTrigger }: Props) {
  const [sections, setSections] = useState<Section[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sidebarChs, setSidebarChs] = useState<Channel[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Inline edit state
  const [addingChannelToSection, setAddingChannelToSection] = useState<string | "root" | null>(null);
  const [newChannelName, setNewChannelName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [renaming, setRenaming] = useState<{ type: "section" | "channel"; id: string; name: string } | null>(null);
  // The rename response was never checked, so when it started 401ing the dialog
  // just closed as though it had worked.
  const [renameError, setRenameError] = useState<string | null>(null);

  async function load() {
    const res = await api(`${SERVER}/api/rooms/${roomName}/channels`);
    if (res.ok) {
      const data = await res.json();
      setSections(data.sections ?? []);
      setChannels(data.channels ?? []);
      setSidebarChs(data.sidebarChannels ?? []);
    }
  }

  useEffect(() => { load(); }, [roomName, refreshTrigger]);

  async function addChannel(sectionId: string | null) {
    const name = newChannelName.trim();
    if (!name) return;
    await api(`${SERVER}/api/rooms/${roomName}/channels`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, name, sectionId }),
    });
    setNewChannelName(""); setAddingChannelToSection(null);
    load();
  }

  async function addSection() {
    const name = newSectionName.trim();
    if (!name) return;
    await api(`${SERVER}/api/rooms/${roomName}/sections`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, name }),
    });
    setNewSectionName(""); setAddingSection(false);
    load();
  }

  async function renameItem() {
    if (!renaming) return;
    const url = renaming.type === "section"
      ? `${SERVER}/api/rooms/${roomName}/sections/${renaming.id}`
      : `${SERVER}/api/rooms/${roomName}/channels/${renaming.id}`;
    // api(), not fetch() — this needs the session token like every other server
    // call. It builds its URL into a variable, which is exactly why the sweep
    // onto api() missed it: that matched `fetch(\`${SERVER}...\`)` inline only.
    const res = await api(url, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renaming.name }),
    });
    if (!res.ok) { setRenameError("Rename failed."); return; }
    setRenaming(null); setRenameError(null); load();
  }

  async function toggleChannelOpinionated(channelId: string, value: boolean) {
    await api(`${SERVER}/api/rooms/${roomName}/channels/${channelId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isOpinionated: value }),
    });
    load();
  }

  async function deleteSection(id: string) {
    await api(`${SERVER}/api/rooms/${roomName}/sections/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    load();
  }

  async function deleteChannel(id: string) {
    await api(`${SERVER}/api/rooms/${roomName}/channels/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    load();
  }

  function toggleSection(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const unsectionedChannels = channels.filter(c => !c.sectionId && !c.isSubDebate && !c.isSidebar);
  const subDebateChannels = channels.filter(c => c.isSubDebate);

  function renderChannel(ch: Channel) {
    const isActive = ch.id === activeChannelId;
    const isRenaming = renaming?.type === "channel" && renaming.id === ch.id;

    return (
      <div key={ch.id} className="group flex items-center">
        {isRenaming ? (
          <input autoFocus value={renaming.name}
            onChange={e => setRenaming({ ...renaming, name: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") renameItem(); if (e.key === "Escape") setRenaming(null); }}
            onBlur={renameItem}
            title={renameError ?? undefined}
            className={`mx-2 flex-1 rounded bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-900 dark:text-gray-100 outline-none ring-1 ${renameError ? "ring-red-500" : "ring-brand-green"}`} />
        ) : (
          <button onClick={() => onSelectChannel(ch)}
            className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors
              ${isActive ? "bg-brand-green/10 dark:bg-brand-green/15 text-brand-green-ink dark:text-brand-green font-semibold" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"}`}>
            <span className={isActive ? "text-brand-green-ink/70 dark:text-brand-green/70" : "text-gray-400 dark:text-gray-500"}>#</span>
            <span className="truncate">{ch.name}</span>
            {ch.isOpinionated && <span className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-500" title="Opinions mode" />}
          </button>
        )}
        {canEdit && !isRenaming && (
          <div className="hidden gap-0.5 pr-1 group-hover:flex">
            <button
              onClick={() => toggleChannelOpinionated(ch.id, !ch.isOpinionated)}
              title={ch.isOpinionated ? "Disable opinions mode" : "Enable opinions mode (no Grounds impact)"}
              className={`rounded p-0.5 transition-colors ${ch.isOpinionated ? "text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300" : "text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400"}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="M1 8.74c0 .983.713 1.825 1.69 1.943L3 10.698V13.5a.5.5 0 0 0 .724.447L8 11.82l4.276 2.127A.5.5 0 0 0 13 13.5v-2.802l.31-.016A2 2 0 0 0 15 8.74V5a3 3 0 0 0-3-3H4a3 3 0 0 0-3 3v3.74Z" clipRule="evenodd" />
              </svg>
            </button>
            <button onClick={() => setRenaming({ type: "channel", id: ch.id, name: ch.name })}
              className="rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z" />
                <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
              </svg>
            </button>
            <button onClick={() => deleteChannel(ch.id)}
              className="rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white dark:bg-gray-900 py-2" style={{ minWidth: 0 }}>

      {/* Unsectioned channels */}
      <div className="mb-1">
        <div className="flex items-center px-2 py-0.5">
          <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Channels</span>
          {canEdit && (
            <button onClick={() => setAddingChannelToSection("root")}
              className="rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-orange-700 dark:hover:text-orange-400" title="Add channel">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
            </button>
          )}
        </div>
        <div className="space-y-0.5 px-1">
          {unsectionedChannels.map(renderChannel)}
          {addingChannelToSection === "root" && (
            <div className="mx-1 flex gap-1">
              <input autoFocus value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addChannel(null); if (e.key === "Escape") { setAddingChannelToSection(null); setNewChannelName(""); } }}
                onBlur={e => { if (!e.relatedTarget && !newChannelName.trim()) { setAddingChannelToSection(null); } }}
                placeholder="channel-name"
                className="min-w-0 flex-1 rounded bg-gray-200 dark:bg-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 outline-none ring-1 ring-brand-green placeholder-gray-500 dark:placeholder-gray-400" />
              <button onMouseDown={e => e.preventDefault()} onClick={() => addChannel(null)} aria-label="Confirm"
                className="shrink-0 rounded bg-orange-700 px-2 py-1 text-xs text-white hover:bg-orange-600"><Check aria-hidden className="inline-block h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      {sections.map(sec => {
        const secChannels = channels.filter(c => c.sectionId === sec.id && !c.isSubDebate);
        const isOpen = !collapsed.has(sec.id);
        const isRenamingSection = renaming?.type === "section" && renaming.id === sec.id;

        return (
          <div key={sec.id} className="mb-1">
            <div className="group flex items-center px-2 py-0.5">
              <button onClick={() => toggleSection(sec.id)} className="mr-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                  className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                  <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06L7.28 11.78a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {isRenamingSection ? (
                <input autoFocus value={renaming.name}
                  onChange={e => setRenaming({ ...renaming, name: e.target.value })}
                  onKeyDown={e => { if (e.key === "Enter") renameItem(); if (e.key === "Escape") setRenaming(null); }}
                  onBlur={renameItem}
                  title={renameError ?? undefined}
                  className={`flex-1 rounded bg-gray-200 dark:bg-gray-700 px-1 py-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100 outline-none ring-1 ${renameError ? "ring-red-500" : "ring-brand-green"}`} />
              ) : (
                <span className="flex-1 truncate text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{sec.name}</span>
              )}

              {canEdit && !isRenamingSection && (
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 md:opacity-0 max-md:opacity-100">
                  <button onClick={() => setAddingChannelToSection(sec.id)}
                    className="rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-orange-700 dark:hover:text-orange-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                    </svg>
                  </button>
                  <button onClick={() => setRenaming({ type: "section", id: sec.id, name: sec.name })}
                    className="rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z" />
                    </svg>
                  </button>
                  <button onClick={() => deleteSection(sec.id)}
                    className="rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {isOpen && (
              <div className="space-y-0.5 px-1">
                {secChannels.map(renderChannel)}
                {addingChannelToSection === sec.id && (
                  <div className="mx-1 flex gap-1">
                    <input autoFocus value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addChannel(sec.id); if (e.key === "Escape") { setAddingChannelToSection(null); setNewChannelName(""); } }}
                      onBlur={e => { if (!e.relatedTarget && !newChannelName.trim()) { setAddingChannelToSection(null); } }}
                      placeholder="channel-name"
                      className="min-w-0 flex-1 rounded bg-gray-200 dark:bg-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 outline-none ring-1 ring-brand-green placeholder-gray-500 dark:placeholder-gray-400" />
                    <button onMouseDown={e => e.preventDefault()} onClick={() => addChannel(sec.id)} aria-label="Confirm"
                      className="shrink-0 rounded bg-orange-700 px-2 py-1 text-xs text-white hover:bg-orange-600"><Check aria-hidden className="inline-block h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Sidebar / side-chat channels */}
      {sidebarChs.length > 0 && (
        <div className="mb-1 mt-2">
          <div className="flex items-center px-2 py-0.5 gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 shrink-0 text-gray-400 dark:text-gray-500">
              <path fillRule="evenodd" d="M2.5 3A1.5 1.5 0 0 0 1 4.5v5A1.5 1.5 0 0 0 2.5 11H5v1.5a.5.5 0 0 0 .82.385l2.235-1.886H13.5A1.5 1.5 0 0 0 15 9.5v-5A1.5 1.5 0 0 0 13.5 3h-11Z" clipRule="evenodd" />
            </svg>
            <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Side chat</span>
          </div>
          <div className="space-y-0.5 px-1">
            {sidebarChs.map(ch => {
              const isActive = ch.id === activeChannelId;
              const parentCh = ch.parentChannelId ? channels.find(c => c.id === ch.parentChannelId) : null;
              return (
                <button
                  key={ch.id}
                  onClick={() => onSelectChannel(ch)}
                  className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                    isActive ? "bg-brand-green/10 dark:bg-brand-green/15 text-brand-green-ink dark:text-brand-green font-semibold" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 shrink-0 ${isActive ? "text-brand-green-ink/70 dark:text-brand-green/70" : "text-gray-400 dark:text-gray-500"}`}>
                    <path fillRule="evenodd" d="M2.5 3A1.5 1.5 0 0 0 1 4.5v5A1.5 1.5 0 0 0 2.5 11H5v1.5a.5.5 0 0 0 .82.385l2.235-1.886H13.5A1.5 1.5 0 0 0 15 9.5v-5A1.5 1.5 0 0 0 13.5 3h-11Z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate">{parentCh ? `#${parentCh.name}` : ch.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-gray-500 dark:text-gray-400">side chat</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-debate channels (Contentions) */}
      {subDebateChannels.length > 0 && (
        <div className="mb-1 mt-2">
          <div className="flex items-center px-2 py-0.5 gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 shrink-0 text-gray-400 dark:text-gray-500">
              <path d="M3 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM11.5 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM3 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM11.5 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
            </svg>
            <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Contentions</span>
          </div>
          <div className="space-y-0.5 px-1">
            {subDebateChannels.map(ch => {
              const isActive = ch.id === activeChannelId;
              return (
                <div key={ch.id} className="group flex items-start">
                  <button
                    onClick={() => onSelectChannel(ch)}
                    className={`flex flex-1 flex-col rounded-md px-2 py-1.5 text-left transition-colors ${
                      isActive ? "bg-brand-green/10 dark:bg-brand-green/15 text-brand-green-ink dark:text-brand-green" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className={`h-2.5 w-2.5 shrink-0 ${isActive ? "text-brand-green-ink dark:text-brand-green" : "text-gray-400 dark:text-gray-500"}`}>
                        <path fillRule="evenodd" d="M3 1a1 1 0 0 0-1 1v2.586l-.293-.293a1 1 0 1 0-1.414 1.414L2 7.414V10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7.414l1.707-1.707a1 1 0 0 0-1.414-1.414L11 4.586V2a1 1 0 0 0-1-1H3Z" clipRule="evenodd" />
                      </svg>
                      <span className="truncate text-[11px] font-medium">{ch.proposition ?? ch.name}</span>
                    </div>
                    {ch.parentMessagePreview && (
                      <p className="mt-0.5 pl-4 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1 italic">↑ "{ch.parentMessagePreview}"</p>
                    )}
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => deleteChannel(ch.id)}
                      className="mt-1.5 hidden rounded p-0.5 text-gray-400 dark:text-gray-700 hover:text-red-600 dark:hover:text-red-400 group-hover:block"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add section */}
      {canEdit && (
        <div className="mt-2 px-2">
          {addingSection ? (
            <input autoFocus value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
              onBlur={() => { if (!newSectionName.trim()) setAddingSection(false); }}
              placeholder="Section name"
              className="w-full rounded bg-gray-200 dark:bg-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 outline-none ring-1 ring-brand-green placeholder-gray-500 dark:placeholder-gray-400" />
          ) : (
            <button onClick={() => setAddingSection(true)}
              className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              Add section
            </button>
          )}
        </div>
      )}
    </div>
  );
}
