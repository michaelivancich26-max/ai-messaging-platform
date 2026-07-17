import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Wired to the next/font CSS variables set in app/layout.tsx. The fallback
        // chain keeps text legible if the webfont hasn't loaded yet.
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-display)", "var(--font-sans)", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Logo palette — GROUNDS (green) / FOR (ink) / DEBATE (red)
        brand: {
          green: "#5FCF44",
          red: "#FA5252",
          ink: "#111827",
          // The logo greens/reds are tuned for a dark background and are too light to
          // read as TEXT on white: #5FCF44 measures 2.0:1 and #FA5252 3.3:1, against a
          // 4.5:1 minimum. These are the same hues darkened for light-mode text —
          // 5.6:1 and 5.9:1. The logo itself still uses the originals.
          "green-ink": "#35762A",
          "red-ink": "#C42121",
        },
      },
      // One elevation scale so cards/heroes/CTAs stop inventing their own shadows.
      // Tuned soft for light mode; dark mode leans on borders (shadows read faintly
      // on near-black), so these are additive, never a contrast dependency.
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        elevated: "0 4px 14px -3px rgba(16,24,40,0.10), 0 2px 6px -2px rgba(16,24,40,0.06)",
        hero: "0 24px 48px -16px rgba(16,24,40,0.20), 0 8px 20px -8px rgba(16,24,40,0.10)",
        // Rapid's signature — an orange lift for the front-door CTA.
        glow: "0 10px 30px -8px rgba(234,88,12,0.45)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Section/list entrances (pair with staggered animation-delay).
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Reveal pop for the VS card / result moments.
        popIn: {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "60%": { opacity: "1", transform: "scale(1.02)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        // Matchmaking: concentric rings scanning outward.
        radar: {
          "0%": { transform: "scale(0.5)", opacity: "0.55" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        // Ambient "live"/energy pulse for dots and the searching state.
        pulseGlow: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.88)" },
        },
        // The proposition bar caught a shift — a quick lift on the leading side.
        barFlash: {
          "0%": { filter: "brightness(1)" },
          "35%": { filter: "brightness(1.25)" },
          "100%": { filter: "brightness(1)" },
        },
        // Skeleton shimmer for loading surfaces.
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 200ms ease-out",
        fadeInUp: "fadeInUp 500ms cubic-bezier(0.16,1,0.3,1) both",
        popIn: "popIn 380ms cubic-bezier(0.16,1,0.3,1) both",
        radar: "radar 2.2s ease-out infinite",
        pulseGlow: "pulseGlow 1.6s ease-in-out infinite",
        barFlash: "barFlash 600ms ease-out",
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
