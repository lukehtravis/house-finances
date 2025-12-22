import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/house-finances/", // Required for GitHub Pages deployment
  plugins: [react()],
  server: {
    port: 5173
  }
});


