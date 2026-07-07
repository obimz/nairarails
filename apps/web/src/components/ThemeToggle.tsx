/**
 * ThemeToggle.tsx — theme switcher in three variants:
 *
 *   default          — compact icon-only button (headers, nav bars)
 *   showSystemOption — three-segment pill: Light / System / Dark (settings page)
 *   sidebar          — animated two-position sliding pill: Light | Dark
 *                      fits naturally in sidebar footers, no Monitor icon clutter
 */

import React from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "../contexts/ThemeContext.js";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface ThemeToggleProps {
  /** Three-segment Light / System / Dark pill — for settings panels */
  showSystemOption?: boolean;
  /** Animated sliding two-position pill — for sidebar footers */
  sidebar?: boolean;
  className?: string;
}

export function ThemeToggle({
  showSystemOption = false,
  sidebar = false,
  className = "",
}: ThemeToggleProps) {
  const { theme, setTheme, toggleTheme } = useTheme();

  // ── Sidebar variant: animated sliding pill ────────────────────────────────
  if (sidebar) {
    const isDark = theme === "dark";

    return (
      <div
        className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl ${className}`}
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Label */}
        <span className="text-[10px] font-medium flex-1" style={{ color: "rgba(100,116,139,0.8)" }}>
          {isDark ? "Dark mode" : "Light mode"}
        </span>

        {/* Toggle track */}
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
          className="relative flex items-center shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16A97B]/60 rounded-full"
          style={{
            width: "44px",
            height: "24px",
            background: isDark
              ? "linear-gradient(135deg, rgba(22,169,123,0.25) 0%, rgba(22,169,123,0.15) 100%)"
              : "rgba(255,255,255,0.08)",
            border: isDark
              ? "1px solid rgba(22,169,123,0.35)"
              : "1px solid rgba(255,255,255,0.12)",
            transition: "background 0.25s, border-color 0.25s",
          }}
        >
          {/* Sliding thumb */}
          <span
            className="absolute flex items-center justify-center rounded-full"
            style={{
              width: "18px",
              height: "18px",
              top: "2px",
              left: isDark ? "22px" : "2px",
              background: isDark
                ? "linear-gradient(135deg, #16A97B 0%, #0d8f67 100%)"
                : "rgba(255,255,255,0.85)",
              boxShadow: isDark
                ? "0 1px 6px rgba(22,169,123,0.5)"
                : "0 1px 4px rgba(0,0,0,0.3)",
              transition: "left 0.22s cubic-bezier(0.4, 0, 0.2, 1), background 0.22s, box-shadow 0.22s",
            }}
          >
            {isDark
              ? <Moon className="w-2.5 h-2.5 text-black" />
              : <Sun  className="w-2.5 h-2.5" style={{ color: "#f59e0b" }} />}
          </span>
        </button>
      </div>
    );
  }

  // ── Three-segment pill: Light / System / Dark ─────────────────────────────
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

  // ── Compact icon button (default) ─────────────────────────────────────────
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
