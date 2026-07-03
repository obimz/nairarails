/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand greens
        brand: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          900: "#14532d",
        },
        // Status colours used across the dashboard
        status: {
          paid:         "#16a34a", // green-600
          pending:      "#ca8a04", // yellow-600
          underpayment: "#dc2626", // red-600
          overpayment:  "#9333ea", // purple-600
          unmatched:    "#6b7280", // gray-500
        },
        // Redesign tokens (landing page specific)
        rail: {
          night: "#0A0E14",
          steel: "#1C2430",
        },
        settlement: {
          green: "#16A97B",
        },
        exception: {
          amber: "#E8A33D",
        },
        ledger: {
          white: "#EDEEEB",
        },
        muted: {
          slate: "#7C8896",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
