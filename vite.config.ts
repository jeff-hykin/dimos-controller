/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Desktop serves the app under /apps/<name>/: every asset path
  // must be relative.
  base: "./",
  plugins: [react()],
  server: {
    // HMR dev on :5173: /zenoh-web goes to a running Desktop.
    proxy: { "/zenoh-web": "http://127.0.0.1:7077" },
  },
  build: {
    target: "es2022",
  },
  test: {
    // UI tests (.test.tsx) opt into happy-dom per file via
    // @vitest-environment; everything else stays on node.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Vitest's default forks pool needs Node child-process IPC, which Deno
    // does not emulate reliably (tinypool "fd is not from BiPipe" under CI).
    pool: "threads",
  },
});
