/**
 * MuSecure – Dashboard v2 (Privy Edition) - ESTILO EXPLORER
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
  metaLoading?: boolean;
  metaError?: string;
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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
    try {
      const registryAddress = import.meta.env.VITE_REGISTRY_ADDRESS as string;
      const rpc = import.meta.env.VITE_ARBITRUM_RPC as string ?? "https://sepolia-rollup.arbitrum.io/rpc";
      const provider = new ethers.JsonRpcProvider(rpc);
      const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
      const filter = registry.filters.WorkRegistered(ownerAddress);
      const logs = await registry.queryFilter(filter, 0, "latest");

      const items: WorkItem[] = logs.map((log: any) => {
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
      }).filter(Boolean) as WorkItem[];

      items.sort((a, b) => b.timestamp - a.timestamp);
      setWorks(items);

      items.forEach((item) => {
        fetch(LighthouseService.gatewayUrl(item.ipfsCid))
          .then((r) => r.json())
          .then((meta: MuSecureMetadata) => {
            setWorks((prev) => prev.map((w) => w.ipfsCid === item.ipfsCid ? { ...w, metadata: meta, metaLoading: false } : w));
          })
          .catch(() => {
            setWorks((prev) => prev.map((w) => w.ipfsCid === item.ipfsCid ? { ...w, metaLoading: false, metaError: "Error" } : w));
          });
      });
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (ready && authenticated && address) loadWorks(address);
    else setWorks([]);
  }, [ready, authenticated, address, loadWorks]);

  if (!ready) return <div style={{ padding: '80px', textAlign: 'center', color: '#10b981', textTransform: 'uppercase', fontSize: '10px', fontWeight: '900', fontStyle: 'italic' }}>Sincronizando...</div>;

  return (
    <div style={{ padding: '20px' }}>
      {/* HEADER ESTILO DASHBOARD */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111111', border: '1px solid #10b98133', padding: '24px 32px', borderRadius: '32px', marginBottom: '40px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '-0.025em', margin: 0 }}>Mis Obras</h2>
          <p style={{ fontSize: '9px', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '4px' }}>Arbitrum Sepolia Ledger</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           {authenticated && (
             <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#10b981', padding: '8px 16px', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid #10b98122' }}>{short(address!)}</span>
           )}
           <button onClick={() => loadWorks(address!)} style={{ backgroundColor: '#10b981', color: '#000000', border: 'none', padding: '8px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: '900' }}>{loading ? "..." : "↺"}</button>
        </div>
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: '10px', textAlign: 'center' }}>{error}</p>}

      {/* GRID DE CUADRITOS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '32px' }}>
        {works.map((item) => (
          <div key={item.tokenId} style={{ backgroundColor: '#111111', border: '1px solid #10b98133', padding: '32px', borderRadius: '32px', display: 'flex', flexDirection: 'column', transition: 'all 0.3s ease' }}>
            
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <span style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px', borderRadius: '9999px', backgroundColor: '#10b981', color: '#000000' }}>
                NFT #{item.tokenId}
              </span>
              <span style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', color: RISK_COLOR[item.riskLevel] }}>
                {RISK_LABEL[item.riskLevel]}
              </span>
            </div>

            <h3 style={{ fontWeight: 'bold', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1rem', marginBottom: '4px', textTransform: 'uppercase' }}>
              {item.metadata?.title || "Cargando..."}
            </h3>
            
            <p style={{ fontSize: '10px', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '24px' }}>
              {item.metadata?.artist || "Original Artist"}
            </p>

            <div style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '12px', backgroundColor: 'rgba(16, 185, 129, 0.03)', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                <p style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', fontWeight: '900' }}>Score</p>
                <p style={{ fontSize: '10px', color: '#fff', fontWeight: 'bold' }}>{item.authenticityScore}%</p>
              </div>
              <div style={{ padding: '12px', backgroundColor: 'rgba(16, 185, 129, 0.03)', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                <p style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', fontWeight: '900' }}>Visibilidad</p>
                <p style={{ fontSize: '10px', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase' }}>{item.metadata?.encryptedAudio.encrypted ? "Privado" : "Público"}</p>
              </div>
            </div>

            <div style={{ marginTop: 'auto' }}>
              {item.metadata?.encryptedAudio.encrypted ? (
                authenticated && address ? (
                  <EncryptedAudioPlayer cid={item.metadata.encryptedAudio.ciphertextCid} ownerAddress={address} signMessage={signMessage} />
                ) : (
                  <button onClick={() => login()} style={{ width: '100%', backgroundColor: '#059669', color: '#000000', padding: '16px', borderRadius: '16px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', border: 'none', cursor: 'pointer' }}>🔓 Desbloquear</button>
                )
              ) : (
                <audio controls preload="none" style={{ width: '100%', height: '40px', filter: 'invert(1) brightness(2)' }} src={LighthouseService.gatewayUrl(item.ipfsCid)} />
              )}
            </div>
            
            <a href={`https://sepolia.arbiscan.io/tx/${item.txHash}`} target="_blank" rel="noreferrer" style={{ marginTop: '24px', color: '#333', fontSize: '8px', textDecoration: 'none', textAlign: 'center', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Blockchain Proof ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}