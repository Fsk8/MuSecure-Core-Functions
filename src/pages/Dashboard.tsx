/**
 * MuSecure – Dashboard v2
 * Lee obras directamente desde eventos WorkRegistered en Arbitrum Sepolia.
 * Funciona desde cualquier dispositivo con la wallet conectada.
 */

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { LighthouseService } from "@/services/LighthouseService";
import { useWallet } from "@/hooks/useWallet";
import { EncryptedAudioPlayer } from "@/components/Encryptedaudioplayer";
import type { MuSecureMetadata } from "@/types/ipfs";

// ── ABI mínimo — solo el evento que necesitamos ───────────────────────────────
const REGISTRY_ABI = [
  "event WorkRegistered(address indexed author, bytes32 indexed fingerprintHash, string ipfsCid, uint256 authenticityScore, uint8 riskLevel, uint256 tokenId, uint256 timestamp)",
];

const RISK_LABEL = ["Low Risk", "Medium Risk", "High Risk", "Blocked"];
const RISK_COLOR = ["#10b981", "#f59e0b", "#ef4444", "#6b21a8"];

interface WorkItem {
  fingerprintHash: string;
  ipfsCid: string;
  metadataUrl: string;
  authenticityScore: number;
  riskLevel: number;
  tokenId: number;
  timestamp: number;
  txHash: string;
  // cargado después desde IPFS
  metadata?: MuSecureMetadata;
  metaLoading?: boolean;
  metaError?: string;
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function Dashboard() {
  const wallet = useWallet();
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

      const rpc = import.meta.env.VITE_ARBITRUM_RPC as string
        ?? "https://sepolia-rollup.arbitrum.io/rpc";

      const provider = new ethers.JsonRpcProvider(rpc);
      const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);

      // Filtrar eventos WorkRegistered por author = wallet conectada
      const filter = registry.filters.WorkRegistered(ownerAddress);
      const logs = await registry.queryFilter(filter, 0, "latest");

      const items: WorkItem[] = logs
        .map((log: any) => {
          const parsed = registry.interface.parseLog(log);
          if (!parsed) return null;
          const { fingerprintHash, ipfsCid, authenticityScore, riskLevel, tokenId, timestamp } = parsed.args;
          return {
            fingerprintHash,
            ipfsCid,
            metadataUrl: LighthouseService.gatewayUrl(ipfsCid),
            authenticityScore: Number(authenticityScore),
            riskLevel: Number(riskLevel),
            tokenId: Number(tokenId),
            timestamp: Number(timestamp) * 1000,
            txHash: log.transactionHash,
            metaLoading: true,
          } as WorkItem;
        })
        .filter(Boolean) as WorkItem[];

      // Ordenar por más reciente primero
      items.sort((a, b) => b.timestamp - a.timestamp);
      setWorks(items);

      // Cargar metadata de IPFS en paralelo (lazy)
      items.forEach((item, idx) => {
        fetch(LighthouseService.gatewayUrl(item.ipfsCid))
          .then((r) => r.json())
          .then((meta: MuSecureMetadata) => {
            setWorks((prev) =>
              prev.map((w, i) =>
                i === idx ? { ...w, metadata: meta, metaLoading: false } : w
              )
            );
          })
          .catch(() => {
            setWorks((prev) =>
              prev.map((w, i) =>
                i === idx ? { ...w, metaLoading: false, metaError: "No se pudo cargar metadata" } : w
              )
            );
          });
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (wallet.address) loadWorks(wallet.address);
    else setWorks([]);
  }, [wallet.address, loadWorks]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Mis Obras Registradas</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Leído directamente desde Arbitrum Sepolia
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!wallet.address ? (
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all"
            >
              {wallet.connecting ? "Conectando…" : "🔗 Conectar Wallet"}
            </button>
          ) : (
            <>
              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-xl text-xs font-mono">
                ✓ {short(wallet.address)}
              </span>
              <button
                onClick={() => loadWorks(wallet.address!)}
                disabled={loading}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl text-xs transition-all"
              >
                {loading ? "Cargando…" : "↺ Actualizar"}
              </button>
            </>
          )}
        </div>
      </div>

