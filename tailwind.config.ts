import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e9f4ff",
          100: "#d2e9ff",
          200: "#a6d4ff",
          300: "#7abeff",
          400: "#4ca8ff",
          500: "#1E91F9",
          600: "#1E91F9",
          700: "#1474d0",
          800: "#0d5ca6",
          900: "#08447e",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
