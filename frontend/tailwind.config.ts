import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontSize: {
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
      colors: {
        navy: "var(--color-navy)",
        void: "var(--color-void)",
        brand: {
          violet: "var(--color-violet)",
          blue: "var(--color-blue)",
          cyan: "var(--color-cyan)",
          mint: "var(--color-mint)",
        },
        fog: "var(--color-fog)",
                tier: {
          0: "var(--color-tier-0)",
          1: "var(--color-tier-1)",
          2: "var(--color-tier-2)",
          3: "var(--color-tier-3)",
          4: "var(--color-tier-4)",
          5: "var(--color-tier-5)",
          6: "var(--color-tier-6)",
          7: "var(--color-tier-7)",
        },
      },
      backgroundImage: {
        "gradient-brand":
          "linear-gradient(135deg, var(--color-violet) 0%, var(--color-blue) 38%, var(--color-cyan) 68%, var(--color-mint) 100%)",
        "gradient-bg":
          "radial-gradient(ellipse at top, var(--color-navy) 0%, var(--color-void) 80%)",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        sans: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        wordmark: ["'Archivo Black'", "sans-serif"],
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'snappy': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        blob: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
        'loader-slide': {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        }
      },
      animation: {
        blob: "blob 7s infinite",
        'loader-slide': 'loader-slide 1.5s cubic-bezier(0.16, 1, 0.3, 1) infinite',
      }
    },
  },
  plugins: [],
};
export default config;



