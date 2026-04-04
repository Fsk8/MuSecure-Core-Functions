import { useState, useRef, useEffect } from "react";
import lighthouse from "@lighthouse-web3/sdk";

interface Props {
  cid: string;
  ownerAddress: string;
  // Cambié el tipo para que sea más flexible con lo que devuelve ethers/wagmi
  signMessage: (message: string) => Promise<string | any>;
}

type DecryptState = "idle" | "signing" | "fetching-key" | "decrypting" | "ready" | "error";

const STATE_MSG: Record<DecryptState, string> = {
  idle:           "",
  signing:        "Firmando con tu wallet...",
  "fetching-key": "Validando acceso en Filecoin...",
  decrypting:     "Descifrando audio...",
  ready:          "Listo",
  error:          "Error de acceso",
};

export function EncryptedAudioPlayer({ cid, ownerAddress, signMessage }: Props) {
  const [decryptState, setDecryptState] = useState<DecryptState>("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevBlobUrl = useRef<string | null>(null);

  // Limpiar memoria al desmontar
  useEffect(() => {
    return () => {
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    };
  }, []);

  const handleDecrypt = async () => {
    setError(null);
    setDecryptState("signing");

    try {
      // 1. Obtener mensaje de Lighthouse
      // IMPORTANTE: El address debe ser el de la wallet ACTUAL conectada, 
      // no necesariamente el del owner original si es que hay permisos compartidos.
      const authRes = await lighthouse.getAuthMessage(ownerAddress);
      if (!authRes.data?.message) throw new Error("Error de comunicación con Lighthouse.");

      // 2. Firmar
      const signature = await signMessage(authRes.data.message);
      if (!signature) throw new Error("Firma cancelada.");

      // 3. Obtener clave
      setDecryptState("fetching-key");
      const keyRes = await lighthouse.fetchEncryptionKey(
        cid,
        ownerAddress,
        signature
      );

      const encryptionKey = keyRes.data?.key;
      
      // Si no hay key, es casi seguro que no tienes acceso
      if (!encryptionKey) {
        throw new Error("ACCESO_DENEGADO");
      }

      // 4. Descifrar el archivo
      setDecryptState("decrypting");
      const decrypted = await lighthouse.decryptFile(cid, encryptionKey);

      // Manejo seguro del buffer (Lighthouse a veces devuelve Blob o ArrayBuffer)
      let audioBlob: Blob;
      if (decrypted instanceof Blob) {
        audioBlob = decrypted;
      } else {
        const rawBuffer = (decrypted as any).buffer || decrypted;
        audioBlob = new Blob([rawBuffer], { type: "audio/mpeg" });
      }

      const url = URL.createObjectURL(audioBlob);

      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
      prevBlobUrl.current = url;
      setBlobUrl(url);
      setDecryptState("ready");

    } catch (e: any) {
      console.error("MuSecure Decrypt Error:", e);
      
      let friendlyMessage = "No tienes permiso para desencriptar esta obra.";
      
      if (e.message === "ACCESO_DENEGADO" || e.status === 401) {
        friendlyMessage = "⚠️ No tienes permisos para esta obra.";
      } else if (e.message?.includes("rejected") || e.code === 4001) {
        friendlyMessage = "Firma rechazada en la wallet.";
      } else if (e.message?.includes("network")) {
        friendlyMessage = "Error de red. Revisa tu conexión.";
      }

      setError(friendlyMessage);
      setDecryptState("error");
    }
  };

  const handleClose = () => {
    if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    prevBlobUrl.current = null;
    setBlobUrl(null);
    setDecryptState("idle");
    setError(null);
  };

  // UI del reproductor listo
  if (decryptState === "ready" && blobUrl) {
    return (
      <div className="encrypted-player-ready" style={{ width: '100%' }}>
        <audio controls src={blobUrl} style={{ width: "100%" }} />
        <button onClick={handleClose} style={{ 
          display: 'block', margin: '8px auto 0', fontSize: '0.65rem', 
          background: 'transparent', border: '1px solid #333', color: '#666',
          borderRadius: '4px', cursor: 'pointer' 
        }}>
          Cerrar Reproductor
        </button>
      </div>
    );
  }

  const isLoading = ["signing", "fetching-key", "decrypting"].includes(decryptState);

  return (
    <div className="encrypted-player-controls">
      {error && (
        <div style={{ 
          background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444",
          color: "#ef4444", padding: "8px", borderRadius: "8px", 
          fontSize: "0.75rem", marginBottom: "8px" 
        }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleDecrypt}
        disabled={isLoading}
        className="btn-decrypt"
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "10px",
          backgroundColor: isLoading ? "#27272a" : "#4f46e5",
          color: "white",
          border: "none",
          cursor: isLoading ? "not-allowed" : "pointer",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "8px",
          fontWeight: "600",
          fontSize: "0.8rem"
        }}
      >
        {isLoading ? (
          <>
            <div className="spinner" />
            <span>{STATE_MSG[decryptState]}</span>
          </>
        ) : (
          "🔓 Desencriptar y escuchar"
        )}
      </button>

      <style>{`
        .spinner {
          width: 14px; height: 14px; border: 2px solid #fff;
          border-top-color: transparent; border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}