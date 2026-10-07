/**
 * MuSecure – lib/ipfsMetadata.ts
 *
 * Utilidades compartidas para leer la metadata ERC-721 de MuSecure desde IPFS:
 * descarga con caché y fallback de gateways, extractores de audio/portada y
 * hash de correos (para casar co-autores sin depender del correo en claro).
 */

import { LighthouseService, DEFAULT_NFT_METADATA_IMAGE } from "@/services/LighthouseService";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const isMobile = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function cleanCid(raw: string): string {
  return String(raw).trim().replace(/^ipfs:\/\//i, "").split("?")[0].split("/")[0];
}

/* ─────────────────────────── Descarga ─────────────────────────── */

const metadataCache = new Map<string, any>();
/** CIDs que ya sabemos que no son JSON (audio, blobs cifrados…): no se re-descargan. */
const NON_METADATA = new Set<string>();

/**
 * Descarga y parsea un JSON de metadata. Prueba el gateway del servicio y luego
 * Lighthouse directo (evita el 402 del proxy en Vercel). Nunca lee cuerpos
 * grandes: si es audio/imagen o pesa > 500 KB se descarta sin descargarlo.
 */
export async function fetchMetadata(cidOrUri: string): Promise<any | null> {
  const cid = cleanCid(cidOrUri);
  if (!cid) return null;
  if (metadataCache.has(cid)) return metadataCache.get(cid);
  if (NON_METADATA.has(cid)) return null;

  const urls = [
    LighthouseService.gatewayUrl(cid),
    `https://gateway.lighthouse.storage/ipfs/${cid}`,
  ];

  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (res.status === 429 || res.status >= 500) {
          await sleep(600 * (attempt + 1));
          continue;
        }
        if (!res.ok) break; // 404/402 → siguiente gateway

        const type = res.headers.get("content-type") ?? "";
        const len = Number(res.headers.get("content-length") ?? 0);
        if (/^(audio|video|image)\//i.test(type) || len > 500_000) {
          NON_METADATA.add(cid);
          return null;
        }

        const text = (await res.text()).trim();
        if (!text.startsWith("{")) {
          NON_METADATA.add(cid);
          return null;
        }
        const json = JSON.parse(text);
        metadataCache.set(cid, json);
        return json;
      } catch (e) {
        if (e instanceof SyntaxError) {
          NON_METADATA.add(cid);
          return null;
        }
        await sleep(350 * (attempt + 1));
      }
    }
  }
  return null;
}

/** Pool de concurrencia para no disparar 429 en el gateway. */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await mapper(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/* ─────────────────────────── Extractores ─────────────────────────── */

/** CID del audio real: `encryptedAudio.ciphertextCid` → `animation_url` → atributo `AudioCID`. */
export function extractAudioCid(meta: any): string {
  const ciphertext = String(meta?.encryptedAudio?.ciphertextCid ?? "").trim();
  if (ciphertext) return cleanCid(ciphertext);

  const anim = String(meta?.animation_url ?? "").trim();
  if (anim) {
    if (anim.toLowerCase().startsWith("ipfs://")) {
      const cid = anim.slice(7).trim().split(/[/?#]/)[0];
      if (cid) return cid;
    }
    const first = anim.split(/[/?#]/)[0];
    if (/^(bafy|bafk|baf|Qm)/i.test(first)) return first;
  }

  const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];
  const keys = ["audiocid", "audio cid", "audio_cid"];
  for (const a of attrs) {
    const tt = String(a?.trait_type ?? "").trim().toLowerCase();
    if (!keys.includes(tt)) continue;
    const v = String(a?.value ?? "").trim();
    if (v) return cleanCid(v);
  }
  return "";
}

export function isEncryptedMeta(meta: any): boolean {
  if (meta?.encryptedAudio?.encrypted === true) return true;
  const prot = (Array.isArray(meta?.attributes) ? meta.attributes : []).find(
    (a: any) => a?.trait_type === "Protección" || a?.trait_type === "Encrypted",
  )?.value;
  return prot === "Cifrado" || prot === true;
}

export function extractArtist(meta: any): string {
  const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];
  const found = attrs.find((a: any) => a?.trait_type === "Artista" || a?.trait_type === "Artist");
  return String(meta?.artist || found?.value || "Artista desconocido");
}

/**
 * URLs candidatas para la portada (gateway del servicio → Lighthouse directo).
 * https:// se usa tal cual; la imagen por defecto del NFT se ignora (la UI
 * muestra el ícono de audífonos).
 */
export function coverUrlsFromImage(image: unknown): string[] {
  const raw = typeof image === "string" ? image.trim() : "";
  if (!raw || raw === DEFAULT_NFT_METADATA_IMAGE) return [];
  if (/^https?:\/\//i.test(raw)) return [raw];
  const cid = raw.replace(/^ipfs:\/\//i, "").replace(/^\/+/, "");
  if (!cid) return [];
  return [LighthouseService.gatewayUrl(cid), `https://gateway.lighthouse.storage/ipfs/${cid}`];
}

/* ─────────────────────────── Hash de correos ─────────────────────────── */

/** SHA-256 hex. Debe coincidir con el que escribe LighthouseService al subir. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}