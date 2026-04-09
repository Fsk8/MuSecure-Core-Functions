/**
 * MuSecure – Dashboard v2 (Privy Edition)
 * Fixes:
 * - "CARGANDO..." mientras espera metadata → skeleton animado
 * - Audio usa ciphertextCid de la metadata, no el CID de la metadata
 * - Reproductor público con preload="metadata" para que el play no desaparezca
 * - Visibilidad solo se muestra cuando metadata ya cargó
 */

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { LighthouseService } from "@/services/LighthouseService";
import { usePrivy } from "@privy-io/react-auth";
import { EncryptedAudioPlayer } from "@/components/Encryptedaudioplayer";
import type { MuSecureMetadata } from "@/types/ipfs";

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
  metadata?: MuSecureMetadata;
  metaLoading: boolean;
  metaError?: string;
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Skeleton para cuando metadata no cargó aún
function SkeletonLine({ width, height = 12 }: { width: string; height?: number }) {
  return (
    <div style={{
      width, height, borderRadius: 6,
      background: 'linear-gradient(90deg, #1a1a1a 25%, #222 50%, #1a1a1a 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
  );
}

export function Dashboard() {
  const { ready, authenticated, user, login, signMessage } = usePrivy();
  const address = user?.wallet?.address;

  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorks = useCallback(async (ownerAddress: string) => {
    setLoading(true);
    setError(null);
    setWorks([]);
    try {
      const registryAddress = import.meta.env.VITE_REGISTRY_ADDRESS as string;
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

      items.sort((a, b) => b.timestamp - a.timestamp);
      setWorks(items);

      // Cargar metadata de cada obra en paralelo
      items.forEach((item) => {
        fetch(LighthouseService.gatewayUrl(item.ipfsCid))
          .then((r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then((meta: MuSecureMetadata) => {
            setWorks((prev) =>
              prev.map((w) =>
                w.ipfsCid === item.ipfsCid ? { ...w, metadata: meta, metaLoading: false } : w
              )
            );
          })
          .catch(() => {
            setWorks((prev) =>
              prev.map((w) =>
                w.ipfsCid === item.ipfsCid
                  ? { ...w, metaLoading: false, metaError: "No se pudo cargar metadata" }
                  : w
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
    if (ready && authenticated && address) loadWorks(address);
    else setWorks([]);
  }, [ready, authenticated, address, loadWorks]);

  if (!ready) return (
    <div style={{ padding: '80px', textAlign: 'center', color: '#10b981', textTransform: 'uppercase', fontSize: '10px', fontWeight: '900', fontStyle: 'italic' }}>
      Sincronizando...
    </div>
  );

  if (!authenticated) return (
    <div style={{ textAlign: 'center', padding: '80px', border: '2px dashed #10b98133', borderRadius: '40px' }}>
      <p style={{ color: '#10b981', textTransform: 'uppercase', fontWeight: '900', fontSize: '0.75rem', marginBottom: '16px' }}>
        Conecta tu wallet para ver tus obras
      </p>
      <button onClick={login} style={{ backgroundColor: '#10b981', color: '#000', border: 'none', padding: '12px 32px', borderRadius: '12px', cursor: 'pointer', fontWeight: '900', fontSize: '12px', textTransform: 'uppercase' }}>
        Conectar
      </button>
    </div>
  );

  return (
    <div style={{ padding: '20px' }}>
      {/* Shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111111', border: '1px solid #10b98133', padding: '24px 32px', borderRadius: '32px', marginBottom: '40px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '-0.025em', margin: 0 }}>Mis Obras</h2>
          <p style={{ fontSize: '9px', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '4px' }}>Arbitrum Sepolia Ledger</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#10b981', padding: '8px 16px', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid #10b98122' }}>
            {short(address!)}
          </span>
          <button
            onClick={() => loadWorks(address!)}
            disabled={loading}
            style={{ backgroundColor: '#10b981', color: '#000000', border: 'none', padding: '8px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: '900', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "..." : "↺"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: '10px', textAlign: 'center', marginBottom: '20px' }}>{error}</p>}

      {!loading && works.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '60px', border: '1px dashed #10b98133', borderRadius: '32px', color: '#10b98166', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase' }}>
          No hay obras registradas para esta wallet.
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '32px' }}>
        {works.map((item) => {
          const isEncrypted = item.metadata?.encryptedAudio?.encrypted ?? false;
          // ── FIX CRÍTICO: usar ciphertextCid para el audio, no ipfsCid ──
          const audioCid = item.metadata?.encryptedAudio?.ciphertextCid ?? "";
          const audioUrl = audioCid ? LighthouseService.gatewayUrl(audioCid) : "";

          return (
            <div key={item.tokenId} style={{ backgroundColor: '#111111', border: '1px solid #10b98133', padding: '32px', borderRadius: '32px', display: 'flex', flexDirection: 'column', transition: 'all 0.3s ease' }}>

              {/* Badge NFT + Risk */}
              <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <span style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px', borderRadius: '9999px', backgroundColor: '#10b981', color: '#000000' }}>
                  NFT #{item.tokenId}
                </span>
                <span style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', color: RISK_COLOR[item.riskLevel] }}>
                  {RISK_LABEL[item.riskLevel]}
                </span>
              </div>

              {/* Título — skeleton mientras carga */}
              {item.metaLoading ? (
                <div style={{ marginBottom: '28px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <SkeletonLine width="75%" height={16} />
                  <SkeletonLine width="45%" height={10} />
                </div>
              ) : (
                <>
                  <h3 style={{ fontWeight: 'bold', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1rem', marginBottom: '4px', textTransform: 'uppercase', marginTop: 0 }}>
                    {item.metadata?.title ?? item.metaError ?? "Sin título"}
                  </h3>
                  <p style={{ fontSize: '10px', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '24px', marginTop: 0 }}>
                    {item.metadata?.artist ?? "—"}
                  </p>
                </>
              )}

              {/* Score + Visibilidad — solo cuando metadata cargó */}
              <div style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ padding: '12px', backgroundColor: 'rgba(16, 185, 129, 0.03)', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                  <p style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', fontWeight: '900', margin: '0 0 4px' }}>Score</p>
                  <p style={{ fontSize: '10px', color: '#fff', fontWeight: 'bold', margin: 0 }}>{item.authenticityScore}%</p>
                </div>
                <div style={{ padding: '12px', backgroundColor: 'rgba(16, 185, 129, 0.03)', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                  <p style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', fontWeight: '900', margin: '0 0 4px' }}>Visibilidad</p>
                  <p style={{ fontSize: '10px', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>
                    {item.metaLoading ? "—" : isEncrypted ? "Privado" : "Público"}
                  </p>
                </div>
              </div>

              {/* Reproductor — solo cuando metadata cargó */}
              <div style={{ marginTop: 'auto' }}>
                {item.metaLoading ? (
                  <SkeletonLine width="100%" height={40} />
                ) : isEncrypted ? (
                  <EncryptedAudioPlayer
                    cid={audioCid}
                    ownerAddress={address!}
                    signMessage={signMessage}
                  />
                ) : audioUrl ? (
                  // FIX: preload="metadata" para que el play no desaparezca
                  <audio
                    controls
                    preload="metadata"
                    style={{ width: '100%', height: '40px', filter: 'invert(1) brightness(2)' }}
                    src={audioUrl}
                  />
                ) : null}
              </div>

              <a
                href={`https://sepolia.arbiscan.io/tx/${item.txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ marginTop: '24px', color: '#333', fontSize: '8px', textDecoration: 'none', textAlign: 'center', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Blockchain Proof ↗
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}