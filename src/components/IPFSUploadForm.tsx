/**
 * MuSecure – components/IPFSUploadForm.tsx
 *
 * En App.tsx:
 *   import { useAccount, useSignMessage } from "wagmi"
 *   const { address } = useAccount()
 *   const { signMessageAsync } = useSignMessage()
 *
 *   {fpResult && address && (
 *     <IPFSUploadForm
 *       fingerprint={fpResult}
 *       audioFile={file}
 *       ownerAddress={address}
 *       signMessage={signMessageAsync}
 *     />
 *   )}
 */

import { useState } from "react";
import { useIPFSUpload } from "@/hooks/useIPFSUpload";
import type { FingerprintResult } from "@/services/AudioFingerprintService";
import { LighthouseService } from "@/services/LighthouseService";

interface Props {
  fingerprint: FingerprintResult;
  ownerAddress: string;
  audioFile: File;
  signMessage: (message: string) => Promise<string>;
}

export function IPFSUploadForm({ fingerprint, ownerAddress, audioFile, signMessage }: Props) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [description, setDescription] = useState("");
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [encrypt, setEncrypt] = useState(true);

  const { upload, progress, result, error, reset } = useIPFSUpload();

  const isUploading =
    progress.stage !== "idle" &&
    progress.stage !== "done" &&
    progress.stage !== "error";

  const handleArtwork = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setArtworkFile(file);
    setArtworkPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !artist.trim()) return;
    await upload({
      audioFile,
      artworkFile: artworkFile ?? undefined,
      ownerAddress,
      signMessage: encrypt ? signMessage : undefined,
      encrypt,
      title: title.trim(),
      artist: artist.trim(),
      description: description.trim() || undefined,
      fingerprint: {
        sha256: fingerprint.sha256,
        data: fingerprint.fingerprint,
        durationSec: fingerprint.duration,
      },
    });
  };

  if (result) {
    return (
      <div className="upload-result">
        <h3>Obra subida a IPFS</h3>
        <dl>
          <dt>Metadata CID (registrar on-chain)</dt>
          <dd><code className="mono">{result.metadataCid}</code></dd>
          <dt>URL metadata</dt>
          <dd>
            <a href={result.metadataUrl} target="_blank" rel="noreferrer">
              {result.metadataUrl}
            </a>
          </dd>
          <dt>Audio {result.metadata.encryptedAudio.encrypted ? "🔒 encriptado" : "🌐 público"}</dt>
          <dd><code className="mono">{result.audioCid}</code></dd>
          {result.artworkCid && (
            <>
              <dt>Artwork</dt>
              <dd>
                <a href={LighthouseService.gatewayUrl(result.artworkCid)} target="_blank" rel="noreferrer">
                  Ver artwork →
                </a>
              </dd>
            </>
          )}
          <dt>SHA-256 (para el contrato)</dt>
          <dd><code className="mono small">0x{result.metadata.fingerprint.sha256}</code></dd>
        </dl>

        <button
          type="button"
          onClick={() =>
            console.log("→ on-chain:", {
              metadataCid: result.metadataCid,
              sha256: `0x${result.metadata.fingerprint.sha256}`,
            })
          }
        >
          Registrar en Arbitrum →
        </button>
        <button type="button" className="secondary" onClick={reset}>
          Subir otra obra
        </button>
      </div>
    );
  }

  return (
    <div className="ipfs-upload-form">
      <h3>Detalles de la obra</h3>

      <label>
        Título <span className="required">*</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nombre de la obra"
          disabled={isUploading}
        />
      </label>

      <label>
        Artista <span className="required">*</span>
        <input
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Tu nombre artístico"
          disabled={isUploading}
        />
      </label>

      <label>
        Descripción
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Contexto, letra, notas de producción…"
          rows={3}
          disabled={isUploading}
        />
      </label>

      <label>
        Artwork (opcional)
        <input type="file" accept="image/*" onChange={handleArtwork} disabled={isUploading} />
      </label>

      {artworkPreview && (
        <img src={artworkPreview} alt="Preview" style={{ maxWidth: 120, borderRadius: 8, marginTop: 8 }} />
      )}

      {/* ── Encryption toggle ─────────────────────────────────────────── */}
      <div className="encrypt-toggle" style={{ marginTop: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <div
            role="switch"
            aria-checked={encrypt}
            onClick={() => !isUploading && setEncrypt((v) => !v)}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              background: encrypt ? "var(--color-text-info, #2563eb)" : "var(--color-border-secondary)",
              position: "relative",
              transition: "background 0.2s",
              cursor: isUploading ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: encrypt ? 23 : 3,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </div>
          <div>
            <span style={{ fontWeight: 500, fontSize: 14 }}>
              {encrypt ? "🔒 Encriptado (solo tú)" : "🌐 Público"}
            </span>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
              {encrypt
                ? "El audio se encripta con Lit Protocol. Solo tu wallet puede acceder."
                : "El audio quedará público en IPFS. Útil para demos o releases abiertos."}
            </p>
          </div>
        </label>
      </div>

      {/* Fingerprint summary */}
      <div className="fingerprint-summary" style={{ marginTop: 12 }}>
        <span>🎵 {audioFile.name}</span>
        <span>{fingerprint.duration.toFixed(1)}s</span>
        <code className="mono small">0x{fingerprint.sha256.slice(0, 16)}…</code>
      </div>

      {isUploading && (
        <div className="upload-progress">
          <progress value={progress.percent} max={100} />
          <p>{progress.message} ({Math.round(progress.percent)}%)</p>
        </div>
      )}

      {error && <p className="err">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!title.trim() || !artist.trim() || isUploading}
        style={{ marginTop: 12 }}
      >
        {isUploading
          ? progress.message
          : encrypt
          ? "Encriptar y subir a IPFS"
          : "Subir a IPFS (público)"}
      </button>
    </div>
  );
}