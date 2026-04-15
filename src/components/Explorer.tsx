/**
 * MuSecure – Explorer (Versión FINAL CON CACHÉ Y RATE LIMITING)
 * - Filtra solo obras públicas con metadata (para demo limpia)
 * - Filtra solo archivos de audio válidos (por extensión)
 * - Mantiene obras encriptadas (sin extensión)
 * - Excluye CIDs problemáticos que fuerzan descarga
 * - Deduplica por CID
 * - Deduplica por título + artista
 * - PRIORIZA la versión con releaseId (portada) sobre las antiguas
 * - PRIORIZA la versión más reciente si todo lo demás es igual
 * - Badges "MB Verified" vs "Original"
 * - Muestra portada con fallback elegante (placeholder si no hay imagen)
 * - CACHÉ: Evita peticiones repetidas a metadatos que ya fallaron
 * - RATE LIMITING: Procesa en lotes para no saturar Lighthouse
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
  releaseId?: string | null;
  title: string;
  artist: string;
  scorePercent: number;
  releaseTitle?: string;
}

// ✨ Función que elige la URL correcta según el entorno
function getCoverArtUrl(releaseId: string | null | undefined): string | null {
  if (!releaseId) return null;
  
  // En desarrollo (local): usar Weserv
  if (import.meta.env.DEV) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(`https://coverartarchive.org/release/${releaseId}/front-500`)}&w=400&h=400&fit=contain&output=jpeg&default=404`;
  }
  
  // En producción (Vercel): usar el rewrite configurado en vercel.json
  return `/api/cover/${releaseId}`;
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

// ✨ Extensiones de audio válidas
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.opus', '.webm', '.mpeg'];

// ✨ CIDs problemáticos que fuerzan descarga (excluir)
const EXCLUDED_CIDS = [
  'bafybeig3gauun6xlp4r66rdjo5ye4mdztn54b6anyo3yt4piwy3snaawhy',
  'bafybeiaiwsqeqtfuwt5ogr72q6yyqfkqw3cpmusfbgu4ulaha4upawjabi',
  'bafybeia5t43wnb3rn6rig4lrcbpcchvmbbk5iavh3mbpka4kdli3frqdvy',
  'bafybeib2l2lm6uq4rcvz5pb5f3ecmjaesc44pgo2ge3zg5on36bz26mvle',
  'bafybeihygixd32wmzy65hmyhrc7hnvnjqjz3tinrjmtq5rp7xu5uypm3wm',
];

// ✨ CACHÉ PARA METADATOS
const metadataCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const FAILED_CIDS = new Set<string>(); // CIDs que ya fallaron (404, 429, etc.)

// ✨ Función para hacer fetch con caché y sin reintentar fallos
async function fetchMetadataWithCache(cid: string, fileName: string): Promise<any | null> {
  // Si ya falló antes, no reintentar (evita 429 repetidos)
  if (FAILED_CIDS.has(cid)) {
    console.log(`⏭️ Saltando ${fileName} (falló previamente)`);
    return null;
  }
  
  // Verificar caché
  const cached = metadataCache.get(cid);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`📦 Usando caché para ${fileName}`);
    return cached.data;
  }
  
  try {
    const url = LighthouseService.gatewayUrl(cid);
    const response = await fetch(url);
    
    if (!response.ok) {
      // Si es 429, marcar como fallido y no reintentar
      if (response.status === 429) {
        console.warn(`⚠️ Rate limited para ${fileName}, no se reintentará`);
        FAILED_CIDS.add(cid);
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const json = await response.json();
    
    // Guardar en caché
    metadataCache.set(cid, { data: json, timestamp: Date.now() });
    console.log(`✅ Metadata obtenida: ${fileName}`);
    return json;
    
  } catch (e) {
    console.warn(`❌ Metadata falló para ${fileName}:`, e);
    // Marcar como fallido para no reintentar
    FAILED_CIDS.add(cid);
    return null;
  }
}

function CardSkeleton() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="mt-auto pt-4">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </Card>
  );
}

// ✨ Componente de imagen con fallback inmediato
function CoverImage({ releaseId, title, onFinalError }: { 
  releaseId: string; 
  title: string;
  onFinalError: () => void;
}) {
  const coverUrl = getCoverArtUrl(releaseId);
  const [hasError, setHasError] = useState(false);
  
  if (!coverUrl || hasError) {
    onFinalError();
    return null;
  }
  
  return (
    <div className="flex items-center justify-center p-4 bg-black/20">
      <img
        src={coverUrl}
        alt={title}
        className="h-48 w-full object-contain"
        onError={() => {
          console.log(`❌ Imagen no disponible para: ${title}`);
          setHasError(true);
          onFinalError();
        }}
        loading="lazy"
        crossOrigin="anonymous"
      />
    </div>
  );
}

export const Explorer = () => {
  const [works, setWorks] = useState<WorkCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

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

        // ✨ FILTRO MEJORADO v2: Excluir octet-stream que no son encriptados reales
        const audioFiles = files.filter((f: any) => {
          const fileName = f.fileName.toLowerCase();
          const mimeType = f.mimeType?.toLowerCase() || '';
          
          // 🚫 Excluir CIDs problemáticos
          if (EXCLUDED_CIDS.includes(f.cid)) {
            console.log(`🚫 Excluyendo CID problemático: ${f.cid} (${fileName})`);
            return false;
          }
          
          // Excluir JSONs
          if (fileName.endsWith('.json')) return false;
          if (mimeType === 'application/json') return false;
          
          // Excluir blobs/text que son metadatos (CIDs que empiezan con bafkrei)
          if (fileName === 'blob' || fileName === 'text') {
            if (f.cid?.startsWith('bafkrei')) return false;
          }
          
          // ✨ Incluir si tiene extensión de audio válida
          if (AUDIO_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
            return true;
          }
          
          // ✨ Para octet-stream: solo incluir si NO tiene extensión (encriptados reales)
          if (mimeType === 'application/octet-stream') {
            if (!fileName.includes('.')) {
              return true;
            }
          }
          
          return false;
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

        // ✨ PROCESAR EN LOTES PARA EVITAR RATE LIMITING
        const BATCH_SIZE = 3; // Procesar de 3 en 3
        const validMetadatas: any[] = [];
        
        for (let i = 0; i < metadataJsons.length; i += BATCH_SIZE) {
          const batch = metadataJsons.slice(i, i + BATCH_SIZE);
          
          const batchResults = await Promise.allSettled(
            batch.map(async (f: any) => {
              const json = await fetchMetadataWithCache(f.cid, f.fileName);
              if (json) {
                return { cid: f.cid, fileName: f.fileName, json };
              }
              throw new Error('No metadata');
            })
          );
          
          for (const r of batchResults) {
            if (r.status === "fulfilled") {
              validMetadatas.push(r.value);
            }
          }
          
          // Pequeña pausa entre lotes para no saturar
          if (i + BATCH_SIZE < metadataJsons.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        console.log(`✅ Metadatos válidos obtenidos: ${validMetadatas.length}`);

        // Construir mapa: audioCid → metadata JSON
        const metadataByAudioCid = new Map<string, any>();
        
        for (const item of validMetadatas) {
          const { json } = item;
          const animUrl: string = json.animation_url ?? "";
          const audioCidFromJson = animUrl.replace("ipfs://", "").trim();
          
          if (audioCidFromJson) {
            metadataByAudioCid.set(audioCidFromJson, json);
          }
        }

        console.log(`📋 Mapa final: ${metadataByAudioCid.size} metadatos vinculados`);

        // ✨ DEDUPLICAR AUDIOS POR CID
        const audioMap = new Map<string, any>();
        for (const audio of audioFiles) {
          const existing = audioMap.get(audio.cid);
          
          if (!existing) {
            audioMap.set(audio.cid, audio);
          } else {
            const isExistingGeneric = existing.fileName === 'blob' || existing.fileName === 'text';
            const isNewGeneric = audio.fileName === 'blob' || audio.fileName === 'text';
            
            if (isExistingGeneric && !isNewGeneric) {
              audioMap.set(audio.cid, audio);
            }
          }
        }
        
        const dedupedAudioFiles = Array.from(audioMap.values());
        console.log(`🎵 AUDIOS (deduplicados por CID): ${dedupedAudioFiles.length}`);

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
              const parsed = typeof mbAttr.value === "string"
                ? JSON.parse(mbAttr.value)
                : mbAttr.value;
              
              mbInfo = {
                recordingId: parsed.recordingId,
                releaseId: parsed.releaseId || null,
                title: parsed.title,
                artist: parsed.artist,
                scorePercent: parsed.scorePercent,
                releaseTitle: parsed.releaseTitle,
              };
              
              console.log(`🎯 MB Info para "${meta.name}": releaseId=${mbInfo.releaseId}`);
            } catch (e) {
              console.warn('Error parsing MB info:', e);
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

        console.log(`📊 Cards antes de deduplicar por título: ${cards.length}`);
        console.log(`📊 MB Verified antes de deduplicar: ${cards.filter(c => c.isVerified).length}`);

        // ✨ NUEVO: Deduplicar por título + artista (PRIORIZANDO releaseId Y VERSIONES RECIENTES)
        const uniqueCards = new Map<string, WorkCard>();
        
        for (const card of cards) {
          const key = `${card.title.toLowerCase().trim()}__${card.artist.toLowerCase().trim()}`;
          const existing = uniqueCards.get(key);
          
          if (!existing) {
            uniqueCards.set(key, card);
            console.log(`   🆕 Nueva obra: ${card.title} (releaseId: ${!!card.mbInfo?.releaseId})`);
          } else {
            const cardHasReleaseId = !!card.mbInfo?.releaseId;
            const existingHasReleaseId = !!existing.mbInfo?.releaseId;
            
            const cardTimestamp = card.fileName.match(/\d{13}/)?.[0] || '';
            const existingTimestamp = existing.fileName.match(/\d{13}/)?.[0] || '';
            const cardIsNewer = cardTimestamp > existingTimestamp;
            
            let shouldReplace = false;
            let reason = '';
            
            if (cardHasReleaseId && !existingHasReleaseId) {
              shouldReplace = true;
              reason = 'tiene portada (releaseId)';
            } else if (cardHasReleaseId === existingHasReleaseId) {
              if (card.hasMetadata && !existing.hasMetadata) {
                shouldReplace = true;
                reason = 'tiene metadata';
              } else if (card.isVerified && !existing.isVerified) {
                shouldReplace = true;
                reason = 'está verificada';
              } else if (cardIsNewer) {
                shouldReplace = true;
                reason = 'es más reciente';
              } else if (!card.fileName.includes('blob') && !card.fileName.includes('text') &&
                       (existing.fileName.includes('blob') || existing.fileName.includes('text'))) {
                shouldReplace = true;
                reason = 'tiene nombre descriptivo';
              }
            }
            
            if (shouldReplace) {
              uniqueCards.set(key, card);
              console.log(`   🔄 Reemplazando "${card.title}": nueva versión ${reason}`);
            } else {
              console.log(`   ⏭️ Manteniendo versión anterior de "${card.title}"`);
            }
          }
        }
        
        const finalCards = Array.from(uniqueCards.values());
        
        console.log(`📊 Antes de filtrar para demo: ${finalCards.length} obras`);
        
        const demoCards = finalCards.filter(card => 
          card.hasMetadata && !card.isEncrypted
        );
        
        console.log(`🎯 DEMO FINAL: ${demoCards.filter(c => c.isVerified).length} MB Verified de ${demoCards.length} total`);
        console.log('═══════════════════════════════════════');

        demoCards.sort((a, b) => {
          if (a.isVerified && !b.isVerified) return -1;
          if (!a.isVerified && b.isVerified) return 1;
          return a.title.localeCompare(b.title);
        });

        setWorks(demoCards);
      } catch (err) {
        console.error("[Explorer] Error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadWorks();
  }, []);

  const handleImageError = (audioCid: string) => {
    setImageErrors(prev => new Set(prev).add(audioCid));
  };

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
          No hay obras públicas todavía
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

        const hasImageError = imageErrors.has(work.audioCid);

        return (
          <motion.div
            key={`${work.audioCid}-${index}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
          >
            <Card className={`group flex h-full flex-col transition-all hover:shadow-lg ${borderColor}`}>
              <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
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

              {/* ✨ PORTADA CON FALLBACK ELEGANTE */}
              {work.isVerified ? (
                <div className="mb-4 overflow-hidden rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-600/5">
                  {work.mbInfo?.releaseId && !hasImageError ? (
                    <CoverImage
                      releaseId={work.mbInfo.releaseId}
                      title={work.title}
                      onFinalError={() => handleImageError(work.audioCid)}
                    />
                  ) : (
                    <div className="h-48 w-full flex flex-col items-center justify-center">
                      <Music className="h-12 w-12 text-blue-400/60 mb-2" />
                      <p className="font-mono text-[10px] uppercase tracking-wider text-blue-400/60">MB Verified</p>
                      {work.mbInfo?.scorePercent && (
                        <p className="font-display text-3xl font-bold text-blue-400 mt-1">{work.mbInfo.scorePercent}%</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-4 overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5">
                  <div className="h-48 w-full flex flex-col items-center justify-center">
                    <Music className="h-12 w-12 text-emerald-400/60 mb-2" />
                    <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/60">Original</p>
                  </div>
                </div>
              )}

              <h3 className="truncate font-display text-base font-bold uppercase tracking-tight text-white">
                {work.title}
              </h3>

              <p className={`mt-1 mb-3 truncate font-mono text-[11px] ${
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