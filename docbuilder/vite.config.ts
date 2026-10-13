/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works when published under a subpath.
  base: "./",
  test: {
    globals: true,
    environment: "node",
  },
});
