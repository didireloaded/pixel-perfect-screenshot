import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the app's single-file/react/tailwind
// plugins are not loaded during unit tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
