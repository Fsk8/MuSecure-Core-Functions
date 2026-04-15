import { useRegisterWork } from "@/hooks/useRegisterWork";
import { useWallet } from "@/hooks/useWallet";
import { useGasAirdrop } from "@/hooks/useGasAirdrop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, Shield, Loader2, ExternalLink, Droplets } from "lucide-react";

interface Props {
  fingerprint: string; 
  ipfsCid: string;
  authenticityScore: number;
  soulbound: boolean;
  title?: string;
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
  fingerprint,
  ipfsCid,
  authenticityScore,
  soulbound,
  title,
  onSuccess,
}: Props) {
  const { registerWork, state } = useRegisterWork();
  const { address } = useWallet();
  const { requestManualAirdrop, airdropStatus, airdropMessage } = useGasAirdrop(address || null, false);

  const isLoading = !["idle", "done", "error"].includes(state.step);
  const isRequestingGas = airdropStatus === "sending";

  const risk = RISK_CONFIG[authenticityScore] || RISK_CONFIG[0];
  const isBlocked = authenticityScore >= 2;

  const handleRegister = async () => {
    if (!ipfsCid) return;
    
    // Sincronizado con los nombres de useRegisterWork.ts
    const result = await registerWork({
      fingerprintHash: fingerprint, 
      ipfsCid: ipfsCid,
      authenticityScore: authenticityScore,
      soulbound,
    });
    
    if (result && onSuccess) {
      onSuccess(result.txHash, result.tokenId);
    }
  };

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {state.step === "done" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <h4 className="font-display text-lg font-bold text-white">
                {title || "Obra"} Protegida
              </h4>
              <p className="font-mono text-[11px] text-zinc-500">
                Certificado registrado en Arbitrum Sepolia
              </p>
            </div>
            {state.txHash && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-zinc-800 bg-zinc-900/50 px-4 text-[10px] font-medium text-zinc-400"
                onClick={() => window.open(`https://sepolia.arbiscan.io/tx/${state.txHash}`, "_blank")}
              >
                Ver en Arbiscan <ExternalLink className="ml-2 h-3 w-3" />
              </Button>
            )}
          </motion.div>
        ) : (
          <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Estado de Análisis</span>
              <Badge variant={risk.variant}>{risk.label}</Badge>
            </div>

            {isBlocked ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                <XCircle className="h-4 w-4 text-red-400" />
                <p className="font-mono text-[11px] font-bold uppercase text-red-400">Registro bloqueado</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Button
                  onClick={handleRegister}
                  disabled={isLoading || !ipfsCid || isRequestingGas}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {state.message || "Procesando..."}
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Registrar Certificado de Obra
                    </>
                  )}
                </Button>

                <div className="flex flex-col items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => address && requestManualAirdrop(address)}
                    disabled={isRequestingGas || isLoading}
                    className="h-8 text-[11px] text-zinc-500 hover:text-emerald-400"
                  >
                    {isRequestingGas ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Droplets className="mr-2 h-3 w-3" />
                    )}
                    ¿Sin fondos? Pedir Gas de prueba
                  </Button>
                  
                  {airdropMessage && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-mono text-[10px] text-emerald-400">
                      {airdropMessage}
                    </motion.p>
                  )}
                </div>
              </div>
            )}

            {state.step === "error" && (
              <p className="text-center font-mono text-[10px] text-red-400">{state.error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}