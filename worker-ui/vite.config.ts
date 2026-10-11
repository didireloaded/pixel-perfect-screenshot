import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), {
    name: "local-test-employee",
    async configureServer(server) {
      const { createLocalHandler } = await import("../scripts/local-api.mjs");
      const handler = await createLocalHandler({ testWorker: true });
      server.middlewares.use(handler);
      server.httpServer?.once("close", () => void handler.close());
    },
  }],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
