"use client";

import { useState } from "react";
import AvatarSprite from "./AvatarSprite";
import {
  SKIN, HAIR_COLOR, SHIRT, PANTS, HAIR_STYLE_COUNT, HATS, BUILDS, BOTTOMS,
  type Appearance,
} from "@/lib/avatar";

export default function CharacterCustomizer({ initial, onClose, onSave }: {
  initial: Appearance;
  onClose: () => void;
  onSave: (a: Appearance) => void | Promise<void>;
}) {
  const [app, setApp] = useState<Appearance>(initial);
  const [saving, setSaving] = useState(false);

  const cycle = (key: keyof Appearance, n: number, d: number) =>
    setApp((a) => ({ ...a, [key]: ((a[key] + d) % n + n) % n }));

  const Row = ({ label, k, n, swatches, names }: { label: string; k: keyof Appearance; n: number; swatches?: string[]; names?: string[] }) => (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-gray-400">{label}</span>
      <button onClick={() => cycle(k, n, -1)} className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700">‹</button>
      <div className="flex-1 text-center text-xs text-gray-200">
        {swatches
          ? <span className="inline-block h-4 w-4 rounded-full ring-1 ring-white/30 align-middle" style={{ background: swatches[app[k]] }} />
          : (names ? names[app[k]] : `${app[k] + 1}`)}
      </div>
      <button onClick={() => cycle(k, n, 1)} className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700">›</button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 ring-1 ring-gray-700 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Customize your character</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-2xl bg-gradient-to-b from-indigo-950 to-gray-950 p-2 ring-1 ring-indigo-900/50">
              <AvatarSprite appearance={app} size={108} />
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <Row label="Body" k="build" n={BUILDS.length} names={BUILDS} />
            <Row label="Skin" k="skin" n={SKIN.length} swatches={SKIN} />
            <Row label="Hair" k="hair" n={HAIR_STYLE_COUNT} />
            <Row label="Hair color" k="hairColor" n={HAIR_COLOR.length} swatches={HAIR_COLOR} />
            <Row label="Shirt" k="shirt" n={SHIRT.length} swatches={SHIRT} />
            <Row label="Bottom" k="bottom" n={BOTTOMS.length} names={BOTTOMS} />
            <Row label="Bottom color" k="pants" n={PANTS.length} swatches={PANTS} />
            <Row label="Hat" k="hat" n={HATS.length} names={HATS} />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-700 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-800">Cancel</button>
          <button onClick={async () => { setSaving(true); await onSave(app); setSaving(false); }}
            className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40" disabled={saving}>
            {saving ? "Saving…" : "Save look"}
          </button>
        </div>
      </div>
    </div>
  );
}
