"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { GavelIcon } from "@/components/GavelsPill";
import QuickBet from "@/components/QuickBet";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = (p: number) => `${Math.round(p * 100)}%`;

interface Market {
  roomName: string;
  matchType: "1v1" | "team";
  labelA: string;
  labelB: string;
  priceA: number;
  priceB: number;
  topic: string;
  volume: number;
  bettors: number;
}
interface Position {
  roomName: string;
  side: "A" | "B";
  label: string;
  shares: number;
  cost: number;
  price: number;
  value: number;
  status: "open" | "settled";
  won: boolean | null;
}

function OddsBar({ a, b }: { a: number; b: number }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-gray-800">
      <div className="bg-emerald-500 transition-all duration-500" style={{ width: pct(a) }} />
      <div className="bg-rose-500 transition-all duration-500" style={{ width: pct(b) }} />
    </div>
  );
}

export default function BetsPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const userId = (session?.user as any)?.id ?? "";

  const [markets, setMarkets] = useState<Market[]>([]);
  const [gavels, setGavels] = useState<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [betMarket, setBetMarket] = useState<Market | null>(null);

  const loadMarkets = useCallback(() => {
    fetch(`${SERVER}/api/markets/live`).then((r) => r.json())
      .then((d) => { setMarkets(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const loadWallet = useCallback(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/wallet?userId=${userId}`).then((r) => r.json())
      .then((d) => { if (typeof d?.gavels === "number") setGavels(d.gavels); setPositions(d?.positions ?? []); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    loadMarkets(); loadWallet();
    const id = setInterval(() => { loadMarkets(); loadWallet(); }, 8000);
    const socket = getSocket();
    const onGavels = (d: { gavels: number }) => setGavels(d.gavels);
    const onOdds = (d: { roomName: string; priceA: number; priceB: number }) =>
      setMarkets((ms) => ms.map((m) => (m.roomName === d.roomName ? { ...m, priceA: d.priceA, priceB: d.priceB } : m)));
    const onSettled = () => { loadMarkets(); loadWallet(); };
    socket.on("gavelsUpdate", onGavels);
    socket.on("oddsUpdate", onOdds);
    socket.on("marketSettled", onSettled);
    return () => { clearInterval(id); socket.off("gavelsUpdate", onGavels); socket.off("oddsUpdate", onOdds); socket.off("marketSettled", onSettled); };
  }, [loadMarkets, loadWallet]);

  if (status === "loading") return <div className="flex h-full items-center justify-center bg-gray-950 text-gray-600 text-sm">Loading…</div>;

  const openPositions = positions.filter((p) => p.status === "open");
  const settledPositions = positions.filter((p) => p.status === "settled");

  return (
    <div className="flex h-full flex-col bg-gray-950 text-white">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-800 px-4 py-3 pt-safe">
        <button onClick={() => router.push("/home")} className="rounded-lg p-1.5 text-gray-500 hover:text-gray-300 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-amber-400"><GavelIcon className="h-5 w-5" /></span>
          <h1 className="text-base font-bold text-white">Betting Grounds</h1>
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-sm font-bold text-amber-300 ring-1 ring-amber-700/40">
          <GavelIcon className="h-4 w-4" />
          {gavels == null ? "…" : money(gavels)} <span className="font-medium text-amber-500/70">Gavels</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-8 max-w-3xl mx-auto w-full">
        {/* Your open positions */}
        {openPositions.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Your open bets</h2>
            <div className="space-y-2">
              {openPositions.map((p, i) => {
                const pnl = p.value - p.cost;
                return (
                  <button key={i} onClick={() => router.push(`/room/${p.roomName}`)}
                    className="flex w-full items-center gap-3 rounded-xl bg-gray-900 ring-1 ring-gray-800 px-4 py-3 text-left hover:ring-gray-700 transition-colors">
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${p.side === "A" ? "bg-emerald-900/40 text-emerald-300" : "bg-rose-900/40 text-rose-300"}`}>{p.label}</span>
                    <span className="text-xs text-gray-500">{p.shares.toFixed(0)} shares</span>
                    <span className="ml-auto text-sm font-semibold text-gray-200">{money(p.value)}</span>
                    <span className={`text-xs font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pnl >= 0 ? "+" : ""}{money(pnl)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Live markets */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            Live markets
          </h2>
          {loading ? (
            <p className="py-16 text-center text-sm text-gray-600">Loading…</p>
          ) : markets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-800 py-16 text-center">
              <p className="text-sm font-medium text-gray-400">No live matches to bet on right now</p>
              <p className="mt-1 text-xs text-gray-600">When players start ranked 1v1 or team debates, their odds open here.</p>
              <button onClick={() => router.push("/compete")} className="mt-4 rounded-xl bg-violet-600 px-5 py-2 text-xs font-semibold text-white hover:bg-violet-500">
                Go to Battle Grounds
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {markets.map((m) => (
                <div key={m.roomName} className="flex flex-col gap-3 rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-violet-950/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-violet-800/50">{m.matchType === "team" ? "Team" : "1v1"}</span>
                  </div>
                  <p className="text-sm font-medium leading-snug text-gray-100 line-clamp-2">&ldquo;{m.topic || "Live debate"}&rdquo;</p>
                  <OddsBar a={m.priceA} b={m.priceB} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-emerald-300">{m.labelA} · {pct(m.priceA)}</span>
                    <span className="font-semibold text-rose-300">{pct(m.priceB)} · {m.labelB}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1 text-amber-400/90"><GavelIcon className="h-3 w-3" /> {money(m.volume)} staked</span>
                    <span>{m.bettors} {m.bettors === 1 ? "bettor" : "bettors"}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setBetMarket(m)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500">
                      <GavelIcon className="h-3.5 w-3.5" /> Bet
                    </button>
                    <button onClick={() => router.push(`/room/${m.roomName}?spectate=1`)}
                      className="shrink-0 rounded-xl bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M4.5 3.5v9l7-4.5-7-4.5Z" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Past bets — settled markets you had a position in */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Past bets</h2>
          {settledPositions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-800 py-10 text-center">
              <p className="text-sm font-medium text-gray-400">No settled bets yet</p>
              <p className="mt-1 text-xs text-gray-600">Once a match you bet on ends, its result shows up here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {settledPositions.map((p, i) => {
                const pnl = p.value - p.cost;
                return (
                  <button key={i} onClick={() => router.push(`/room/${p.roomName}`)}
                    className="flex w-full items-center gap-3 rounded-xl bg-gray-900 ring-1 ring-gray-800 px-4 py-3 text-left hover:ring-gray-700 transition-colors">
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${p.side === "A" ? "bg-emerald-900/40 text-emerald-300" : "bg-rose-900/40 text-rose-300"}`}>{p.label}</span>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.won ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>{p.won ? "Won" : "Lost"}</span>
                    <span className="text-xs text-gray-500">staked {money(p.cost)}</span>
                    <span className="ml-auto text-sm font-semibold text-gray-200">{money(p.value)}</span>
                    <span className={`text-xs font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pnl >= 0 ? "+" : ""}{money(pnl)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {betMarket && (
        <QuickBet roomName={betMarket.roomName} side="A" labelA={betMarket.labelA} labelB={betMarket.labelB} priceA={betMarket.priceA}
          onClose={() => setBetMarket(null)} onPlaced={() => { loadMarkets(); loadWallet(); }} />
      )}
    </div>
  );
}
