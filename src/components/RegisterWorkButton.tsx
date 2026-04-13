/**
 * MuSecure – RegisterWorkButton
 * Recibe metadataCid (CID del JSON ERC-721).
 * Muestra el título de la obra al finalizar con éxito.
 */

import { useRegisterWork } from "@/hooks/useRegisterWork";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, Shield, Loader2, ExternalLink } from "lucide-react";

interface Props {
  fingerprintHash: string;
  /** CID del JSON de metadata ERC-721 — este es el que va al contrato */
  ipfsCid: string;
  authenticityScore: number;
  soulbound: boolean;
  title?: string; // Prop añadida para mostrar el nombre real en el éxito
  onSuccess?: (txHash: string, tokenId: number) => void;
}

const RISK_CONFIG: Record<
  number,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  0: { label: "Sin coincidencias — original", variant: "success" },
  1: { label: "Riesgo medio — coincidencias parciales", variant: "warning" },
  2: { label: "Alta coincidencia — bloqueado", variant: "danger" },
};

export function RegisterWorkButton({
  fingerprintHash,
  ipfsCid,
  authenticityScore,
  soulbound,
  title, // Recibimos el título aquí
  onSuccess,
}: Props) {
  const { registerWork, state, reset } = useRegisterWork();
  const isLoading = !["idle", "done", "error"].includes(state.step);

  const risk = RISK_CONFIG[authenticityScore] || RISK_CONFIG[0];
  const isBlocked = authenticityScore >= 2;

  const handleRegister = async () => {
    try {
      const res = await registerWork({
        fingerprintHash,
        ipfsCid,
        authenticityScore,
        soulbound,
      });
      if (onSuccess) onSuccess(res.txHash, res.tokenId);
    } catch (e) {
      // Error manejado por el hook
    }
  };

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {state.step === "done" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center"
          >
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <div className="space-y-1">
              {/* Muestra el título si existe, si no, el ID por defecto */}
              <h3 className="font-display text-xl font-bold text-white">
                {title || `Obra #${state.tokenId}`}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Certificado Registrado (ID: {state.tokenId})
              </p>
            </div>

            <div className="flex flex-col gap-2 w-full pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10"
                onClick={() => window.open(`https://sepolia.arbiscan.io/tx/${state.txHash}`, "_blank")}
              >
                <ExternalLink className="h-3 w-3" />
                Ver en Arbiscan
              </Button>
              <Button variant="ghost" size="sm" onClick={reset} className="text-zinc-500 hover:text-white">
                Registrar otra obra
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="action"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface-overlay p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-zinc-800 p-2 text-zinc-400">
                  <Shield className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Estado de Análisis</p>
                  <p className="text-sm font-medium text-white">Verificación de Huella</p>
                </div>
              </div>
              <Badge variant={risk.variant}>{risk.label}</Badge>
            </div>

            {isBlocked ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                <XCircle className="h-4 w-4 text-red-400" />
                <p className="font-mono text-[11px] font-bold uppercase text-red-400">
                  Registro bloqueado por alta similitud
                </p>
              </div>
            ) : (
              <Button
                onClick={handleRegister}
                disabled={isLoading || !ipfsCid}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {state.message || "Procesando..."}
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Registrar Certificado de Obra
                  </>
                )}
              </Button>
            )}

            {state.step === "error" && state.error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center font-mono text-[10px] text-red-400"
              >
                {state.error}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}