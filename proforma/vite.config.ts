import { defineConfig } from "vite";

// The proforma is a separate app from the simulation at the repo root: its own
// index.html, its own entry point, its own build output. Run it from the repo
// root with `npm run proforma`.
export default defineConfig({
  root: "proforma",
  base: "./",
  build: {
    outDir: "../dist-proforma",
    emptyOutDir: true,
  },
});
