/**
 * MuSecure – Dashboard v2
 * 
 * Soporta ambas estructuras y recupera metadata desde localStorage si el CID falla
 */

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { LighthouseService } from "@/services/LighthouseService";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";
import { EncryptedAudioPlayer } from "@/components/Encryptedaudioplayer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import { RefreshCw, ExternalLink, Shield, Music, Headphones, AlertCircle, Database } from "lucide-react";
import type { MuSecureMetadata } from "@/types/ipfs";

// Tipo para la nueva estructura NFT
interface NFTMetadataJSON {
  name: string;
  description: string;
  image: string;
  animation_url: string;
  attributes: Array<{ trait_type: string; value: string | boolean }>;
}

// Tipo unión para soportar ambas estructuras
type AnyMetadata = MuSecureMetadata | NFTMetadataJSON;

const REGISTRY_ABI = [
  "event WorkRegistered(address indexed author, bytes32 indexed fingerprintHash, string ipfsCid, uint256 authenticityScore, uint8 riskLevel, uint256 tokenId, uint256 timestamp)",
];

const RISK_LABEL = ["Bajo Riesgo", "Riesgo Medio", "Alto Riesgo", "Bloqueado"];
const RISK_VARIANT: Record<number, "success" | "warning" | "danger" | "violet"> = {
  0: "success", 1: "warning", 2: "danger", 3: "violet",
};

interface WorkItem {
  fingerprintHash: string;
  ipfsCid: string;
  authenticityScore: number;
  riskLevel: number;
  tokenId: number;
  timestamp: number;
  txHash: string;
  metadata?: AnyMetadata;
  metaLoading: boolean;
  metaError?: string;
  recoveredFromLocal?: boolean;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="space-y-4">
            <div className="flex justify-between"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-24" /></div>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-2 gap-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>
            <Skeleton className="h-12 w-full rounded-xl" />
          </Card>
        ))}
      </div>
    </div>
  );
}

// Helper para detectar el tipo de metadata
function isNFTMetadata(meta: any): meta is NFTMetadataJSON {
  return meta && typeof meta === 'object' && 'attributes' in meta && Array.isArray(meta.attributes);
}

function isLegacyMetadata(meta: any): meta is MuSecureMetadata {
  return meta && typeof meta === 'object' && 'encryptedAudio' in meta;
}

// Helper para extraer título
function extractTitle(meta: AnyMetadata | undefined): string | null {
  if (!meta) return null;
  if (isNFTMetadata(meta)) return meta.name || null;
  if (isLegacyMetadata(meta)) return meta.title || null;
  return null;
}

// Helper para extraer artista
function extractArtist(meta: AnyMetadata | undefined): string | null {
  if (!meta) return null;
  if (isNFTMetadata(meta)) {
    const artistAttr = meta.attributes?.find(
      attr => attr.trait_type === "Artista" || attr.trait_type === "Artist"
    );
    return artistAttr?.value?.toString() || null;
  }
  if (isLegacyMetadata(meta)) return meta.artist || null;
  return null;
}

// Helper para extraer info de audio
function extractAudioInfo(meta: AnyMetadata | undefined): { 
  isEncrypted: boolean; 
  audioCid: string;
  mimeType: string;
} {
  if (!meta) return { isEncrypted: false, audioCid: "", mimeType: "audio/mpeg" };
  
  if (isNFTMetadata(meta)) {
    const hasAudio = meta.animation_url && meta.animation_url !== "";
    const isEncrypted = !hasAudio;
    const audioCid = hasAudio ? meta.animation_url.replace("ipfs://", "") : "";
    const mimeTypeAttr = meta.attributes?.find(
      attr => attr.trait_type === "Tipo de Archivo" || attr.trait_type === "MimeType"
    );
    return { isEncrypted, audioCid, mimeType: mimeTypeAttr?.value?.toString() || "audio/mpeg" };
  }
  
  if (isLegacyMetadata(meta)) {
    return {
      isEncrypted: meta.encryptedAudio?.encrypted ?? false,
      audioCid: meta.encryptedAudio?.ciphertextCid ?? "",
      mimeType: (meta.encryptedAudio as any)?.mimeType ?? "audio/mpeg"
    };
  }
  
  return { isEncrypted: false, audioCid: "", mimeType: "audio/mpeg" };
}

