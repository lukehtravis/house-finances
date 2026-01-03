import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { copyFileSync } from "fs";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/house-finances/", // Required for GitHub Pages deployment
  plugins: [
    react(),
    // Simple dev-only redirect: only handle exact base path without trailing slash
    {
      name: "dev-base-redirect",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Only redirect the exact base path without trailing slash
          // This is just for convenience when starting the dev server
          if (req.url === "/house-finances") {
            res.writeHead(301, { Location: "/house-finances/" });
            res.end();
            return;
          }
          next();
        });
      },
    },
    // Copy 404.html to dist folder for GitHub Pages
    {
      name: "copy-404",
      closeBundle() {
        const root = process.cwd();
        const src = resolve(root, "404.html");
        const dest = resolve(root, "dist", "404.html");
        try {
          copyFileSync(src, dest);
          console.log("✓ Copied 404.html to dist folder");
        } catch (error) {
          console.warn("⚠ Could not copy 404.html:", error);
        }
      },
    },
  ],
  server: {
    port: 5173,
  },
});


