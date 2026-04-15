/**
 * MuSecure – services/LighthouseService.ts
 *
 * Usa "as any" para el SDK de Lighthouse — evita errores de tipos TS.
 * CORREGIDO: uploadMetadata ahora usa upload() en lugar de uploadText()
 * para que los metadatos sean accesibles públicamente en IPFS.
 * MEJORADO: Sube metadatos con nombre descriptivo y tipo MIME correcto.
 * PROXY: Usa /api/ipfs/ en producción para evitar CORS y rate limiting.
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
   * ✨ MEJORADO: Usa un nombre de archivo descriptivo para que sea fácil de identificar.
   *
   * @returns CID del JSON de metadata
   */
  async uploadMetadata(
    title: string,
    artist: string,
    audioCid: string,
    isEncrypted: boolean,
    mimeType: string,
    mbInfo?: { recordingId: string; title: string; artist: string; scorePercent: number; releaseTitle?: string; releaseId?: string | null; }
  ): Promise<string> {
    try {
      const lh = await this.getLh();
      const apiKey = getApiKey();

      // Estructura compatible con marketplaces y exploradores
      const attributes: Array<{ trait_type: string; value: string | boolean }> = [
        { trait_type: "Artista", value: artist },
        { trait_type: "Protección", value: isEncrypted ? "Cifrado" : "Público" },
        { trait_type: "Tipo de Archivo", value: mimeType }
      ];
      
      // Agregar MusicBrainz info si existe
      if (mbInfo) {
        attributes.push({
          trait_type: "MusicBrainz",
          value: JSON.stringify(mbInfo)
        });
      }

      const nftMetadata: NFTMetadata = {
        name: title,
        description: `Certificado de Autenticidad MuSecure para la obra "${title}" de ${artist}.`,
        image: "ipfs://bafybeibvbfxhsexhqy6mipbqk7qmlolhynxfhqq7c7h4yzb5pcl5u4ixe4",
        animation_url: isEncrypted ? "" : `ipfs://${audioCid}`,
        attributes,
      };

      const jsonStr = JSON.stringify(nftMetadata);
      const blob = new Blob([jsonStr], { type: "application/json" });
      
      // ✨ MEJORA: Nombre de archivo descriptivo
      const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `metadata_${Date.now()}_${safeTitle}.json`;
      
      console.log('📤 Subiendo metadata pública:', { title, fileName, size: jsonStr.length });
      
      const response = await lh.upload([blob], apiKey, {
        cidVersion: 1,
      });
      
      const mCid = LighthouseService.extractCid(response?.data ?? response);
      
      if (!mCid) {
        throw new Error("Error al obtener CID de metadata");
      }
      
      console.log('✅ Metadata pública subida:', mCid);
      console.log('🔗 URL pública:', LighthouseService.gatewayUrl(mCid));

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
    // En producción, usar el proxy de Vercel para evitar CORS y rate limiting
    if (!import.meta.env.DEV) {
      return `/api/ipfs/${cid}`;
    }
    // En desarrollo, usar el gateway directo (o el proxy de Vite si lo tienes)
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
    
    // En producción, usar el proxy de Vercel
    if (!import.meta.env.DEV) {
      return `/api/ipfs/${cid}?filename=audio.${ext}`;
    }
    return `https://gateway.lighthouse.storage/ipfs/${cid}?filename=audio.${ext}`;
  }
}