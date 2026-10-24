import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./server/api.js";
const root = path.dirname(fileURLToPath(import.meta.url));
// Server-only secrets such as OPENROUTER_API_KEY. Not VITE_-prefixed, so they are
// never bundled into the browser app.
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {}
export default defineConfig({
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  plugins: [
    {
      name: "folio-local-storage",
      configureServer(server) {
        server.middlewares.use(
          createApi(
            process.env.FOLIO_CONFIG_PATH ||
              path.join(root, ".folio-local.json"),
          ),
        );
      },
      configurePreviewServer(server) {
        server.middlewares.use(
          createApi(
            process.env.FOLIO_CONFIG_PATH ||
              path.join(root, ".folio-local.json"),
          ),
        );
      },
    },
  ],
});
