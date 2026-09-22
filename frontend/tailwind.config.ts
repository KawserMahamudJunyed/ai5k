import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
        'loader-slide': {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        }
      },
      animation: {
        'loader-slide': 'loader-slide 1.5s cubic-bezier(0.16, 1, 0.3, 1) infinite',
      }
    },
  },
  plugins: [],
};
export default config;


