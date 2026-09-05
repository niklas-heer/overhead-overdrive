import { defineConfig } from "vite";
export default defineConfig({
  server: { proxy: { "/api/online": "http://127.0.0.1:5174" } },
  build: {
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
  },
});
