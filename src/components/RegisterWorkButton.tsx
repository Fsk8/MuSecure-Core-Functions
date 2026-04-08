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

  // ESTADO: ÉXITO (DASHBOARD STYLE)
  if (state.step === "done") return (
    <div style={{ padding: '24px', backgroundColor: '#000', borderRadius: '24px', border: '1px solid #10b98133', textAlign: 'center' }}>
      <p style={{ color: '#10b981', fontWeight: '900', fontSize: '10px', textTransform: 'uppercase', marginBottom: '16px' }}>✓ Registro Exitoso</p>
      <button 
        onClick={reset} 
        style={{ backgroundColor: '#10b981', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '12px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', cursor: 'pointer' }}
      >
        Proteger otro track
      </button>
    </div>
  );

  // RENDER NORMAL
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
        <span style={{ fontSize: '9px', color: '#10b981', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.1em', opacity: 0.6 }}>Validación de Red</span>
        <span style={{ 
          fontSize: '9px', 
          fontWeight: '900', 
          padding: '4px 12px', 
          borderRadius: '999px', 
          textTransform: 'uppercase', 
          backgroundColor: `${risk.color}15`, 
          color: risk.color, 
          border: `1px solid ${risk.color}33` 
        }}>
          {risk.label}
        </span>
      </div>

      {isBlocked ? (
        <div style={{ width: '100%', padding: '20px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '20px', textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontWeight: '900', textTransform: 'uppercase', fontSize: '10px', margin: 0 }}>🚫 Registro bloqueado por similitud</p>
        </div>
      ) : (
        <button
          onClick={handleRegister}
          disabled={isLoading}
          style={{
            width: '100%',
            backgroundColor: '#ffffff',
            color: '#000000',
            fontWeight: '900',
            padding: '20px',
            borderRadius: '20px',
            border: 'none',
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            cursor: isLoading ? 'default' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: isLoading ? 0.7 : 1,
            boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.1)'
          }}
        >
          {isLoading ? "Enviando a Arbitrum..." : "3. Firmar y Registrar"}
        </button>
      )}
    </div>
  );
}