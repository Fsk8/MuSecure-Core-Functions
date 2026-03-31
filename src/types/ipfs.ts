/**
 * MuSecure – types/ipfs.ts
 */

export interface MuSecureMetadata {
  schemaVersion: "1.0";
  title: string;
  artist: string;
  description?: string;
  createdAt: string;
  ownerAddress: string;

  fingerprint: {
    sha256: string;
    data: number[];
    durationSec: number;
    algorithm: "musecure-v1";
  };

  encryptedAudio: {
    ciphertextCid: string;
    /** true = encriptado con Lit, false = público */
    encrypted: boolean;
    dataToEncryptHash: string;
    /** null si el audio es público */
    accessConditions: string | null;
    /** null si el audio es público */
    litNetwork: string | null;
    originalFileName: string;
    mimeType: string;
    originalSizeBytes: number;
  };

  artwork?: {
    cid: string;
    mimeType: string;
  };
}

export interface IPFSUploadResult {
  metadataCid: string;
  metadataUrl: string;
  audioCid: string;
  artworkCid?: string;
  metadata: MuSecureMetadata;
}

export type UploadStage =
  | "idle"
  | "encrypting"
  | "uploading-audio"
  | "uploading-artwork"
  | "uploading-metadata"
  | "done"
  | "error";

export interface UploadProgress {
  stage: UploadStage;
  percent: number;
  message: string;
}