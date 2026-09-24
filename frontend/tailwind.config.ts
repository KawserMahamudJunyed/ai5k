import type { Config } from "tailwindcss";

// DESIGN.md design tokens — Cohere-style system:
// white editorial canvas, deep green/navy product bands, coral accents,
// monumental tight display type, flat surfaces, pill CTAs.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#212121",
        muted: "#75758a",
        "muted-2": "#93939f",
        hairline: "#d9d9dd",
        "border-light": "#e5e7eb",
        canvas: "#ffffff",
        stone: "#eeece7",
        "green-wash": "#edfce9",
        "blue-wash": "#f1f5ff",
        "near-black": "#17171c",
        "brand-green": "#003c33",
        navy: "#071829",
        blue: "#1863dc",
        coral: "#ff7759",
        "coral-soft": "#ffad9b",
        "focus-blue": "#4c6ee6",
        "error-red": "#b30000",
      },
      fontFamily: {
        display: ["var(--font-display)", "Space Grotesk", "Inter", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-sans)", "Inter", "Arial", "ui-sans-serif", "system-ui"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Arial", "monospace"],
      },
      fontSize: {
        // Type scale from DESIGN.md
        "hero": ["clamp(3rem, 8vw, 6rem)", { lineHeight: "1.0", letterSpacing: "-0.02em" }],
        "product-display": ["clamp(2.5rem, 6vw, 4.5rem)", { lineHeight: "1.0", letterSpacing: "-0.02em" }],
        "section-display": ["clamp(2rem, 5vw, 3.75rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "section-heading": ["clamp(1.75rem, 4vw, 3rem)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        "card-heading": ["2rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "feature-heading": ["1.5rem", { lineHeight: "1.3" }],
        "body-lg": ["1.125rem", { lineHeight: "1.4" }],
        caption: ["0.875rem", { lineHeight: "1.4" }],
        micro: ["0.75rem", { lineHeight: "1.4" }],
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "22px",
        xl: "30px",
      },
      maxWidth: {
        shell: "1200px",
        text: "720px",
      },
      minHeight: {
        band: "420px",
      },
    },
  },
  plugins: [],
};

export default config;
