import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5019,
    strictPort: true,
    proxy: {
      "/socket.io": "http://127.0.0.1:5020",
      "/api": "http://127.0.0.1:5020"
    }
  }
});
