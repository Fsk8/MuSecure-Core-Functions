import { useState, useEffect } from "react";
import lighthouse from "@lighthouse-web3/sdk";

interface Props {
  cid: string;
  ownerAddress: string;
  // Cambiamos el tipo para aceptar la función de Privy
  signMessage: (message: string) => Promise<string>;
}

export function EncryptedAudioPlayer({ cid, ownerAddress, signMessage }: Props) {
  const [decryptState, setDecryptState] = useState<"idle" | "signing" | "decrypting" | "ready">("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Liberar memoria del audio al cerrar
  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  const handleDecrypt = async () => {
    if (!ownerAddress) return;
    setError(null);
    setDecryptState("signing");

    try {
      // 1. Obtener el mensaje de Lighthouse
      const response = await lighthouse.getAuthMessage(ownerAddress);
      const message = response.data.message;

      // SOLUCIÓN AL ERROR TS(2345): Validamos que el mensaje exista
      if (!message) {
        throw new Error("No se pudo obtener el mensaje de autenticación");
      }
      
      // 2. Firmar usando Privy
      const signature = await signMessage(message);
      
      setDecryptState("decrypting");

      // 3. Descifrar el archivo
      const decryptedFile = await lighthouse.decryptFile(cid, signature);
      
      // 4. Crear el archivo temporal de audio
      const url = URL.createObjectURL(new Blob([decryptedFile]));
      setBlobUrl(url);
      setDecryptState("ready");
    } catch (err: any) {
      console.error("Error en desencriptación:", err);
      setError(err.message || "Error al descifrar el audio");
      setDecryptState("idle");
    }
  };

  if (blobUrl) {
    return (
      <div className="animate-in fade-in duration-500">
        <audio src={blobUrl} controls className="w-full h-10 invert brightness-200" autoPlay />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleDecrypt}
        disabled={decryptState !== "idle"}
        className="w-full bg-zinc-800 hover:bg-indigo-600 py-4 rounded-2xl text-[10px] font-black uppercase text-white transition-all border border-zinc-700 disabled:opacity-50"
      >
        {decryptState === "signing" ? "✍️ Firma en tu Wallet..." : 
         decryptState === "decrypting" ? "🔓 Descifrando..." : "🔓 Desbloquear Obra"}
      </button>
      {error && <p className="text-[7px] text-red-500 uppercase font-bold text-center tracking-tighter">{error}</p>}
    </div>
  );
}