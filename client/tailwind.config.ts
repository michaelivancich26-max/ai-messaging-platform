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
        },
      },
    },
  },
  plugins: [],
};

export default config;
