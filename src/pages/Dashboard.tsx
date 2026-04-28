/**
 * MuSecure – Dashboard v3 (Feed Global + Filtro Personal)
 * Versión Segura: Switch manual con Tailwind para evitar conflictos de librerías.
 * CORRECCIÓN: Mapeo de metadata para nombres de artista y títulos dinámicos.
 */

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";
import { EncryptedAudioPlayer } from "@/components/Encryptedaudioplayer";
import { LighthouseService } from "@/services/LighthouseService";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, ExternalLink, Shield, Music, Headphones, Globe, User } from "lucide-react";
import type { MuSecureMetadata } from "@/types/ipfs";

const REGISTRY_ABI = [
  "event WorkRegistered(address indexed author, bytes32 indexed fingerprintHash, string ipfsCid, uint256 authenticityScore, uint8 riskLevel, uint256 tokenId, uint256 timestamp)",
];

const RISK_LABEL = ["Bajo Riesgo", "Riesgo Medio", "Alto Riesgo", "Bloqueado"];

const DEPLOY_BLOCK = 255365885; 

const getRiskVariant = (level: number): "success" | "warning" | "danger" | "violet" | "secondary" => {
  switch (level) {
    case 0: return "success";
    case 1: return "warning";
    case 2: return "danger";
    case 3: return "violet";
    default: return "secondary";
  }
};

interface WorkItem {
  tokenId: number;
  metadataCid: string;
  audioCid: string;
  authenticityScore: number;
  riskLevel: number;
  timestamp: number;
  txHash: string;
  author: string;
  title: string;
  artist: string;
  isEncrypted: boolean;
  metaLoading: boolean;
}

