import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { readSupabaseConfig } from "../shared/supabase-config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
  resolve: { dedupe: ["react", "react-dom"], alias: { "@": path.resolve(__dirname, "src") } },
});
