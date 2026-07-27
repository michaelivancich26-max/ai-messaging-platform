"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Search, PencilLine, Check, Library, X } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export interface PickedClaim {
  text: string;
  propositionId: string | null;   // null = the user wrote it
}

interface Proposition { id: string; text: string; categoryId: string; label: string }

const CLAIM_MAX = 300;
const CLAIM_MIN = 12;

// Picking a claim for a Battle Grounds challenge.
//
// The curated library is the DEFAULT path and writing your own is a disclosure
// behind it, rather than the two being equal tabs. That ordering is the whole
// point: curated claims are written to be two-sided, so neither player is handed
// an indefensible position, and a shared claim set means the same debate can be
// compared across players. Both kinds are ranked identically — so the lean here
// is a recommendation, never a penalty, and the copy is careful not to imply
// otherwise.
export default function ClaimPicker({ value, onChange }: {
  value: PickedClaim | null;
  onChange: (v: PickedClaim | null) => void;
}) {
  const [props, setProps] = useState<Proposition[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [writingOwn, setWritingOwn] = useState(false);
  const [draft, setDraft] = useState("");
  const [showAll, setShowAll] = useState(false);
  const ownRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(() => {
    setLoading(true); setErr("");
    api(`${SERVER}/api/propositions`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (r.ok) setProps(d.propositions ?? []);
        else setErr(d.error ?? "Couldn't load the claim library.");
      })
      .catch(() => setErr("Couldn't reach the claim library."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Filtering client-side: 40-ish live claims is far too few to justify a
  // round-trip per keystroke, and it keeps the list instant while typing.
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    props.forEach(p => seen.set(p.categoryId, p.label));
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [props]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return props.filter(p =>
      (category === "all" || p.categoryId === category) &&
      (!needle || p.text.toLowerCase().includes(needle)));
  }, [props, q, category]);

  const shown = showAll ? filtered : filtered.slice(0, 6);

  function pickCurated(p: Proposition) {
    setWritingOwn(false);
    setDraft("");
    onChange({ text: p.text, propositionId: p.id });
  }

  function startOwn() {
    setWritingOwn(true);
    onChange(null);
    setTimeout(() => ownRef.current?.focus(), 0);
  }

  function commitOwn(text: string) {
    setDraft(text);
    const t = text.trim();
    onChange(t.length >= CLAIM_MIN ? { text: t, propositionId: null } : null);
  }

  const ownTooShort = writingOwn && draft.trim().length > 0 && draft.trim().length < CLAIM_MIN;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label id="claim-picker-label" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          The claim
        </label>
        {value && !writingOwn && (
          <button onClick={() => { onChange(null); setWritingOwn(false); setDraft(""); }}
            className="-my-2 min-h-11 py-2 text-[11px] font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
            Change
          </button>
        )}
      </div>

      {/* Collapsed confirmation, for a LIBRARY pick only. A custom claim must not
          collapse the moment it becomes valid — that fired on the 12th character
          and yanked the textarea away mid-sentence. While writing your own, the
          editor stays put and the value updates live underneath it. */}
      {value && !writingOwn ? (
        <div className="mt-1.5 rounded-xl border border-brand-green/40 bg-brand-green/5 p-3 dark:bg-brand-green/10">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-ink dark:text-brand-green" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">{value.text}</p>
              <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                {value.propositionId
                  ? "From the claim library — written to be arguable from both sides."
                  : "Your own claim. It'll also be suggested for the claim library."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Search + category, only once there's enough to be worth filtering. */}
          {!writingOwn && props.length > 6 && (
            <>
              <div className="relative mt-1.5">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="search"
                  value={q}
                  onChange={e => { setQ(e.target.value); setShowAll(false); }}
                  placeholder="Search claims…"
                  aria-label="Search the claim library"
                  className="min-h-11 w-full rounded-xl border border-gray-300 bg-gray-100 py-2 pl-9 pr-3 text-base text-gray-900 outline-none transition-colors placeholder-gray-500 focus:border-brand-green dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 md:text-sm"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[{ id: "all", label: "All" }, ...categories].map(c => (
                  <button key={c.id} onClick={() => { setCategory(c.id); setShowAll(false); }}
                    aria-pressed={category === c.id}
                    className={`min-h-11 rounded-full px-3 text-[11px] font-semibold transition-colors ${category === c.id
                      ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* The library */}
          {!writingOwn && (
            <div className="mt-2">
              {loading ? (
                <div className="space-y-2" aria-live="polite" aria-busy="true">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="shimmer-track h-14 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                      <div className="animate-shimmer h-full w-full" />
                    </div>
                  ))}
                </div>
              ) : err ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {err}{" "}
                  <button onClick={load} className="font-semibold underline underline-offset-2">Try again</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center dark:border-gray-700">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {q ? <>Nothing in the library matches &ldquo;{q}&rdquo;.</> : "No claims in this category yet."}
                  </p>
                  <button onClick={startOwn}
                    className="mt-2 min-h-11 text-xs font-semibold text-brand-green-ink hover:underline dark:text-brand-green">
                    Write it yourself instead
                  </button>
                </div>
              ) : (
                <>
                  <ul className="space-y-1.5" aria-labelledby="claim-picker-label">
                    {shown.map(p => (
                      <li key={p.id}>
                        <button onClick={() => pickCurated(p)}
                          className="flex w-full items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-brand-green/50 hover:bg-brand-green/5 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-brand-green/10">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm leading-snug text-gray-900 dark:text-gray-100">{p.text}</span>
                            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{p.label}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {filtered.length > shown.length && (
                    <button onClick={() => setShowAll(true)}
                      className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800">
                      Show {filtered.length - shown.length} more
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Custom claim — deliberately secondary, and disclosed rather than shown. */}
          {!writingOwn ? (
            <button onClick={startOwn}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
              <PencilLine className="h-3.5 w-3.5" aria-hidden />
              Or write your own claim
            </button>
          ) : (
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Your own claim</span>
                <button onClick={() => { setWritingOwn(false); setDraft(""); onChange(null); }}
                  className="-my-2 inline-flex min-h-11 items-center gap-1 py-2 text-[11px] font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
                  <Library className="h-3.5 w-3.5" aria-hidden /> Back to the library
                </button>
              </div>
              <textarea
                ref={ownRef}
                value={draft}
                onChange={e => commitOwn(e.target.value.slice(0, CLAIM_MAX))}
                maxLength={CLAIM_MAX}
                rows={3}
                placeholder="e.g. Public transport should be free at the point of use"
                aria-describedby="own-claim-help"
                className="mt-1 w-full resize-none rounded-xl border border-gray-300 bg-gray-100 px-4 py-3 text-base text-gray-900 outline-none transition-colors placeholder-gray-500 focus:border-brand-green dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 md:text-sm"
              />
              <div className="mt-1 flex items-start justify-between gap-2">
                <p id="own-claim-help" className={`text-[11px] leading-relaxed ${ownTooShort ? "text-amber-700 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"}`}>
                  {ownTooShort
                    ? `A few more words — at least ${CLAIM_MIN} characters.`
                    : "State it as something arguable from both sides. It'll also be suggested for the claim library."}
                </p>
                <span className="shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{draft.length}/{CLAIM_MAX}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
