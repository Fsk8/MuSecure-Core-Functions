/**
 * MuSecure – components/Dashboard.tsx
 * Lee los uploads desde localStorage (guardados al subir cada obra).
 * No depende de ningún endpoint externo — funciona offline.
 */

import { useCallback, useEffect, useState } from "react";
import { LighthouseService, type LocalUploadRecord } from "@/services/LighthouseService";
import { useWallet } from "@/hooks/useWallet";

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function Dashboard() {
  const wallet = useWallet();
  const [items, setItems] = useState<LocalUploadRecord[]>([]);

  const refresh = useCallback(() => {
    if (!wallet.address) return;
    const lh = LighthouseService.getInstance();
    setItems(lh.getRecordsByOwner(wallet.address));
  }, [wallet.address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="card">
      <div className="row">
        <div>
          <h2>Mis obras</h2>
          <p className="muted">Obras registradas desde este navegador.</p>
        </div>
        <div className="row">
          {!wallet.address ? (
            <button type="button" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Conectando…" : "Conectar wallet"}
            </button>
          ) : (
            <span className="pill">Wallet: {short(wallet.address)}</span>
          )}
          <button type="button" onClick={refresh} disabled={!wallet.address}>
            Actualizar
          </button>
        </div>
      </div>

      {wallet.error && <p className="err">{wallet.error}</p>}

      {wallet.address && items.length === 0 && (
        <p className="muted">No hay obras registradas desde este navegador para esta wallet.</p>
      )}

      {items.map((item) => (
        <article key={item.metadataCid} className="dash-card">
          <div className="dash-head">
            <div>
              <h3 className="dash-title">
                {item.title}{" "}
                <span className="muted">— {item.artist}</span>
              </h3>
              <p className="muted small">
                {new Date(item.uploadedAt).toLocaleString()} ·{" "}
                {item.encrypted ? "🔒 encriptado" : "🌐 público"}
              </p>
            </div>
            <a
              className="dash-link"
              href={LighthouseService.gatewayUrl(item.metadataCid)}
              target="_blank"
              rel="noreferrer"
            >
              Ver metadata →
            </a>
          </div>

          <dl className="meta-dl">
            <dt>Metadata CID</dt>
            <dd><code className="mono">{item.metadataCid}</code></dd>

            <dt>Audio CID</dt>
            <dd>
              {!item.encrypted ? (
                <audio
                  controls
                  preload="none"
                  src={LighthouseService.gatewayUrl(item.audioCid)}
                  style={{ width: "100%", marginTop: 4 }}
                />
              ) : (
                <code className="mono">{item.audioCid}</code>
              )}
            </dd>

            {item.artworkCid && (
              <>
                <dt>Artwork</dt>
                <dd>
                  <img
                    src={LighthouseService.gatewayUrl(item.artworkCid)}
                    alt="Artwork"
                    className="art"
                    style={{ maxWidth: 120, borderRadius: 8, marginTop: 4 }}
                  />
                </dd>
              </>
            )}
          </dl>

          {/* Placeholder — se conectará al smart contract en la próxima fase */}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              console.log("→ registrar on-chain:", {
                metadataCid: item.metadataCid,
                ownerAddress: item.ownerAddress,
              })
            }
          >
            Registrar en Arbitrum →
          </button>
        </article>
      ))}
    </div>
  );
}