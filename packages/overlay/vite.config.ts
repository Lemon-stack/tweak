import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: "src/index.tsx",
      name: "TweakOverlay",
      fileName: () => "overlay.js",
      formats: ["iife"],
    },
    outDir: "../../packages/cli/public",
    rollupOptions: {
      external: [],
    },
  },
});
