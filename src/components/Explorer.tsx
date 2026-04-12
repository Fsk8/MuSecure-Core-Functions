import { useEffect, useState } from "react";
import { LighthouseService } from "@/services/LighthouseService";
import { EncryptedAudioPlayer } from "@/components/Encryptedaudioplayer";
import { usePrivy } from "@privy-io/react-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { Lock, Globe, Music, Headphones, ExternalLink } from "lucide-react";

interface LighthouseFile {
  cid: string;
  fileName: string;
  mimeType: string;
  fileSizeInBytes: number;
}

function CardSkeleton() {
  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="mt-auto">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </Card>
  );
}

export const Explorer = () => {
  const [songs, setSongs] = useState<LighthouseFile[]>([]);
  const [loading, setLoading] = useState(true);
  const { ready, authenticated, user, login, signMessage } = usePrivy();
  const address = user?.wallet?.address;

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setLoading(true);
        const lighthouseService = LighthouseService.getInstance();
        const allFiles = await lighthouseService.listUploads();
        const unique = new Map<string, LighthouseFile>();
        (allFiles || []).forEach((file: LighthouseFile) => {
          if (!file.fileName.toLowerCase().endsWith(".json")) {
            unique.set(file.cid, file);
          }
        });
        setSongs(Array.from(unique.values()));
      } catch (error) {
        console.error("[Explorer] Failed to load content:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, []);

  if (!ready || loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 pt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-4 py-24"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised">
          <Music className="h-7 w-7 text-zinc-600" />
        </div>
        <p className="font-mono text-xs uppercase tracking-wider text-zinc-600">
          No hay obras publicadas todavia
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 pt-2">
      {songs.map((song, index) => {
        const isEncrypted =
          song.mimeType === "application/octet-stream" ||
          !song.fileName.includes(".");

        return (
          <motion.div
            key={song.cid}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
          >
            <Card className="group flex h-full flex-col hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/5">
              <div className="mb-6 flex items-center justify-between">
                <Badge variant={isEncrypted ? "default" : "secondary"}>
                  {isEncrypted ? (
                    <>
                      <Lock className="mr-1 h-2.5 w-2.5" />
                      Protegido
                    </>
                  ) : (
                    <>
                      <Globe className="mr-1 h-2.5 w-2.5" />
                      Publico
                    </>
                  )}
                </Badge>
              </div>

              <h3 className="truncate font-display text-base font-bold uppercase tracking-tight text-white">
                {song.fileName || "Sin titulo"}
              </h3>

              <p className="mt-1 truncate font-mono text-[11px] text-emerald-500/70">
                {song.cid}
              </p>

              <div className="mt-auto pt-8">
                {isEncrypted ? (
                  authenticated && address ? (
                    <EncryptedAudioPlayer
                      cid={song.cid}
                      ownerAddress={address}
                      signMessage={signMessage}
                    />
                  ) : (
                    <Button
                      onClick={() => login()}
                      className="w-full"
                      size="lg"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Conectar para Escuchar
                    </Button>
                  )
                ) : (
                  <a
                    href={`https://gateway.lighthouse.storage/ipfs/${song.cid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group/play flex w-full items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 no-underline transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:shadow-lg hover:shadow-emerald-500/5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/25 transition-transform group-hover/play:scale-105">
                      <Headphones className="h-4 w-4 text-black" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">Escuchar</p>
                      <p className="font-mono text-[10px] text-zinc-500">Abrir en IPFS Gateway</p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-emerald-500/40 transition-colors group-hover/play:text-emerald-500" />
                  </a>
                )}
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
};
