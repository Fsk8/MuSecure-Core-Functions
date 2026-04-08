import { useRegisterWork } from "@/hooks/useRegisterWork";

interface Props {
  fingerprintHash: string; ipfsCid: string; authenticityScore: number; soulbound: boolean;
  onSuccess?: (txHash: string, tokenId: number) => void;
}

const RISK_LABEL: Record<number, { label: string; color: string }> = {
  0: { label: "Sin coincidencias — original", color: "#10b981" },
  1: { label: "Riesgo medio — coincidencias parciales", color: "#f59e0b" },
  2: { label: "Alta coincidencia — bloqueado", color: "#ef4444" },
};

export function RegisterWorkButton({ fingerprintHash, ipfsCid, authenticityScore, soulbound, onSuccess }: Props) {
  const { registerWork, state, reset } = useRegisterWork();
  const isLoading = !["idle", "done", "error"].includes(state.step);
  const riskLevel = authenticityScore >= 80 ? 2 : authenticityScore >= 45 ? 1 : 0;
  const risk = RISK_LABEL[riskLevel];
  const isBlocked = riskLevel === 2;

  const handleRegister = async () => {
    try {
      const result = await registerWork({ fingerprintHash, ipfsCid, authenticityScore, soulbound });
      onSuccess?.(result.txHash, result.tokenId);
    } catch (e) { console.error("Error:", e); }
  };

  if (state.step === "done") return (
    <div className="p-6 bg-zinc-900 border border-emerald-500/20 rounded-[30px] text-center animate-in fade-in zoom-in duration-300">
      <p className="text-emerald-400 font-black uppercase text-xs mb-2">¡Propiedad Intelectual Protegida!</p>
      <p className="text-white font-bold mb-4">NFT Certificado #{state.tokenId}</p>
      <a href={`https://sepolia.arbiscan.io/tx/${state.txHash}`} target="_blank" rel="noreferrer" className="text-indigo-400 text-[10px] font-black uppercase hover:underline block mb-4 tracking-widest">Ver en Arbiscan ↗</a>
      <button onClick={reset} className="bg-white text-black font-black py-2 px-6 rounded-xl text-[10px] uppercase">Registrar otra</button>
    </div>
  );

  return (
    <div className="space-y-4 pt-2">
      <div className="flex justify-between items-center px-2">
        <span className="text-[9px] text-indigo-400 uppercase font-black tracking-widest">Validación de Red</span>
        <span className="text-[9px] font-black px-3 py-1 rounded-full uppercase" style={{ backgroundColor: `${risk.color}15`, color: risk.color, border: `1px solid ${risk.color}33` }}>
          {risk.label}
        </span>
      </div>

      {isBlocked ? (
        <div className="w-full p-5 bg-red-500/10 border border-red-500/30 rounded-2xl text-center">
          <p className="text-red-400 font-black uppercase text-[10px]">🚫 Registro bloqueado por plagio</p>
        </div>
      ) : (
        <button
          onClick={handleRegister}
          disabled={isLoading}
          className="w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest shadow-lg"
        >
          {isLoading
            ? <><div className="animate-spin h-3 w-3 border-2 border-black border-t-transparent rounded-full" /> {state.message.toUpperCase()}</>
            : "3. Firmar y Registrar en Arbitrum"}
        </button>
      )}

      {state.error && <p className="text-red-500 text-[9px] text-center font-mono font-bold uppercase">{state.error}</p>}
    </div>
  );
}