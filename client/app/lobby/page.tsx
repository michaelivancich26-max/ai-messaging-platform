"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// ─── Trending Strip ──────────────────────────────────────────────────────────
interface TrendingTopic { headline: string; proposition: string; source: string; roomName: string; sourceUrl?: string; }

function TrendingStrip({ onStartDebate }: { onStartDebate: (proposition: string) => void }) {
  const router = useRouter();
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${SERVER}/api/trending`)
      .then(r => r.json())
      .then(d => { setTopics(d.topics ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (!loading && topics.length === 0) return null;

  return (
    <div className="border-b border-gray-800 px-4 md:px-6 py-4 shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-amber-400">
          <path d="M7.557 2.066A1 1 0 0 1 8.75 3v2.316l2.387-.795A1 1 0 0 1 12.369 5.8l-1.134 3.401 2.01 2.009a1 1 0 0 1-.848 1.704l-2.758-.46-.92 2.302a1 1 0 0 1-1.856-.021l-.84-2.521L4.28 13.6a1 1 0 0 1-1.273-1.273l1.366-3.415-1.948-.974A1 1 0 0 1 3 6.25h2.316l-.795-2.387A1 1 0 0 1 5.8 2.631l2.401.803-.644-1.368Z" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Trending Today</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mr-4 md:-mr-6 pr-4 md:pr-6 scrollbar-none">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="shrink-0 w-56 h-28 rounded-xl bg-gray-800/60 animate-pulse" />
          ))
        ) : (
          topics.map((t, i) => (
            <div key={i} className="shrink-0 w-56 flex flex-col justify-between gap-3 rounded-xl border border-amber-900/30 bg-gray-900 p-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {t.sourceUrl ? (
                    <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:text-indigo-400 transition-colors">
                      {t.source}
                      <svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5 opacity-60">
                        <path d="M3.5 1a.5.5 0 0 0 0 1H8.3L1.15 9.15a.5.5 0 0 0 .7.7L9 2.7V7.5a.5.5 0 0 0 1 0v-6a.5.5 0 0 0-.5-.5h-6Z"/>
                      </svg>
                    </a>
                  ) : (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{t.source}</span>
                  )}
                  <span className="rounded-full bg-amber-950/60 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-500">Official</span>
                </div>
                <p className="text-xs leading-relaxed text-gray-200">{t.proposition}</p>
              </div>
              <div className="space-y-1.5">
                <button
                  onClick={() => router.push(`/room/${t.roomName}`)}
                  className="w-full rounded-lg bg-indigo-600 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Join debate →
                </button>
                <button
                  onClick={() => onStartDebate(t.proposition)}
                  className="w-full rounded-lg py-1 text-[10px] font-medium text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Start separate room
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Password Modal ─────────────────────────────────────────────────────────
function PasswordModal({ roomName, onConfirm, onCancel, error }: { roomName: string; onConfirm: (pw: string) => void; onCancel: () => void; error: string }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-indigo-400">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Zm-5 2a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Z" clipRule="evenodd" />
          </svg>
          <h2 className="text-base font-semibold">Private room</h2>
        </div>
        <p className="mb-4 text-sm text-gray-400"><span className="font-medium text-gray-200">#{roomName}</span> requires a password.</p>
        <div className="relative mb-1">
          <input autoFocus type={show ? "text" : "password"} value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && pw) onConfirm(pw); if (e.key === "Escape") onCancel(); }}
            placeholder="Enter password"
            className="w-full rounded-lg bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          <button type="button" onClick={() => setShow(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              {show ? <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /> : <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06L3.28 2.22Z" clipRule="evenodd" />}
            </svg>
          </button>
        </div>
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={() => pw && onConfirm(pw)} disabled={!pw} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">Join</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Room Modal ──────────────────────────────────────────────────────
function CreateRoomModal({ userId, onClose, onCreate, initialProposition }: { userId: string; onClose: () => void; onCreate: (name: string) => void; initialProposition?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [proposition, setProposition] = useState(initialProposition ?? "");
  const [matchedRoom, setMatchedRoom] = useState<{ name: string; proposition: string; _count: { members: number } } | null>(null);
  const [dismissedMatch, setDismissedMatch] = useState(false);

  useEffect(() => { if (initialProposition) { setProposition(initialProposition); setDismissedMatch(false); } }, [initialProposition]);

  useEffect(() => {
    setDismissedMatch(false);
    if (proposition.trim().length < 5) { setMatchedRoom(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${SERVER}/api/rooms/match?proposition=${encodeURIComponent(proposition.trim())}`);
        const d = await r.json();
        setMatchedRoom(d.room ?? null);
      } catch { setMatchedRoom(null); }
    }, 600);
    return () => clearTimeout(t);
  }, [proposition]);

  const [stances, setStances] = useState<string[]>([]);
  const [isOpinionated, setIsOpinionated] = useState(false);
  const [stanceCooldown, setStanceCooldown] = useState(0);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [maxMembers, setMaxMembers] = useState("");
  const [aiPersona, setAiPersona] = useState("");
  const [isFishbowl, setIsFishbowl] = useState(false);
  const [fishbowlSeats, setFishbowlSeats] = useState(4);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true); setError("");
    try {
      const cleanStances = stances.map(s => s.trim()).filter(Boolean);
      const res = await fetch(`${SERVER}/api/rooms`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), proposition: proposition.trim() || undefined,
          stances: cleanStances.length > 0 ? cleanStances : undefined,
          isOpinionated, stanceCooldown: stanceCooldown > 0 ? stanceCooldown : undefined,
          isPrivate, password: isPrivate ? password : undefined,
          maxMembers: maxMembers ? parseInt(maxMembers) : undefined,
          creatorId: userId, aiPersona: aiPersona.trim() || undefined,
          isFishbowl, fishbowlSeats: isFishbowl ? fishbowlSeats : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create debate."); return; }
      onCreate(data.name);
    } catch { setError("Could not reach server."); } finally { setCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-indigo-400">
              <path fillRule="evenodd" d="M10 2a1 1 0 0 1 .894.553l2.991 5.994 6.61.961a1 1 0 0 1 .554 1.706l-4.783 4.664 1.128 6.587a1 1 0 0 1-1.451 1.054L10 20.573l-5.943 3.126a1 1 0 0 1-1.45-1.054l1.128-6.587L-.05 11.214a1 1 0 0 1 .554-1.706l6.61-.961L9.106 2.553A1 1 0 0 1 10 2Z" clipRule="evenodd" />
            </svg>
            <h2 className="text-base font-semibold">Start a Debate</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Proposition <span className="text-gray-600">(optional)</span></label>
            <textarea autoFocus value={proposition} onChange={e => setProposition(e.target.value)} placeholder="e.g. AI will replace most jobs by 2035" maxLength={300} rows={2}
              className="w-full resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
            <p className="mt-1 text-[10px] text-gray-600">The statement being debated. Participants take FOR or AGAINST positions.</p>
            {matchedRoom && !dismissedMatch && (
              <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2.5">
                <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-amber-300">This debate already exists</p>
                  <p className="mt-0.5 text-[11px] text-amber-400/70">
                    <span className="font-mono text-amber-300/80">#{matchedRoom.name}</span>
                    {" · "}{matchedRoom._count.members} member{matchedRoom._count.members !== 1 ? "s" : ""}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => { onClose(); router.push(`/room/${matchedRoom.name}`); }}
                      className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-500 transition-colors">
                      Join existing
                    </button>
                    <button type="button" onClick={() => setDismissedMatch(true)}
                      className="rounded-md px-2.5 py-1 text-[11px] text-amber-400/70 hover:text-amber-300 transition-colors">
                      Continue anyway
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Custom stances */}
          <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-300">Custom stances <span className="text-gray-600">(optional)</span></p>
              {stances.length < 6 && (
                <button type="button" onClick={() => setStances(prev => [...prev, ""])}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">+ Add stance</button>
              )}
            </div>
            {stances.length === 0 && (
              <p className="text-[10px] text-gray-600">Leave empty for the default FOR / AGAINST.</p>
            )}
            {stances.map((s, i) => (
              <div key={i} className="mb-1.5 flex gap-1.5">
                <input value={s} onChange={e => setStances(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                  maxLength={40} placeholder={`Stance ${i + 1}`}
                  className="flex-1 rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-100 outline-none ring-1 ring-gray-700 focus:ring-indigo-500/60" />
                <button type="button" onClick={() => setStances(prev => prev.filter((_, j) => j !== i))}
                  className="rounded-lg px-2 text-gray-600 hover:text-red-400 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Debate name <span className="text-red-400">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. ai-jobs-debate" maxLength={40}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          </div>
          {!isFishbowl && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Max participants <span className="text-gray-600">(optional)</span></label>
              <input type="number" value={maxMembers} onChange={e => setMaxMembers(e.target.value)} placeholder="Unlimited" min={2} max={500}
                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
            </div>
          )}

          {/* Fishbowl toggle */}
          <div className="flex items-center justify-between rounded-xl bg-cyan-950/30 border border-cyan-900/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-200">Fishbowl debate</p>
              <p className="text-xs text-gray-500">Limited debate seats — everyone else watches as a spectator</p>
            </div>
            <button type="button" onClick={() => setIsFishbowl(v => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${isFishbowl ? "bg-cyan-500" : "bg-gray-700"}`}>
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isFishbowl ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
          {isFishbowl && (
            <div className="flex items-center gap-3 rounded-xl bg-gray-800/60 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-200">Debate seats</p>
                <p className="text-xs text-gray-500">How many people can actively participate (2–20)</p>
              </div>
              <input
                type="number"
                value={fishbowlSeats}
                onChange={e => setFishbowlSeats(Math.min(20, Math.max(2, parseInt(e.target.value) || 2)))}
                min={2} max={20}
                className="w-16 rounded-lg bg-gray-700 px-2 py-1.5 text-sm text-center text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-cyan-500"
              />
            </div>
          )}

          {/* Opinionated toggle */}
          <div className="flex items-center justify-between rounded-xl bg-amber-950/30 border border-amber-900/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-200">Opinionated chat</p>
              <p className="text-xs text-gray-500">Subjective discussion — no Veritas score impact</p>
            </div>
            <button type="button" onClick={() => setIsOpinionated(v => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${isOpinionated ? "bg-amber-500" : "bg-gray-700"}`}>
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isOpinionated ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-gray-800/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-200">Stance cooldown <span className="text-gray-600">(seconds)</span></p>
              <p className="text-xs text-gray-500">How long before participants can switch stances (0 = off)</p>
            </div>
            <input
              type="number"
              value={stanceCooldown}
              onChange={e => setStanceCooldown(Math.max(0, Math.round(parseFloat(e.target.value) || 0)))}
              min={0} max={3600}
              className="w-16 rounded-lg bg-gray-700 px-2 py-1.5 text-sm text-center text-gray-100 outline-none ring-1 ring-gray-600 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-gray-800/60 px-4 py-3">
            <div><p className="text-sm font-medium text-gray-200">Private</p><p className="text-xs text-gray-500">Requires a password</p></div>
            <button type="button" onClick={() => { setIsPrivate(v => !v); setPassword(""); }}
              className={`relative h-6 w-11 rounded-full transition-colors ${isPrivate ? "bg-indigo-600" : "bg-gray-700"}`}>
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isPrivate ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
          {isPrivate && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Password <span className="text-red-400">*</span></label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Set a password" maxLength={100}
                  className="w-full rounded-lg bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    {showPw ? <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /> : <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06L3.28 2.22Z" clipRule="evenodd" />}
                  </svg>
                </button>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400 shrink-0">
                <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
              </svg>
              <span className="text-xs font-medium text-gray-300">AI moderator persona <span className="text-gray-600">(optional)</span></span>
            </div>
            <textarea value={aiPersona} onChange={e => setAiPersona(e.target.value)} maxLength={500} rows={2}
              placeholder={"e.g. A rigorous Socratic moderator who demands evidence for every claim."}
              className="w-full resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-amber-500" />
            <p className="mt-1.5 text-[10px] text-gray-600">The AI fact-checker&apos;s personality. It will evaluate claims and award credibility scores.</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" disabled={!name.trim() || (isPrivate && !password) || creating}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
              {creating ? "Starting…" : "Start debate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Debate Board Panel ──────────────────────────────────────────────────────
interface BrowseRoom {
  id: string;
  name: string;
  description: string | null;
  proposition: string | null;
  isPrivate: boolean;
  creatorId: string | null;
  joined: boolean;
  isFishbowl: boolean;
  fishbowlSeats: number | null;
  participantCount: number;
  createdAt: string;
  _count: { messages: number; members: number };
}

type SortKey = "trending" | "active" | "members" | "newest";
type TypeFilter = "all" | "official" | "fishbowl" | "private";

function BrowseRooms({ userId, onJoined, onCreateClick, onMenuClick }: { userId: string; onJoined: () => void; onCreateClick: (proposition?: string) => void; onMenuClick?: () => void }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<BrowseRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("trending");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [authRoom, setAuthRoom] = useState<BrowseRoom | null>(null);
  const [authError, setAuthError] = useState("");
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${SERVER}/api/rooms/browse?userId=${userId}`)
      .then(r => r.json())
      .then(data => { setRooms(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function joinRoom(room: BrowseRoom) {
    if (room.isPrivate) { setAuthRoom(room); setAuthError(""); return; }
    setJoining(room.id);
    await fetch(`${SERVER}/api/rooms/${room.name}/join`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setJoining(null);
    load();
    onJoined();
    router.push(`/room/${room.name}`);
  }

  async function joinPrivate(password: string) {
    if (!authRoom) return;
    const res = await fetch(`${SERVER}/api/rooms/${authRoom.name}/auth`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, userId }),
    });
    const { ok } = await res.json();
    if (ok) {
      sessionStorage.setItem(`room-pw:${authRoom.name}`, password);
      setAuthRoom(null);
      load();
      onJoined();
      router.push(`/room/${authRoom.name}`);
    } else {
      setAuthError("Incorrect password.");
    }
  }

  const filtered = rooms
    .filter(r => {
      const q = search.toLowerCase();
      const textMatch = !q || r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || r.proposition?.toLowerCase().includes(q);
      if (!textMatch) return false;
      if (typeFilter === "official") return r.name.startsWith("tr-");
      if (typeFilter === "fishbowl") return r.isFishbowl;
      if (typeFilter === "private") return r.isPrivate;
      return true;
    })
    .sort((a, b) => {
      if (sort === "trending") {
        const aT = a.name.startsWith("tr-") ? 1 : 0;
        const bT = b.name.startsWith("tr-") ? 1 : 0;
        if (aT !== bT) return bT - aT;
        return b._count.members - a._count.members;
      }
      if (sort === "active") return b._count.messages - a._count.messages;
      if (sort === "members") return b._count.members - a._count.members;
      if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return 0;
    });

  return (
    <div className="flex flex-1 flex-col min-w-0">
      {/* Header */}
      <div className="flex min-h-14 items-center gap-2 border-b border-gray-800 px-3 md:px-6 pt-safe">
        <button className="md:hidden rounded p-1.5 text-gray-400 hover:bg-gray-800" onClick={onMenuClick}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
          </svg>
        </button>
        <h1 className="text-sm font-semibold text-gray-100">Debate Board</h1>
        <div className="ml-auto flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search debates…"
            className="w-32 sm:w-52 rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          <button onClick={() => onCreateClick()}
            className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
            + Start debate
          </button>
        </div>
      </div>

      {/* Filter / sort bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 px-3 md:px-6 py-2 shrink-0">
        {/* Sort pills */}
        <div className="flex items-center gap-1">
          {([ ["trending", "Trending"], ["active", "Active"], ["members", "Members"], ["newest", "Newest"] ] as [SortKey, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setSort(key)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                sort === key ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
              }`}>
              {label}
            </button>
          ))}
        </div>
        {/* Divider */}
        <div className="h-4 w-px bg-gray-800" />
        {/* Type filters */}
        <div className="flex items-center gap-1">
          {([ ["all", "All"], ["official", "Official"], ["fishbowl", "Fishbowl"], ["private", "Private"] ] as [TypeFilter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTypeFilter(key)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                typeFilter === key
                  ? key === "official" ? "bg-amber-600 text-white"
                  : key === "fishbowl" ? "bg-cyan-700 text-white"
                  : key === "private" ? "bg-gray-600 text-white"
                  : "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <TrendingStrip onStartDebate={(p) => onCreateClick(p)} />

      {/* Room list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-600">No rooms found.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(room => {
              const isTrending = room.name.startsWith("tr-");
              return (
              <div key={room.id} className={`flex flex-col gap-3 rounded-2xl border p-4 transition-colors ${
                isTrending
                  ? "border-amber-900/50 bg-amber-950/10 hover:border-amber-700/60"
                  : "border-gray-800 bg-gray-900 hover:border-gray-700"
              }`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 ${isTrending ? "text-amber-400" : room.isFishbowl ? "text-cyan-400" : room.isPrivate ? "text-amber-500" : "text-indigo-500"}`}>
                    {isTrending ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.184a1 1 0 0 1 .633.632l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.632l.551-.184a1 1 0 0 0 0-1.898l-.551-.183a1 1 0 0 1-.633-.633l-.183-.551Z" />
                      </svg>
                    ) : room.isFishbowl ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z" />
                      </svg>
                    ) : room.isPrivate ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Zm-5 2a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M10 2a1 1 0 0 1 .894.553l2.991 5.994 6.61.961a1 1 0 0 1 .554 1.706l-4.783 4.664 1.128 6.587a1 1 0 0 1-1.451 1.054L10 20.573l-5.943 3.126a1 1 0 0 1-1.45-1.054l1.128-6.587L-.05 11.214a1 1 0 0 1 .554-1.706l6.61-.961L9.106 2.553A1 1 0 0 1 10 2Z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    {isTrending ? (
                      <>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-semibold text-gray-100 line-clamp-2 leading-snug">{room.proposition}</p>
                        </div>
                        <span className="mt-1 inline-block rounded-full bg-amber-950/60 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-400">Official · Trending</span>
                      </>
                    ) : (
                      <>
                        <p className="truncate text-sm font-semibold text-gray-100">{room.name}</p>
                        {room.proposition ? (
                          <p className="mt-0.5 text-xs text-indigo-300/80 line-clamp-2 italic">&ldquo;{room.proposition}&rdquo;</p>
                        ) : room.description ? (
                          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{room.description}</p>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-600">
                  {room.isFishbowl && room.fishbowlSeats ? (
                    <span className="text-cyan-500/80">{room.participantCount}/{room.fishbowlSeats} seats</span>
                  ) : (
                    <span>{room._count.members} participant{room._count.members !== 1 ? "s" : ""}</span>
                  )}
                  <span>{room._count.messages} message{room._count.messages !== 1 ? "s" : ""}</span>
                  {room.isFishbowl && <span className="rounded-full bg-cyan-900/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-400">Fishbowl</span>}
                </div>
                <button
                  onClick={() => room.joined ? router.push(`/room/${room.name}`) : joinRoom(room)}
                  disabled={joining === room.id}
                  className={`w-full rounded-xl py-1.5 text-xs font-semibold transition-colors ${
                    room.joined
                      ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      : room.isFishbowl && room.fishbowlSeats && room.participantCount >= room.fishbowlSeats
                      ? "bg-cyan-900/60 text-cyan-300 hover:bg-cyan-900"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                  } disabled:opacity-40`}>
                  {joining === room.id ? "Joining…" : room.joined ? "Enter debate"
                    : room.isFishbowl && room.fishbowlSeats && room.participantCount >= room.fishbowlSeats
                    ? "Watch debate"
                    : room.isPrivate ? "Join (private)" : "Join debate"}
                </button>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {authRoom && (
        <PasswordModal roomName={authRoom.name} error={authError}
          onConfirm={joinPrivate} onCancel={() => { setAuthRoom(null); setAuthError(""); }} />
      )}
    </div>
  );
}

// ─── Main Lobby ─────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();

  const [showCreate, setShowCreate] = useState(false);
  const [pendingProposition, setPendingProposition] = useState("");
  const [sidebarKey, setSidebarKey] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  function openCreate(proposition?: string) {
    setPendingProposition(proposition ?? "");
    setShowCreate(true);
  }

  const userId: string = (session?.user as any)?.id ?? "";

  if (status === "loading") return (
    <main className="flex h-full items-center justify-center bg-gray-950"><span className="text-gray-500">Loading…</span></main>
  );

  return (
    <div className="flex h-full overflow-hidden bg-gray-950 text-gray-100">
      <Sidebar key={sidebarKey} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      <BrowseRooms
        userId={userId}
        onJoined={() => setSidebarKey(k => k + 1)}
        onCreateClick={openCreate}
        onMenuClick={() => setMobileSidebarOpen(true)}
      />

      {showCreate && (
        <CreateRoomModal
          userId={userId}
          initialProposition={pendingProposition}
          onClose={() => { setShowCreate(false); setPendingProposition(""); }}
          onCreate={(name) => { setSidebarKey(k => k + 1); router.push(`/room/${name}`); }}
        />
      )}
    </div>
  );
}
