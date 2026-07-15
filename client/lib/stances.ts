// Shared palette — all Tailwind class strings must be literal so the build includes them.
//
// Each entry carries a light-mode value and a dark: override. `self` and `btn_active`
// sit on a solid 600/700 fill, so white text works in both themes and they need no
// override. `other`, `tag` and `btn_inactive` land on the page background, so they
// were written dark-only and had to gain light values — bg-emerald-900/40 with
// text-emerald-100 is pale-on-pale once the surface underneath is white.

export const STANCE_PALETTE = [
  {
    self: "bg-emerald-700 text-white",
    other: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-600/30 dark:bg-emerald-900/40 dark:text-emerald-100 dark:ring-emerald-700/30",
    tag: "bg-emerald-200 text-emerald-800 dark:bg-emerald-800/60 dark:text-emerald-300",
    btn_active: "bg-emerald-600 text-white border-emerald-500",
    btn_inactive: "border-emerald-600/40 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/40 dark:text-emerald-500 dark:hover:bg-emerald-900/20",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  {
    self: "bg-red-700 text-white",
    other: "bg-red-100 text-red-900 ring-1 ring-red-600/30 dark:bg-red-900/40 dark:text-red-100 dark:ring-red-700/30",
    tag: "bg-red-200 text-red-800 dark:bg-red-800/60 dark:text-red-300",
    btn_active: "bg-red-600 text-white border-red-500",
    btn_inactive: "border-red-600/40 text-red-700 hover:bg-red-50 dark:border-red-700/40 dark:text-red-500 dark:hover:bg-red-900/20",
    dot: "bg-red-500",
    bar: "bg-red-500",
  },
  {
    self: "bg-sky-700 text-white",
    other: "bg-sky-100 text-sky-900 ring-1 ring-sky-600/30 dark:bg-sky-900/40 dark:text-sky-100 dark:ring-sky-700/30",
    tag: "bg-sky-200 text-sky-800 dark:bg-sky-800/60 dark:text-sky-300",
    btn_active: "bg-sky-600 text-white border-sky-500",
    btn_inactive: "border-sky-600/40 text-sky-700 hover:bg-sky-50 dark:border-sky-700/40 dark:text-sky-500 dark:hover:bg-sky-900/20",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
  },
  {
    self: "bg-amber-700 text-white",
    other: "bg-amber-100 text-amber-900 ring-1 ring-amber-600/30 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-700/30",
    tag: "bg-amber-200 text-amber-800 dark:bg-amber-800/60 dark:text-amber-300",
    btn_active: "bg-amber-600 text-white border-amber-500",
    btn_inactive: "border-amber-600/40 text-amber-700 hover:bg-amber-50 dark:border-amber-700/40 dark:text-amber-500 dark:hover:bg-amber-900/20",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  {
    self: "bg-violet-700 text-white",
    other: "bg-violet-100 text-violet-900 ring-1 ring-violet-600/30 dark:bg-violet-900/40 dark:text-violet-100 dark:ring-violet-700/30",
    tag: "bg-violet-200 text-violet-800 dark:bg-violet-800/60 dark:text-violet-300",
    btn_active: "bg-violet-600 text-white border-violet-500",
    btn_inactive: "border-violet-600/40 text-violet-700 hover:bg-violet-50 dark:border-violet-700/40 dark:text-violet-500 dark:hover:bg-violet-900/20",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
  },
  {
    self: "bg-orange-700 text-white",
    other: "bg-orange-100 text-orange-900 ring-1 ring-orange-600/30 dark:bg-orange-900/40 dark:text-orange-100 dark:ring-orange-700/30",
    tag: "bg-orange-200 text-orange-800 dark:bg-orange-800/60 dark:text-orange-300",
    btn_active: "bg-orange-600 text-white border-orange-500",
    btn_inactive: "border-orange-600/40 text-orange-700 hover:bg-orange-50 dark:border-orange-700/40 dark:text-orange-500 dark:hover:bg-orange-900/20",
    dot: "bg-orange-500",
    bar: "bg-orange-500",
  },
];

export const NEUTRAL_PALETTE = {
  self: "bg-indigo-600 text-white",
  other: "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
  tag: "bg-gray-200 text-gray-700 dark:bg-gray-700/60 dark:text-gray-400",
  btn_active: "bg-gray-600 text-white border-gray-500",
  btn_inactive: "border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700/40 dark:text-gray-500 dark:hover:bg-gray-800",
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
