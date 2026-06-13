import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201b",
        moss: "#445f4d",
        leaf: "#0f766e",
        ember: "#d97706",
        paper: "#f8f7f2"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(23, 32, 27, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
