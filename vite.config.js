import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/spotiguess/" : "/",
  server: {
    port: 5019,
    strictPort: true,
    proxy: {
      "/socket.io": "http://127.0.0.1:5020",
      "/api": "http://127.0.0.1:5020"
    }
  }
});
