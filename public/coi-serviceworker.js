/**
 * coi-serviceworker.js — MuSecure
 *
 * Inyecta COEP/COOP solo en la página principal para habilitar SharedArrayBuffer (WASM).
 * Usa "credentialless" en lugar de "require-corp" para no bloquear iframes de terceros
 * como el de Privy, WalletConnect, Cloudflare Turnstile, etc.
 *
 * IMPORTANTE: Este archivo debe estar en /public/coi-serviceworker.js
 * y ser llamado desde index.html ANTES del script principal.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", function (event) {
  // Solo interceptar requests del mismo origen
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // No modificar responses de error
          if (!response.ok && response.type !== "opaque") {
            return response;
          }

          // Añadir headers COEP/COOP a las páginas HTML
          const newHeaders = new Headers(response.headers);

          // credentialless permite que iframes de terceros (Privy, WC) carguen
          // sin necesitar el header CORP en sus recursos
          if (!newHeaders.has("Cross-Origin-Embedder-Policy")) {
            newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
          }
          if (!newHeaders.has("Cross-Origin-Opener-Policy")) {
            newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
          }

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch(() => fetch(event.request))
    );
    return;
  }

  // Para requests de assets (JS, CSS, WASM): añadir CORP si es mismo origen
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const newHeaders = new Headers(response.headers);
          if (!newHeaders.has("Cross-Origin-Resource-Policy")) {
            newHeaders.set("Cross-Origin-Resource-Policy", "same-origin");
          }
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch(() => fetch(event.request))
    );
    return;
  }

  // Requests de terceros (Privy iframe, WalletConnect, etc.): pasar sin modificar
  // Esto es CRÍTICO — no interceptar ni modificar requests de auth.privy.io
  event.respondWith(fetch(event.request));
});