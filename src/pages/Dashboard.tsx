/**
 * MuSecure – Dashboard v3 (Feed Global + Filtro Personal)
 * Versión Segura: Switch manual con Tailwind para evitar conflictos de librerías.
 * CORRECCIÓN: Mapeo de metadata para nombres de artista y títulos dinámicos.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";
import { EncryptedAudioPlayer } from "@/components/Encryptedaudioplayer";
import { LighthouseService } from "@/services/LighthouseService";
import { getWorksByAuthor, getAllWorks, getCreditsByCollaborator, getStats, type IndexedWork, type IndexedWorkCredit, type IndexerStats } from "@/services/EnvioIndexerService";
import { CollaboratorsList } from "@/components/CollaboratorsList";
import { LicenseControl } from "@/components/LicenseControl";
import { EarningsPanel } from "@/components/EarningsPanel";
import { goToArtistProfile } from "@/lib/Artistnavigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, ExternalLink, Shield, Music, Headphones, Globe, User, Users, BarChart3, Search, X } from "lucide-react";
import type { MuSecureMetadata } from "@/types/ipfs";
import { CHAIN, RPC_URL, txUrl } from "@/lib/chain";

const REGISTRY_ABI = [
  "event WorkRegistered(address indexed author, bytes32 indexed fingerprintHash, string ipfsCid, uint256 authenticityScore, uint8 riskLevel, uint256 tokenId, uint256 timestamp)",
];

const RISK_LABEL = ["Bajo Riesgo", "Riesgo Medio", "Alto Riesgo", "Bloqueado"];

// Bloque de despliegue del Registry en la red activa (Monad testnet: 69323359).
const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK ?? 69323359);

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
  fingerprintHash?: string;
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
  /** Co-autores acreditados on-chain (solo viene del indexador Envio). */
  credits?: IndexedWorkCredit[];
}

function cleanCid(raw: string): string {
  return String(raw).trim().replace("ipfs://", "").split("?")[0].split("/")[0];
}

/** Adapta una obra del indexer Envio al shape que usa este dashboard. */
function indexedToWorkItem(w: IndexedWork): WorkItem {
  return {
    tokenId: Number(w.tokenId),
    fingerprintHash: (w as any).fingerprintHash ?? (w as any).id,
    metadataCid: cleanCid(w.ipfsCid),
    audioCid: "",
    authenticityScore: Number(w.authenticityScore),
    riskLevel: Number(w.riskLevel),
    timestamp: Number(w.registeredAt) * 1000,
    txHash: w.txHash,
    author: w.author.id,
    title: `Obra #${Number(w.tokenId)}`,
    artist: "...",
    isEncrypted: false,
    metaLoading: true,
    credits: w.credits ?? [],
  };
}

/** Fallback: lee eventos WorkRegistered directo del RPC (por si el indexer no responde). */
async function fetchWorksFromRpc(authorAddress: string | null): Promise<WorkItem[]> {
  const RPC_ENDPOINTS = [
    RPC_URL,
  ].filter(Boolean);

  for (const url of RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
      const contract = new ethers.Contract(import.meta.env.VITE_REGISTRY_ADDRESS, REGISTRY_ABI, provider);
      const filter = contract.filters.WorkRegistered(authorAddress ? ethers.getAddress(authorAddress) : null);
      const logs: any[] = await contract.queryFilter(filter, DEPLOY_BLOCK, "latest");

      return logs.map((log) => {
        const { author, ipfsCid, authenticityScore, riskLevel, tokenId, timestamp } = log.args;
        return {
          tokenId: Number(tokenId),
          fingerprintHash: String(log.args.fingerprintHash),
          metadataCid: cleanCid(ipfsCid),
          audioCid: "",
          authenticityScore: Number(authenticityScore),
          riskLevel: Number(riskLevel),
          timestamp: Number(timestamp) * 1000,
          txHash: log.transactionHash,
          author,
          title: `Obra #${Number(tokenId)}`,
          artist: "...",
          isEncrypted: false,
          metaLoading: true,
        };
      });
    } catch {
      console.warn(`RPC Falló: ${url}`);
    }
  }
  throw new Error("Todos los RPC fallaron");
}

