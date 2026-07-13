"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>({
  theme: "light", toggle: () => {}, setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

// Light is the default. The stored choice is applied pre-paint by an inline script in
// app/layout.tsx (avoids a flash); this provider keeps React state, localStorage, and the
// <html> "dark" class in sync when the user toggles.
export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("theme")) as Theme | null;
    setThemeState(stored === "dark" ? "dark" : "light");
  }, []);

  function apply(t: Theme) {
    setThemeState(t);
    try {
      localStorage.setItem("theme", t);
      document.documentElement.classList.toggle("dark", t === "dark");
    } catch { /* ignore */ }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => apply(theme === "dark" ? "light" : "dark"), setTheme: apply }}>
      {children}
    </ThemeContext.Provider>
  );
}
