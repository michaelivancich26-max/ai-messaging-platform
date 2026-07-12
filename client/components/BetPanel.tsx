"use client";

import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Market {
  roomName: string;
  matchType: "1v1" | "team";
  labelA: string;
  labelB: string;
  priceA: number;
  priceB: number;
  status: "open" | "settled";
  winningSide: "A" | "B" | null;
  topic: string;
  isParticipant: boolean;
}
interface Position { side: "A" | "B"; shares: number; cost: number }

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = (p: number) => `${Math.round(p * 100)}%`;

// Live prediction market for a competitive match. Spectators buy shares of a
// side at its current probability (price); a winning share pays 1 Gavel. Odds
// are the sharpened proposition bar, updated each full exchange.
export default function BetPanel({ roomName, userId }: { roomName: string; userId: string }) {
  const [market, setMarket] = useState<Market | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [gavels, setGavels] = useState<number | null>(null);
  const [side, setSide] = useState<"A" | "B">("A");
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [mRes, wRes] = await Promise.all([
        fetch(`${SERVER}/api/markets/${roomName}?userId=${userId}`).then((r) => r.json()),
        fetch(`${SERVER}/api/wallet?userId=${userId}`).then((r) => r.json()),
      ]);
      if (mRes?.market) setMarket(mRes.market);
      setPositions(mRes?.positions ?? []);
      if (typeof wRes?.gavels === "number") setGavels(wRes.gavels);
    } catch { /* offline */ }
  }, [roomName, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const socket = getSocket();
    const onOdds = (d: { roomName: string; priceA: number; priceB: number }) => {
      if (d.roomName !== roomName) return;
      setMarket((m) => (m ? { ...m, priceA: d.priceA, priceB: d.priceB } : m));
    };
    const onSettled = (d: { roomName: string; winningSide: "A" | "B" | null; priceA: number }) => {
      if (d.roomName !== roomName) return;
      setMarket((m) => (m ? { ...m, status: "settled", winningSide: d.winningSide, priceA: d.priceA, priceB: 1 - d.priceA } : m));
      setTimeout(refresh, 400);
    };
    const onGavels = (d: { gavels: number }) => setGavels(d.gavels);
    socket.on("oddsUpdate", onOdds);
    socket.on("marketSettled", onSettled);
    socket.on("gavelsUpdate", onGavels);
    return () => { socket.off("oddsUpdate", onOdds); socket.off("marketSettled", onSettled); socket.off("gavelsUpdate", onGavels); };
  }, [roomName, refresh]);

  if (!market) return null;

  const priceOf = (s: "A" | "B") => (s === "A" ? market.priceA : market.priceB);
  const labelOf = (s: "A" | "B") => (s === "A" ? market.labelA : market.labelB);
  const posOf = (s: "A" | "B") => positions.find((p) => p.side === s);
  const settled = market.status === "settled";

  async function trade(kind: "buy" | "sell", s: "A" | "B") {
    setBusy(true); setMsg(null);
    try {
      const body = kind === "buy" ? { userId, side: s, amount } : { userId, side: s };
      const res = await fetch(`${SERVER}/api/markets/${roomName}/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ kind: "err", text: data?.error ?? "Failed" }); return; }
      if (typeof data.gavels === "number") setGavels(data.gavels);
      setMsg({ kind: "ok", text: kind === "buy" ? `Bought ${data.shares?.toFixed(0)} shares of ${labelOf(s)}` : `Sold for ${money(data.received ?? 0)} Gavels` });
      await refresh();
    } catch { setMsg({ kind: "err", text: "Network error" }); }
    finally { setBusy(false); }
  }

  const sideColor = (s: "A" | "B", active: boolean) =>
    s === "A"
      ? (active ? "bg-emerald-600 text-white" : "text-emerald-300 ring-1 ring-emerald-700/50 hover:bg-emerald-900/30")
      : (active ? "bg-rose-600 text-white" : "text-rose-300 ring-1 ring-rose-700/50 hover:bg-rose-900/30");

  return (
    <div className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">Live bet</span>
          {settled && <span className="text-[10px] font-semibold text-gray-500">Settled</span>}
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-amber-300">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M3 2.75A.75.75 0 0 1 3.75 2h8.5a.75.75 0 0 1 .53 1.28l-3.1 3.1 3.1 3.1a.75.75 0 0 1-.53 1.28h-8.5A.75.75 0 0 1 3 11.25V2.75Z" /><path d="M7.25 12.5h1.5V15h-1.5z" /></svg>
          {gavels == null ? "…" : money(gavels)} Gavels
        </span>
      </div>

      {/* Odds bar (sharpened proposition bar — what you watch is what pays) */}
      <div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-800">
          <div className="bg-emerald-500 transition-all duration-500" style={{ width: pct(market.priceA) }} />
          <div className="bg-rose-500 transition-all duration-500" style={{ width: pct(market.priceB) }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-emerald-300">{market.labelA} · {pct(market.priceA)}</span>
          <span className="font-semibold text-rose-300">{pct(market.priceB)} · {market.labelB}</span>
        </div>
      </div>

      {settled ? (
        <div className="rounded-xl bg-gray-800/60 p-3 text-center text-sm">
          {market.winningSide === null
            ? <span className="text-gray-300">Too close to call — bets refunded.</span>
            : <span className="text-gray-200"><b className={market.winningSide === "A" ? "text-emerald-300" : "text-rose-300"}>{labelOf(market.winningSide)}</b> took it.</span>}
        </div>
      ) : market.isParticipant ? (
        <p className="rounded-xl bg-gray-800/60 p-3 text-center text-xs text-gray-400">You&apos;re debating this match — betting is disabled for participants.</p>
      ) : (
        <>
          {/* Side + amount + buy */}
          <div className="flex gap-1.5">
            {(["A", "B"] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${sideColor(s, side === s)}`}>
                {labelOf(s)} · ${priceOf(s).toFixed(2)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min={1} value={amount}
              onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              className="w-24 rounded-lg bg-gray-800 px-2.5 py-1.5 text-sm text-gray-100 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
            <button onClick={() => trade("buy", side)} disabled={busy}
              className="flex-1 rounded-lg bg-indigo-600 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
              Bet on {labelOf(side)}
            </button>
          </div>
          <p className="text-center text-[10px] text-gray-500">
            {amount} Gavels → {(amount / priceOf(side)).toFixed(0)} shares · wins {money(amount / priceOf(side))} if {labelOf(side)} leads at the end
          </p>
        </>
      )}

      {/* My positions */}
      {positions.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-800 pt-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Your position</p>
          {positions.map((p) => {
            const value = p.shares * priceOf(p.side);
            const pnl = value - p.cost;
            return (
              <div key={p.side} className="flex items-center justify-between gap-2 text-xs">
                <span className={p.side === "A" ? "text-emerald-300" : "text-rose-300"}>
                  {p.shares.toFixed(0)} × {labelOf(p.side)}
                </span>
                <span className="text-gray-400">
                  {money(value)} <span className={pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>({pnl >= 0 ? "+" : ""}{money(pnl)})</span>
                </span>
                {!settled && (
                  <button onClick={() => trade("sell", p.side)} disabled={busy}
                    className="rounded-md bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-gray-300 hover:bg-gray-700 disabled:opacity-40">
                    Cash out
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {msg && <p className={`text-center text-[11px] ${msg.kind === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</p>}
    </div>
  );
}
