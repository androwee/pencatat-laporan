/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        persona: { DEFAULT: "#e60012", dark: "#b3000e", bright: "#ff1e2d" },
        ink: "#0a0a0a",
        panel: "#141414",
        panel2: "#1c1c1c",
        line: "#2a2a2a",
      },
    },
  },
  plugins: [],
};
