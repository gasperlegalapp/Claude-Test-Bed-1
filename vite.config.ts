/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built site works under the GitHub Pages project
  // subpath (e.g. /Claude-Test-Bed-1/) without hardcoding the repo name.
  base: "./",
  test: {
    globals: true,
    environment: "node",
  },
});
