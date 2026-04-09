/**
 * MuSecure – EncryptedAudioPlayer
 * Fix: flujo correcto de Lighthouse — getAuthMessage → sign → fetchEncryptionKey → decryptFile
 */

import { useState, useEffect, useRef } from "react";
import lighthouse from "@lighthouse-web3/sdk";

interface Props {
  cid: string;
  ownerAddress: string;
  signMessage: (message: string) => Promise<string>;
}

type State = "idle" | "signing" | "fetching-key" | "decrypting" | "ready" | "error";

export function EncryptedAudioPlayer({ cid, ownerAddress, signMessage }: Props) {
  const [state, setState] = useState<State>("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current); };
  }, []);

  const handleDecrypt = async () => {
    if (!ownerAddress || !cid) return;
    setError(null);
    setState("signing");

    try {
      // 1. Obtener mensaje de auth de Lighthouse
      const authRes = await lighthouse.getAuthMessage(ownerAddress);
      const message = authRes?.data?.message;
      if (!message) throw new Error("No se pudo obtener el mensaje de autenticación de Lighthouse.");

      // 2. Firmar con Privy
      const signature = await signMessage(message);

      // 3. Obtener clave de encriptación — este paso lo faltaba
      setState("fetching-key");
      const keyRes = await lighthouse.fetchEncryptionKey(cid, ownerAddress, signature);
      const encryptionKey = keyRes?.data?.key;
      if (!encryptionKey) throw new Error("Sin acceso. Solo el owner puede desencriptar.");

      // 4. Descifrar el archivo con la clave
      setState("decrypting");
      const decrypted = await lighthouse.decryptFile(cid, encryptionKey);

      // 5. Crear blob URL
      const rawBuffer = decrypted instanceof Uint8Array ? decrypted.buffer : decrypted as ArrayBuffer;
      const blob = new Blob([rawBuffer as ArrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
      prevUrl.current = url;
      setBlobUrl(url);
      setState("ready");

    } catch (err: any) {
      console.error("[Decrypt] Error:", err);
      const msg = err.message?.includes("reject") || err.message?.includes("denied")
        ? "Firma rechazada."
        : err.message?.includes("key") || err.message?.includes("acceso")
        ? "Sin acceso — conecta la wallet que encriptó esta obra."
        : err.message || "Error al descifrar";
      setError(msg);
      setState("error");
    }
  };

  const handleClose = () => {
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    prevUrl.current = null;
    setBlobUrl(null);
    setState("idle");
    setError(null);
  };

  if (state === "ready" && blobUrl) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <audio
          controls
          autoPlay={false}
          src={blobUrl}
          style={{ width: '100%', height: '40px', filter: 'invert(1) brightness(2)' }}
        />
        <button
          onClick={handleClose}
          style={{ fontSize: '8px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', fontWeight: '900' }}
        >
          Cerrar ✕
        </button>
      </div>
    );
  }

  const isLoading = state !== "idle" && state !== "error";
  const label = state === "signing" ? "✍️ Firma en tu Wallet..."
    : state === "fetching-key" ? "🔑 Obteniendo clave..."
    : state === "decrypting" ? "🔓 Descifrando..."
    : "🔓 Desbloquear Obra";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <button
        onClick={handleDecrypt}
        disabled={isLoading || !cid}
        style={{
          width: '100%',
          backgroundColor: isLoading ? '#111' : '#059669',
          color: isLoading ? '#10b981' : '#000000',
          padding: '16px',
          borderRadius: '16px',
          fontSize: '10px',
          fontWeight: '900',
          textTransform: 'uppercase',
          border: '1px solid #10b98133',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        {label}
      </button>
      {error && (
        <p style={{ fontSize: '8px', color: '#ef4444', textTransform: 'uppercase', fontWeight: '900', textAlign: 'center', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}