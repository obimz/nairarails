/**
 * ThemeContext.tsx — light / dark mode provider
 *
 * Persists the user's choice in localStorage under "nairarails-theme".
 * Falls back to the OS preference on first visit.
 */

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

function resolveInitial(): Theme {
  try {
    const stored = localStorage.getItem("nairarails-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* localStorage unavailable */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(resolveInitial);

  // Apply class to <html> and persist whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark",  theme === "dark");
    root.classList.toggle("light", theme === "light");
    try { localStorage.setItem("nairarails-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  // Listen for OS-level changes (only when user hasn't overridden)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      // Only follow OS if the user hasn't stored a manual choice
      const stored = (() => { try { return localStorage.getItem("nairarails-theme"); } catch { return null; } })();
      if (!stored) setThemeState(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState(prev => prev === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
