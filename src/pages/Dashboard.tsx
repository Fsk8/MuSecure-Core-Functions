/**
 * MuSecure – Dashboard v2
 *
 * - Lee WorkRegistered de Arbitrum Sepolia
 * - audioCid: metadata.encryptedAudio.ciphertextCid (no el ipfsCid del evento)
 * - Fallback de título: metadata.title → metadata.name → "Obra #N"
 * - URLs con audioUrl() para evitar descargas forzadas
 * - signMessage viene de useWallet (compatible con cualquier wallet)
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
import { RefreshCw, ExternalLink, Shield, Music, Headphones } from "lucide-react";
import type { MuSecureMetadata } from "@/types/ipfs";

const REGISTRY_ABI = [
  "event WorkRegistered(address indexed author, bytes32 indexed fingerprintHash, string ipfsCid, uint256 authenticityScore, uint8 riskLevel, uint256 tokenId, uint256 timestamp)",
];

const RISK_LABEL = ["Bajo Riesgo", "Riesgo Medio", "Alto Riesgo", "Bloqueado"];
const RISK_VARIANT: Record<number, "success" | "warning" | "danger" | "violet"> = {
  0: "success", 1: "warning", 2: "danger", 3: "violet",
};

interface WorkItem {
  fingerprintHash: string;
  ipfsCid: string;       // CID del JSON de metadata
  authenticityScore: number;
  riskLevel: number;
  tokenId: number;
  timestamp: number;
  txHash: string;
  metadata?: MuSecureMetadata & { name?: string };
  metaLoading: boolean;
  metaError?: string;
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

      items.forEach((item) => {
        fetch(LighthouseService.gatewayUrl(item.ipfsCid))
          .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then((meta) => {
            setWorks((prev) => prev.map((w) =>
              w.ipfsCid === item.ipfsCid ? { ...w, metadata: meta, metaLoading: false } : w
            ));
          })
          .catch(() => {
            setWorks((prev) => prev.map((w) =>
              w.ipfsCid === item.ipfsCid
                ? { ...w, metaLoading: false, metaError: `Obra #${item.tokenId}` }
                : w
            ));
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
          // CID real del audio — viene del JSON de metadata, NO del evento on-chain
          const audioCid = item.metadata?.encryptedAudio?.ciphertextCid ?? "";
          const isEncrypted = item.metadata?.encryptedAudio?.encrypted ?? false;
          const mimeType = (item.metadata?.encryptedAudio as any)?.mimeType ?? "audio/mpeg";

          // Fallback de título: title (MuSecure) → name (ERC-721) → "Obra #N"
          const displayTitle =
            item.metadata?.title
            ?? item.metadata?.name
            ?? item.metaError
            ?? `Obra #${item.tokenId}`;

          const displayArtist =
            item.metadata?.artist
            ?? (item.metadata as any)?.attributes?.find((a: any) => a.trait_type === "Artist")?.value
            ?? "—";

          const publicAudioUrl = audioCid ? LighthouseService.audioUrl(audioCid, mimeType) : "";
          const audioNotReady = !item.metaLoading && !audioCid && !isEncrypted;

          return (
            <motion.div
              key={item.tokenId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.06 }}
            >
              <Card className="group flex h-full flex-col hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/5">
                <div className="mb-6 flex items-center justify-between">
                  <Badge>NFT #{item.tokenId}</Badge>
                  <Badge variant={RISK_VARIANT[item.riskLevel] ?? "secondary"}>{RISK_LABEL[item.riskLevel]}</Badge>
                </div>

                {item.metaLoading ? (
                  <div className="space-y-2 mb-6"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                ) : (
                  <>
                    <h3 className="truncate font-display text-base font-bold uppercase tracking-tight text-white">{displayTitle}</h3>
                    <p className="mt-1 mb-6 font-mono text-[11px] font-semibold uppercase text-emerald-500/70">{displayArtist}</p>
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
                  ) : isEncrypted ? (
                    authenticated && address && signMessage ? (
                      <EncryptedAudioPlayer cid={audioCid} ownerAddress={address} signMessage={signMessage} />
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