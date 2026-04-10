import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["Inter", "system-ui", "sans-serif"],
        display: ["'Playfair Display'", "Georgia", "serif"],
      },
      colors: {
        // Roam brand palette
        parchment: "#FAF7F2",   // Background
        logistics: "#111827",   // Near-black
        activity:  "#1A1A2E",   // Deep Ink
        food:      "#7C3AED",   // Purple
        roam: {
          50:  "#f0fafa",
          100: "#ccf2f0",
          500: "#1A1A2E",
          600: "#111120",
          700: "#0a0a14",
        },
      },
      maxWidth: {
        mobile: "390px",
      },
      screens: {
        xs: "390px",
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 12px 0 rgba(0,0,0,0.10)",
        sheet: "0 -4px 24px 0 rgba(0,0,0,0.12)",
      },
      zIndex: {
        '60': '60',
      },
    },
  },
  safelist: ["touch-none"],
  plugins: [require("tailwindcss-animate")],
};

export default config;
