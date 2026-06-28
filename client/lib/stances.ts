// Shared palette — all Tailwind class strings must be literal so the build includes them.

export const STANCE_PALETTE = [
  {
    self: "bg-emerald-700 text-white",
    other: "bg-emerald-900/40 text-emerald-100 ring-1 ring-emerald-700/30",
    tag: "bg-emerald-800/60 text-emerald-300",
    btn_active: "bg-emerald-600 text-white border-emerald-500",
    btn_inactive: "border-emerald-700/40 text-emerald-500 hover:bg-emerald-900/20",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  {
    self: "bg-red-700 text-white",
    other: "bg-red-900/40 text-red-100 ring-1 ring-red-700/30",
    tag: "bg-red-800/60 text-red-300",
    btn_active: "bg-red-600 text-white border-red-500",
    btn_inactive: "border-red-700/40 text-red-500 hover:bg-red-900/20",
    dot: "bg-red-500",
    bar: "bg-red-500",
  },
  {
    self: "bg-sky-700 text-white",
    other: "bg-sky-900/40 text-sky-100 ring-1 ring-sky-700/30",
    tag: "bg-sky-800/60 text-sky-300",
    btn_active: "bg-sky-600 text-white border-sky-500",
    btn_inactive: "border-sky-700/40 text-sky-500 hover:bg-sky-900/20",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
  },
  {
    self: "bg-amber-700 text-white",
    other: "bg-amber-900/40 text-amber-100 ring-1 ring-amber-700/30",
    tag: "bg-amber-800/60 text-amber-300",
    btn_active: "bg-amber-600 text-white border-amber-500",
    btn_inactive: "border-amber-700/40 text-amber-500 hover:bg-amber-900/20",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  {
    self: "bg-violet-700 text-white",
    other: "bg-violet-900/40 text-violet-100 ring-1 ring-violet-700/30",
    tag: "bg-violet-800/60 text-violet-300",
    btn_active: "bg-violet-600 text-white border-violet-500",
    btn_inactive: "border-violet-700/40 text-violet-500 hover:bg-violet-900/20",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
  },
  {
    self: "bg-orange-700 text-white",
    other: "bg-orange-900/40 text-orange-100 ring-1 ring-orange-700/30",
    tag: "bg-orange-800/60 text-orange-300",
    btn_active: "bg-orange-600 text-white border-orange-500",
    btn_inactive: "border-orange-700/40 text-orange-500 hover:bg-orange-900/20",
    dot: "bg-orange-500",
    bar: "bg-orange-500",
  },
];

export const NEUTRAL_PALETTE = {
  self: "bg-indigo-600 text-white",
  other: "bg-gray-800 text-gray-100",
  tag: "bg-gray-700/60 text-gray-400",
  btn_active: "bg-gray-600 text-white border-gray-500",
  btn_inactive: "border-gray-700/40 text-gray-500 hover:bg-gray-800",
  dot: "bg-gray-500",
  bar: "bg-gray-500",
};

export const DEFAULT_STANCES = ["FOR", "AGAINST"];

export function getStancePalette(position: string, stances: string[]) {
  if (!position || position === "NEUTRAL") return NEUTRAL_PALETTE;
  const idx = stances.indexOf(position);
  if (idx === -1) return NEUTRAL_PALETTE;
  return STANCE_PALETTE[idx % STANCE_PALETTE.length];
}
