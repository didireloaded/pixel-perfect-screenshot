// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

let closeLocalDatabase: (() => Promise<void>) | undefined;

export default defineConfig({
  vite: {
    plugins: [
      {
        name: "shiftline-local-postgres",
        async configureServer(server) {
          // The app now ships with a default hosted backend; local Postgres only on opt-in.
          const env = loadEnv(server.config.mode, server.config.envDir, "SHIFTLINE_");
          if (env["SHIFTLINE_LOCAL_DB"] === "1") {
            const { createLocalHandler } = await import("./scripts/local-api.mjs");
            const handler = await createLocalHandler();
            closeLocalDatabase = handler.close;
            server.middlewares.use(handler);
          }
        },
        async closeBundle() {
          await closeLocalDatabase?.();
          closeLocalDatabase = undefined;
        },
      },
    ],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
