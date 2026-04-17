/**
 * MuSecure – Dashboard v3 (Feed Global + Filtro Personal)
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, ExternalLink, Shield, Music, Headphones, AlertCircle, Globe, User } from "lucide-react";
import type { MuSecureMetadata } from "@/types/ipfs";

const REGISTRY_ABI = [
  "event WorkRegistered(address indexed author, bytes32 indexed fingerprintHash, string ipfsCid, uint256 authenticityScore, uint8 riskLevel, uint256 tokenId, uint256 timestamp)",
];

const RISK_LABEL = ["Bajo Riesgo", "Riesgo Medio", "Alto Riesgo", "Bloqueado"];

const DEPLOY_BLOCK = 75000000; 

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
  title: string;
  artist: string;
  author: string; // Guardamos quien lo subió
  isEncrypted: boolean;
  metaLoading: boolean;
  metaError?: string;
}

export function Dashboard() {
  const { authenticated, login } = usePrivy();
  const { address, signMessage, isReady } = useWallet();
  
  // Estados de datos y filtros
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(true);

  const fetchWorks = useCallback(async () => {
    // Si queremos filtrar por "Mio" pero no hay wallet, forzamos "Todos" o paramos
    if (showOnlyMine && !address) return;
    
    setError(null);
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
        
        // 🪄 DINAMISMO AQUÍ: 
        // Si showOnlyMine es true -> Filtramos por address del usuario.
        // Si es false -> Filtramos por null (trae todos los eventos del contrato).
        const filter = contract.filters.WorkRegistered(showOnlyMine ? ethers.getAddress(address!) : null);
        //desde la creacion de mi contrato
        logs = await contract.queryFilter(filter, DEPLOY_BLOCK, "latest");
        success = true;
      } catch (e) {
        console.warn(`RPC Error en ${url}`);
      }
    }

    if (!success) {
      setError("Error de conexión con Arbitrum Sepolia.");
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

      // Carga asíncrona de metadata
      items.forEach((item) => {
        fetch(LighthouseService.gatewayUrl(item.metadataCid))
          .then((r) => r.json())
          .then((meta: MuSecureMetadata & { name?: string; attributes?: any[] }) => {
            const audioCid = (meta.encryptedAudio?.ciphertextCid ?? (meta as any).animation_url ?? "").replace("ipfs://", "");
            const isEncrypted = !!(meta.encryptedAudio?.encrypted || meta.attributes?.some(a => a.value === "Cifrado" || a.value === true));

            setWorks((prev) => prev.map((w) =>
              w.tokenId === item.tokenId
                ? { ...w, audioCid, isEncrypted, title: meta.title ?? meta.name ?? w.title, artist: meta.artist ?? "—", metaLoading: false }
                : w
            ));
          })
          .catch(() => {
            setWorks((prev) => prev.map((w) =>
              w.tokenId === item.tokenId ? { ...w, metaLoading: false } : w
            ));
          });
      });
    } catch (e) {
      setError("Error al procesar los datos de la obra.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address, showOnlyMine]);

  useEffect(() => {
    if (authenticated) {
      fetchWorks();
    }
  }, [authenticated, fetchWorks]);

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 border border-dashed border-emerald-500/20 rounded-[3rem] mt-4 bg-zinc-900/10">
        <Music className="h-10 w-10 text-zinc-700" />
        <Button onClick={login} className="rounded-2xl bg-emerald-600 hover:bg-emerald-500">
          <Shield className="h-4 w-4 mr-2" /> Conectar para entrar al Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-4 pb-12">
      {/* HEADER CON TOGGLE */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-white tracking-tight">
            {showOnlyMine ? "Mis Protecciones" : "Explorar Obras"}
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60 mt-1">
            {showOnlyMine ? `Wallet: ${address?.slice(0,6)}...${address?.slice(-4)}` : "Protocolo Global MuSecure"}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-zinc-900/50 p-2 rounded-2xl border border-zinc-800">
          <div className="flex items-center space-x-2 px-2">
            <Globe className={`h-3.5 w-3.5 ${!showOnlyMine ? "text-emerald-500" : "text-zinc-600"}`} />
            <Switch 
              id="view-filter" 
              checked={showOnlyMine} 
              onCheckedChange={setShowOnlyMine} 
            />
            <User className={`h-3.5 w-3.5 ${showOnlyMine ? "text-emerald-500" : "text-zinc-600"}`} />
            <Label htmlFor="view-filter" className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 cursor-pointer">
              {showOnlyMine ? "Solo yo" : "Todos"}
            </Label>
          </div>
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

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center font-mono text-[10px] text-red-400">{error}</div>}

      {loading && !refreshing ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-[2.5rem] bg-zinc-900/50" />)}
        </div>
      ) : (
        <>
          {works.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-32 border border-zinc-900 rounded-[3rem]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 opacity-20">
                <Music className="h-8 w-8 text-white" />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600">Nada que mostrar aquí</p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {works.map((item, index) => (
                  <motion.div 
                    key={item.tokenId} 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                  >
                    <Card className="flex h-full flex-col border-zinc-800 bg-zinc-900/30 p-6 hover:border-emerald-500/30 transition-all backdrop-blur-sm relative overflow-hidden group">
                      {/* Badge de "Tu obra" si es del usuario logueado */}
                      {address && item.author.toLowerCase() === address.toLowerCase() && (
                        <div className="absolute -right-8 -top-8 bg-emerald-500/10 p-10 rotate-45 border border-emerald-500/20">
                           <User className="h-3 w-3 text-emerald-500 -rotate-45 translate-y-2" />
                        </div>
                      )}

                      <div className="mb-6 flex items-center justify-between">
                        <Badge variant="secondary" className="font-mono text-[9px] tracking-tighter uppercase">NFT #{item.tokenId}</Badge>
                        <Badge variant={getRiskVariant(item.riskLevel)} className="text-[9px]">
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
                            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Privacidad</p>
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
                              <div className="flex-1 text-left"><p className="text-sm font-bold text-white m-0">Reproducir</p><p className="font-mono text-[9px] text-zinc-500 m-0">Open IPFS</p></div>
                              <ExternalLink className="h-3.5 w-3.5 text-zinc-600 group-hover/btn:text-emerald-500" />
                            </a>
                          ) : (
                            <div className="text-center py-4 border border-zinc-800 rounded-2xl opacity-40">
                              <p className="font-mono text-[9px] uppercase tracking-widest">Sin Audio CID</p>
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
        </>
      )}
    </div>
  );
}