// Recuperar metadata desde localStorage
function getLocalMetadata(tokenId: number, txHash: string): { metadata: AnyMetadata; audioCid: string } | null {
  try {
    const records = JSON.parse(localStorage.getItem('musecure:uploads') || '[]');
    // Buscar por timestamp aproximado o por otros criterios
    const record = records.find((r: any) => {
      // Intentar match por fecha cercana (mismo día)
      const recordDate = new Date(r.uploadedAt).toDateString();
      // Aquí podrías agregar más lógica de matching
      return true; // Temporal: devolver el primero que coincida en algo
    });
    
    if (record) {
      // Reconstruir metadata
      const metadata: MuSecureMetadata = {
        schemaVersion: "1.0",
        title: record.title,
        artist: record.artist,
        createdAt: new Date(record.uploadedAt).toISOString(),
        ownerAddress: record.ownerAddress,
        fingerprint: { sha256: "", data: [], durationSec: 0, algorithm: "musecure-v1" },
        encryptedAudio: {
          ciphertextCid: record.audioCid,
          encrypted: record.encrypted,
          dataToEncryptHash: "",
          accessConditions: null,
          litNetwork: null,
          originalFileName: "",
          mimeType: "audio/mpeg",
          originalSizeBytes: 0
        }
      };
      return { metadata, audioCid: record.audioCid };
    }
  } catch (e) {
    console.error("Error reading localStorage:", e);
  }
  return null;
}

