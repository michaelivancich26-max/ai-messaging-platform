"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { GavelIcon } from "./GavelsPill";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const CHIPS = [50, 100, 500];

// Compact bet sheet launched from a live-match card. Side is preselected from the tapped
// button; amount via quick chips. Posts to the existing /api/markets/:room/buy endpoint.
export default function QuickBet({
  roomName, side, labelA, labelB, priceA, onClose, onPlaced,
}: {
  roomName: string; side: "A" | "B"; labelA: string; labelB: string; priceA: number;
  onClose: () => void; onPlaced?: () => void;
}) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id ?? "";
  const [sel, setSel] = useState<"A" | "B">(side);
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const price = sel === "A" ? priceA : 1 - priceA;
  const label = sel === "A" ? labelA : labelB;

  async function confirm() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${SERVER}/api/markets/${roomName}/buy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, side: sel, amount }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ kind: "err", text: data?.error ?? "Couldn't place bet" }); return; }
      setMsg({ kind: "ok", text: `Bought ${data.shares?.toFixed(0)} shares of ${label}` });
      onPlaced?.();
      setTimeout(onClose, 900);
    } catch { setMsg({ kind: "err", text: "Network error" }); }
    finally { setBusy(false); }
  }

  const sideBtn = (s: "A" | "B") => {
    const active = sel === s;
    const p = s === "A" ? priceA : 1 - priceA;
    const lbl = s === "A" ? labelA : labelB;
    return (
      <button key={s} onClick={() => setSel(s)}
        className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
          s === "A"
            ? (active ? "bg-emerald-600 text-white" : "text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-700/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30")
            : (active ? "bg-rose-600 text-white" : "text-rose-700 dark:text-rose-300 ring-1 ring-rose-700/50 hover:bg-rose-100 dark:hover:bg-rose-900/30")
        }`}>
        {lbl} · ${p.toFixed(2)}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300"><GavelIcon className="h-4 w-4" /> Place a bet</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" aria-label="Close">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>

        <div className="flex gap-1.5">{sideBtn("A")}{sideBtn("B")}</div>

        <div className="flex gap-1.5">
          {CHIPS.map(c => (
            <button key={c} onClick={() => setAmount(c)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${amount === c ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
              {c}
            </button>
          ))}
          <input type="number" min={1} value={amount}
            onChange={e => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
            className="w-20 rounded-lg bg-gray-100 dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-indigo-500" />
        </div>

        <p className="text-center text-[11px] text-gray-500">
          {amount} Gavels → {(amount / price).toFixed(0)} shares · wins {money(amount / price)} if {label} leads at the end
        </p>

        <button onClick={confirm} disabled={busy}
          className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40 transition-colors">
          {busy ? "Placing…" : `Bet ${amount} on ${label}`}
        </button>

        {msg && <p className={`text-center text-[11px] ${msg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
