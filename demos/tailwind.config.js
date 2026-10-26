// Every demo shares these role names; each site's CSS file gives them its own colours and faces.
const role = (v) => `rgb(var(--${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./*/index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: role("ground"), ink: role("ink"), soft: role("soft"), line: role("line"),
        field: role("field"), "on-field": role("on-field"), accent: role("accent"), "on-accent": role("on-accent"),
        tint: role("tint"), bad: role("bad"),
      },
      fontFamily: { display: "var(--font-display)", body: "var(--font-body)" },
      maxWidth: { page: "1400px" },
    },
  },
  plugins: [],
};
