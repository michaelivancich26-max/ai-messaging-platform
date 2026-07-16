"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Category { id: string; label: string; count: number }
interface MatchFound { roomName: string; topic: string; stance: string; opponent: string; minMessages: number }

const ANY = "__any__";

function elapsed(since: number): string {
  const s = Math.floor((Date.now() - since) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Queue for a rapid round. You pick a category (or take anything); the server
// pairs you with whoever's waiting, picks the topic, and deals the sides.
export default function RapidFire({ userId, username }: { userId: string; username: string }) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string>(ANY);
  const [queued, setQueued] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [found, setFound] = useState<MatchFound | null>(null);
  const queuedRef = useRef(false);

  useEffect(() => {
    api(`${SERVER}/api/topics`).then(r => r.json())
      .then(d => setCategories(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const loadWaiting = useCallback(() => {
    api(`${SERVER}/api/rapid/queue-size`).then(r => r.json())
      .then(d => setWaiting(d?.waiting ?? 0)).catch(() => {});
  }, []);

  useEffect(() => {
    loadWaiting();
    const id = setInterval(loadWaiting, 5000);
    return () => clearInterval(id);
  }, [loadWaiting]);

  // Tick the "waiting for 0:42" label.
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [since]);

  useEffect(() => {
    if (!userId || !username) return;
    const socket = getSocket();

    const onWaiting = () => { setQueued(true); queuedRef.current = true; setSince(Date.now()); };
    const onLeft = () => { setQueued(false); queuedRef.current = false; setSince(null); };
    const onFound = (m: MatchFound) => {
      setQueued(false); queuedRef.current = false; setSince(null);
      setFound(m);
      // Beat lets the pairing register before the room mounts and starts judging.
      setTimeout(() => router.push(`/room/${m.roomName}`), 1200);
    };

    socket.on("rapidQueueWaiting", onWaiting);
    socket.on("rapidQueueLeft", onLeft);
    socket.on("rapidMatchFound", onFound);
    return () => {
      socket.off("rapidQueueWaiting", onWaiting);
      socket.off("rapidQueueLeft", onLeft);
      socket.off("rapidMatchFound", onFound);
    };
  }, [userId, username, router]);

  // Leave the pool if the user navigates away while still queued.
  useEffect(() => () => {
    if (queuedRef.current) getSocket().emit("rapidQueueLeave");
  }, [userId, username]);

  function join() {
    getSocket().emit("rapidQueueJoin", { categoryId: selected === ANY ? null : selected });
    setQueued(true); queuedRef.current = true; setSince(Date.now());
  }

  function leave() {
    getSocket().emit("rapidQueueLeave");
    setQueued(false); queuedRef.current = false; setSince(null);
  }

  if (found) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Match found</p>
        <p className="max-w-md text-base font-semibold text-gray-900 dark:text-gray-100">&ldquo;{found.topic}&rdquo;</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You&rsquo;re arguing <span className={`font-bold ${found.stance === "affirmative" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {found.stance === "affirmative" ? "FOR" : "AGAINST"}
          </span>{" "}vs {found.opponent}
        </p>
        <p className="text-xs text-gray-500">Opening the room…</p>
      </div>
    );
  }

  if (queued) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-orange-500" />
        </span>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Looking for an opponent…</p>
        <p className="text-xs text-gray-500">
          {selected === ANY ? "Any topic" : categories.find(c => c.id === selected)?.label}
          {since && <> · waiting {elapsed(since)}</>}
        </p>
        <button onClick={leave}
          className="mt-2 rounded-full border border-gray-300 dark:border-gray-700 px-4 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-8">
      <div className="text-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Rapid Fire</h3>
        <p className="mt-1 text-sm text-gray-500">
          Get matched with whoever&rsquo;s waiting. The topic and your side are dealt to you.
          Argue until one of you moves on — whoever leads the proposition bar takes it.
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Move on before 3 messages each and the round is void — no winner, no rating change.
        </p>
        {waiting > 0 && (
          <p className="mt-2 text-xs font-semibold text-orange-600 dark:text-orange-400">{waiting} {waiting === 1 ? "person" : "people"} in the queue</p>
        )}
      </div>

      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Category</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelected(ANY)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              selected === ANY ? "bg-orange-600 text-white" : "border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400"
            }`}>
            Any topic
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setSelected(c.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected === c.id ? "bg-orange-600 text-white" : "border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400"
              }`}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          &ldquo;Any topic&rdquo; matches fastest — a category only pairs you with someone who chose it or chose any.
        </p>
      </div>

      <button onClick={join}
        className="mt-6 w-full rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-500">
        Find an opponent →
      </button>
    </div>
  );
}
