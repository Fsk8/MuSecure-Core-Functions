import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      util: "util",
    },
    dedupe: ["react", "react-dom"],
  },
  server: { 
    host: true,
    // ✨ AGREGADO: Proxy para IPFS (Lighthouse)
    proxy: {
      '/ipfs-proxy': {
        target: 'https://gateway.lighthouse.storage',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ipfs-proxy/, ''),
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
    // Dejamos vacío para que el Service Worker (public/sw.js) maneje los headers de seguridad
    headers: {} 
  },
  preview: { 
    headers: {} 
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    // Excluimos estos módulos para evitar que el empaquetado rompa el acceso al WASM
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "@unimusic/chromaprint"],
    esbuildOptions: { 
      target: "es2022",
      define: { global: "globalThis" } 
    },
  },
  worker: { 
    format: "es",
    plugins: () => [nodePolyfills()]
  },
  build: { 
    target: "es2022", 
    chunkSizeWarningLimit: 5000 
  },
});