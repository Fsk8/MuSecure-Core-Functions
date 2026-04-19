/**
 * coi-serviceworker.js — MuSecure
 * 
 * Inyecta COEP/COOP dinámicamente para habilitar SharedArrayBuffer (WASM).
 * 
 * POR QUÉ ESTO Y NO vercel.json:
 * Vercel aplica COEP a TODAS las responses incluyendo el iframe de Privy.
 * El iframe de Privy no envía CORP: cross-origin → bloqueado → "Exceeded max attempts".
 * 
 * El service worker intercepta SOLO la respuesta de navegación principal (HTML)
 * y añade los headers ahí. El iframe de Privy carga en su propio contexto
 * sin que le afecten estos headers.
 */

// Instalación inmediata sin esperar
self.addEventListener("install", (e) => {
  e.waitUntil(self.skipWaiting());
});

// Tomar control inmediatamente
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const { request } = e;

  // Solo interceptar navegaciones (carga del HTML principal)
  // NO interceptar recursos de terceros como auth.privy.io
  if (request.mode !== "navigate") return;

  e.respondWith(
    fetch(request)
      .then((response) => {
        // No modificar errores
        if (!response.ok) return response;

        const headers = new Headers(response.headers);

        // Añadir COEP/COOP solo si no vienen ya de Vercel
        if (!headers.has("Cross-Origin-Embedder-Policy")) {
          headers.set("Cross-Origin-Embedder-Policy", "credentialless");
        }
        if (!headers.has("Cross-Origin-Opener-Policy")) {
          headers.set("Cross-Origin-Opener-Policy", "same-origin");
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      })
      .catch(() => fetch(request))
  );
});