/**
 * MuSecure – services/LighthouseService.ts
 *
 * Usa "as any" para el SDK de Lighthouse — evita errores de tipos TS.
 */

function getApiKey(): string {
  const key = import.meta.env.VITE_LIGHTHOUSE_API_KEY as string;
  if (!key) throw new Error("Falta VITE_LIGHTHOUSE_API_KEY en las variables de entorno");
  return key;
}

export interface UploadResult {
  cid: string;
  url: string;
  encrypted: boolean;
}

export interface LocalUploadRecord {
  metadataCid: string;
  audioCid: string;
  artworkCid?: string;
  title: string;
  artist: string;
  encrypted: boolean;
  uploadedAt: number;
  ownerAddress: string;
}

/** Metadata ERC-721 estándar — este CID va al contrato para el mint */
export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  animation_url: string;
  attributes: Array<{ trait_type: string; value: string | boolean }>;
}

const LS_KEY = "musecure:uploads";

export class LighthouseService {
  private static instance: LighthouseService | null = null;
  private constructor() {}

  static getInstance(): LighthouseService {
    if (!LighthouseService.instance) {
      LighthouseService.instance = new LighthouseService();
    }
    return LighthouseService.instance;
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private async getLh(): Promise<any> {
    return ((await import("@lighthouse-web3/sdk")) as any).default;
  }

  private static extractCid(data: unknown): string {
    const tryExtract = (v: unknown): string | null => {
      if (!v) return null;
      if (Array.isArray(v)) return tryExtract(v[0]);
      if (typeof v === "object") {
        const obj = v as any;
        if (obj.Hash) return obj.Hash;
        if (obj.cid) return obj.cid;
        if (obj.data) return tryExtract(obj.data);
      }
      return null;
    };
    const cid = tryExtract(data);
    if (!cid) throw new Error("Lighthouse no devolvió un CID válido.");
    return cid;
  }

  // ── Upload Audio ──────────────────────────────────────────────────────────

  async uploadAudio(
    file: File,
    ownerAddress: string,
    encrypt: boolean,
    signMessage?: (msg: string) => Promise<string>,
    onProgress?: (pct: number) => void
  ): Promise<UploadResult> {
    const lh = await this.getLh();
    const apiKey = getApiKey();

    if (encrypt) {
      if (typeof signMessage !== "function") {
        throw new Error("Se requiere firma para encriptar.");
      }
      const authRes = await lh.getAuthMessage(ownerAddress);
      const message: string | undefined = (authRes as any)?.data?.message;
      if (!message) throw new Error("No se pudo obtener mensaje de autenticación de Lighthouse.");
      const signature = await signMessage(message);

      let response: any;
      try {
        response = await lh.uploadEncrypted([file], apiKey, ownerAddress, signature);
      } catch (e) {
        throw new Error(`Error encriptando: ${(e as Error)?.message}`);
      }
      const cid = LighthouseService.extractCid(response?.data ?? response);
      return { cid, url: LighthouseService.gatewayUrl(cid), encrypted: true };
    } else {
      return this.uploadPublic(file, file.name, onProgress);
    }
  }

  // ── Upload Public (alias simplificado) ───────────────────────────────────

  async uploadPublic(
    file: File | Blob,
    fileName: string,
    onProgress?: (pct: number) => void
  ): Promise<UploadResult> {
    const lh = await this.getLh();
    const apiKey = getApiKey();
    const blob = file instanceof File ? file : new File([file], fileName, { type: file.type });

    let response: any;
    try {
      response = await lh.upload([blob], apiKey, {
        cidVersion: 1,
        onProgress: onProgress
          ? (data: { progress: number }) => onProgress(data.progress)
          : undefined,
      });
    } catch (e) {
      throw new Error(`Error en carga pública: ${(e as Error)?.message}`);
    }
    const cid = LighthouseService.extractCid(response?.data ?? response);
    return { cid, url: LighthouseService.gatewayUrl(cid), encrypted: false };
  }

  // ── Upload Metadata ERC-721 ───────────────────────────────────────────────
  /**
   * Genera y sube a IPFS el JSON de metadata NFT estándar.
   *
   * IMPORTANTE: El CID devuelto es el que va al contrato inteligente (registerWork),
   * NO el CID del audio. El audio se referencia dentro del JSON como animation_url.
   *
   * @returns CID del JSON de metadata
   */
  // Modifica solo esta función dentro de LighthouseService.ts
  async uploadMetadata(
    title: string,
    artist: string,
    audioCid: string,
    isEncrypted: boolean,
    mimeType: string
  ): Promise<string> {
    try {
      const lh = await this.getLh();
      const apiKey = getApiKey();

      // Estructura compatible con marketplaces y exploradores
      const nftMetadata: NFTMetadata = {
        name: title, // Aquí se reutiliza el título del form
        description: `Certificado de Autenticidad MuSecure para la obra "${title}" de ${artist}.`,
        image: "ipfs://QmYwAP...tu_logo_o_cover_aqui", // Podrías pasar un artworkCid si lo tienes
        animation_url: isEncrypted ? "" : `ipfs://${audioCid}`, // Solo visible si es público
        attributes: [
          { trait_type: "Artista", value: artist },
          { trait_type: "Protección", value: isEncrypted ? "Cifrado" : "Público" },
          { trait_type: "Tipo de Archivo", value: mimeType }
        ],
      };

      const jsonStr = JSON.stringify(nftMetadata);
      const res = await lh.uploadText(jsonStr, apiKey);
      
      // El SDK de Lighthouse a veces devuelve el CID en res.data.Hash o res.Hash
      const mCid = (res as any)?.data?.Hash || (res as any)?.Hash;
      if (!mCid) throw new Error("Error al obtener CID de metadata");

      return mCid;
    } catch (err) {
      console.error("[Lighthouse] uploadMetadata error:", err);
      throw err;
    }
  }

  // ── Upload JSON (genérico) ────────────────────────────────────────────────

  async uploadJSON(data: unknown, fileName: string): Promise<UploadResult> {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    return this.uploadPublic(blob, fileName);
  }

  // ── Local Storage ─────────────────────────────────────────────────────────

  saveUploadRecord(record: LocalUploadRecord): void {
    const all = this.getAllRecords();
    const deduped = all.filter((r) => r.metadataCid !== record.metadataCid);
    deduped.unshift(record);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(deduped));
    } catch {
      console.warn("LocalStorage lleno — registro no guardado.");
    }
  }

  getRecordsByOwner(ownerAddress: string): LocalUploadRecord[] {
    return this.getAllRecords().filter(
      (r) => r.ownerAddress.toLowerCase() === ownerAddress.toLowerCase()
    );
  }

  private getAllRecords(): LocalUploadRecord[] {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as LocalUploadRecord[]) : [];
    } catch {
      return [];
    }
  }

  async listUploads(lastKey: string | null = null): Promise<any[]> {
    try {
      const lh = await this.getLh();
      const apiKey = getApiKey();
      const res = await lh.getUploads(apiKey, lastKey as any);
      return (res as any)?.data?.fileList ?? [];
    } catch (err) {
      console.error("[Lighthouse] listUploads error:", err);
      return [];
    }
  }

  // ── URL Helpers ───────────────────────────────────────────────────────────

  /** URL del gateway para metadata JSON y uso interno */
  static gatewayUrl(cid: string): string {
    if (!cid) return "";
    const isDev = import.meta.env.DEV;
    if (isDev) return `/ipfs-proxy/ipfs/${cid}`;
    return `https://gateway.lighthouse.storage/ipfs/${cid}`;
  }

  /**
   * URL para reproducción de audio en el navegador.
   * ?filename=audio.mp3 evita que el gateway fuerce descarga.
   */
  static audioUrl(cid: string, mimeType = "audio/mpeg"): string {
    if (!cid) return "";
    const ext = mimeType.includes("ogg") ? "ogg"
      : mimeType.includes("wav") ? "wav"
      : mimeType.includes("aac") ? "aac"
      : "mp3";
    return `${LighthouseService.gatewayUrl(cid)}?filename=audio.${ext}`;
  }
}