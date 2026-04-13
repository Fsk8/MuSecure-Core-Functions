/**
 * MuSecure – EncryptedAudioPlayer
 *
 * Flujo correcto: getAuthMessage → signMessage → fetchEncryptionKey → decryptFile
 * Usa "as any" para evitar errores de tipos del SDK de Lighthouse.
 * Compatible con cualquier wallet (embedded Privy o externa MetaMask/Rabby).
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { Lock, Pause, Play, Key } from "lucide-react";

interface Props {
  cid: string;
  ownerAddress: string;
  /** Firma un mensaje — viene de useWallet().signMessage, compatible con cualquier wallet */
  signMessage: (message: string) => Promise<string>;
}

type DecryptState = "idle" | "signing" | "fetching-key" | "decrypting" | "ready" | "error";

const STATE_LABEL: Record<DecryptState, string> = {
  idle: "Desbloquear Obra",
  signing: "Firmando...",
  "fetching-key": "Obteniendo clave...",
  decrypting: "Descifrando...",
  ready: "",
  error: "Reintentar",
};

function WaveformBars({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-emerald-500"
          animate={playing ? { height: [6, 8 + (i % 4) * 6, 6] } : { height: 6 }}
          transition={
            playing
              ? { duration: 0.5 + i * 0.07, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}

export function EncryptedAudioPlayer({ cid, ownerAddress, signMessage }: Props) {
  const [decryptState, setDecryptState] = useState<DecryptState>("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const prevBlobUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !blobUrl) return;
    const onTimeUpdate = () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setProgress(0); };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [blobUrl]);

  const handleDecrypt = async () => {
    if (!cid || !ownerAddress) return;
    setError(null);
    setDecryptState("signing");

    try {
      // Importar SDK como any para evitar errores de tipos TS
      const lh = ((await import("@lighthouse-web3/sdk")) as any).default;

      // 1. Mensaje de autenticación
      const authRes = await lh.getAuthMessage(ownerAddress);
      const message: string | undefined = (authRes as any)?.data?.message;
      if (!message) throw new Error("No se pudo obtener el mensaje de autenticación de Lighthouse.");

      // 2. Firmar — funciona con embedded wallet Y con MetaMask/Rabby
      const signature = await signMessage(message);

      // 3. Obtener clave de descifrado — PASO CRÍTICO que evita el error
      setDecryptState("fetching-key");
      const keyRes = await lh.fetchEncryptionKey(cid, ownerAddress, signature);
      const encryptionKey: string | undefined = (keyRes as any)?.data?.key;
      if (!encryptionKey) {
        throw new Error("Sin acceso — conecta la wallet que encriptó esta obra.");
      }

      // 4. Descifrar con la clave
      setDecryptState("decrypting");
      const decrypted = await lh.decryptFile(cid, encryptionKey);

      // 5. Crear blob URL (cast para resolver incompatibilidad de tipos TS)
      const rawBuffer = decrypted instanceof Uint8Array
        ? (decrypted.buffer as ArrayBuffer)
        : (decrypted as ArrayBuffer);
      const blob = new Blob([rawBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
      prevBlobUrl.current = url;
      setBlobUrl(url);
      setDecryptState("ready");

    } catch (err: unknown) {
      console.error("[EncryptedAudioPlayer]", err);
      let msg = err instanceof Error ? err.message : "Error al descifrar";

      if (msg.includes("s11") || msg.toLowerCase().includes("embedded wallet")) {
        msg = "Error de wallet. Reconecta con email, Google o MetaMask.";
      } else if (msg.includes("reject") || msg.includes("denied") || msg.includes("User rejected")) {
        msg = "Firma rechazada. Acepta la solicitud en tu wallet.";
      } else if (msg.toLowerCase().includes("key") || msg.includes("acceso") || msg.includes("access")) {
        msg = "Sin acceso — esta obra fue encriptada con otra wallet.";
      }

      setError(msg);
      setDecryptState("error");
    }
  };

  const handleClose = () => {
    if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    prevBlobUrl.current = null;
    setBlobUrl(null);
    setDecryptState("idle");
    setError(null);
    setProgress(0);
    setIsPlaying(false);
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };

  const isLoading = ["signing", "fetching-key", "decrypting"].includes(decryptState);
  const IconComponent = decryptState === "fetching-key" ? Key : Lock;

  return (
    <div className="space-y-2">
      <AnimatePresence mode="wait">
        {blobUrl ? (
          <motion.div
            key="player"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-4 rounded-xl bg-black/60 p-3 border border-surface-border">
              <audio ref={audioRef} src={blobUrl} preload="auto" />
              <button
                onClick={togglePlayback}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black transition-transform hover:scale-105 active:scale-95"
              >
                {isPlaying
                  ? <Pause className="h-4 w-4" />
                  : <Play className="h-4 w-4 ml-0.5" />}
              </button>
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <WaveformBars playing={isPlaying} />
                <div
                  className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-surface-overlay"
                  onClick={handleSeek}
                >
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-full text-center font-mono text-[9px] uppercase tracking-wider text-zinc-600 transition-colors hover:text-zinc-400"
            >
              Cerrar ✕
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="unlock"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Button
              onClick={handleDecrypt}
              disabled={isLoading || !cid}
              variant="violet"
              className="w-full h-12"
            >
              {isLoading ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="inline-block"
                >
                  <IconComponent className="h-3.5 w-3.5" />
                </motion.span>
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              {STATE_LABEL[decryptState]}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-center font-mono text-[10px] text-red-400 px-2 leading-relaxed"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}