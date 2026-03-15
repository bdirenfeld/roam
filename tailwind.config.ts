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
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        // Roam brand palette
        logistics: "#64748B",   // Slate
        activity:  "#0D9488",   // Teal
        food:      "#F59E0B",   // Amber
        roam: {
          50:  "#f0fafa",
          100: "#ccf2f0",
          500: "#0D9488",
          600: "#0b7e74",
          700: "#096059",
        },
      },
      maxWidth: {
        mobile: "390px",
      },
      screens: {
        xs: "390px",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 12px 0 rgba(0,0,0,0.10)",
        sheet: "0 -4px 24px 0 rgba(0,0,0,0.12)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
