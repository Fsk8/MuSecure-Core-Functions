/**
 * MuSecure – IPFSUploadForm
 *
 * Fix s11: usa useWallet() en lugar de signMessage de usePrivy().
 * Flujo: uploadAudio → uploadMetadata (ERC-721 JSON) → RegisterWorkButton con metadataCid.
 */

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { LighthouseService } from "@/services/LighthouseService";
import { RegisterWorkButton } from "@/components/RegisterWorkButton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2, Lock, Unlock, Link2, Unlink2, Upload, Loader2,
} from "lucide-react";
import type { FingerprintResult } from "@/services/AudioFingerprintService";

interface Props {
  fingerprint: FingerprintResult;
  ownerAddress: string;
  audioFile: File;
  authenticityScore: number;
}

type UploadStage = "idle" | "uploading-audio" | "uploading-metadata" | "done" | "error";

export function IPFSUploadForm({
  fingerprint,
  ownerAddress,
  audioFile,
  authenticityScore,
}: Props) {
  const { signMessage } = useWallet();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [encrypt, setEncrypt] = useState(true);
  const [isSoulbound, setIsSoulbound] = useState(false);

  const [stage, setStage] = useState<UploadStage>("idle");
  const [stageMsg, setStageMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  // CIDs resultantes
  const [audioCid, setAudioCid] = useState("");
  const [metadataCid, setMetadataCid] = useState("");

  const isUploading = stage === "uploading-audio" || stage === "uploading-metadata";
  const isDone = stage === "done";

  const handleSubmit = async () => {
    if (!title.trim() || !artist.trim()) return;
    setError(null);
    const lh = LighthouseService.getInstance();

    try {
      // ── Paso 1: subir audio ────────────────────────────────────────────────
      setStage("uploading-audio");
      setStageMsg(encrypt ? "Firmando y encriptando audio..." : "Subiendo audio a IPFS...");

      const audioResult = await lh.uploadAudio(
        audioFile,
        ownerAddress,
        encrypt,
        encrypt ? signMessage ?? undefined : undefined
      );
      setAudioCid(audioResult.cid);

      // ── Paso 2: subir metadata ERC-721 ────────────────────────────────────
      // El metadataCid es el que va al contrato, NO el audioCid
      setStage("uploading-metadata");
      setStageMsg("Subiendo metadata a IPFS...");

      const mCid = await lh.uploadMetadata(
        title.trim(),
        artist.trim(),
        audioResult.cid,
        audioResult.encrypted,
        audioFile.type || "audio/mpeg"
      );
      setMetadataCid(mCid);

      // Guardar en localStorage para el Dashboard local
      lh.saveUploadRecord({
        metadataCid: mCid,
        audioCid: audioResult.cid,
        title: title.trim(),
        artist: artist.trim(),
        encrypted: audioResult.encrypted,
        uploadedAt: Date.now(),
        ownerAddress,
      });

      setStage("done");
      setStageMsg("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
      setStage("error");
    }
  };

  // Post-upload: mostrar botón de registro on-chain
  if (isDone && metadataCid) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Card className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="font-display text-xl font-bold text-white">Subida exitosa</h3>
          <p className="font-mono text-[10px] text-zinc-500">
            Audio: {audioCid.slice(0, 12)}...
          </p>
          <p className="font-mono text-[10px] text-emerald-500">
            Certificado: {metadataCid.slice(0, 12)}...
          </p>
          {/* RegisterWorkButton recibe el metadataCid (JSON ERC-721), NO el audioCid */}
          <RegisterWorkButton
            fingerprintHash={`0x${fingerprint.sha256}`}
            ipfsCid={metadataCid}
            authenticityScore={authenticityScore}
            soulbound={isSoulbound}
          />
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className="space-y-6">
      <h3 className="border-b border-surface-border pb-4 font-display text-lg font-bold text-white">
        Configuración
      </h3>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título de la obra"
            disabled={isUploading}
          />
          <Input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Nombre del Artista"
            disabled={isUploading}
          />
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setEncrypt(!encrypt)}
            disabled={isUploading}
            className={`flex w-full items-center gap-3 rounded-2xl border p-4 transition-all ${
              encrypt
                ? "border-violet/30 bg-violet-glow"
                : "border-surface-border bg-surface-overlay"
            }`}
            aria-pressed={encrypt}
          >
            {encrypt
              ? <Lock className="h-4 w-4 text-violet" />
              : <Unlock className="h-4 w-4 text-zinc-500" />}
            <div className="text-left">
              <p className={`text-sm font-bold ${encrypt ? "text-violet" : "text-zinc-400"}`}>
                {encrypt ? "Encriptado" : "Público"}
              </p>
              <p className="text-[10px] text-zinc-600">Privacidad de Lighthouse</p>
            </div>
            <div className={`ml-auto h-3 w-3 rounded-full ${encrypt ? "bg-violet" : "bg-zinc-700"}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsSoulbound(!isSoulbound)}
            disabled={isUploading}
            className={`flex w-full items-center gap-3 rounded-2xl border p-4 transition-all ${
              isSoulbound
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-surface-border bg-surface-overlay"
            }`}
            aria-pressed={isSoulbound}
          >
            {isSoulbound
              ? <Link2 className="h-4 w-4 text-emerald-500" />
              : <Unlink2 className="h-4 w-4 text-zinc-500" />}
            <div className="text-left">
              <p className={`text-sm font-bold ${isSoulbound ? "text-emerald-500" : "text-zinc-400"}`}>
                {isSoulbound ? "Soulbound" : "Transferible"}
              </p>
              <p className="text-[10px] text-zinc-600">Propiedad del NFT</p>
            </div>
            <div className={`ml-auto h-3 w-3 rounded-full ${isSoulbound ? "bg-emerald-500" : "bg-zinc-700"}`} />
          </button>
        </div>
      </div>

      {/* Progress */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className={`h-2 w-2 rounded-full transition-colors ${stage === "uploading-audio" || stage === "uploading-metadata" ? "bg-emerald-500" : "bg-zinc-700"}`} />
                <div className={`h-2 w-2 rounded-full transition-colors ${stage === "uploading-metadata" ? "bg-emerald-500" : "bg-zinc-700"}`} />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-500">
                {stageMsg}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="text-center font-mono text-[10px] text-red-400">{error}</p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!title.trim() || !artist.trim() || isUploading}
        className="w-full"
        size="lg"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {stageMsg || "Subiendo..."}
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Subir a IPFS
          </>
        )}
      </Button>
    </Card>
  );
}