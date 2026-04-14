/**
 * MuSecure – IPFSUploadForm
 * Flujo: uploadAudio → uploadMetadata (ERC-721 JSON) → RegisterWorkButton con metadataCid.
 * 
 * MODIFICADO PARA DEMO: Permite subir a IPFS obras con match de MB,
 * pero muestra advertencia y bloquea el registro en blockchain.
 */

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { LighthouseService } from "@/services/LighthouseService";
import { RegisterWorkButton } from "@/components/RegisterWorkButton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2, Lock, Unlock, Link2, Unlink2, Upload, Loader2, AlertTriangle,
} from "lucide-react";
import type { FingerprintResult } from "@/services/AudioFingerprintService";
import type { CatalogAuthenticityReport } from "@/types/acoustid";

interface Props {
  fingerprint: FingerprintResult;
  ownerAddress: string;
  audioFile: File;
  authenticityScore: number;
  catalogReport?: CatalogAuthenticityReport;
}

type UploadStage = "idle" | "uploading-audio" | "uploading-metadata" | "done" | "error";

export function IPFSUploadForm({
  fingerprint,
  ownerAddress,
  audioFile,
  authenticityScore,
  catalogReport,
}: Props) {
  const { signMessage } = useWallet();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [encrypt, setEncrypt] = useState(true);
  const [isSoulbound, setIsSoulbound] = useState(false);

  const [stage, setStage] = useState<UploadStage>("idle");
  const [stageMsg, setStageMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [audioCid, setAudioCid] = useState("");
  const [metadataCid, setMetadataCid] = useState("");
  
  // Determinar si la obra tiene match
  const hasHighMatch = authenticityScore >= 2;
  const hasMediumMatch = authenticityScore === 1;
  const hasMBMatch = catalogReport && catalogReport.matches.length > 0 && catalogReport.matches[0].scorePercent >= 45;

  const isUploading = stage === "uploading-audio" || stage === "uploading-metadata";
  const isDone = stage === "done";

  const handleSubmit = async () => {
    if (!title.trim() || !artist.trim()) {
      setError("Por favor completa el título y el artista");
      return;
    }
    
    setError(null);
    const lh = LighthouseService.getInstance();

    try {
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

      setStage("uploading-metadata");
      setStageMsg("Subiendo metadata a IPFS...");

      // Usar título de MB si existe match significativo
      let finalTitle = title.trim();
      let finalArtist = artist.trim();
      
      // ✨ NUEVO: Preparar MB info para guardar en metadata
      let mbInfo: { recordingId: string; title: string; artist: string; scorePercent: number; releaseTitle?: string } | undefined = undefined;
      
      if (hasMBMatch && catalogReport) {
        const bestMatch = catalogReport.matches[0];
        finalTitle = bestMatch.title || finalTitle;
        finalArtist = bestMatch.artist || finalArtist;
        
        mbInfo = {
          recordingId: bestMatch.recordingId,
          title: bestMatch.title || finalTitle,
          artist: bestMatch.artist || finalArtist,
          scorePercent: bestMatch.scorePercent,
          releaseTitle: bestMatch.releaseTitle,
        };
        
        console.log("[IPFSUploadForm] Usando título de MusicBrainz:", finalTitle);
      }

      // ✨ MODIFICADO: Pasar mbInfo a uploadMetadata
      const mCid = await lh.uploadMetadata(
        finalTitle,
        finalArtist,
        audioResult.cid,
        audioResult.encrypted,
        audioFile.type || "audio/mpeg",
        mbInfo
      );
      setMetadataCid(mCid);
      console.log("✅ Metadata subida:", mCid);

      // Guardar en localStorage
      lh.saveUploadRecord({
        metadataCid: mCid,
        audioCid: audioResult.cid,
        title: finalTitle,
        artist: finalArtist,
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
  };

  if (isDone && metadataCid) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Card className="flex flex-col items-center gap-4 text-center p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="font-display text-xl font-bold text-white">
            ¡Subida Exitosa a IPFS!
          </h3>
          
          {hasMBMatch && (
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 px-3 py-1">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Verificado en MusicBrainz
            </Badge>
          )}
          
          <div className="w-full space-y-2 text-left">
            <p className="font-mono text-[10px] text-zinc-500">
              Audio CID: {audioCid.slice(0, 20)}...
            </p>
            <p className="font-mono text-[10px] text-emerald-500">
              Metadata CID: {metadataCid.slice(0, 20)}...
            </p>
          </div>
          
          {/* ADVERTENCIA O REGISTRO */}
          {hasHighMatch ? (
            <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <p className="font-mono text-xs font-bold uppercase text-amber-500">
                  Registro Blockchain Bloqueado
                </p>
              </div>
              <p className="text-xs text-zinc-400">
                Esta obra tiene coincidencias significativas. 
                No puede registrarse en blockchain, pero está en IPFS para demo.
              </p>
            </div>
          ) : hasMediumMatch ? (
            <div className="w-full space-y-3">
              <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <p className="font-mono text-xs font-bold uppercase text-yellow-500">
                    Coincidencias Parciales
                  </p>
                </div>
              </div>
              <RegisterWorkButton
                fingerprintHash={`0x${fingerprint.sha256}`}
                ipfsCid={metadataCid}
                authenticityScore={authenticityScore}
                soulbound={isSoulbound}
                title={title}
              />
            </div>
          ) : (
            <div className="w-full">
              <RegisterWorkButton
                fingerprintHash={`0x${fingerprint.sha256}`}
                ipfsCid={metadataCid}
                authenticityScore={authenticityScore}
                soulbound={isSoulbound}
                title={title}
              />
            </div>
          )}
          
          <Button 
            variant="outline" 
            onClick={handleReset}
            className="w-full"
          >
            Subir Otra Obra
          </Button>
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className="space-y-6">
      <div className="border-b border-surface-border pb-4">
        <h3 className="font-display text-lg font-bold text-white">
          Configuración de Subida a IPFS
        </h3>
        <p className="mt-1 font-mono text-[10px] text-zinc-500">
          Los archivos se almacenarán en Lighthouse (IPFS)
        </p>
      </div>

      {/* ADVERTENCIA SI TIENE MATCH */}
      {hasMBMatch && catalogReport && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-400" />
            <p className="font-mono text-xs font-bold uppercase text-blue-400">
              Obra Reconocida en MusicBrainz
            </p>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            {catalogReport.matches[0].title} - {catalogReport.matches[0].artist}
            <br />
            <span className="text-blue-400/60">
              Score: {catalogReport.matches[0].scorePercent}%
            </span>
          </p>
        </div>
      )}

      {/* CAMPOS DE TÍTULO Y ARTISTA */}
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            Título de la obra
          </label>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={hasMBMatch && catalogReport ? catalogReport.matches[0].title || "Título" : "Ej: Mi Canción"}
            disabled={isUploading}
            className={hasMBMatch ? "border-blue-500/30 bg-blue-500/5" : ""}
          />
          {hasMBMatch && (
            <p className="mt-1 font-mono text-[9px] text-blue-400/60">
              ↑ Título verificado de MusicBrainz sugerido
            </p>
          )}
        </div>
        
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            Artista
          </label>
          <Input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder={hasMBMatch && catalogReport ? catalogReport.matches[0].artist || "Artista" : "Ej: Nombre del Artista"}
            disabled={isUploading}
            className={hasMBMatch ? "border-blue-500/30 bg-blue-500/5" : ""}
          />
        </div>
      </div>

      {/* OPCIONES */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setEncrypt(!encrypt)}
          disabled={isUploading}
          className={`flex w-full items-center gap-3 rounded-2xl border p-4 transition-all ${
            encrypt
              ? "border-violet/30 bg-violet-glow"
              : "border-surface-border bg-surface-overlay"
          }`}
        >
          {encrypt
            ? <Lock className="h-4 w-4 text-violet" />
            : <Unlock className="h-4 w-4 text-zinc-500" />}
          <div className="text-left">
            <p className={`text-sm font-bold ${encrypt ? "text-violet" : "text-zinc-400"}`}>
              {encrypt ? "Encriptado" : "Público"}
            </p>
            <p className="text-[10px] text-zinc-600">Privacidad</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => !hasHighMatch && setIsSoulbound(!isSoulbound)}
          disabled={isUploading || hasHighMatch}
          className={`flex w-full items-center gap-3 rounded-2xl border p-4 transition-all ${
            isSoulbound && !hasHighMatch
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-surface-border bg-surface-overlay"
          } ${hasHighMatch ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isSoulbound && !hasHighMatch
            ? <Link2 className="h-4 w-4 text-emerald-500" />
            : <Unlink2 className="h-4 w-4 text-zinc-500" />}
          <div className="text-left">
            <p className={`text-sm font-bold ${isSoulbound && !hasHighMatch ? "text-emerald-500" : "text-zinc-400"}`}>
              {isSoulbound ? "Soulbound" : "Transferible"}
            </p>
            <p className="text-[10px] text-zinc-600">
              {hasHighMatch ? "Bloqueado" : "Tipo de NFT"}
            </p>
          </div>
        </button>
      </div>

      {/* PROGRESO */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
              <div>
                <p className="font-mono text-xs font-bold text-emerald-500">
                  {stageMsg}
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-500/20">
                  <motion.div
                    className="h-full rounded-full bg-emerald-500"
                    initial={{ width: "0%" }}
                    animate={{ 
                      width: stage === "uploading-audio" ? "45%" : "90%" 
                    }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ERROR */}
      {error && (
        <p className="text-center font-mono text-[10px] text-red-400">
          {error}
        </p>
      )}

      {/* BOTÓN DE SUBIR */}
      <Button
        onClick={handleSubmit}
        disabled={!title.trim() || !artist.trim() || isUploading}
        className="w-full h-12 text-base font-bold"
        size="lg"
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {stageMsg}
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            {hasHighMatch ? "🚀 Subir a IPFS (Demo)" : "📤 Subir a IPFS"}
          </>
        )}
      </Button>
      
      {/* MENSAJE DE AYUDA */}
      {!isUploading && (
        <p className="text-center font-mono text-[9px] text-zinc-500">
          {!title.trim() || !artist.trim() 
            ? "✏️ Completa título y artista para continuar" 
            : "✅ Listo para subir a IPFS"}
        </p>
      )}
      
      {hasHighMatch && (
        <p className="text-center font-mono text-[9px] text-amber-500/60">
          ⚠️ Registro blockchain bloqueado • Solo demostración IPFS
        </p>
      )}
    </Card>
  );
}