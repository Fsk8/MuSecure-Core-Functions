/**
 * MuSecure – IPFSUploadForm
 *
 * Si hay match de MB → autocompletar título/artista y bloquear inputs
 * Si no → inputs editables normalmente
 * CORRECCIÓN: Sincronización de estado para desbloqueo inmediato del botón al hacer match.
 */

import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { LighthouseService } from "@/services/LighthouseService";
import { RegisterWorkButton } from "@/components/RegisterWorkButton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2, Lock, Unlock, Link2, Unlink2, Upload, Loader2,
  AlertTriangle, ExternalLink, ImageIcon,
} from "lucide-react";
import type { FingerprintResult } from "@/services/AudioFingerprintService";
import type { CatalogAuthenticityReport } from "@/types/acoustid";

interface Props {
  fingerprint: FingerprintResult;
  ownerAddress: string;
  audioFile: File;
  authenticityScore: number;
  catalogReport?: CatalogAuthenticityReport;
  /** Portada opcional (obras muy originales, sin match fuerte en catálogo). */
  optionalCoverArtEnabled?: boolean;
}

type UploadStage = "idle" | "uploading-audio" | "uploading-metadata" | "done" | "error";

export function IPFSUploadForm({
  fingerprint,
  ownerAddress,
  audioFile,
  authenticityScore,
  catalogReport,
  optionalCoverArtEnabled = false,
}: Props) {
  const { signMessage } = useWallet();

  // ── Detectar match de MB ──────────────────────────────────────────────────
  const mbMatch = catalogReport?.matches?.[0];
  const hasMBMatch = !!mbMatch && mbMatch.scorePercent >= 45;
  const isHighRisk = authenticityScore >= 2;

  // Estados locales
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [encrypt, setEncrypt] = useState(true);
  const [isSoulbound, setIsSoulbound] = useState(false);

  const [stage, setStage] = useState<UploadStage>("idle");
  const [stageMsg, setStageMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [audioCid, setAudioCid] = useState("");
  const [metadataCid, setMetadataCid] = useState("");
  const [coverArtFile, setCoverArtFile] = useState<File | null>(null);
  const [coverArtPreview, setCoverArtPreview] = useState<string | null>(null);

  // ✨ EFECTO DE SINCRONIZACIÓN: Desbloquea el botón cuando llega el reporte
  useEffect(() => {
    if (hasMBMatch && mbMatch) {
      setTitle(mbMatch.title ?? "");
      setArtist(mbMatch.artist ?? "");
    }
  }, [hasMBMatch, mbMatch]);

  useEffect(() => {
    if (!coverArtFile) {
      setCoverArtPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverArtFile);
    setCoverArtPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverArtFile]);

  const isUploading = stage === "uploading-audio" || stage === "uploading-metadata";
  const isDone = stage === "done";

  // Validación robusta para el botón
  const isMetadataIncomplete = !title.trim() || !artist.trim();

  const handleSubmit = async () => {
    if (isMetadataIncomplete) {
      setError("Por favor completa el título y el artista");
      return;
    }
    // Guard: signMessage no está listo si el iframe de Privy aún no cargó
    if (encrypt && !signMessage) {
      setError("La wallet aún no está lista. Espera unos segundos e intenta de nuevo.");
      return;
    }
    setError(null);
    const lh = LighthouseService.getInstance();

    try {
      // ── 1. Subir audio ────────────────────────────────────────────────────
      setStage("uploading-audio");
      setStageMsg(encrypt ? "Firmando y encriptando audio..." : "Subiendo audio a IPFS...");

      const audioResult = await lh.uploadAudio(
        audioFile,
        ownerAddress,
        encrypt,
        encrypt ? signMessage ?? undefined : undefined
      );
      setAudioCid(audioResult.cid);
      console.log("✅ Audio subido:", audioResult.cid);

      let artworkCid: string | undefined;
      if (optionalCoverArtEnabled && coverArtFile) {
        setStageMsg("Subiendo portada a IPFS...");
        const art = await lh.uploadPublic(
          coverArtFile,
          coverArtFile.name || "cover.jpg",
          undefined
        );
        artworkCid = art.cid;
      }

      // ── 2. Subir metadata ERC-721 JSON ────────────────────────────────────
      setStage("uploading-metadata");
      setStageMsg("Subiendo metadata a IPFS...");

      const mbInfo = hasMBMatch && mbMatch
        ? {
            recordingId: mbMatch.recordingId,
            releaseId: mbMatch.releaseId || null,
            title: mbMatch.title ?? title,
            artist: mbMatch.artist ?? artist,
            scorePercent: mbMatch.scorePercent,
            releaseTitle: mbMatch.releaseTitle,
          }
        : undefined;

      const mCid = await lh.uploadMetadata(
        title.trim(),
        artist.trim(),
        audioResult.cid,
        audioResult.encrypted,
        audioFile.type || "audio/mpeg",
        mbInfo,
        artworkCid
      );
      setMetadataCid(mCid);
      console.log("✅ Metadata subida:", mCid);

      lh.saveUploadRecord({
        metadataCid: mCid,
        audioCid: audioResult.cid,
        artworkCid,
        title: title.trim(),
        artist: artist.trim(),
        encrypted: audioResult.encrypted,
        uploadedAt: Date.now(),
        ownerAddress,
      });

      setStage("done");
      setStageMsg("");
    } catch (e: unknown) {
      console.error("❌ Error en upload:", e);
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
      setStage("error");
    }
  };

  const handleReset = () => {
    setStage("idle");
    setAudioCid("");
    setMetadataCid("");
    setError(null);
    if (!hasMBMatch) {
      setTitle("");
      setArtist("");
    }
    setCoverArtFile(null);
    setCoverArtPreview(null);
  };

  if (isDone && metadataCid) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <Card className="flex flex-col items-center gap-4 text-center p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="font-display text-xl font-bold text-white">¡Subida Exitosa a IPFS!</h3>

          {hasMBMatch && (
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 px-3 py-1">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Verificado en MusicBrainz
            </Badge>
          )}

          <div className="w-full space-y-1 text-left">
            <p className="font-mono text-[10px] text-zinc-500">Audio: {audioCid.slice(0, 20)}...</p>
            <p className="font-mono text-[10px] text-emerald-500">Certificado: {metadataCid.slice(0, 20)}...</p>
          </div>

          {isHighRisk ? (
            <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <p className="font-mono text-xs font-bold uppercase text-amber-500">Registro Blockchain Bloqueado</p>
              </div>
              <p className="text-xs text-zinc-400">
                Esta obra tiene coincidencias significativas. No puede registrarse en blockchain.
              </p>
            </div>
          ) : (
            <div className="w-full">
              <RegisterWorkButton
                fingerprint={`0x${fingerprint.sha256}`}
                ipfsCid={metadataCid}
                authenticityScore={authenticityScore}
                soulbound={isSoulbound}
                title={title}
              />
            </div>
          )}

          <Button variant="outline" onClick={handleReset} className="w-full">
            Subir Otra Obra
          </Button>
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className="space-y-6">
      <div className="border-b border-surface-border pb-4">
        <h3 className="font-display text-lg font-bold text-white">Configuración</h3>
        <p className="mt-1 font-mono text-[10px] text-zinc-500">Almacenamiento en Lighthouse (IPFS)</p>
      </div>

      {hasMBMatch && mbMatch && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-400" />
            <p className="font-mono text-xs font-bold uppercase text-blue-400">
              Obra Reconocida en MusicBrainz
            </p>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            {mbMatch.title} — {mbMatch.artist}
            {mbMatch.releaseTitle && <span className="text-zinc-500"> · {mbMatch.releaseTitle}</span>}
          </p>
          <p className="mt-1 font-mono text-[10px] text-blue-400/60">Score: {mbMatch.scorePercent}%</p>
          {mbMatch.recordingId && (
            <a
              href={`https://musicbrainz.org/recording/${mbMatch.recordingId}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-mono text-[9px] text-blue-400/60 hover:text-blue-400 transition-colors"
            >
              Ver en MusicBrainz <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      )}

      <div className="space-y-4">
        {optionalCoverArtEnabled && !isHighRisk && (
          <div className="rounded-2xl border border-dashed border-emerald-500/25 bg-emerald-500/[0.03] p-4">
            <div className="mb-2 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-emerald-500/80" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                Portada opcional
              </span>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
              Obra muy original: puedes subir una imagen (JPG, PNG, WebP) para el certificado y el explorador.
            </p>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-surface-border bg-surface-overlay/50 px-3 py-2.5 transition-colors hover:border-emerald-500/30">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-border bg-black/40">
                {coverArtPreview ? (
                  <img src={coverArtPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-zinc-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {coverArtFile ? coverArtFile.name : "Elegir imagen"}
                </p>
                <p className="font-mono text-[9px] text-zinc-600">Opcional · máx. recomendado 5 MB</p>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 6 * 1024 * 1024) {
                    setError("La imagen supera 6 MB. Elige un archivo más pequeño.");
                    return;
                  }
                  setCoverArtFile(f);
                  setError(null);
                }}
              />
            </label>
            {coverArtFile && (
              <button
                type="button"
                className="mt-2 font-mono text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-400 hover:underline"
                onClick={() => {
                  setCoverArtFile(null);
                  setCoverArtPreview(null);
                }}
              >
                Quitar imagen
              </button>
            )}
          </div>
        )}

        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            Título {hasMBMatch && <span className="text-blue-400/60">(verificado)</span>}
          </label>
          <Input
            type="text"
            value={title}
            onChange={(e) => !hasMBMatch && setTitle(e.target.value)}
            placeholder="Título de la obra"
            disabled={isUploading || hasMBMatch}
            readOnly={hasMBMatch}
            className={hasMBMatch ? "border-blue-500/30 bg-blue-500/5 cursor-not-allowed opacity-80" : ""}
          />
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            Artista {hasMBMatch && <span className="text-blue-400/60">(verificado)</span>}
          </label>
          <Input
            type="text"
            value={artist}
            onChange={(e) => !hasMBMatch && setArtist(e.target.value)}
            placeholder="Nombre del Artista"
            disabled={isUploading || hasMBMatch}
            readOnly={hasMBMatch}
            className={hasMBMatch ? "border-blue-500/30 bg-blue-500/5 cursor-not-allowed opacity-80" : ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => !isUploading && setEncrypt(!encrypt)}
          disabled={isUploading}
          className={`flex items-center gap-3 rounded-2xl border p-4 transition-all ${
            encrypt ? "border-violet/30 bg-violet-glow" : "border-surface-border bg-surface-overlay"
          }`}
        >
          {encrypt ? <Lock className="h-4 w-4 text-violet" /> : <Unlock className="h-4 w-4 text-zinc-500" />}
          <div className="text-left">
            <p className={`text-sm font-bold ${encrypt ? "text-violet" : "text-zinc-400"}`}>
              {encrypt ? "Encriptado" : "Público"}
            </p>
            <p className="text-[10px] text-zinc-600">Privacidad</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => !isUploading && !isHighRisk && setIsSoulbound(!isSoulbound)}
          disabled={isUploading || isHighRisk}
          className={`flex items-center gap-3 rounded-2xl border p-4 transition-all ${
            isSoulbound && !isHighRisk
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-surface-border bg-surface-overlay"
          } ${isHighRisk ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          {isSoulbound && !isHighRisk
            ? <Link2 className="h-4 w-4 text-emerald-500" />
            : <Unlink2 className="h-4 w-4 text-zinc-500" />}
          <div className="text-left">
            <p className={`text-sm font-bold ${isSoulbound && !isHighRisk ? "text-emerald-500" : "text-zinc-400"}`}>
              {isSoulbound ? "Soulbound" : "Transferible"}
            </p>
            <p className="text-[10px] text-zinc-600">{isHighRisk ? "No disponible" : "Tipo de NFT"}</p>
          </div>
        </button>
      </div>

      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs font-bold text-emerald-500 truncate">{stageMsg}</p>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-emerald-500/20">
                  <motion.div
                    className="h-full rounded-full bg-emerald-500"
                    animate={{ width: stage === "uploading-audio" ? "45%" : "90%" }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-center font-mono text-[10px] text-red-400">{error}</p>}

      <Button
        onClick={handleSubmit}
        disabled={isMetadataIncomplete || isUploading || (encrypt && !signMessage)}
        className="w-full h-12"
        size="lg"
      >
        {isUploading ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{stageMsg}</>
        ) : encrypt && !signMessage ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Conectando wallet...</>
        ) : (
          <><Upload className="mr-2 h-4 w-4" />Subir a IPFS</>
        )}
      </Button>

      {!isUploading && isMetadataIncomplete && (
        <p className="text-center font-mono text-[9px] text-zinc-500">
          Completa título y artista para continuar
        </p>
      )}
    </Card>
  );
}