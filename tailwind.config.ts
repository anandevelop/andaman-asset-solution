import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core CI palette (from brief)
        primary: {
          DEFAULT: "#083551", // deep Andaman-night navy
          50: "#e7edf1",
          100: "#c3d3dd",
          200: "#9bb6c6",
          300: "#7099af",
          400: "#4d8099",
          500: "#296682",
          600: "#1c4e69",
          700: "#123a50",
          800: "#083551",
          900: "#041d2c",
        },
        accent: {
          DEFAULT: "#e8b384", // warm sand at low tide
          50: "#fdf7f0",
          100: "#f9e9d7",
          200: "#f3d5b3",
          300: "#edc199",
          400: "#e8b384",
          500: "#dd9758",
          // 600 clears 3:1 — fine for icons, borders and large display type,
          // but not for body copy. 700 is the smallest step that reaches
          // 4.5:1 on the surface background, so it is the floor for text.
          600: "#c47b3a",
          700: "#9c602c", // 4.84:1 on #f9f9fa — WCAG AA normal text
          800: "#7a4a20", // 7.06:1 — hover/active, keeps a visible delta
        },
        surface: {
          DEFAULT: "#f9f9fa", // page background
          raised: "#ffffff",
          muted: "#f0f1f3",
        },
        ink: {
          DEFAULT: "#0d2635", // body text (near-primary, softened)
          muted: "#516573",
        },
      },
      fontFamily: {
        sans: ["var(--font-roboto)", "system-ui", "sans-serif"],
        // Thai-locale pages swap in FC Vision (licensed, see fonts/fc-vision)
        // instead of Roboto — applied via the `font-thai` class set on
        // <body> only when locale === "th" (app/[locale]/layout.tsx).
        thai: ["var(--font-fc-vision)", "var(--font-roboto)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        widest2: "0.28em",
      },
      maxWidth: {
        container: "1440px",
      },
      boxShadow: {
        card: "0 10px 40px -12px rgba(8, 53, 81, 0.18)",
        cardHover: "0 20px 60px -16px rgba(8, 53, 81, 0.28)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Nudges right then settles — a wordless "there's more, swipe me"
        // hint for horizontally-scrolling rows on mobile (see
        // components/AwardsSection.tsx). translateY(-50%) is baked into
        // every step (not just a static class alongside the animation)
        // so the element stays vertically centered throughout, since the
        // animation's own `transform` overrides whatever is set outside it.
        "scroll-hint": {
          "0%, 100%": { transform: "translateY(-50%) translateX(0)" },
          "50%": { transform: "translateY(-50%) translateX(6px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16,1,0.3,1) forwards",
        shimmer: "shimmer 2.5s linear infinite",
        // 3 nudges, not infinite — a hint that never stops moving reads as
        // an animation glitch rather than a hint once you've seen it twice.
        "scroll-hint": "scroll-hint 1.3s ease-in-out 3 both",
      },
      backgroundImage: {
        "horizon-line":
          "linear-gradient(90deg, transparent 0%, #e8b384 50%, transparent 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
