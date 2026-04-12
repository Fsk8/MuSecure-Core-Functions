import { useRegisterWork } from "@/hooks/useRegisterWork";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, Shield, Loader2 } from "lucide-react";

interface Props {
  fingerprintHash: string;
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
  const riskLevel =
    authenticityScore >= 80 ? 2 : authenticityScore >= 45 ? 1 : 0;
  const risk = RISK_CONFIG[riskLevel];
  const isBlocked = riskLevel === 2;

  const handleRegister = async () => {
    try {
      const result = await registerWork({
        fingerprintHash,
        ipfsCid,
        authenticityScore,
        soulbound,
      });
      onSuccess?.(result.txHash, result.tokenId);
    } catch (e) {
      console.error("[RegisterWork] Failed:", e);
    }
  };

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {state.step === "done" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center"
          >
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-500">
              Registro Exitoso
            </p>
            <Button variant="outline" size="sm" onClick={reset}>
              Proteger otro track
            </Button>
          </motion.div>
        ) : (
          <motion.div key="action" className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Validacion de Red
              </span>
              <Badge variant={risk.variant}>{risk.label}</Badge>
            </div>

            {isBlocked ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                <XCircle className="h-4 w-4 text-red-400" />
                <p className="font-mono text-[11px] font-bold uppercase text-red-400">
                  Registro bloqueado por similitud
                </p>
              </div>
            ) : (
              <Button
                onClick={handleRegister}
                disabled={isLoading}
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
                    Firmar y Registrar
                  </>
                )}
              </Button>
            )}

            {state.step === "error" && state.error && (
              <p className="text-center font-mono text-[10px] text-red-400">
                {state.error}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
