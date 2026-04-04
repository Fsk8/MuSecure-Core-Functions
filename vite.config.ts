import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless", // Cambiado para permitir IPFS
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' https://vercel.live blob:",
    "script-src-elem 'self' 'unsafe-inline' https://vercel.live blob:",
    "connect-src 'self' http://localhost:* https://sepolia-rollup.arbitrum.io https://*.arbitrum.io https://api.acoustid.org https://*.musicbrainz.org https://api.studio.thegraph.com https://*.lighthouse.storage https://gateway.lighthouse.storage https://encryption.lighthouse.storage https://*.infura.io https://*.alchemy.com https://verify.walletconnect.com https://verify.walletconnect.org https://vercel.live blob:",
    "worker-src 'self' blob:",
    "img-src 'self' data: blob: https://*.lighthouse.storage https://gateway.lighthouse.storage https://*.musicbrainz.org https://coverartarchive.org https://assets.vercel.com",
    "media-src 'self' blob: https://*.lighthouse.storage https://gateway.lighthouse.storage",
    "style-src 'self' 'unsafe-inline' https://vercel.live",
    "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://*.musicbrainz.org https://vercel.live",
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
    host: true,
  },
  preview: {
    headers: SECURITY_HEADERS,
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "@unimusic/chromaprint"],
    esbuildOptions: { target: "es2022" },
  },
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 5000 },
});