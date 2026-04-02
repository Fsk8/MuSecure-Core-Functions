/**
 * MuSecure – services/LighthouseService.ts
 * Implementación optimizada para despliegue en Vercel y uso compartido.
 */

import lighthouse from "@lighthouse-web3/sdk";

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

/** Registro que se persiste en localStorage por sesión/wallet */
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

  // ── Upload (Audio & General) ──────────────────────────────────────────────

  async uploadAudio(
    file: File,
    ownerAddress: string,
    encrypt: boolean,
    signMessage?: (msg: string) => Promise<string>,
    onProgress?: (pct: number) => void
  ): Promise<UploadResult> {
    const apiKey = getApiKey();

    if (encrypt) {
      if (typeof signMessage !== "function") {
        throw new Error("Se requiere firmar el mensaje para encriptar la obra.");
      }

      const authMessage = await lighthouse.getAuthMessage(ownerAddress);
      const message = authMessage?.data?.message;
      
      if (!message) {
        throw new Error("No se pudo obtener el mensaje de autenticación de Lighthouse.");
      }
      
      const signature = await signMessage(message);

      let response: any;
      try {
        response = await lighthouse.uploadEncrypted(
          [file],
          apiKey,
          ownerAddress,
          signature
        );
      } catch (e) {
        throw new Error(`Error en carga encriptada: ${(e as Error)?.message}`);
      }

      const cid = LighthouseService.extractCid(response.data || response);
      return { cid, url: LighthouseService.gatewayUrl(cid), encrypted: true };
    } else {
      return this.uploadPublic(file, file.name, onProgress);
    }
  }

  async uploadPublic(
    file: File | Blob,
    fileName: string,
    onProgress?: (pct: number) => void
  ): Promise<UploadResult> {
    const apiKey = getApiKey();
    const blob = file instanceof File ? file : new File([file], fileName, { type: file.type });

    let response: any;
    try {
      response = await lighthouse.upload(
        [blob],
        apiKey,
        {
          cidVersion: 1,
          onProgress: onProgress
            ? (data: { progress: number }) => onProgress(data.progress)
            : undefined,
        }
      );
    } catch (e) {
      throw new Error(`Error en carga pública: ${(e as Error)?.message}`);
    }

    const cid = LighthouseService.extractCid(response.data || response);
    return { cid, url: LighthouseService.gatewayUrl(cid), encrypted: false };
  }

  async uploadJSON(data: unknown, fileName: string): Promise<UploadResult> {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    return this.uploadPublic(blob, fileName);
  }

  // ── Gestión de Registros (Local & Global) ────────────────────────────────

  saveUploadRecord(record: LocalUploadRecord): void {
    const all = this.getAllRecords();
    const deduped = all.filter((r) => r.metadataCid !== record.metadataCid);
    deduped.unshift(record);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(deduped));
    } catch {
      console.warn("LocalStorage lleno, el registro no se guardó localmente.");
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

  /** * Retorna la lista global de archivos vinculados a la API Key.
   * Ideal para el componente "Explorer".
   */
  async listUploads(lastKey: string | null = null): Promise<any[]> {
    try {
      const apiKey = getApiKey();
      const res = await lighthouse.getUploads(apiKey, lastKey as any);
      return (res as any)?.data?.fileList || [];
    } catch (error) {
      console.error("Error al listar archivos de la API Key:", error);
      return [];
    }
  }

  // ── Helpers de Infraestructura ───────────────────────────────────────────

  /** Genera la URL para acceder al archivo vía IPFS Gateway */
  static gatewayUrl(cid: string): string {
    // Detectamos si estamos en desarrollo para usar el proxy de Vite
    const isDev = import.meta.env.DEV;
    if (isDev) {
      return `/ipfs-proxy/ipfs/${cid}`;
    }
    // En producción (Vercel) usamos el gateway oficial
    return `https://gateway.lighthouse.storage/ipfs/${cid}`;
  }

  /** Extrae el CID de manera robusta según la respuesta de la API */
  private static extractCid(data: unknown): string {
    const tryExtract = (v: unknown): string | null => {
      if (!v) return null;
      if (Array.isArray(v)) return tryExtract(v[0]);
      if (typeof v === "object") {
        const obj = v as any;
        // Buscamos 'Hash' (común en Lighthouse) o 'cid'
        if (obj.Hash) return obj.Hash;
        if (obj.cid) return obj.cid;
        if (obj.data) return tryExtract(obj.data);
      }
      return null;
    };

    const cid = tryExtract(data);
    if (cid) return cid;

    throw new Error("Lighthouse no devolvió un CID válido en la respuesta.");
  }
}