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
    encrypted: boolean;
    dataToEncryptHash: string;
    accessConditions: string | null;
    litNetwork: string | null;
    originalFileName: string;
    mimeType: string;
    originalSizeBytes: number;
  };

  artwork?: {
    cid: string;
    mimeType: string;
  };

  // ✨ NUEVO: MusicBrainz verification (OPCIONAL - no rompe nada)
  musicbrainz?: {
    recordingId: string;
    title: string;
    artist: string;
    releaseTitle?: string;
    scorePercent: number;
    verifiedAt: string;
    matchSource: "acoustid" | "musicbrainz";
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