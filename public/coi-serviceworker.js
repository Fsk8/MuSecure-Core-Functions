/* eslint-disable no-restricted-globals */

// Service Worker diseñado para MuSecure por Gemini
// Maneja el aislamiento de origen (COOP/COEP) de forma dinámica

self.addEventListener("install", () => {
    self.skipWaiting();
  });
  
  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });
  
  self.addEventListener("fetch", (event) => {
    // Verificamos si la petición va hacia el gateway de Lighthouse
    const isLighthouse = event.request.url.includes("lighthouse.storage");
  
    if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
      return;
    }
  
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }
  
          const newHeaders = new Headers(response.headers);
  
          // Cabeceras para habilitar el aislamiento de origen (WASM/Fingerprinting)
          newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
          
          // Si el recurso viene de Lighthouse, permitimos explícitamente el acceso cruzado
          // para evitar el error net::ERR_BLOCKED_BY_RESPONSE
          if (isLighthouse) {
            newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
          }
  
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => {
          console.error("SW Fetch Error:", e);
          return fetch(event.request);
        })
    );
  });