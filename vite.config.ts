import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

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
  ],
  server: {
    port: 5173,
  },
});


