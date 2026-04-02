import { useCallback, useState } from "react";
import { AudioFingerprintService, type FingerprintResult } from "@/services/AudioFingerprintService";
import { runCatalogAuthenticityCheck } from "@/services/runCatalogCheck";
import { getAcoustIdClientKey } from "@/env";
import type { CatalogAuthenticityReport } from "@/types/acoustid";
import { IPFSUploadForm } from "@/components/IPFSUploadForm";
import { useWallet } from "@/hooks/useWallet";

interface ProgressState { stage: string; percent: number; }

export function FingerprintUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<FingerprintResult | null>(null);
  const [catalog, setCatalog] = useState<{ report: CatalogAuthenticityReport; durationSec: number; } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acoustIdKey = getAcoustIdClientKey();
  const wallet = useWallet();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null); setCatalog(null); setError(null);
  };

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setError(null); setResult(null); setCatalog(null);
    setProgress({ stage: "Iniciando…", percent: 0 });

    try {
      const svc = AudioFingerprintService.getInstance();
      const custom = await svc.generateFingerprint(file, (stage, pct) => {
        setProgress({ stage: `Analizando: ${stage}`, percent: 10 + pct * 0.45 });
      });
      setResult(custom);

      if (acoustIdKey) {
        const out = await runCatalogAuthenticityCheck(file, acoustIdKey, (s) => {
          if (s === "chromaprint") setProgress({ stage: "Generando Chromaprint…", percent: 55 });
          if (s === "acoustid") setProgress({ stage: "Consultando Catálogos…", percent: 80 });
        });
        setCatalog({ report: out.report, durationSec: out.durationSec });
      }
      setProgress({ stage: "Análisis completado", percent: 100 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTimeout(() => setProgress(null), 1000);
    }
  }, [file, acoustIdKey]);

  const authenticityScore = catalog?.report.catalogMatchScore ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
        <header className="mb-8 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-white">1. Analizar Obra</h2>
            <p className="text-zinc-500 text-sm mt-1">Genera la huella digital antes de subirla</p>
          </div>
          {!wallet.address ? (
            <button onClick={wallet.connect} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all">
              🔗 Conectar Wallet
            </button>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-xs font-mono">
              ✓ {wallet.address.slice(0, 6)}...
            </div>
          )}
        </header>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input type="file" accept="audio/*" onChange={handleFileChange} className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700 cursor-pointer" />
            <button onClick={handleAnalyze} disabled={!file || !!progress} className="bg-white text-black px-6 py-2 rounded-full font-bold hover:bg-zinc-200 disabled:opacity-50">
              {progress ? `${Math.round(progress.percent)}%` : "Analizar"}
            </button>
          </div>
          {progress && <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden"><div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${progress.percent}%` }} /></div>}
          {error && <p className="text-red-500 text-xs font-mono">{error}</p>}
        </div>

        {result && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
            <div className="bg-black/20 border border-zinc-800 p-4 rounded-2xl">
              <h4 className="text-[10px] text-zinc-500 uppercase font-bold mb-2 tracking-widest">Hash SHA-256</h4>
              <p className="text-zinc-300 font-mono text-[10px] truncate">0x{result.sha256}</p>
            </div>
            <div className="bg-black/20 border border-zinc-800 p-4 rounded-2xl">
              <h4 className="text-[10px] text-zinc-500 uppercase font-bold mb-2 tracking-widest">Probabilidad de plagio</h4>
              <p className={`text-xl font-bold ${authenticityScore >= 90 ? 'text-red-500' : 'text-emerald-500'}`}>{authenticityScore}%</p>
            </div>
          </div>
        )}
      </div>

      {result && file && wallet.address && wallet.signMessage && (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <IPFSUploadForm fingerprint={result} audioFile={file} ownerAddress={wallet.address} signMessage={wallet.signMessage} authenticityScore={authenticityScore} />
        </div>
      )}
    </div>
  );
}