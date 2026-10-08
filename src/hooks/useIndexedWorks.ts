/**
 * MuSecure – hooks/useIndexedWorks.ts
 *
 * Combina datos on-chain indexados (Envio) con metadata off-chain (IPFS/Lighthouse)
 * para mostrar obras con título/artista reales en la UI.
 */

import { useState, useEffect, useCallback } from "react";
import { getWorksByAuthor, type IndexedWork } from "@/services/EnvioIndexerService";
import { LighthouseService, DEFAULT_NFT_METADATA_IMAGE } from "@/services/LighthouseService";

export interface WorkWithMetadata extends IndexedWork {
  title?: string;
  artist?: string;
  /** Primera URL candidata de la portada (compatibilidad). */
  coverUrl?: string;
  /** URLs candidatas de la portada, en orden de preferencia. Vacío → sin portada. */
  coverUrls?: string[];
  audioCid?: string;
  isEncrypted?: boolean;
  metadataError?: string;
}

/**
 * URLs candidatas para la portada, en orden:
 *  1) gateway del servicio (proxy /api/ipfs en Vercel, que a veces da 402/redirect)
 *  2) gateway directo de Lighthouse
 * Una imagen https:// se usa tal cual. La imagen por defecto del NFT se ignora
 * (la UI muestra el ícono de audífonos en su lugar).
 */
function coverUrlsFromImage(image: unknown): string[] {
  const raw = typeof image === "string" ? image.trim() : "";
  if (!raw || raw === DEFAULT_NFT_METADATA_IMAGE) return [];
  if (/^https?:\/\//i.test(raw)) return [raw];

  const cid = raw.replace(/^ipfs:\/\//i, "").replace(/^\/+/, "");
  if (!cid) return [];
  return [LighthouseService.gatewayUrl(cid), `https://gateway.lighthouse.storage/ipfs/${cid}`];
}

function extractArtist(attributes: Array<{ trait_type: string; value: unknown }> = []): string | undefined {
  const found = attributes.find((a) => a.trait_type === "Artista" || a.trait_type === "Artist");
  return typeof found?.value === "string" ? found.value : undefined;
}

/** Extrae el CID del audio real (distinto del CID del JSON de metadata). */
function extractAudioCid(meta: any): string {
  const anim = String(meta?.animation_url ?? "").trim();
  if (anim) {
    const low = anim.toLowerCase();
    if (low.startsWith("ipfs://")) {
      const rest = anim.slice(7).trim();
      const cid = rest.split(/[/?#]/)[0];
      if (cid) return cid;
    }
    const first = anim.split(/[/?#]/)[0];
    if (/^(bafy|bafk|baf|Qm)/i.test(first)) return first;
  }

  // Cuando la obra está cifrada, animation_url viene vacío y el CID real
  // del audio se guarda en el atributo "AudioCID" (ver LighthouseService.uploadMetadata).
  const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];
  const keys = ["audiocid", "audio cid", "audio_cid"];
  for (const a of attrs) {
    const tt = String(a?.trait_type ?? "").trim().toLowerCase();
    if (!keys.includes(tt)) continue;
    const v = String(a?.value ?? "").trim();
    if (!v) continue;
    if (v.toLowerCase().startsWith("ipfs://")) {
      return v.slice(7).split(/[/?#]/)[0];
    }
    return v.split(/[/?#]/)[0];
  }

  // Fallback legado por si alguna vez existió este shape alternativo.
  const ciphertextCid = meta?.encryptedAudio?.ciphertextCid;
  return typeof ciphertextCid === "string" ? ciphertextCid : "";
}

function extractIsEncrypted(meta: any): boolean {
  if (meta?.encryptedAudio?.encrypted === true) return true;
  const protAttr = (meta?.attributes ?? []).find(
    (a: any) => a.trait_type === "Protección" || a.trait_type === "Encrypted",
  );
  return protAttr?.value === "Cifrado" || protAttr?.value === true;
}

async function fetchMetadataJSON(ipfsCid: string): Promise<any> {
  const urls = LighthouseService.metadataFetchUrls(ipfsCid);
  let lastError: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error(`No se pudo obtener metadata para CID ${ipfsCid}`);
}

async function enrichWork(work: IndexedWork): Promise<WorkWithMetadata> {
  try {
    const meta = await fetchMetadataJSON(work.ipfsCid);
    const coverUrls = coverUrlsFromImage(meta?.image);
    return {
      ...work,
      title: meta?.name,
      artist: extractArtist(meta?.attributes),
      coverUrl: coverUrls[0],
      coverUrls,
      audioCid: extractAudioCid(meta),
      isEncrypted: extractIsEncrypted(meta),
    };
  } catch (err) {
    return { ...work, metadataError: (err as Error).message };
  }
}

export function useIndexedWorks(address?: string) {
  const [works, setWorks] = useState<WorkWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!address) {
      setWorks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const indexed = await getWorksByAuthor(address);
      const enriched = await Promise.all(indexed.map(enrichWork));
      setWorks(enriched);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { works, loading, error, reload };
}