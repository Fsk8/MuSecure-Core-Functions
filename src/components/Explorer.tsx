/**
 * MuSecure – Explorer (Versión FINAL - Con deduplicación)
 * - Deduplica audios por CID
 * - Prioriza entradas con metadata vinculada
 * - Filtra JSONs por MIME type y extensión
 */

import { useEffect, useState } from "react";
import { LighthouseService } from "@/services/LighthouseService";
import { EncryptedAudioPlayer } from "@/components/Encryptedaudioplayer";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import {
  Music, ExternalLink, CheckCircle2, Sparkles,
  Headphones, Lock, Globe,
} from "lucide-react";

interface MBInfo {
  recordingId: string;
  title: string;
  artist: string;
  scorePercent: number;
  releaseTitle?: string;
}

interface WorkCard {
  audioCid: string;
  fileName: string;
  title: string;
  artist: string;
  isEncrypted: boolean;
  isVerified: boolean;
  mbInfo?: MBInfo;
  hasMetadata: boolean;
}

function CardSkeleton() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="mt-auto pt-4">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </Card>
  );
}

export const Explorer = () => {
  const [works, setWorks] = useState<WorkCard[]>([]);
  const [loading, setLoading] = useState(true);

  const { ready, authenticated, login } = usePrivy();
  const { address, signMessage } = useWallet();

  useEffect(() => {
    const loadWorks = async () => {
      try {
        setLoading(true);
        const lh = LighthouseService.getInstance();
        const files = await lh.listUploads();

        console.log('═══════════════════════════════════════');
        console.log(`📦 TOTAL ARCHIVOS: ${files.length}`);

        // Separar audios y JSONs
        const audioFiles = files.filter((f: any) => {
          const mimeType = f.mimeType?.toLowerCase() || '';
          const fileName = f.fileName.toLowerCase();
          
          if (fileName.endsWith('.json')) return false;
          if (mimeType === 'application/json') return false;
          if (fileName === 'blob' || fileName === 'text') {
            if (f.cid?.startsWith('bafkrei')) return false;
          }
          
          return true;
        });

        const metadataJsons = files.filter((f: any) => {
          const fileName = f.fileName.toLowerCase();
          const mimeType = f.mimeType?.toLowerCase() || '';
          
          return (
            fileName.endsWith('.json') ||
            mimeType === 'application/json' ||
            fileName === 'blob' ||
            fileName === 'text' ||
            fileName.startsWith('metadata_')
          );
        });

        console.log(`🎵 AUDIOS (antes de deduplicar): ${audioFiles.length}`);
        console.log(`📄 METADATA JSONs: ${metadataJsons.length}`);

        // Fetch de todos los JSONs
        const metadataResults = await Promise.allSettled(
          metadataJsons.map(async (f: any) => {
            const url = LighthouseService.gatewayUrl(f.cid);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return { cid: f.cid, fileName: f.fileName, json };
          })
        );

        // Construir mapa: audioCid → metadata JSON
        const metadataByAudioCid = new Map<string, any>();
        
        for (const r of metadataResults) {
          if (r.status === "fulfilled") {
            const { json } = r.value;
            const animUrl: string = json.animation_url ?? "";
            const audioCidFromJson = animUrl.replace("ipfs://", "").trim();
            
            if (audioCidFromJson) {
              metadataByAudioCid.set(audioCidFromJson, json);
            }
          }
        }

        console.log(`📋 Mapa final: ${metadataByAudioCid.size} metadatos vinculados`);

        // ✨ DEDUPLICAR AUDIOS POR CID
        const audioMap = new Map<string, any>();
        for (const audio of audioFiles) {
          const existing = audioMap.get(audio.cid);
          
          // Si no existe, o si la nueva entrada tiene mejor nombre (no es blob/text)
          if (!existing) {
            audioMap.set(audio.cid, audio);
          } else {
            // Preferir entradas con nombres descriptivos sobre "blob" o "text"
            const isExistingGeneric = existing.fileName === 'blob' || existing.fileName === 'text';
            const isNewGeneric = audio.fileName === 'blob' || audio.fileName === 'text';
            
            if (isExistingGeneric && !isNewGeneric) {
              audioMap.set(audio.cid, audio);
            }
          }
        }
        
        const dedupedAudioFiles = Array.from(audioMap.values());
        console.log(`🎵 AUDIOS (deduplicados): ${dedupedAudioFiles.length}`);

        // Construir WorkCards
        const cards: WorkCard[] = dedupedAudioFiles.map((audio: any) => {
          const meta = metadataByAudioCid.get(audio.cid);

          if (!meta) {
            return {
              audioCid: audio.cid,
              fileName: audio.fileName,
              title: audio.fileName || "Sin título",
              artist: "—",
              isEncrypted: audio.mimeType === "application/octet-stream" || !audio.fileName.includes("."),
              isVerified: false,
              hasMetadata: false,
            };
          }

          const artistAttr = meta.attributes?.find(
            (a: any) => a.trait_type === "Artista" || a.trait_type === "Artist"
          );

          const mbAttr = meta.attributes?.find(
            (a: any) => a.trait_type === "MusicBrainz"
          );

          let mbInfo: MBInfo | undefined;
          if (mbAttr?.value) {
            try {
              mbInfo = typeof mbAttr.value === "string"
                ? JSON.parse(mbAttr.value)
                : mbAttr.value;
            } catch {
              // Ignorar error
            }
          }

          const encryptedAttr = meta.attributes?.find(
            (a: any) => a.trait_type === "Protección" || a.trait_type === "Encrypted"
          );
          const isEncrypted =
            encryptedAttr?.value === "Cifrado" ||
            encryptedAttr?.value === true ||
            audio.mimeType === "application/octet-stream";

          return {
            audioCid: audio.cid,
            fileName: audio.fileName,
            title: meta.name || audio.fileName,
            artist: artistAttr?.value || "—",
            isEncrypted,
            isVerified: !!mbInfo,
            mbInfo,
            hasMetadata: true,
          };
        });

        console.log(`📊 RESUMEN: ${cards.filter(c => c.isVerified).length} MB Verified de ${cards.length} total`);

        cards.sort((a, b) => {
          if (a.isVerified && !b.isVerified) return -1;
          if (!a.isVerified && b.isVerified) return 1;
          return a.title.localeCompare(b.title);
        });

        setWorks(cards);
      } catch (err) {
        console.error("[Explorer] Error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadWorks();
  }, []);

  if (!ready || loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 pt-2">
        {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised">
          <Music className="h-7 w-7 text-zinc-600" />
        </div>
        <p className="font-mono text-xs uppercase tracking-wider text-zinc-600">
          No hay obras en IPFS todavía
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 pt-2">
      {works.map((work, index) => {
        const publicAudioUrl = !work.isEncrypted && work.audioCid
          ? LighthouseService.audioUrl(work.audioCid, "audio/mpeg")
          : "";

        const borderColor = work.isVerified
          ? "hover:border-blue-500/30 hover:shadow-blue-500/10"
          : "hover:border-emerald-500/20 hover:shadow-emerald-500/5";

        return (
          <motion.div
            key={`${work.audioCid}-${index}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
          >
            <Card className={`group flex h-full flex-col transition-all hover:shadow-lg ${borderColor}`}>
              <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
                <Badge variant={work.isEncrypted ? "default" : "secondary"}>
                  {work.isEncrypted
                    ? <><Lock className="mr-1 h-2.5 w-2.5" />Privado</>
                    : <><Globe className="mr-1 h-2.5 w-2.5" />Público</>}
                </Badge>

                {work.isVerified ? (
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                    MB Verified
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    <Sparkles className="mr-1 h-2.5 w-2.5" />
                    Original
                  </Badge>
                )}
              </div>

              <h3 className="truncate font-display text-base font-bold uppercase tracking-tight text-white">
                {work.title}
              </h3>

              <p className={`mt-1 mb-4 truncate font-mono text-[11px] ${
                work.isVerified ? "text-blue-400/70" : "text-emerald-500/70"
              }`}>
                {work.artist}
              </p>

              {work.isVerified && work.mbInfo && (
                <div className="mb-4 rounded-xl bg-blue-500/5 border border-blue-500/20 p-3 space-y-1">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-blue-400/60">
                    ✓ Verificado en MusicBrainz
                  </p>
                  <p className="font-mono text-[9px] text-blue-400/60">
                    Score: {work.mbInfo.scorePercent}%
                  </p>
                  <a
                    href={`https://musicbrainz.org/recording/${work.mbInfo.recordingId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[9px] text-blue-400/60 hover:text-blue-400 transition-colors"
                  >
                    Ver en MusicBrainz <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              )}

              {!work.hasMetadata && (
                <p className="mb-4 font-mono text-[9px] text-zinc-600 italic">
                  Obra legacy — sin metadata extendida
                </p>
              )}

              <div className="mt-auto">
                {work.isEncrypted ? (
                  authenticated && address && signMessage ? (
                    <EncryptedAudioPlayer
                      cid={work.audioCid}
                      ownerAddress={address}
                      signMessage={signMessage}
                    />
                  ) : (
                    <Button onClick={() => login()} className="w-full" size="lg">
                      <Lock className="h-3.5 w-3.5" />
                      Conectar para Escuchar
                    </Button>
                  )
                ) : publicAudioUrl ? (
                  <a
                    href={publicAudioUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={[
                      "group/play flex w-full items-center gap-3 rounded-2xl border p-3 no-underline transition-all",
                      work.isVerified
                        ? "border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 hover:bg-blue-500/10"
                        : "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 hover:bg-emerald-500/10",
                    ].join(" ")}
                  >
                    <span className={[
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-lg transition-transform group-hover/play:scale-105",
                      work.isVerified
                        ? "bg-blue-500 shadow-blue-500/25"
                        : "bg-emerald-500 shadow-emerald-500/25",
                    ].join(" ")}>
                      <Headphones className="h-4 w-4 text-black" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">Escuchar</p>
                      <p className="font-mono text-[10px] text-zinc-500 truncate">Abrir en IPFS Gateway</p>
                    </div>
                    <ExternalLink className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                      work.isVerified
                        ? "text-blue-500/40 group-hover/play:text-blue-500"
                        : "text-emerald-500/40 group-hover/play:text-emerald-500"
                    }`} />
                  </a>
                ) : (
                  <div className="rounded-2xl border border-zinc-700 bg-zinc-800/30 p-3 text-center">
                    <p className="font-mono text-[10px] text-zinc-500">
                      Audio no disponible
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
};