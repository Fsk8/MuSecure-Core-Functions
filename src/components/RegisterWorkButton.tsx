/**
 * MuSecure – RegisterWorkButton
 *
 * Recibe metadataCid (CID del JSON ERC-721), NO el CID del audio.
 * Mantiene todo el estilo shadcn/ui + motion/react.
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
  onSuccess,
}: Props) {
  const { registerWork, state, reset } = useRegisterWork();
  const isLoading = !["idle", "done", "error"].includes(state.step);
  const riskLevel = authenticityScore >= 80 ? 2 : authenticityScore >= 45 ? 1 : 0;
  const risk = RISK_CONFIG[riskLevel];
  const isBlocked = riskLevel === 2;

  const handleRegister = async () => {
    try {
      const result = await registerWork({
        fingerprintHash,
        ipfsCid,        // metadataCid — CID del JSON ERC-721
        authenticityScore,
        soulbound,
      });
      onSuccess?.(result.txHash, result.tokenId);
    } catch (e) {
      console.error("[RegisterWork] Failed:", e);
    }
  };

  return (
    <div className="w-full space-y-4">
      <AnimatePresence mode="wait">
        {state.step === "done" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center"
          >
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-500">
                Certificado de Obra Registrado
              </p>
              {state.tokenId !== undefined && (
                <p className="mt-1 font-display text-lg font-bold text-white">
                  NFT #{state.tokenId}
                </p>
              )}
            </div>
            {state.txHash && (
              <a
                href={`https://sepolia.arbiscan.io/tx/${state.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 no-underline transition-colors hover:text-emerald-500"
              >
                Ver en Arbiscan
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            <Button variant="outline" size="sm" onClick={reset}>
              Proteger otro track
            </Button>
          </motion.div>
        ) : (
          <motion.div key="action" className="space-y-3">
            {/* Risk badge */}
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Certificado de Obra
              </span>
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