/**
 * ThemeToggle.tsx — animated sun/moon toggle button
 *
 * Two variants:
 *   - default   : compact icon-only button (for headers)
 *   - showSystemOption : three-button pill (Light / Dark / System) for settings panels
 */

import React from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "../contexts/ThemeContext.js";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface ThemeToggleProps {
  /** Show a three-segment Light / System / Dark switcher instead of the icon button */
  showSystemOption?: boolean;
  className?: string;
}

export function ThemeToggle({ showSystemOption = false, className = "" }: ThemeToggleProps) {
  const { theme, setTheme, toggleTheme } = useTheme();

  if (showSystemOption) {
    const systemTheme = getSystemTheme();

    return (
      <div
        className={`inline-flex items-center rounded-xl p-1 gap-0.5 ${className}`}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
        }}
        role="group"
        aria-label="Select colour theme"
      >
        {(
          [
            { id: "light",  icon: Sun,     label: "Light" },
            { id: "system", icon: Monitor, label: "System" },
            { id: "dark",   icon: Moon,    label: "Dark" },
          ] as const
        ).map(({ id, icon: Icon, label }) => {
          const isActive =
            id === "system"
              ? theme === systemTheme && !localStorage.getItem("nairarails-theme")
              : theme === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (id === "system") {
                  localStorage.removeItem("nairarails-theme");
                  setTheme(systemTheme);
                } else {
                  setTheme(id);
                }
              }}
              aria-label={`${label} theme`}
              aria-pressed={isActive}
              className={[
                "relative flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium",
                "transition-all duration-200 cursor-pointer",
                "focus:outline-none focus:ring-2 focus:ring-[#16A97B]/60 focus:ring-offset-1",
                isActive
                  ? "bg-[#16A97B] text-black shadow-md shadow-emerald-500/30"
                  : "hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>
    );
  }

  // — Compact icon button —
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={[
        "relative flex items-center justify-center w-10 h-10 rounded-xl",
        "backdrop-blur-sm transition-all duration-200 cursor-pointer group",
        "focus:outline-none focus:ring-2 focus:ring-[#16A97B]/60 focus:ring-offset-2 focus:ring-offset-transparent",
        className,
      ].join(" ")}
      style={{ background: "var(--bg-glass)", border: "1px solid var(--border)" }}
    >
      {/* Hover shimmer */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      {/* Sun — shown in light mode */}
      <Sun
        className={[
          "absolute w-5 h-5 text-amber-400 transition-all duration-300",
          theme === "light" ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-75",
        ].join(" ")}
      />

      {/* Moon — shown in dark mode */}
      <Moon
        className={[
          "absolute w-5 h-5 text-blue-400 transition-all duration-300",
          theme === "dark" ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75",
        ].join(" ")}
      />
    </button>
  );
}