export function Dashboard() {
  const { authenticated, login } = usePrivy();
  const { address, signMessage, isReady } = useWallet();
  
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(true);

  const fetchWorks = useCallback(async () => {
    if (showOnlyMine && !address) return;
    
    setFetchError(null);
    setRefreshing(true);

    const RPC_ENDPOINTS = [
      "https://sepolia-rollup.arbitrum.io/rpc", 
      import.meta.env.VITE_RPC_URL 
    ].filter(Boolean);

    let logs: any[] = [];
    let success = false;

    for (const url of RPC_ENDPOINTS) {
      if (success) break;
      try {
        const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
        const contract = new ethers.Contract(import.meta.env.VITE_REGISTRY_ADDRESS, REGISTRY_ABI, provider);
        
        const filter = contract.filters.WorkRegistered(showOnlyMine ? ethers.getAddress(address!) : null);
        
        logs = await contract.queryFilter(filter, DEPLOY_BLOCK, "latest");
        success = true;
      } catch (e) {
        console.warn(`RPC Falló: ${url}`);
      }
    }

    if (!success) {
      setFetchError("Error de red. Prueba sincronizar de nuevo.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const items: WorkItem[] = logs.map((log) => {
        const { author, ipfsCid, authenticityScore, riskLevel, tokenId, timestamp } = log.args;
        const cleanCid = String(ipfsCid).trim().replace("ipfs://", "").split("?")[0].split("/")[0];

        return {
          tokenId: Number(tokenId),
          metadataCid: cleanCid,
          audioCid: "",
          authenticityScore: Number(authenticityScore),
          riskLevel: Number(riskLevel),
          timestamp: Number(timestamp) * 1000,
          txHash: log.transactionHash,
          author: author,
          title: `Obra #${Number(tokenId)}`,
          artist: "...",
          isEncrypted: false,
          metaLoading: true,
        };
      });

      setWorks(items.sort((a, b) => b.timestamp - a.timestamp));

      items.forEach((item) => {
        // Intentar primero con el gateway del servicio, luego fallback directo a Lighthouse
        // Esto resuelve el problema en Vercel donde el proxy (/api/ipfs) puede dar 402/redirect
        const urls = [
          LighthouseService.gatewayUrl(item.metadataCid),
          `https://gateway.lighthouse.storage/ipfs/${item.metadataCid}`,
        ];

        const fetchMeta = async () => {
          for (const url of urls) {
            try {
              const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
              // Verificar que la respuesta es válida antes de parsear
              if (!r.ok) continue;
              const contentType = r.headers.get("content-type") ?? "";
              // Evitar parsear HTML de páginas de error como JSON
              if (!contentType.includes("json") && !contentType.includes("octet")) continue;
              const meta: MuSecureMetadata & { name?: string; attributes?: any[] } = await r.json();
              return meta;
            } catch {
              continue;
            }
          }
          return null;
        };

        fetchMeta().then((meta) => {
          if (!meta) {
            setWorks((prev) => prev.map((w) =>
              w.tokenId === item.tokenId ? { ...w, metaLoading: false } : w
            ));
            return;
          }

          // Soporte dual: formato MuSecure (encryptedAudio) + ERC-721 (animation_url)
          const animUrl: string = (meta as any).animation_url ?? "";
          const audioCid =
            meta.encryptedAudio?.ciphertextCid
            ?? (animUrl ? animUrl.replace("ipfs://", "").trim() : "");

          const protAttr = meta.attributes?.find(
            (a: any) => a.trait_type === "Protección" || a.trait_type === "Encrypted"
          );
          const isEncrypted =
            meta.encryptedAudio?.encrypted === true
            || protAttr?.value === "Cifrado"
            || protAttr?.value === true;

          const attrArtist = meta.attributes?.find(
            (a: any) => a.trait_type === "Artista" || a.trait_type === "Artist"
          )?.value;
          const finalArtist = meta.artist || attrArtist || "Unknown Artist";
          const finalTitle = meta.title || (meta as any).name || item.title;

          setWorks((prev) => prev.map((w) =>
            w.tokenId === item.tokenId
              ? { ...w, audioCid, isEncrypted, title: finalTitle, artist: String(finalArtist), metaLoading: false }
              : w
          ));
        });
      });
    } catch (e) {
      setFetchError("Error al procesar registros.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address, showOnlyMine]);

  useEffect(() => {
    if (authenticated) fetchWorks();
  }, [authenticated, fetchWorks]);

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 border border-dashed border-emerald-500/20 rounded-[3rem] mt-4 bg-zinc-900/10">
        <Music className="h-10 w-10 text-zinc-700" />
        <Button onClick={login} className="rounded-2xl">Conectar Wallet</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-4 pb-12 px-4 sm:px-0">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-white tracking-tight">
            {showOnlyMine ? "Mis Protecciones" : "Explorar Obras"}
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60 mt-1">
             Arbitrum Sepolia Ledger
          </p>
        </div>

        <div className="flex items-center gap-4 bg-zinc-900/80 p-1.5 rounded-2xl border border-zinc-800 shadow-xl">
          <div className="flex items-center gap-3 px-3">
            <Globe className={`h-3.5 w-3.5 transition-colors ${!showOnlyMine ? "text-emerald-500" : "text-zinc-600"}`} />
            
            <label className="relative inline-flex cursor-pointer items-center">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={showOnlyMine}
                onChange={() => setShowOnlyMine(!showOnlyMine)}
              />
              <div className="h-5 w-9 rounded-full bg-zinc-800 border border-zinc-700 peer-checked:bg-emerald-600 peer-checked:border-emerald-500 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-zinc-400 after:transition-all peer-checked:after:translate-x-full peer-checked:after:bg-white content-['']"></div>
            </label>

            <User className={`h-3.5 w-3.5 transition-colors ${showOnlyMine ? "text-emerald-500" : "text-zinc-600"}`} />
          </div>

          <div className="h-6 w-[1px] bg-zinc-800"></div>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={fetchWorks} 
            disabled={refreshing} 
            className="h-8 w-8 rounded-xl hover:bg-zinc-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-emerald-500 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {fetchError && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 font-mono text-xs text-amber-400">
          {fetchError}
        </p>
      )}

      {loading && !refreshing ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-[2.5rem] bg-zinc-900/50" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {works.map((item) => (
              <motion.div 
                key={item.tokenId} 
                layout
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="flex h-full flex-col border-zinc-800 bg-zinc-900/30 p-6 hover:border-emerald-500/30 transition-all backdrop-blur-sm relative group overflow-hidden">
                  
                  {address && item.author.toLowerCase() === address.toLowerCase() && (
                    <div className="absolute top-0 right-0 p-2">
                       <Badge variant="success" className="text-[8px] h-4 px-1 opacity-50">TÚ</Badge>
                    </div>
                  )}

                  <div className="mb-6 flex items-center justify-between">
                    <Badge variant="secondary" className="font-mono text-[9px]">ID #{item.tokenId}</Badge>
                    <Badge variant={getRiskVariant(item.riskLevel)}>
                      {RISK_LABEL[item.riskLevel]}
                    </Badge>
                  </div>

                  <div className="flex-1">
                    {item.metaLoading ? (
                      <div className="space-y-2 mb-6"><Skeleton className="h-5 w-3/4 bg-zinc-800" /><Skeleton className="h-3 w-1/2 bg-zinc-800" /></div>
                    ) : (
                      <>
                        <h3 className="truncate font-display text-lg font-bold text-white tracking-tight uppercase group-hover:text-emerald-400 transition-colors">{item.title}</h3>
                        <p className="mt-1 mb-6 font-mono text-[10px] uppercase tracking-widest text-zinc-500 italic">By {item.artist}</p>
                      </>
                    )}

                    <div className="mb-6 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Score</p>
                        <p className="mt-1 font-display text-sm font-bold text-white">{item.authenticityScore}%</p>
                      </div>
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Visibilidad</p>
                        <p className="mt-1 font-display text-sm font-bold text-emerald-500/80">{item.isEncrypted ? "Cifrado" : "Público"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto space-y-4">
                    {!item.metaLoading && (
                      item.isEncrypted ? (
                        isReady && address && signMessage ? (
                          <EncryptedAudioPlayer cid={item.audioCid} ownerAddress={address} signMessage={signMessage} />
                        ) : (
                          <Button onClick={login} className="w-full rounded-2xl bg-zinc-800 border-zinc-700 hover:bg-zinc-700" variant="secondary">
                            <Shield className="h-3.5 w-3.5 mr-2" /> Desbloquear
                          </Button>
                        )
                      ) : item.audioCid ? (
                        <a href={LighthouseService.audioUrl(item.audioCid)} target="_blank" className="flex w-full items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 hover:bg-emerald-500/10 transition-colors group/btn no-underline">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-black shadow-lg shadow-emerald-500/10 group-hover/btn:scale-105 transition-transform"><Headphones className="h-4 w-4" /></div>
                          <div className="flex-1 text-left"><p className="text-sm font-bold text-white m-0">Escuchar</p><p className="font-mono text-[9px] text-zinc-500 m-0">Open IPFS</p></div>
                          <ExternalLink className="h-3.5 w-3.5 text-zinc-600 group-hover/btn:text-emerald-500" />
                        </a>
                      ) : (
                        <div className="text-center py-4 border border-zinc-800 rounded-2xl opacity-40">
                          <p className="font-mono text-[9px] uppercase tracking-widest">Sin Audio Registrado</p>
                        </div>
                      )
                    )}
                    <a href={`https://sepolia.arbiscan.io/tx/${item.txHash}`} target="_blank" className="flex items-center justify-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.3em] text-zinc-700 hover:text-emerald-500 transition-colors no-underline">
                      Blockchain Proof <ExternalLink className="h-2 w-2" />
                    </a>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}