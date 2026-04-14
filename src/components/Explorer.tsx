/**
 * MuSecure – Explorer (Versión FINAL CORREGIDA)
 * - Solo procesa JSONs que empiezan con "metadata_" (los nuevos)
 */

import { useEffect, useState } from "react";
import { LighthouseService } from "@/services/LighthouseService";
import { usePrivy } from "@privy-io/react-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { Music, ExternalLink, CheckCircle2, Sparkles, Headphones, Lock, Globe } from "lucide-react";

interface IPFSWork {
  cid: string;
  fileName: string;
  title: string;
  artist: string;
  isEncrypted: boolean;
  isVerified: boolean;
  mbInfo?: {
    recordingId: string;
    title: string;
    artist: string;
    scorePercent: number;
    releaseTitle?: string;
  };
  loading: boolean;
}

function CardSkeleton() {
  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between"><Skeleton className="h-5 w-32" /></div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="mt-auto"><Skeleton className="h-12 w-full rounded-xl" /></div>
    </Card>
  );
}

export const Explorer = () => {
  const [works, setWorks] = useState<IPFSWork[]>([]);
  const [loading, setLoading] = useState(true);
  const { ready } = usePrivy();

  useEffect(() => {
    const loadPublicWorks = async () => {
      try {
        setLoading(true);
        const lh = LighthouseService.getInstance();
        
        const files = await lh.listUploads();
        console.log(`📦 ${files.length} archivos totales en Lighthouse`);
        
        const audioFiles = files.filter((f: any) => 
          !f.fileName.toLowerCase().endsWith('.json') &&
          (f.mimeType?.startsWith('audio/') || f.mimeType === 'application/octet-stream')
        );
        
        // ✨ SOLO obtener JSONs que empiezan con "metadata_" (los nuevos)
        const jsonFiles = files.filter((f: any) => 
          f.fileName.toLowerCase().startsWith('metadata_') && 
          f.fileName.toLowerCase().endsWith('.json')
        );
        
        console.log(`🎵 ${audioFiles.length} audios, 📄 ${jsonFiles.length} JSONs nuevos (metadata_)`);
        
        // Mostrar los JSONs encontrados
        console.log('📋 JSONs metadata_:', jsonFiles.map((j: any) => j.fileName));
        
        const validMetadatas: any[] = [];
        for (const jsonFile of jsonFiles) {
          try {
            const metadataUrl = LighthouseService.gatewayUrl(jsonFile.cid);
            const response = await fetch(metadataUrl);
            if (response.ok) {
              const metadata = await response.json();
              if (metadata.animation_url) {
                validMetadatas.push({
                  cid: jsonFile.cid,
                  metadata
                });
                console.log(`✅ Metadata válido: ${jsonFile.fileName} -> ${metadata.name}`);
              }
            }
          } catch (e) {
            console.warn(`Error con ${jsonFile.fileName}:`, e);
          }
        }
        
        console.log(`📋 ${validMetadatas.length} metadatos válidos encontrados`);
        
        const worksList: IPFSWork[] = [];
        
        for (const audio of audioFiles) {
          const work: IPFSWork = {
            cid: audio.cid,
            fileName: audio.fileName,
            title: audio.fileName || "Sin título",
            artist: "Cargando...",
            isEncrypted: audio.mimeType === "application/octet-stream" || !audio.fileName.includes("."),
            isVerified: false,
            loading: true,
          };
          
          let metadataFound = false;
          
          for (const item of validMetadatas) {
            const audioInMetadata = item.metadata.animation_url?.replace('ipfs://', '');
            
            if (audioInMetadata === audio.cid) {
              console.log(`✅ MATCH: ${audio.fileName} -> ${item.metadata.name}`);
              
              work.title = item.metadata.name || audio.fileName;
              
              const artistAttr = item.metadata.attributes?.find(
                (a: any) => a.trait_type === 'Artista' || a.trait_type === 'Artist'
              );
              work.artist = artistAttr?.value || 'Artista desconocido';
              
              const mbAttr = item.metadata.attributes?.find(
                (a: any) => a.trait_type === 'MusicBrainz'
              );
              
              if (mbAttr?.value) {
                try {
                  work.mbInfo = typeof mbAttr.value === 'string' 
                    ? JSON.parse(mbAttr.value) 
                    : mbAttr.value;
                  work.isVerified = true;
                  work.title = work.mbInfo?.title || work.title;
                  work.artist = work.mbInfo?.artist || work.artist;
                  console.log(`🎵 MB VERIFIED: ${work.title} (${work.mbInfo?.scorePercent}%)`);
                } catch (e) {
                  console.warn('Error parsing MB info:', e);
                }
              }
              
              metadataFound = true;
              break;
            }
          }
          
          if (!metadataFound) {
            work.artist = "Información no disponible";
          }
          
          work.loading = false;
          worksList.push(work);
        }
        
        console.log(`📊 RESUMEN: ${worksList.filter(w => w.isVerified).length} obras verificadas de ${worksList.length} total`);
        
        worksList.sort((a, b) => {
          if (a.isVerified && !b.isVerified) return -1;
          if (!a.isVerified && b.isVerified) return 1;
          return a.title.localeCompare(b.title);
        });
        
        setWorks(worksList);
        
      } catch (err) {
        console.error('[Explorer] Error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadPublicWorks();
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
          No hay obras públicas en IPFS todavía
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 pt-2">
      {works.map((work, index) => {
        const publicAudioUrl = !work.isEncrypted && work.cid
          ? LighthouseService.audioUrl(work.cid, 'audio/mpeg')
          : '';

        return (
          <motion.div
            key={work.cid}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
          >
            <Card className={`group flex h-full flex-col transition-all ${
              work.isVerified 
                ? "hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10" 
                : "hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/5"
            }`}>
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={work.isEncrypted ? "default" : "secondary"}>
                    {work.isEncrypted
                      ? <><Lock className="mr-1 h-2.5 w-2.5" />Privado</>
                      : <><Globe className="mr-1 h-2.5 w-2.5" />Público</>}
                  </Badge>
                  
                  {!work.loading && (
                    work.isVerified ? (
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                        MB Verified
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        <Sparkles className="mr-1 h-2.5 w-2.5" />
                        Original
                      </Badge>
                    )
                  )}
                </div>
                
                {work.mbInfo && (
                  <div className="text-right">
                    <p className="font-mono text-[9px] text-blue-400/60">
                      Score: {work.mbInfo.scorePercent}%
                    </p>
                  </div>
                )}
              </div>

              {work.loading ? (
                <>
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2 mb-4" />
                </>
              ) : (
                <>
                  <h3 className="truncate font-display text-base font-bold uppercase tracking-tight text-white">
                    {work.title}
                  </h3>
                  <p className={`mt-1 mb-4 truncate font-mono text-[11px] ${
                    work.isVerified ? "text-blue-400/70" : "text-emerald-500/70"
                  }`}>
                    {work.artist}
                  </p>
                </>
              )}

              {work.isVerified && work.mbInfo && (
                <div className="mb-4 rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-blue-400/60">
                    ✓ Verificado en MusicBrainz
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-400">
                    {work.mbInfo.releaseTitle && `${work.mbInfo.releaseTitle} • `}
                    Score: {work.mbInfo.scorePercent}%
                  </p>
                  {work.mbInfo.recordingId && (
                    <a
                      href={`https://musicbrainz.org/recording/${work.mbInfo.recordingId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[9px] text-blue-400/60 hover:text-blue-400 transition-colors"
                    >
                      Ver en MusicBrainz <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              )}

              <div className="mt-auto">
                {work.isEncrypted ? (
                  <div className="rounded-2xl border border-violet/20 bg-violet/5 p-3 text-center">
                    <p className="font-mono text-[10px] text-violet/60">
                      🔒 Obra privada - No reproducible públicamente
                    </p>
                  </div>
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
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-lg transition-transform group-hover/play:scale-105 ${
                      work.isVerified 
                        ? "bg-blue-500 shadow-blue-500/25" 
                        : "bg-emerald-500 shadow-emerald-500/25"
                    }`}>
                      <Headphones className="h-4 w-4 text-black" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">Escuchar</p>
                      <p className="font-mono text-[10px] text-zinc-500 truncate">
                        Abrir en IPFS Gateway
                      </p>
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