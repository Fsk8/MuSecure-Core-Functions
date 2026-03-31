# MuSecure – Headers de Seguridad para WASM / SharedArrayBuffer

Los siguientes headers son **obligatorios** en producción para que
`ffmpeg.wasm` (y cualquier módulo WASM con threads) funcione correctamente.

---

## ¿Por qué son necesarios?

`SharedArrayBuffer` (SAB) fue deshabilitado en todos los navegadores en 2018
tras la vulnerabilidad Spectre/Meltdown. Fue rehabilitado solo en contextos
"cross-origin isolated", lo que requiere estos dos headers en **todas** las
respuestas HTTP de tu origin.

---

## Nginx

```nginx
# /etc/nginx/sites-available/musecure
server {
    listen 443 ssl;
    server_name musecure.app;

    # ← WASM / SharedArrayBuffer
    add_header Cross-Origin-Opener-Policy  "same-origin"   always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    # Archivos .wasm – tipo MIME correcto
    types {
        application/wasm wasm;
    }

    location / {
        root /var/www/musecure/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Vercel (vercel.json)

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy",  "value": "require-corp" }
      ]
    }
  ]
}
```

---

## Netlify (_headers)

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

---

## Cloudflare Workers / Pages

```javascript
// _worker.js (Pages Functions)
export async function onRequest({ next }) {
  const response = await next();
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  newResponse.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return newResponse;
}
```

---

## Verificación

Abre DevTools → Application → Security y confirma:

```
Cross-Origin Isolated: true
```

O en consola:
```javascript
console.log(crossOriginIsolated); // debe ser true
```

---

## Impacto

| Funcionalidad            | Sin headers | Con headers |
|--------------------------|-------------|-------------|
| SharedArrayBuffer        | ❌ bloqueado | ✅ disponible |
| ffmpeg.wasm (multi-thread) | ❌ falla   | ✅ funciona |
| Atomics.wait()           | ❌ bloqueado | ✅ disponible |
| window.opener            | ✅ funciona  | ⚠️  bloqueado (intencional) |
| postMessage cross-origin | ✅ funciona  | ⚠️  requiere CORP en recursos externos |

> **Nota**: Si integras SDKs de terceros (Stripe, Firebase Auth popup, etc.)
> que usan `window.opener`, necesitarás migrarlos a flows de redirect.
