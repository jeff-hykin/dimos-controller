/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The viewer SDK and the wire protocol are vendored from dimos (web/sdk,
// web/shared) under vendor/; the aliases keep upstream's import names.
// Subpath aliases must come first: aliases match in order and the bare one
// would otherwise swallow them.
const vendored = (path: string) => fileURLToPath(new URL(`./vendor/${path}`, import.meta.url));

export default defineConfig({
  // Desktop serves the app under /app/dimos-controller/: every asset path
  // must be relative.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@dimos/sdk/internal/teleop": vendored("dimos-sdk/internal/teleopMachine.ts"),
      "@dimos/sdk/react": vendored("dimos-sdk/react.ts"),
      "@dimos/sdk": vendored("dimos-sdk/index.ts"),
      "@dimos/shared/manifest": vendored("dimos-shared/manifest.ts"),
      "@dimos/shared": vendored("dimos-shared/protocol.ts"),
    },
  },
  server: {
    // HMR dev on :5173: /api/info is answered by the relay on :7780; the
    // WebTransport connection then goes straight to the advertised wtUrl.
    proxy: { "/api": "http://127.0.0.1:7780" },
  },
  build: {
    target: "es2022",
    // The map3d panel's three.js chunk (voxelScene.ts, a dynamic import) is
    // ~540 kB minified by design; the main bundle stays under the default.
    chunkSizeWarningLimit: 600,
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
