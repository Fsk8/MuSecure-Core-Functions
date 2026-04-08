/**
 * MuSecure – hooks/useGasAirdrop.ts
 *
 * Detecta usuarios nuevos y llama al endpoint /api/airdrop-gas
 * para fondearlos con ETH de testnet.
 *
 * Uso en App.tsx:
 *   const wallet = useWallet();
 *   useGasAirdrop(wallet.address, wallet.isNewUser);
 */

import { useEffect, useState } from "react";

type AirdropStatus = "idle" | "sending" | "done" | "skipped" | "error";

export function useGasAirdrop(address: string | null, isNewUser: boolean) {
  const [status, setStatus] = useState<AirdropStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !isNewUser || status !== "idle") return;

    const sendAirdrop = async () => {
      setStatus("sending");
      setMessage("Fondeando tu cuenta con ETH de testnet...");

      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL as string ?? "";
        const res = await fetch(`${backendUrl}/api/airdrop-gas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });

        const data = await res.json();

        if (data.skipped) {
          setStatus("skipped");
          setMessage(null);
          return;
        }

        if (!data.success) {
          throw new Error(data.error ?? "Error en el airdrop");
        }

        setStatus("done");
        setMessage(`✅ Recibiste ${data.amount} ETH para gas`);

        // Limpiar mensaje después de 5 segundos
        setTimeout(() => setMessage(null), 5000);
      } catch (e) {
        setStatus("error");
        setMessage(null);
        console.warn("[Airdrop] Falló:", (e as Error).message);
      }
    };

    sendAirdrop();
  }, [address, isNewUser, status]);

  return { airdropStatus: status, airdropMessage: message };
}