/**
 * MuSecure – hooks/useIPFSUpload.ts
 */

import { useState, useCallback, useRef } from "react";
import { LighthouseService } from "@/services/LighthouseService";
import type { IPFSUploadResult, MuSecureMetadata, UploadProgress, UploadStage } from "@/types/ipfs";

export interface UploadInput {
  audioFile: File;
  artworkFile?: File;
  ownerAddress: string;
  signMessage?: (message: string) => Promise<string>;
  encrypt: boolean;
  title: string;
  artist: string;
  description?: string;
  fingerprint: { sha256: string; data: number[]; durationSec: number };
}

function prog(stage: UploadStage, percent: number, message: string): UploadProgress {
  return { stage, percent, message };
}

export function useIPFSUpload() {
  const [progress, setProgress] = useState<UploadProgress>(prog("idle", 0, ""));
  const [result, setResult] = useState<IPFSUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const upload = useCallback(async (input: UploadInput) => {
    abortRef.current = false;
    setResult(null);
    setError(null);
    const lh = LighthouseService.getInstance();

    try {
      // ── 1. Audio ──────────────────────────────────────────────────────
      setProgress(prog(
        input.encrypt ? "encrypting" : "uploading-audio",
        5,
        input.encrypt ? "Firmando con wallet y encriptando…" : "Subiendo audio a IPFS…"
      ));

      const audioResult = await lh.uploadAudio(
        input.audioFile,
        input.ownerAddress,
        input.encrypt,
        input.signMessage,
        (pct) => setProgress(prog("uploading-audio", 5 + pct * 0.4, "Subiendo audio…"))
      );

      if (abortRef.current) return;
      setProgress(prog("uploading-audio", 48, "Audio en IPFS ✓"));

      // ── 2. Artwork ────────────────────────────────────────────────────
      let artworkCid: string | undefined;
      if (input.artworkFile) {
        setProgress(prog("uploading-artwork", 52, "Subiendo artwork…"));
        const artResult = await lh.uploadPublic(
          input.artworkFile,
          input.artworkFile.name,
          (pct) => setProgress(prog("uploading-artwork", 52 + pct * 0.15, "Subiendo artwork…"))
        );
        artworkCid = artResult.cid;
      }

      if (abortRef.current) return;

      // ── 3. Metadata JSON ──────────────────────────────────────────────
      setProgress(prog("uploading-metadata", 72, "Construyendo metadata…"));

      const metadata: MuSecureMetadata = {
        schemaVersion: "1.0",
        title: input.title,
        artist: input.artist,
        description: input.description,
        createdAt: new Date().toISOString(),
        ownerAddress: input.ownerAddress,
        fingerprint: {
          sha256: input.fingerprint.sha256,
          data: input.fingerprint.data,
          durationSec: input.fingerprint.durationSec,
          algorithm: "musecure-v1",
        },
        encryptedAudio: {
          ciphertextCid: audioResult.cid,
          encrypted: audioResult.encrypted,
          dataToEncryptHash: input.fingerprint.sha256,
          accessConditions: input.encrypt
            ? JSON.stringify([{
                chain: "arbitrum", method: "", standardContractType: "",
                contractAddress: "",
                returnValueTest: { comparator: "=", value: input.ownerAddress.toLowerCase() },
                parameters: [":userAddress"],
              }])
            : null,
          litNetwork: input.encrypt ? "datil-dev" : null,
          originalFileName: input.audioFile.name,
          mimeType: input.audioFile.type || "audio/mpeg",
          originalSizeBytes: input.audioFile.size,
        },
        ...(artworkCid && input.artworkFile
          ? { artwork: { cid: artworkCid, mimeType: input.artworkFile.type || "image/jpeg" } }
          : {}),
      };

      setProgress(prog("uploading-metadata", 84, "Subiendo metadata a IPFS…"));
      const safeTitle = input.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const metaResult = await lh.uploadJSON(metadata, `musecure_${safeTitle}_metadata.json`);

      setProgress(prog("done", 100, "¡Listo!"));

      const uploadResult: IPFSUploadResult = {
        metadataCid: metaResult.cid,
        metadataUrl: metaResult.url,
        audioCid: audioResult.cid,
        artworkCid,
        metadata,
      };

      // ── Guardar en localStorage → Dashboard lo lee por wallet ─────────
      lh.saveUploadRecord({
        metadataCid: metaResult.cid,
        audioCid: audioResult.cid,
        artworkCid,
        title: input.title,
        artist: input.artist,
        encrypted: input.encrypt,
        uploadedAt: Date.now(),
        ownerAddress: input.ownerAddress,
      });

      setResult(uploadResult);
      return uploadResult;
    } catch (err) {
      const msg = (err as Error).message ?? "Error en la subida";
      setError(msg);
      setProgress(prog("error", 0, msg));
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    setProgress(prog("idle", 0, ""));
    setResult(null);
    setError(null);
  }, []);

  return { upload, progress, result, error, reset };
}