// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { readSupabaseConfig } from "./shared/supabase-config";

export default defineConfig({
  vite: {
    plugins: [
      {
        name: "require-supabase-config",
        configResolved(config) {
          if (
            config.command === "build" &&
            !readSupabaseConfig(loadEnv(config.mode, config.envDir, "VITE_SUPABASE_"))
          )
            throw new Error(
              "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before building",
            );
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
