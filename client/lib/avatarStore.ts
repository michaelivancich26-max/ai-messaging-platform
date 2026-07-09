"use client";

// Client-side cache of pixel-avatar configs keyed by userId, with debounced
// batch fetching. Chat bubbles call useAvatar(userId, username) and get a
// deterministic default immediately, upgraded to the user's saved look once
// the batch request resolves.

import { useEffect, useState } from "react";
import { defaultAppearance, normalizeAppearance, type Appearance } from "./avatar";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

const cache = new Map<string, Appearance>();
const listeners = new Set<() => void>();
let queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function notify() { listeners.forEach((l) => l()); }

function flush() {
  timer = null;
  const ids = [...queue].filter((id) => !cache.has(id));
  queue = new Set();
  if (!ids.length) return;
  fetch(`${SERVER}/api/avatars?ids=${ids.map(encodeURIComponent).join(",")}`)
    .then((r) => r.json())
    .then((m: Record<string, { u: string; a: unknown }>) => {
      for (const id of ids) {
        const e = m?.[id];
        cache.set(id, normalizeAppearance(e?.a as any, e?.u || id));
      }
      notify();
    })
    .catch(() => {
      for (const id of ids) if (!cache.has(id)) cache.set(id, defaultAppearance(id));
      notify();
    });
}

function request(id: string) {
  if (cache.has(id) || queue.has(id)) return;
  queue.add(id);
  if (!timer) timer = setTimeout(flush, 50);
}

export function useAvatar(userId?: string | null, username?: string | null): Appearance {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const l = () => bump((v) => v + 1);
    listeners.add(l);
    request(userId);
    return () => { listeners.delete(l); };
  }, [userId]);
  if (userId && cache.has(userId)) return cache.get(userId)!;
  return defaultAppearance(username || userId || "anon");
}

// Update your own cached look instantly after saving (before the next fetch).
export function setLocalAvatar(userId: string, a: Appearance) {
  cache.set(userId, a);
  notify();
}
