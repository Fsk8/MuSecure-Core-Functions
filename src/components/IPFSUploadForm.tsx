import { useState } from "react";
import { useIPFSUpload } from "@/hooks/useIPFSUpload";
import { RegisterWorkButton } from "@/components/RegisterWorkButton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { CheckCircle2, Lock, Unlock, Link2, Unlink2, Upload } from "lucide-react";
import type { FingerprintResult } from "@/services/AudioFingerprintService";

interface Props {
  fingerprint: FingerprintResult;
  ownerAddress: string;
  audioFile: File;
  signMessage: (message: string) => Promise<string>;
  authenticityScore: number;
}

export function IPFSUploadForm({
  fingerprint,
  ownerAddress,
  audioFile,
  signMessage,
  authenticityScore,
}: Props) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [encrypt, setEncrypt] = useState(true);
  const [isSoulbound, setIsSoulbound] = useState(false);

  const { upload, progress, result } = useIPFSUpload();
  const isUploading =
    progress.stage !== "idle" &&
    progress.stage !== "done" &&
    progress.stage !== "error";

  const handleSubmit = async () => {
    if (!title.trim() || !artist.trim()) return;
    await upload({
      audioFile,
      ownerAddress,
      signMessage: encrypt ? signMessage : undefined,
      encrypt,
      title,
      artist,
      fingerprint: {
        sha256: fingerprint.sha256,
        data: fingerprint.fingerprint,
        durationSec: fingerprint.duration,
      },
    });
  };

  if (result)
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Card className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="font-display text-xl font-bold text-white">
            Subida exitosa
          </h3>
          <RegisterWorkButton
            fingerprintHash={`0x${result.metadata.fingerprint.sha256}`}
            ipfsCid={result.metadataCid}
            authenticityScore={authenticityScore}
            soulbound={isSoulbound}
          />
        </Card>
      </motion.div>
    );

  return (
    <Card className="space-y-6">
      <h3 className="font-display text-lg font-bold text-white border-b border-surface-border pb-4">
        Configuracion
      </h3>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titulo de la obra"
          />
          <Input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Nombre del Artista"
          />
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setEncrypt(!encrypt)}
            className={`flex w-full items-center gap-3 rounded-2xl border p-4 transition-all ${
              encrypt
                ? "border-violet/30 bg-violet-glow"
                : "border-surface-border bg-surface-overlay"
            }`}
            aria-pressed={encrypt}
          >
            {encrypt ? (
              <Lock className="h-4 w-4 text-violet" />
            ) : (
              <Unlock className="h-4 w-4 text-zinc-500" />
            )}
            <div className="text-left">
              <p
                className={`text-sm font-bold ${encrypt ? "text-violet" : "text-zinc-400"}`}
              >
                {encrypt ? "Encriptado" : "Publico"}
              </p>
              <p className="text-[10px] text-zinc-600">
                Privacidad de Lighthouse
              </p>
            </div>
            <div
              className={`ml-auto h-3 w-3 rounded-full ${encrypt ? "bg-violet" : "bg-zinc-700"}`}
            />
          </button>

          <button
            type="button"
            onClick={() => setIsSoulbound(!isSoulbound)}
            className={`flex w-full items-center gap-3 rounded-2xl border p-4 transition-all ${
              isSoulbound
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-surface-border bg-surface-overlay"
            }`}
            aria-pressed={isSoulbound}
          >
            {isSoulbound ? (
              <Link2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Unlink2 className="h-4 w-4 text-zinc-500" />
            )}
            <div className="text-left">
              <p
                className={`text-sm font-bold ${isSoulbound ? "text-emerald-500" : "text-zinc-400"}`}
              >
                {isSoulbound ? "Soulbound" : "Transferible"}
              </p>
              <p className="text-[10px] text-zinc-600">Propiedad del NFT</p>
            </div>
            <div
              className={`ml-auto h-3 w-3 rounded-full ${isSoulbound ? "bg-emerald-500" : "bg-zinc-700"}`}
            />
          </button>
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!title.trim() || !artist.trim() || isUploading}
        className="w-full"
        size="lg"
      >
        {isUploading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Upload className="h-4 w-4" />
            </motion.div>
            {progress.message}...
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
