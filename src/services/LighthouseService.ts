/**
 * MuSecure – services/LighthouseService.ts
 * Instalar: npm install @lighthouse-web3/sdk
 */

import lighthouse from "@lighthouse-web3/sdk";

function getApiKey(): string {
  const key = import.meta.env.VITE_LIGHTHOUSE_API_KEY as string;
  if (!key) throw new Error("Falta VITE_LIGHTHOUSE_API_KEY en .env");
  return key;
}

export interface UploadResult {
  cid: string;
  url: string;
  encrypted: boolean;
}

/** Registro que se persiste en localStorage por wallet */
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

  // ── Upload ────────────────────────────────────────────────────────────────

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
        throw new Error("signMessage requerido para encriptar");
      }

      const authMessage = await lighthouse.getAuthMessage(ownerAddress);
      const message = authMessage?.data?.message;
      if (typeof message !== "string" || !message.trim()) {
        throw new Error(
          "Lighthouse no devolvió mensaje de autenticación (revisa CSP y conexión a encryption.lighthouse.storage)"
        );
      }
      const signature = await signMessage(message);

      let response: { data: unknown };
      try {
        response = (await lighthouse.uploadEncrypted(
          [file],
          apiKey,
          ownerAddress,
          signature
        )) as { data: unknown };
      } catch (e) {
        throw new Error(
          `Lighthouse uploadEncrypted falló: ${(e as Error)?.message ?? String(e)}`
        );
      }

      const cid = LighthouseService.extractCid(response.data ?? response);
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
    const blob =
      file instanceof File ? file : new File([file], fileName, { type: file.type });

    let response: { data: unknown };
    try {
      response = (await lighthouse.upload(
        [blob],
        apiKey,
        {
          cidVersion: 1,
          onProgress: onProgress
            ? (data: { progress: number }) => onProgress(data.progress)
            : undefined,
        }
      )) as { data: unknown };
    } catch (e) {
      throw new Error(
        `Lighthouse upload falló: ${(e as Error)?.message ?? String(e)}`
      );
    }

    const cid = LighthouseService.extractCid(response.data ?? response);
    return { cid, url: LighthouseService.gatewayUrl(cid), encrypted: false };
  }

  async uploadJSON(data: unknown, fileName: string): Promise<UploadResult> {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    return this.uploadPublic(blob, fileName);
  }

  // ── Registro local por wallet ─────────────────────────────────────────────

  saveUploadRecord(record: LocalUploadRecord): void {
    const all = this.getAllRecords();
    // Evitar duplicados por metadataCid
    const deduped = all.filter((r) => r.metadataCid !== record.metadataCid);
    deduped.unshift(record);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(deduped));
    } catch {
      console.warn("localStorage lleno — registro no guardado");
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

  // ── Lighthouse getUploads (lista de la API key, no por wallet) ────────────
  // Útil para debug — no filtrar por wallet aquí porque publicKey
  // corresponde a la API key, no al usuario conectado.

  async listUploads(lastKey: string | null = null): Promise<
    Array<{
      publicKey: string;
      fileName: string;
      mimeType: string;
      txHash: string;
      status: string;
      createdAt: number;
      fileSizeInBytes: string;
      cid: string;
      id: string;
      lastUpdate: number;
      encryption: boolean;
    }>
  > {
    const apiKey = getApiKey();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await lighthouse.getUploads(apiKey, lastKey as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (res as any)?.data?.fileList;
    if (!Array.isArray(list)) return [];
    return list;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  static gatewayUrl(cid: string): string {
    // En dev usamos el proxy de Vite (/ipfs-proxy) para evitar el bloqueo COEP.
    // En producción necesitarás un proxy equivalente en tu CDN/servidor.
    const isDev = import.meta.env.DEV;
    if (isDev) return `/ipfs-proxy/ipfs/${cid}`;
    return `https://gateway.lighthouse.storage/ipfs/${cid}`;
  }

  private static extractCid(data: unknown): string {
    const tryExtract = (v: unknown): string | null => {
      if (!v) return null;
      if (Array.isArray(v)) return tryExtract(v[0]);
      if (typeof v === "object") {
        const obj = v as Record<string, unknown>;
        if (typeof obj.Hash === "string" && obj.Hash) return obj.Hash;
        if (obj.data !== undefined) return tryExtract(obj.data);
      }
      return null;
    };

    const cid = tryExtract(data);
    if (cid) return cid;

    let preview: string;
    try {
      const s = JSON.stringify(data);
      preview = typeof s === "string" ? s : String(data);
    } catch {
      preview = String(data);
    }
    if (preview.length > 800) preview = preview.slice(0, 800) + "…";

    throw new Error(
      `Lighthouse no devolvió CID. Puede ser API key inválida o sin cuota (403). Respuesta: ${preview}`
    );
  }
}