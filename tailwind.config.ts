import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { studio: { bg: "#09080c", panel: "#121016", line: "#2a252f", pink: "#F472B6", violet: "#A855F7" } } } },
  plugins: [],
};

export default config;
