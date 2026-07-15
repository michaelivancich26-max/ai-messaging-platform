import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
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
    },
  },
  plugins: [],
};

export default config;
