import { useCallback, useState } from "react";
import {
  AudioFingerprintService,
  type FingerprintResult,
} from "@/services/AudioFingerprintService";
import { runCatalogAuthenticityCheck } from "@/services/runCatalogCheck";
import { getAcoustIdClientKey } from "@/env";
import type { CatalogAuthenticityReport, CatalogMatchRow } from "@/types/acoustid";
import { IPFSUploadForm } from "@/components/IPFSUploadForm";
import { useWallet } from "@/hooks/useWallet";
 
interface ProgressState {
  stage: string;
  percent: number;
}
 
function mbRecordingUrl(id: string): string {
  return `https://musicbrainz.org/recording/${id}`;
}
 
function acoustIdTrackUrl(id: string): string {
  return `https://acoustid.org/track/${id}`;
}
 
function matchHeadline(m: CatalogMatchRow): string {
  if (m.title && m.artist) return `${m.title} — ${m.artist}`;
  if (m.title) return m.title;
  if (m.artist) return m.artist;
  return "Grabación indexada en MusicBrainz";
}
 
export function FingerprintUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<FingerprintResult | null>(null);
  const [catalog, setCatalog] = useState<{
    report: CatalogAuthenticityReport;
    durationSec: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
 
  const acoustIdKey = getAcoustIdClientKey();
  const wallet = useWallet();
 
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setCatalog(null);
    setError(null);
  };
 
  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setCatalog(null);
    setProgress({ stage: "Iniciando…", percent: 0 });
 
    try {
      const svc = AudioFingerprintService.getInstance();
      const custom = await svc.generateFingerprint(file, (stage, pct) => {
        setProgress({ stage: `Huella MuSecure: ${stage}`, percent: 10 + pct * 0.45 });
      });
      setResult(custom);
 
      if (!acoustIdKey) {
        setProgress({ stage: "Listo (sin AcoustID)", percent: 100 });
        return;
      }
 
      try {
        const out = await runCatalogAuthenticityCheck(file, acoustIdKey, (s) => {
          if (s === "chromaprint") setProgress({ stage: "Chromaprint (AcoustID)…", percent: 55 });
          if (s === "acoustid") setProgress({ stage: "Consultando AcoustID / MusicBrainz…", percent: 80 });
        });
        setCatalog({ report: out.report, durationSec: out.durationSec });
      } catch (e) {
        setError(`Catálogo AcoustID: ${(e as Error).message}`);
      }
 
      setProgress({ stage: "Listo", percent: 100 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }, [file, acoustIdKey]);
 
  // Score a pasar al contrato: si no hay catálogo usamos 0 (sin riesgo conocido)
  const authenticityScore = catalog?.report.catalogMatchScore ?? 0;
 
  return (
    <div className="card">
      <h2>Registrar obra</h2>
      <p className="muted">
        1) Genera huella (MuSecure + AcoustID) → 2) Conecta wallet → 3) Sube a IPFS → 4) Registra on-chain
      </p>
 
      <input type="file" accept="audio/*" onChange={handleFileChange} disabled={!!progress} />
 
      <button type="button" onClick={handleAnalyze} disabled={!file || !!progress}>
        {progress ? `${progress.stage} (${Math.round(progress.percent)}%)` : "Analizar"}
      </button>
 
      {progress && <progress value={progress.percent} max={100} />}
      {error && <p className="err">{error}</p>}
 
      {result && (
        <section className="section">
          <h3>Huella MuSecure</h3>
          <dl className="dl">
            <dt>Archivo</dt><dd>{result.fileName}</dd>
            <dt>Duración</dt><dd>{result.duration.toFixed(2)} s</dd>
            <dt>SHA-256</dt>
            <dd><code className="mono">0x{result.sha256}</code></dd>
          </dl>
        </section>
      )}
 
      {catalog && !catalog.report.error && catalog.report.matches.length > 0 && (
        <section className="section">
          <h3>Coincidencias (AcoustID/MusicBrainz)</h3>
          <p className="muted">{catalog.report.summary}</p>
          <ul className="list">
            {catalog.report.matches.slice(0, 10).map((m) => (
              <li key={m.recordingId} className="list-row">
                <a href={mbRecordingUrl(m.recordingId)} target="_blank" rel="noreferrer">
                  {matchHeadline(m)}
                </a>
                <span className="pill">{m.scorePercent}%</span>
                {m.releaseTitle && <span className="muted">({m.releaseTitle})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
 
      {catalog && catalog.report.matches.length === 0 && catalog.report.acoustIdOnlyTracks.length > 0 && (
        <section className="section">
          <h3>Huella reconocida (AcoustID)</h3>
          <ul className="list">
            {catalog.report.acoustIdOnlyTracks.slice(0, 10).map((t) => (
              <li key={t.trackId}>
                <a href={acoustIdTrackUrl(t.trackId)} target="_blank" rel="noreferrer">
                  Track {t.trackId}
                </a>{" "}
                <span className="muted">score {t.scorePercent}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}
 
      {/* ── Wallet ────────────────────────────────────────────────────────── */}
      {result && (
        <section className="section">
          <h3>Wallet</h3>
          {!wallet.address ? (
            <button type="button" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Conectando…" : "Conectar wallet"}
            </button>
          ) : (
            <p className="muted">
              Conectada: <code className="mono">{wallet.address}</code>
            </p>
          )}
          {wallet.error && <p className="err">{wallet.error}</p>}
        </section>
      )}
 
      {/* ── Subida IPFS + Registro on-chain ──────────────────────────────── */}
      {result && file && wallet.address && wallet.signMessage && (
        <IPFSUploadForm
          fingerprint={result}
          audioFile={file}
          ownerAddress={wallet.address}
          signMessage={wallet.signMessage}
          authenticityScore={authenticityScore}
        />
      )}
    </div>
  );
}
