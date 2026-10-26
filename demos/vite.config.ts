import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// One multi-page build: the hub at /demos/ and one folder per demo site.
const pages = ["malnad-table", "navilu-boutique", "little-banyan", "sampige-residency"];

export default defineConfig({
  base: "/demos/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: Object.fromEntries([
        ["hub", resolve(__dirname, "index.html")],
        ...pages.map((p) => [p, resolve(__dirname, p, "index.html")]),
      ]),
    },
  },
});
