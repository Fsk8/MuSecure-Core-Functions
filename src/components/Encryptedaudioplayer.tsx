/**
 * MuSecure – components/EncryptedAudioPlayer.tsx
 *
 * Reproductor para audio encriptado con Lighthouse.
 * El usuario debe tener la wallet que encriptó el archivo conectada.
 *
 * Uso en Dashboard:
 *   <EncryptedAudioPlayer cid={item.audioCid} ownerAddress={item.ownerAddress} signMessage={wallet.signMessage} />
 *
 * Uso en Explorer:
 *   <EncryptedAudioPlayer cid={song.cid} ownerAddress={connectedAddress} signMessage={wallet.signMessage} />
 */

import { useState, useRef, useEffect } from "react";
import lighthouse from "@lighthouse-web3/sdk";

interface Props {
  cid: string;
  ownerAddress: string;
  signMessage: (message: string) => Promise<string>;
}

type DecryptState = "idle" | "signing" | "fetching-key" | "decrypting" | "ready" | "error";

const STATE_MSG: Record<DecryptState, string> = {
  idle:           "",
  signing:        "Firmando con wallet...",
  "fetching-key": "Obteniendo clave de descifrado...",
  decrypting:     "Descifrando audio...",
  ready:          "",
  error:          "",
};

export function EncryptedAudioPlayer({ cid, ownerAddress, signMessage }: Props) {
  const [decryptState, setDecryptState] = useState<DecryptState>("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevBlobUrl = useRef<string | null>(null);

  // Limpiar blob URL al desmontar
  useEffect(() => {
    return () => {
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    };
  }, []);

  const handleDecrypt = async () => {
    setError(null);
    setDecryptState("signing");

    try {
      // 1. Obtener mensaje de autenticación de Lighthouse
      const authRes = await lighthouse.getAuthMessage(ownerAddress);
      const message = authRes?.data?.message;
      if (!message) throw new Error("No se pudo obtener mensaje de autenticación de Lighthouse.");

      // 2. Firmar con la wallet
      const signature = await signMessage(message);

      // 3. Obtener la clave de encriptación del archivo
      setDecryptState("fetching-key");
      const keyRes = await lighthouse.fetchEncryptionKey(
        cid,
        ownerAddress,
        signature
      );

      const encryptionKey = keyRes?.data?.key;
      if (!encryptionKey) {
        throw new Error("No se pudo obtener la clave. ¿Estás usando la wallet correcta?");
      }

      // 4. Descifrar el archivo
      setDecryptState("decrypting");
      const decrypted = await lighthouse.decryptFile(cid, encryptionKey);

      // decrypted es un ArrayBuffer o Uint8Array según la versión del SDK
        const rawBuffer = decrypted instanceof Uint8Array
        ? decrypted.buffer
        : decrypted as ArrayBuffer;
        const blob = new Blob([rawBuffer as ArrayBuffer], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);

      // Limpiar blob anterior
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
      prevBlobUrl.current = url;
      setBlobUrl(url);
      setDecryptState("ready");

    } catch (e) {
      const msg = (e as Error).message ?? "Error desconocido";
      const friendly = msg.includes("rejected") || msg.includes("denied")
        ? "Firma rechazada por el usuario."
        : msg.includes("key") || msg.includes("clave")
        ? "No tienes acceso a este archivo. Solo el owner puede desencriptar."
        : msg;
      setError(friendly);
      setDecryptState("error");
    }
  };

  if (decryptState === "ready" && blobUrl) {
    return (
      <div className="encrypted-player">
        <audio
          controls
          autoPlay={false}
          src={blobUrl}
          style={{ width: "100%", marginTop: 4 }}
        />
        <button
          type="button"
          onClick={() => {
            if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
            prevBlobUrl.current = null;
            setBlobUrl(null);
            setDecryptState("idle");
          }}
          style={{ fontSize: "0.7rem", marginTop: 4, opacity: 0.5 }}
        >
          Cerrar
        </button>
      </div>
    );
  }

  const isLoading = decryptState !== "idle" && decryptState !== "error";

  return (
    <div className="encrypted-player">
      {error && (
        <p style={{ color: "#ef4444", fontSize: "0.75rem", marginBottom: 6 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleDecrypt}
        disabled={isLoading}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: "0.75rem",
          padding: "6px 12px",
          borderRadius: 8,
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        {isLoading ? (
          <>
            <span style={{
              width: 12, height: 12, border: "2px solid currentColor",
              borderTopColor: "transparent", borderRadius: "50%",
              display: "inline-block", animation: "spin 0.8s linear infinite"
            }} />
            {STATE_MSG[decryptState]}
          </>
        ) : (
          <>🔓 Desencriptar y escuchar</>
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}