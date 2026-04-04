import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp", // Mantenlo para que FFmpeg/WASM funcione
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
    "script-src-elem 'self' 'unsafe-inline' blob:",
    // AGREGADO: Arbitrum, Sepolia y Gateways de audio
    "connect-src 'self' http://localhost:* https://sepolia-rollup.arbitrum.io https://*.arbitrum.io https://api.acoustid.org https://api.studio.thegraph.com https://*.lighthouse.storage https://gateway.lighthouse.storage https://encryption.lighthouse.storage blob: https://*.infura.io https://*.alchemy.com",
    "worker-src 'self' blob:",
    "img-src 'self' data: blob: https://*.lighthouse.storage https://gateway.lighthouse.storage",
    // AGREGADO: Permisos de audio desde Lighthouse
    "media-src 'self' blob: https://*.lighthouse.storage https://gateway.lighthouse.storage",
    "style-src 'self' 'unsafe-inline'",
    "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
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