export function Dashboard() {
  const { ready, authenticated, login } = usePrivy();
  const { address, signMessage } = useWallet();

  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorks = useCallback(async (ownerAddress: string) => {
    setLoading(true);
    setError(null);
    setWorks([]);
    try {
      const registryAddress = import.meta.env.VITE_REGISTRY_ADDRESS as string;
      if (!registryAddress) throw new Error("Falta VITE_REGISTRY_ADDRESS en .env");
      const rpc = (import.meta.env.VITE_ARBITRUM_RPC as string) ?? "https://sepolia-rollup.arbitrum.io/rpc";
      const provider = new ethers.JsonRpcProvider(rpc);
      const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
      const filter = registry.filters.WorkRegistered(ownerAddress);
      const logs = await registry.queryFilter(filter, 0, "latest");

      const items: WorkItem[] = (logs as any[])
        .map((log) => {
          const parsed = registry.interface.parseLog(log);
          if (!parsed) return null;
          const { fingerprintHash, ipfsCid, authenticityScore, riskLevel, tokenId, timestamp } = parsed.args;
          return {
            fingerprintHash, ipfsCid,
            authenticityScore: Number(authenticityScore),
            riskLevel: Number(riskLevel),
            tokenId: Number(tokenId),
            timestamp: Number(timestamp) * 1000,
            txHash: log.transactionHash,
            metaLoading: true,
          } as WorkItem;
        })
        .filter(Boolean) as WorkItem[];

      items.sort((a, b) => b.timestamp - a.timestamp);
      setWorks(items);

      // Cargar registros de localStorage para fallback
      const localRecords = JSON.parse(localStorage.getItem('musecure:uploads') || '[]');
      
      items.forEach((item) => {
        const itemCid = item.ipfsCid;
        const url = LighthouseService.gatewayUrl(itemCid);
        
        fetch(url)
          .then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const contentType = r.headers.get("content-type");
            if (!contentType?.includes("application/json")) {
              throw new Error("Invalid content type");
            }
            return r.json();
          })
          .then((meta: AnyMetadata) => {
            setWorks((prev) => prev.map((w) =>
              w.ipfsCid === itemCid ? { ...w, metadata: meta, metaLoading: false } : w
            ));
          })
          .catch(async (err) => {
            console.warn(`⚠️ CID ${itemCid} falló, buscando en localStorage...`);
            
            // Intentar recuperar de localStorage
            const matchingRecord = localRecords.find((r: any) => {
              // Buscar por timestamp cercano (±1 hora)
              const recordTime = r.uploadedAt;
              const itemTime = item.timestamp;
              return Math.abs(recordTime - itemTime) < 3600000; // 1 hora de diferencia
            });
            
            if (matchingRecord) {
              console.log(`✅ Recuperado de localStorage para #${item.tokenId}:`, matchingRecord.title);
              
              // Construir metadata desde el registro local
              const recoveredMeta: MuSecureMetadata = {
                schemaVersion: "1.0",
                title: matchingRecord.title,
                artist: matchingRecord.artist,
                createdAt: new Date(matchingRecord.uploadedAt).toISOString(),
                ownerAddress: matchingRecord.ownerAddress,
                fingerprint: { sha256: "", data: [], durationSec: 0, algorithm: "musecure-v1" },
                encryptedAudio: {
                  ciphertextCid: matchingRecord.audioCid,
                  encrypted: matchingRecord.encrypted,
                  dataToEncryptHash: "",
                  accessConditions: null,
                  litNetwork: null,
                  originalFileName: "",
                  mimeType: "audio/mpeg",
                  originalSizeBytes: 0
                }
              };
              
              setWorks((prev) => prev.map((w) =>
                w.ipfsCid === itemCid ? { 
                  ...w, 
                  metadata: recoveredMeta, 
                  metaLoading: false,
                  recoveredFromLocal: true 
                } : w
              ));
            } else {
              setWorks((prev) => prev.map((w) =>
                w.ipfsCid === itemCid
                  ? { ...w, metaLoading: false, metaError: "Metadata no disponible" }
                  : w
              ));
            }
          });
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && authenticated && address) loadWorks(address);
    else setWorks([]);
  }, [ready, authenticated, address, loadWorks]);

  if (!ready || loading) return <DashboardSkeleton />;

  if (!authenticated) return (
    <div className="flex flex-col items-center gap-4 py-24 border border-dashed border-emerald-500/20 rounded-3xl">
      <p className="font-mono text-xs uppercase tracking-wider text-emerald-500/60">Conecta tu wallet para ver tus obras</p>
      <Button onClick={login}><Shield className="h-3.5 w-3.5" />Conectar Wallet</Button>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Mis Obras</h2>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-emerald-500/60">Arbitrum Sepolia Ledger</p>
        </div>
        <div className="flex items-center gap-3">
          {address && (
            <div className="rounded-xl border border-surface-border bg-surface-raised px-4 py-2">
              <span className="font-mono text-xs text-emerald-500">{address.slice(0, 6)}...{address.slice(-4)}</span>
            </div>
          )}
          <Button variant="secondary" size="icon" onClick={() => address && loadWorks(address)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-center font-mono text-xs text-red-400">{error}</div>
      )}

      {works.length === 0 && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-24">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised">
            <Music className="h-7 w-7 text-zinc-600" />
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-zinc-600">No tienes obras registradas</p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {works.map((item, index) => {
          const title = extractTitle(item.metadata);
          const artist = extractArtist(item.metadata);
          const { isEncrypted, audioCid, mimeType } = extractAudioInfo(item.metadata);
          
          let displayTitle = `Obra #${item.tokenId}`;
          let displaySubtitle = "";
          
          if (item.metaLoading) {
            displayTitle = "Cargando...";
          } else if (title) {
            displayTitle = title;
            displaySubtitle = artist || "";
            if (item.recoveredFromLocal) {
              displaySubtitle += " 📦";
            }
          } else if (item.metaError) {
            displayTitle = `Obra #${item.tokenId}`;
            displaySubtitle = item.metaError;
          } else {
            displayTitle = `Obra #${item.tokenId}`;
            displaySubtitle = "Metadata no disponible";
          }
          
          const publicAudioUrl = audioCid ? LighthouseService.audioUrl(audioCid, mimeType) : "";
          const audioNotReady = !item.metaLoading && !audioCid && !isEncrypted;
          const hasError = !!item.metaError && !item.recoveredFromLocal;

          return (
            <motion.div
              key={item.tokenId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.06 }}
            >
              <Card className={`group flex h-full flex-col hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/5 ${hasError ? 'border-amber-500/20' : ''}`}>
                <div className="mb-6 flex items-center justify-between">
                  <Badge>NFT #{item.tokenId}</Badge>
                  <div className="flex items-center gap-2">
                    {item.recoveredFromLocal && (
                      <div className="flex items-center gap-1 text-blue-400" title="Recuperado de caché local">
                        <Database className="h-3 w-3" />
                      </div>
                    )}
                    {hasError && (
                      <div className="flex items-center gap-1 text-amber-500" title={item.metaError}>
                        <AlertCircle className="h-3 w-3" />
                      </div>
                    )}
                    <Badge variant={RISK_VARIANT[item.riskLevel] ?? "secondary"}>{RISK_LABEL[item.riskLevel]}</Badge>
                  </div>
                </div>

                {item.metaLoading ? (
                  <div className="space-y-2 mb-6">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ) : (
                  <>
                    <h3 className="truncate font-display text-base font-bold uppercase tracking-tight text-white">
                      {displayTitle}
                    </h3>
                    <p className={`mt-1 mb-6 font-mono text-[11px] font-semibold uppercase ${hasError ? 'text-amber-500/70' : 'text-emerald-500/70'}`}>
                      {displaySubtitle}
                    </p>
                  </>
                )}

                <div className="mb-6 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] p-3">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Score</p>
                    <p className="mt-1 font-display text-sm font-bold text-white">{item.authenticityScore}%</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] p-3">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Visibilidad</p>
                    <p className="mt-1 font-display text-sm font-bold text-emerald-500">
                      {item.metaLoading ? "..." : isEncrypted ? "Privado" : "Público"}
                    </p>
                  </div>
                </div>

                <div className="mt-auto">
                  {item.metaLoading ? (
                    <Skeleton className="h-14 w-full rounded-2xl" />
                  ) : hasError ? (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                      <p className="text-xs text-amber-400">Metadata no disponible</p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-500 truncate">{item.ipfsCid}</p>
                    </div>
                  ) : isEncrypted ? (
                    authenticated && address && signMessage ? (
                      <EncryptedAudioPlayer 
                        cid={audioCid} 
                        ownerAddress={address} 
                        signMessage={signMessage} 
                      />
                    ) : (
                      <Button onClick={() => login()} className="w-full">
                        <Shield className="h-3.5 w-3.5" />Conectar Wallet
                      </Button>
                    )
                  ) : (
                    <a
                      href={publicAudioUrl || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={[
                        "group/play flex w-full items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 no-underline transition-all",
                        audioNotReady
                          ? "pointer-events-none opacity-40"
                          : "hover:border-emerald-500/40 hover:bg-emerald-500/10",
                      ].join(" ")}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/25">
                        <Headphones className="h-4 w-4 text-black" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">Escuchar</p>
                        <p className="font-mono text-[10px] text-zinc-500 truncate">
                          {audioNotReady ? "Audio no disponible" : "Abrir en IPFS Gateway"}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-emerald-500/40" />
                    </a>
                  )}
                </div>

                <a
                  href={`https://sepolia.arbiscan.io/tx/${item.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-600 no-underline transition-colors hover:text-emerald-500"
                >
                  Blockchain Proof <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
