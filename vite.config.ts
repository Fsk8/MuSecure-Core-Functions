import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp", // Crítico para WASM/SharedArrayBuffer
  "Content-Security-Policy": [
    "default-src 'self'",
    // Agregamos soporte para Vercel Live y mantenemos WASM/Blobs
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' https://vercel.live blob:",
    "script-src-elem 'self' 'unsafe-inline' https://vercel.live blob:",
    // ACTUALIZADO: Agregamos *.musicbrainz.org para que los enlaces y datos de la canción carguen
    "connect-src 'self' http://localhost:* https://sepolia-rollup.arbitrum.io https://*.arbitrum.io https://api.acoustid.org https://*.musicbrainz.org https://api.studio.thegraph.com https://*.lighthouse.storage https://gateway.lighthouse.storage https://encryption.lighthouse.storage https://*.infura.io https://*.alchemy.com https://vercel.live blob:",
    "worker-src 'self' blob:",
    // ACTUALIZADO: Agregamos coverartarchive.org y musicbrainz.org para las imágenes de los discos
    "img-src 'self' data: blob: https://*.lighthouse.storage https://gateway.lighthouse.storage https://*.musicbrainz.org https://coverartarchive.org https://assets.vercel.com",
    // Mantenemos los permisos de audio para el reproductor
    "media-src 'self' blob: https://*.lighthouse.storage https://gateway.lighthouse.storage",
    "style-src 'self' 'unsafe-inline' https://vercel.live",
    // ACTUALIZADO: Permitimos frames de MusicBrainz si son necesarios
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
    // Permite acceder desde el celular en la misma red (ej. 192.168.x.x)
    host: true, 
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