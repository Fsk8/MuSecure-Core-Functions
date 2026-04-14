import { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet"; 
import { AudioFingerprintService } from "@/services/AudioFingerprintService";
import { runCatalogAuthenticityCheck } from "@/services/runCatalogCheck";
import { IPFSUploadForm } from "@/components/IPFSUploadForm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "motion/react";
import {
  FileAudio,
  Search,
  Lock,
  Unlock,
  Link2,
  Unlink2,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import type { CatalogAuthenticityReport } from "@/types/acoustid";
import type { FingerprintResult } from "@/services/AudioFingerprintService";

const TOTAL_STEPS = 4;

function StepIndicator({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <motion.div
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
              i <= currentStep
                ? "bg-emerald-500 text-black"
                : "bg-surface-overlay text-zinc-600"
            }`}
            animate={i === currentStep ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            {i + 1}
          </motion.div>
          {i < totalSteps - 1 && (
            <div
              className={`h-px w-6 transition-colors ${
                i < currentStep ? "bg-emerald-500" : "bg-surface-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export const FingerprintUploader = () => {
  const { user, logout, authenticated, ready } = usePrivy();
  const { address } = useWallet(); 
  const audioRef = useRef<HTMLAudioElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isEncrypted, setIsEncrypted] = useState(true);
  const [isSoulbound, setIsSoulbound] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [fpResult, setFpResult] = useState<FingerprintResult | null>(null);
  const [catalogReport, setCatalogReport] =
    useState<CatalogAuthenticityReport | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFpResult(null);
      setCatalogReport(null);
      setCurrentStep(0);
      setStatus("Track seleccionado");
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    try {
      setLoading(true);
      setStatus("Generando huella digital...");
      const fp = await AudioFingerprintService.getInstance().generateFingerprint(file);
      setFpResult(fp);
      setStatus("Escaneando bases de datos globales...");
      const check = await runCatalogAuthenticityCheck(
        file,
        import.meta.env.VITE_ACOUSTID_CLIENT_KEY || "",
        () => {}
      );
      setCatalogReport(check.report);
      setCurrentStep(1);
      setStatus("Analisis finalizado");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setStatus(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex justify-center py-20">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-600">
          Sincronizando...
        </p>
      </div>
    );
  }

  const originalityScore = catalogReport
    ? 100 - catalogReport.catalogMatchScore
    : null;
  const catalogScore = catalogReport?.catalogMatchScore ?? 0;
  const isHighRisk = catalogScore >= 80;
  
  // Determinar autenticidad para el registro
  let authenticityScore = 0;
  if (catalogScore >= 80) authenticityScore = 2; // Alto riesgo
  else if (catalogScore >= 45) authenticityScore = 1; // Riesgo medio
  else authenticityScore = 0; // Bajo riesgo

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="relative overflow-hidden">
        {/* Gradient accent at top */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

        <div className="flex items-center justify-between mb-8">
          <StepIndicator
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
          />
          {authenticated && (
            <Button variant="destructive" size="sm" onClick={logout}>
              Salir
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {/* Audio preview */}
          <AnimatePresence>
            {previewUrl && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl bg-black/50 px-2 py-1 border border-surface-border">
                  <audio
                    ref={audioRef}
                    controls
                    className="h-10 w-full"
                    src={previewUrl}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Originality report */}
          <AnimatePresence>
            {catalogReport && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-3xl border p-6 ${
                  isHighRisk
                    ? "border-red-500/20 bg-red-500/5"
                    : "border-emerald-500/20 bg-emerald-500/5"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Originalidad
                  </span>
                  <span
                    className={`font-display text-3xl font-bold ${
                      isHighRisk ? "text-red-400" : "text-white"
                    }`}
                  >
                    {originalityScore}%
                  </span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
                  <motion.div
                    className="h-full rounded-full bg-emerald-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${originalityScore}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>

                {isHighRisk && (
                  <div className="mt-4 flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                    <p className="font-mono text-[11px] font-bold uppercase text-red-400">
                      Coincidencia alta detectada
                    </p>
                  </div>
                )}

                {/* MusicBrainz matches */}
                {catalogReport.matches.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-blue-400">
                      Coincidencias en MusicBrainz
                    </p>
                    {catalogReport.matches.slice(0, 5).map((m) => (
                      <a
                        key={m.recordingId}
                        href={`https://musicbrainz.org/recording/${m.recordingId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-xl bg-black/40 border border-white/5 p-3 transition-colors hover:border-white/10 no-underline"
                      >
                        <div className="min-w-0 mr-3">
                          <p className="truncate text-sm font-semibold text-white">
                            {m.title || "Grabacion"}
                            {m.artist ? ` — ${m.artist}` : ""}
                          </p>
                          {m.releaseTitle && (
                            <p className="text-[11px] text-emerald-500/70">
                              {m.releaseTitle}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="success">{m.scorePercent}%</Badge>
                          <ExternalLink className="h-3 w-3 text-zinc-600" />
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {/* AcoustID-only tracks */}
                {catalogReport.matches.length === 0 &&
                  catalogReport.acoustIdOnlyTracks.length > 0 && (
                    <div className="mt-5 space-y-2">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-500">
                        Reconocido en AcoustID
                      </p>
                      {catalogReport.acoustIdOnlyTracks
                        .slice(0, 3)
                        .map((t) => (
                          <a
                            key={t.trackId}
                            href={`https://acoustid.org/track/${t.trackId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between rounded-xl bg-black/30 p-3 no-underline"
                          >
                            <span className="font-mono text-[11px] text-zinc-500">
                              {t.trackId.slice(0, 16)}...
                            </span>
                            <Badge variant="warning">{t.scorePercent}%</Badge>
                          </a>
                        ))}
                    </div>
                  )}

                {catalogReport.summary && (
                  <p className="mt-4 text-xs italic text-zinc-600">
                    {catalogReport.summary}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toggle options */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsSoulbound(!isSoulbound)}
              className={`flex items-center gap-3 rounded-2xl border p-4 transition-all ${
                isSoulbound
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-surface-border bg-surface-overlay"
              }`}
              aria-pressed={isSoulbound}
            >
              {isSoulbound ? (
                <Link2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Unlink2 className="h-4 w-4 text-zinc-500" />
              )}
              <div className="text-left">
                <p
                  className={`text-xs font-bold ${isSoulbound ? "text-emerald-500" : "text-zinc-400"}`}
                >
                  Soulbound
                </p>
                <p className="text-[10px] text-zinc-600">
                  {isSoulbound ? "Intransferible" : "Transferible"}
                </p>
              </div>
            </button>

            <button
              onClick={() => setIsEncrypted(!isEncrypted)}
              className={`flex items-center gap-3 rounded-2xl border p-4 transition-all ${
                isEncrypted
                  ? "border-violet/30 bg-violet-glow"
                  : "border-surface-border bg-surface-overlay"
              }`}
              aria-pressed={isEncrypted}
            >
              {isEncrypted ? (
                <Lock className="h-4 w-4 text-violet" />
              ) : (
                <Unlock className="h-4 w-4 text-zinc-500" />
              )}
              <div className="text-left">
                <p
                  className={`text-xs font-bold ${isEncrypted ? "text-violet" : "text-zinc-400"}`}
                >
                  Cifrado
                </p>
                <p className="text-[10px] text-zinc-600">
                  {isEncrypted ? "Encriptado" : "Publico"}
                </p>
              </div>
            </button>
          </div>

          <Separator />

          {/* Action steps */}
          <div className="space-y-3">
            {/* Step 1: Select + Analyze */}
            <div
              className={`transition-opacity ${currentStep === 0 ? "opacity-100" : "opacity-40 pointer-events-none"}`}
            >
              <label className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-surface-border bg-surface-overlay/50 p-5 transition-colors hover:border-emerald-500/30">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                  <FileAudio className="h-5 w-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">
                    {file ? file.name : "Seleccionar archivo de audio"}
                  </p>
                  <p className="text-[11px] text-zinc-600">
                    {file
                      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                      : "MP3, WAV, FLAC, OGG"}
                  </p>
                </div>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <Button
                onClick={handleAnalyze}
                disabled={loading || !file}
                className="mt-3 w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="mr-2"
                    >
                      <Search className="h-4 w-4" />
                    </motion.div>
                    Analizando...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Analizar Originalidad
                  </>
                )}
              </Button>
            </div>

            {/* ✅ CORRECCIÓN: Mostrar IPFSUploadForm SIEMPRE que tengamos fpResult */}
            {currentStep === 1 && fpResult && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <IPFSUploadForm
                    fingerprint={fpResult}
                    audioFile={file!}
                    ownerAddress={address ?? ""}
                    authenticityScore={authenticityScore}
                    catalogReport={catalogReport || undefined}
                  />
                </motion.div>
              </AnimatePresence>
            )}

            {/* Success state */}
            <AnimatePresence>
              {currentStep === 3 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-8"
                >
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                  <p className="font-display text-lg font-bold text-white">
                    Obra Protegida
                  </p>
                  <p className="font-mono text-[11px] text-zinc-500">
                    Registrada en Arbitrum Sepolia
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Status bar */}
        <AnimatePresence>
          {status && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-8 text-center"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                {status}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
};