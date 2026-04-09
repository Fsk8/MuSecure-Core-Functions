import { useState, useEffect, useRef } from "react";
import lighthouse from "@lighthouse-web3/sdk";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { Lock, Pause, Play } from "lucide-react";

interface Props {
  cid: string;
  ownerAddress: string;
  signMessage: (message: string) => Promise<string>;
}

function WaveformBars({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-emerald-500"
          animate={
            playing
              ? { height: [6, 14 + Math.random() * 14, 6] }
              : { height: 6 }
          }
          transition={
            playing
              ? {
                  duration: 0.6 + Math.random() * 0.4,
                  repeat: Infinity,
                  delay: i * 0.08,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}

export function EncryptedAudioPlayer({ cid, ownerAddress, signMessage }: Props) {
  const [decryptState, setDecryptState] = useState<
    "idle" | "signing" | "decrypting" | "ready"
  >("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

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
    if (!ownerAddress) return;
    setError(null);
    setDecryptState("signing");

    try {
      const response = await lighthouse.getAuthMessage(ownerAddress);
      const message = response.data.message;

      if (!message) {
        throw new Error("No se pudo obtener el mensaje de autenticacion");
      }

      const signature = await signMessage(message);
      setDecryptState("decrypting");

      const decryptedFile = await lighthouse.decryptFile(cid, signature);
      const url = URL.createObjectURL(new Blob([decryptedFile]));
      setBlobUrl(url);
      setDecryptState("ready");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al descifrar";
      console.error("[EncryptedAudioPlayer] Decryption failed:", msg);
      setError(msg);
      setDecryptState("idle");
    }
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  };

  return (
    <div className="space-y-2">
      <AnimatePresence mode="wait">
        {blobUrl ? (
          <motion.div
            key="player"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-4 rounded-xl bg-black/60 p-3 border border-surface-border"
          >
            <audio ref={audioRef} src={blobUrl} preload="auto" />

            <button
              onClick={togglePlayback}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black transition-transform hover:scale-105 active:scale-95"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </button>

            <div className="flex flex-1 items-center gap-3">
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
          </motion.div>
        ) : (
          <motion.div key="unlock" exit={{ opacity: 0, scale: 0.95 }}>
            <Button
              onClick={handleDecrypt}
              disabled={decryptState !== "idle"}
              variant="violet"
              className="w-full h-12"
            >
              {decryptState === "signing" && (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="inline-block"
                >
                  <Lock className="h-3.5 w-3.5" />
                </motion.span>
              )}
              {decryptState === "signing"
                ? "Firmando..."
                : decryptState === "decrypting"
                  ? "Descifrando..."
                  : "Desbloquear Obra"}
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
            className="text-center font-mono text-[10px] text-red-400"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
