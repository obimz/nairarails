/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  // Enable class-based dark mode (we toggle .dark / .light on <html>)
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        xs: "480px", // custom xs breakpoint for the navbar hamburger threshold
      },
      colors: {
        // ── Brand ──────────────────────────────────────────────────────────
        brand: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          900: "#14532d",
        },
        // ── Status colours used across the dashboard ───────────────────────
        status: {
          paid:         "#16a34a",
          pending:      "#ca8a04",
          underpayment: "#dc2626",
          overpayment:  "#9333ea",
          unmatched:    "#6b7280",
        },
        // ── CSS-var tokens (allow "text-theme-primary" etc.) ──────────────
        theme: {
          primary:   "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted:     "var(--text-muted)",
          brand:     "var(--brand)",
          base:      "var(--bg-base)",
          surface:   "var(--bg-surface)",
          elevated:  "var(--bg-elevated)",
        },
        // ── Legacy tokens kept for backwards compat ────────────────────────
        rail: {
          night: "#0A0E14",
          steel: "#1C2430",
        },
        settlement: { green: "#16A97B" },
        exception:  { amber: "#E8A33D" },
        ledger:     { white: "#EDEEEB" },
        muted:      { slate: "#7C8896" },
      },
      fontFamily: {
        sans:    ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
