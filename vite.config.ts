import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
    "script-src-elem 'self' 'unsafe-inline' blob:",
    "connect-src 'self' http://localhost:3001 https://api.acoustid.org https://unpkg.com https://encryption.lighthouse.storage https://lighthouse.storage https://*.lighthouse.storage blob:",
    "worker-src 'self' blob:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
  ].join("; "),
};

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },

  server: {
    headers: SECURITY_HEADERS,

    proxy: {
      // Proxy para evitar bloqueo COEP con Lighthouse gateway
      "/ipfs-proxy": {
        target: "https://gateway.lighthouse.storage",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ipfs-proxy/, ""),
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["cross-origin-resource-policy"] = "cross-origin";
          });
        },
      },
    },
  },

  preview: {
    headers: SECURITY_HEADERS,
  },

  assetsInclude: ["**/*.wasm"],

  optimizeDeps: {
    // CRÍTICO: estos tres no deben pre-bundlearse — usan WASM con URLs relativas
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "@unimusic/chromaprint"],
    esbuildOptions: {
      target: "es2022",
    },
  },

  worker: {
    format: "es",
  },

  build: {
    target: "es2022",
    chunkSizeWarningLimit: 5000,
  },
});