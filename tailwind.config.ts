import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
  content: ["./src/web/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1D2327",
        "ink-light": "#2C3338",
        accent: "#F3713C",
        teal: "#2D3D40",
        slate: "#3C434A",
        surface: "#F0F0F1",
        edge: "#C3C4C7",
      },
      fontFamily: {
        display: ['"Raleway"', "system-ui", "sans-serif"],
        body: ['"Libre Franklin"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        wide: "0.08em",
        wider: "0.1em",
        widest: "0.12em",
      },
    },
  },
  plugins: [forms],
} satisfies Config;
