import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  },
  envPrefix: ["VITE_", "ELECTRON_"],
  base: "./",
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: !!process.env.ELECTRON_DEBUG
  }
});
