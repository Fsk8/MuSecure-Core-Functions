import { useRegisterWork } from "@/hooks/useRegisterWork";
import type { RegisterStep } from "@/hooks/useRegisterWork";

interface Props {
  fingerprintHash: string;   
  ipfsCid: string;           
  authenticityScore: number; 
  soulbound: boolean;
  onSuccess?: (txHash: string, tokenId: number) => void;
}

const STEP_ICON: Record<RegisterStep, string> = {
  idle:                  "⛓",
  "checking-duplicate":  "🔍",
  "requesting-signature":"🔐",
  "waiting-wallet":      "👛",
  confirming:            "⏳",
  done:                  "✅",
  error:                 "❌",
};

const RISK_LABEL: Record<number, { label: string; color: string }> = {
  0: { label: "Low Risk",    color: "#4caf50" },
  1: { label: "Medium Risk", color: "#ff9800" },
  2: { label: "High Risk",   color: "#f44336" },
};

function getRiskLevel(score: number): 0 | 1 | 2 {
  if (score >= 80) return 2;
  if (score >= 45) return 1;
  return 0;
}

export function RegisterWorkButton({
  fingerprintHash,
  ipfsCid,
  authenticityScore,
  soulbound,
  onSuccess,
}: Props) {
  const { registerWork, state, reset } = useRegisterWork();

  const isLoading = !["idle", "done", "error"].includes(state.step);
  const riskLevel = getRiskLevel(authenticityScore);
  const risk = RISK_LABEL[riskLevel];

  const handleRegister = async () => {
    try {
      const result = await registerWork({
        fingerprintHash,
        ipfsCid,
        authenticityScore,
        soulbound,
      });
      onSuccess?.(result.txHash, result.tokenId);
    } catch (error) {
      console.error("Fallo al registrar:", error);
    }
  };

  if (state.step === "done") {
    return (
      <div className="register-success" style={{ textAlign: "center", padding: "1rem", border: "1px solid #ddd", borderRadius: "8px" }}>
        <p>✅ Obra registrada con éxito</p>
        {state.tokenId !== undefined && (
          <p><strong>Certificado NFT #{state.tokenId}</strong></p>
        )}
        {state.txHash && (
          <div style={{ marginBottom: "1rem" }}>
            <a href={`https://sepolia.arbiscan.io/tx/${state.txHash}`} target="_blank" rel="noreferrer">
              Ver en Arbiscan →
            </a>
          </div>
        )}
        <button type="button" onClick={reset}>Registrar otra obra</button>
      </div>
    );
  }

  return (
    <div className="register-work" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="risk-badge" style={{ color: risk.color, fontWeight: "bold" }}>
        Score AcoustID: {authenticityScore}/100 — {risk.label}
      </div>

      {authenticityScore >= 95 && (
        <p style={{ color: "#f44336", fontSize: "0.8rem" }}>
          ⚠️ Score muy alto. El contrato podría rechazar este registro.
        </p>
      )}

      {state.error && (
        <div style={{ color: "#f44336", fontSize: "0.9rem", padding: "10px", backgroundColor: "#ffebee", borderRadius: "4px" }}>
          {state.error}
          <button type="button" onClick={reset} style={{ marginLeft: "10px", fontSize: "0.7rem" }}>Reintentar</button>
        </div>
      )}

      <button
        type="button"
        onClick={handleRegister}
        disabled={isLoading || authenticityScore >= 95}
        style={{ padding: "12px", cursor: isLoading ? "not-allowed" : "pointer" }}
      >
        {isLoading
          ? `${STEP_ICON[state.step]} ${state.message}`
          : "Registrar obra en blockchain"}
      </button>

      {isLoading && state.txHash && (
        <p style={{ fontSize: "0.7rem", textAlign: "center" }}>
          Tx enviada: {state.txHash.substring(0, 10)}...
        </p>
      )}
    </div>
  );
}