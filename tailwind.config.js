/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f0f4fa",
          100: "#d9e2f0",
          200: "#b3c5e1",
          300: "#8da8d2",
          400: "#678bc3",
          500: "#416eb4",
          600: "#345890",
          700: "#27426c",
          800: "#1a2c48",
          900: "#0f1a2d",
          950: "#080d17",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