export function Dashboard() {
  const { authenticated, login } = usePrivy();
  const { address, signMessage, isReady } = useWallet();
  
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(true);
  /** Obras de otros autores donde mi wallet figura como co-autora. */
  const [showCollabs, setShowCollabs] = useState(false);
  const [artistQuery, setArtistQuery] = useState("");
  const [dataSource, setDataSource] = useState<"envio" | "rpc" | null>(null);
  const [stats, setStats] = useState<IndexerStats | null>(null);

  const fetchWorks = useCallback(async () => {
    if ((showOnlyMine || showCollabs) && !address) return;
    
    setFetchError(null);
    setRefreshing(true);

    let items: WorkItem[] = [];

    // 1) Fuente principal: indexer Envio (GraphQL) — rápido, sin escanear logs on-chain
    try {
      const indexed = showCollabs
        ? (await getCreditsByCollaborator(address!)).map((c) => c.work)
        : showOnlyMine
          ? await getWorksByAuthor(address!)
          : await getAllWorks(500);
      items = indexed.map(indexedToWorkItem);
      setDataSource("envio");
    } catch (indexerErr) {
      console.warn("[Dashboard] Envio no disponible, usando RPC directo:", indexerErr);

      // Los créditos solo existen en el indexador: sin Envio no hay fallback por RPC.
      if (showCollabs) {
        setFetchError("Las colaboraciones requieren el indexador Envio, que no responde ahora.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 2) Fallback: leer eventos directo del RPC (comportamiento anterior)
      try {
        items = await fetchWorksFromRpc(showOnlyMine ? address! : null);
        setDataSource("rpc");
      } catch {
        setFetchError("Error de red. Prueba sincronizar de nuevo.");
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    try {

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
          // + fallback al atributo "AudioCID" (obras cifradas: animation_url viene vacío).
          const animUrl: string = (meta as any).animation_url ?? "";
          const audioCidAttr = meta.attributes?.find((a: any) => {
            const tt = String(a?.trait_type ?? "").trim().toLowerCase();
            return tt === "audiocid" || tt === "audio cid" || tt === "audio_cid";
          })?.value;
          const audioCid =
            (meta.encryptedAudio?.ciphertextCid
              ?? (animUrl ? animUrl.replace("ipfs://", "").trim() : ""))
            || (typeof audioCidAttr === "string" ? audioCidAttr.replace("ipfs://", "").trim() : "");

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
  }, [address, showOnlyMine, showCollabs]);

  useEffect(() => {
    if (authenticated) fetchWorks();
  }, [authenticated, fetchWorks]);

  useEffect(() => {
    if (!authenticated) return;
    getStats()
      .then(setStats)
      .catch((e) => console.warn("[Dashboard] No se pudieron cargar las stats:", e));
  }, [authenticated]);

  // Filtro por artista: busca en los datos ya cargados, sin pegarle de nuevo a Envio.
  // Acepta la wallet completa o un fragmento (ej. los últimos 4 caracteres).
  // También oculta obras cifradas "huérfanas" (metadata antigua sin atributo AudioCID) —
  // nunca serán reproducibles, así que no vale la pena mostrarlas en el feed.
  const filteredWorks = useMemo(() => {
    const q = artistQuery.trim().toLowerCase();
    return works.filter((w) => {
      if (w.isEncrypted && !w.metaLoading && !w.audioCid) return false;
      if (!q) return true;
      return w.author.toLowerCase().includes(q);
    });
  }, [works, artistQuery]);

  function shortAddress(addr: string): string {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

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
            {showCollabs ? "Mis Colaboraciones" : showOnlyMine ? "Mis Protecciones" : "Explorar Obras"}
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60 mt-1">
             {CHAIN.name} Ledger{dataSource === "envio" && " · ⚡ Indexed by Envio"}
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
                onChange={() => {
                  setShowCollabs(false);
                  setShowOnlyMine(!showOnlyMine);
                }}
              />
              <div className="h-5 w-9 rounded-full bg-zinc-800 border border-zinc-700 peer-checked:bg-emerald-600 peer-checked:border-emerald-500 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-zinc-400 after:transition-all peer-checked:after:translate-x-full peer-checked:after:bg-white content-['']"></div>
            </label>

            <User className={`h-3.5 w-3.5 transition-colors ${showOnlyMine ? "text-emerald-500" : "text-zinc-600"}`} />
          </div>

          <div className="h-6 w-[1px] bg-zinc-800"></div>

          <Button
            variant={showCollabs ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowCollabs((v) => !v)}
            className="h-8 gap-1.5 rounded-xl px-3 font-mono text-[10px]"
            title="Obras de otros autores donde figuras como co-autor"
          >
            <Users className={`h-3.5 w-3.5 ${showCollabs ? "text-violet-400" : "text-zinc-500"}`} />
            Colaboraciones
          </Button>

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

      {!showOnlyMine && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={artistQuery}
            onChange={(e) => setArtistQuery(e.target.value)}
            placeholder="Filtrar por wallet del artista (0x... o los últimos caracteres)"
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/50 py-3 pl-10 pr-10 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
          />
          {artistQuery && (
            <button
              onClick={() => setArtistQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {artistQuery && (
            <p className="mt-2 font-mono text-[10px] text-zinc-500">
              {filteredWorks.length} obra{filteredWorks.length !== 1 ? "s" : ""}
              {filteredWorks.length > 0 && (
                <>
                  {" "}· Artista: <span className="text-emerald-400">{shortAddress(filteredWorks[0].author)}</span>
                  {" "}·{" "}
                  <button
                    onClick={() => goToArtistProfile(filteredWorks[0].author)}
                    className="text-violet-400 hover:underline"
                  >
                    Ver perfil completo →
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* Regalías por licencias: solo en la vista personal */}
      {showOnlyMine && !showCollabs && <EarningsPanel address={address} />}

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-2 text-zinc-600">
              <Shield className="h-3 w-3" />
              <p className="font-mono text-[9px] uppercase tracking-widest">Obras Registradas</p>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-white">{stats.totalWorks}</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-2 text-zinc-600">
              <Users className="h-3 w-3" />
              <p className="font-mono text-[9px] uppercase tracking-widest">Autores Únicos</p>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-white">{stats.uniqueAuthors}</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-emerald-400/70">
              <BarChart3 className="h-3 w-3" />
              <p className="font-mono text-[9px] uppercase tracking-widest">Score Promedio</p>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-emerald-400">{stats.avgAuthenticityScore}%</p>
          </div>

          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
            <div className="flex items-center gap-2 text-violet-400/70">
              <Shield className="h-3 w-3" />
              <p className="font-mono text-[9px] uppercase tracking-widest">% Soulbound</p>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-violet-400">{stats.soulboundPercentage}%</p>
          </div>

          <div className="col-span-2 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 sm:col-span-4">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Por Nivel de Riesgo (obras registradas exitosamente)</p>
            <div className="flex items-center gap-4 font-mono text-[10px]">
              <span className="text-emerald-400">Bajo {stats.riskBreakdown.low}</span>
              <span className="text-amber-400">Medio {stats.riskBreakdown.medium}</span>
              <span className="text-red-400">Alto {stats.riskBreakdown.high}</span>
            </div>
          </div>
        </div>
      )}

      {fetchError && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 font-mono text-xs text-amber-400">
          {fetchError}
        </p>
      )}

      {loading && !refreshing ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-[2.5rem] bg-zinc-900/50" />)}
        </div>
      ) : artistQuery && filteredWorks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[2.5rem] border border-dashed border-zinc-800 py-20">
          <Search className="h-8 w-8 text-zinc-700" />
          <p className="font-mono text-xs uppercase tracking-wider text-zinc-600">
            Ningún artista coincide con "{artistQuery}"
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredWorks.map((item) => (
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
                        <p className={`mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500 italic ${showOnlyMine && !showCollabs ? "mb-6" : "mb-1"}`}>By {item.artist}</p>
                        {(!showOnlyMine || showCollabs) && (
                          <button
                            onClick={() => goToArtistProfile(item.author)}
                            title={`Ver perfil de ${item.author}`}
                            className="mb-6 flex items-center gap-1 font-mono text-[9px] text-zinc-600 hover:text-emerald-400 transition-colors"
                          >
                            <User className="h-2.5 w-2.5" /> {shortAddress(item.author)}
                          </button>
                        )}
                      </>
                    )}

                    <CollaboratorsList credits={item.credits} myAddress={address} />

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
                    <LicenseControl fingerprintHash={item.fingerprintHash} author={item.author} title={item.title} audioUrl={item.audioCid ? LighthouseService.audioUrl(item.audioCid) : null} isEncrypted={item.isEncrypted} />
                    {!item.metaLoading && (
                      item.isEncrypted ? (
                        !item.audioCid ? (
                          <div className="w-full rounded-2xl border border-zinc-700 bg-zinc-800/30 p-3 text-center">
                            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                              Metadata antigua — audio no vinculado
                            </p>
                          </div>
                        ) : address && item.author.toLowerCase() === address.toLowerCase() ? (
                          isReady && signMessage ? (
                            <EncryptedAudioPlayer cid={item.audioCid} ownerAddress={address} signMessage={signMessage} />
                          ) : (
                            <Button onClick={login} className="w-full rounded-2xl bg-zinc-800 border-zinc-700 hover:bg-zinc-700" variant="secondary">
                              <Shield className="h-3.5 w-3.5 mr-2" /> Desbloquear
                            </Button>
                          )
                        ) : (
                          <div className="w-full rounded-2xl border border-zinc-700 bg-zinc-800/30 p-3 text-center">
                            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                              Cifrado — solo el propietario puede reproducirlo
                            </p>
                          </div>
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
                    <a href={txUrl(item.txHash)} target="_blank" className="flex items-center justify-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.3em] text-zinc-700 hover:text-emerald-500 transition-colors no-underline">
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