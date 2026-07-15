import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Soft, neutral palette with a single accent.
        accent: {
          DEFAULT: "#4f46e5",
          soft: "#eef2ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
