import type { Config } from "tailwindcss";

/** Zoho-style orange brand palette */
const brand = {
  50: "#fff7ed",
  100: "#ffedd5",
  200: "#fed7aa",
  300: "#fdba74",
  400: "#fb923c",
  500: "#f97316",
  600: "#ea580c",
  700: "#c2410c",
  800: "#9a3412",
  900: "#7c2d12",
  950: "#431407",
};

/** Soft slate used for borders / muted UI (replaces old green-as-sky) */
const sky = {
  50: "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#94a3b8",
  500: "#64748b",
  600: "#475569",
  700: "#334155",
  800: "#1e293b",
  900: "#0f172a",
  950: "#020617",
};

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "Segoe UI", "sans-serif"],
        display: ['"Outfit"', '"DM Sans"', "system-ui", "sans-serif"],
      },
      colors: {
        brand,
        sky,
      },
      maxWidth: {
        content: "72rem",
        exam: "56rem",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
      boxShadow: {
        warm: "0 1px 3px rgba(15, 23, 42, 0.06), 0 4px 12px -4px rgba(15, 23, 42, 0.08)",
        "warm-lg":
          "0 2px 6px rgba(15, 23, 42, 0.05), 0 12px 28px -10px rgba(15, 23, 42, 0.12)",
        "warm-sm": "0 1px 2px rgba(15, 23, 42, 0.05)",
        "inner-soft": "inset 0 1px 2px rgba(15, 23, 42, 0.04)",
        float: "0 16px 40px -18px rgba(15, 23, 42, 0.22)",
      },
      backgroundImage: {
        "mesh-warm":
          "radial-gradient(ellipse 80% 50% at 10% -10%, rgba(234, 88, 12, 0.08), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(194, 65, 12, 0.06), transparent 50%)",
        "noise-dots":
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='1' cy='1' r='1' fill='rgba(15,23,42,0.04)'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-slow": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.72" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out forwards",
        "fade-in-slow": "fade-in-slow 0.35s ease-out forwards",
        "slide-up": "slide-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "scale-in": "scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        shimmer: "shimmer 2.4s linear infinite",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
