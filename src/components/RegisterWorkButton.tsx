import { useRegisterWork } from "@/hooks/useRegisterWork";

interface Props {
  fingerprintHash: string; ipfsCid: string; authenticityScore: number; soulbound: boolean;
  onSuccess?: (txHash: string, tokenId: number) => void;
}

const RISK_LABEL: Record<number, { label: string; color: string }> = {
  0: { label: "No hay coincidencia", color: "#10b981" },
  1: { label: "Riesgo Medio, hay coincidencias parciales", color: "#f59e0b" },
  2: { label: "No se puede registrar, alta probabilidad de plagio", color: "#ef4444" },
};

export function RegisterWorkButton({ fingerprintHash, ipfsCid, authenticityScore, soulbound, onSuccess }: Props) {
  const { registerWork, state, reset } = useRegisterWork();
  const isLoading = !["idle", "done", "error"].includes(state.step);
  const risk = RISK_LABEL[authenticityScore >= 80 ? 2 : authenticityScore >= 45 ? 1 : 0];

  const handleRegister = async () => {
    try {
      const result = await registerWork({ fingerprintHash, ipfsCid, authenticityScore, soulbound });
      onSuccess?.(result.txHash, result.tokenId);
    } catch (e) { console.error("Error:", e); }
  };

  if (state.step === "done") return (
    <div className="p-6 bg-zinc-900 border border-emerald-500/20 rounded-2xl">
      <p className="text-emerald-400 font-bold mb-4">NFT Certificado #{state.tokenId}</p>
      <a href={`https://sepolia.arbiscan.io/tx/${state.txHash}`} target="_blank" className="text-indigo-400 text-xs hover:underline block mb-4">Ver en Arbiscan ↗</a>
      <button onClick={reset} className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-xs">Registrar otra</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-4">
        <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Validación de Red</span>
        <span className="text-[10px] font-bold px-2 py-1 rounded" style={{ backgroundColor: `${risk.color}20`, color: risk.color }}>{risk.label}</span>
      </div>
      <button onClick={handleRegister} disabled={isLoading || authenticityScore >= 95} className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:bg-zinc-200 disabled:opacity-20 transition-all flex items-center justify-center gap-2">
        {isLoading ? <><div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full" /> {state.message}</> : "3. Firmar y Registrar en Arbitrum"}
      </button>
      {state.error && <p className="text-red-500 text-[10px] text-center font-mono">{state.error}</p>}
    </div>
  );
}