      {wallet.error && <p className="text-red-400 text-sm">{wallet.error}</p>}
      {error && <p className="text-red-400 text-sm font-mono">{error}</p>}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-zinc-400 text-sm">
          <div className="animate-spin h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
          Consultando eventos en Arbitrum Sepolia…
        </div>
      )}

      {/* Sin resultados */}
      {!loading && wallet.address && works.length === 0 && !error && (
        <div className="border border-dashed border-zinc-800 rounded-2xl p-10 text-center text-zinc-600 italic">
          No hay obras registradas para esta wallet.
        </div>
      )}

      {/* Lista de obras */}
      {works.map((item) => (
        <article
          key={item.fingerprintHash}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4"
        >
          {/* Título y artista desde metadata */}
          <div className="flex justify-between items-start">
            <div>
              {item.metaLoading ? (
                <div className="h-5 w-48 bg-zinc-800 rounded animate-pulse" />
              ) : item.metadata ? (
                <>
                  <h3 className="text-white font-bold text-lg">{item.metadata.title}</h3>
                  <p className="text-zinc-400 text-sm">{item.metadata.artist}</p>
                </>
              ) : (
                <p className="text-zinc-500 text-sm italic">{item.metaError ?? "Metadata no disponible"}</p>
              )}
            </div>

            {/* Risk badge */}
            <span
              className="text-[10px] px-2 py-1 rounded font-bold uppercase"
              style={{
                backgroundColor: `${RISK_COLOR[item.riskLevel]}20`,
                color: RISK_COLOR[item.riskLevel],
              }}
            >
              {RISK_LABEL[item.riskLevel]}
            </span>
          </div>

          {/* Datos on-chain */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
            <div className="bg-black/30 p-3 rounded-xl">
              <p className="text-zinc-500 uppercase tracking-widest mb-1">NFT Token</p>
              <p className="text-white font-mono font-bold">#{item.tokenId}</p>
            </div>
            <div className="bg-black/30 p-3 rounded-xl">
              <p className="text-zinc-500 uppercase tracking-widest mb-1">Score</p>
              <p className="text-white font-bold">{item.authenticityScore}/100</p>
            </div>
            <div className="bg-black/30 p-3 rounded-xl">
              <p className="text-zinc-500 uppercase tracking-widest mb-1">Registrado</p>
              <p className="text-white">{new Date(item.timestamp).toLocaleDateString()}</p>
            </div>
            <div className="bg-black/30 p-3 rounded-xl">
              <p className="text-zinc-500 uppercase tracking-widest mb-1">Estado</p>
              <p className="text-white">
                {item.metadata?.encryptedAudio.encrypted ? "🔒 Privado" : "🌐 Público"}
              </p>
            </div>
          </div>

          {/* Audio */}
          <div>
            {item.metadata ? (
              item.metadata.encryptedAudio.encrypted ? (
                wallet.signMessage ? (
                  <EncryptedAudioPlayer
                    cid={item.metadata.encryptedAudio.ciphertextCid}
                    ownerAddress={wallet.address!}
                    signMessage={wallet.signMessage}
                  />
                ) : (
                  <p className="text-zinc-500 text-xs">Conecta wallet para escuchar</p>
                )
              ) : (
                <audio
                  controls
                  preload="none"
                  src={LighthouseService.gatewayUrl(item.metadata.encryptedAudio.ciphertextCid)}
                  className="w-full"
                />
              )
            ) : item.metaLoading ? (
              <div className="h-8 bg-zinc-800 rounded animate-pulse" />
            ) : null}
          </div>

          {/* Links */}
          <div className="flex gap-4 text-[10px]">
            <a
              href={`https://sepolia.arbiscan.io/tx/${item.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-400 hover:underline"
            >
              Ver tx en Arbiscan ↗
            </a>
            <a
              href={item.metadataUrl}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-500 hover:underline"
            >
              Ver metadata IPFS ↗
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}