import { useEffect, useState, useCallback } from "react";

type AirdropStatus = "idle" | "sending" | "done" | "skipped" | "error";

export function useGasAirdrop(address: string | null, isNewUser?: boolean) {
  const [status, setStatus] = useState<AirdropStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const requestManualAirdrop = useCallback(async (targetAddress: string) => {
    setStatus("sending");
    setMessage("Fondeando tu cuenta con ETH de testnet...");

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL as string ?? "";
      const res = await fetch(`${backendUrl}/api/airdrop-gas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: targetAddress }),
      });

      const data = await res.json();

      if (data.skipped) {
        setStatus("skipped");
        setMessage(data.reason === "has_balance" ? "✅ Ya tienes fondos suficientes" : "Ya recibiste tu airdrop");
        setTimeout(() => setMessage(null), 5000);
        return;
      }

      if (!data.success) {
        throw new Error(data.error ?? "Error en el airdrop");
      }

      setStatus("done");
      setMessage(`✅ Recibiste ${data.amount} ETH para gas`);
      setTimeout(() => setMessage(null), 5000);
    } catch (e) {
      setStatus("error");
      setMessage("Error al solicitar gas");
      console.warn("[Airdrop] Falló:", (e as Error).message);
      setTimeout(() => setMessage(null), 5000);
    }
  }, []);

  useEffect(() => {
    if (!address || !isNewUser || status !== "idle") return;
    requestManualAirdrop(address);
  }, [address, isNewUser, status, requestManualAirdrop]);

  return { airdropStatus: status, airdropMessage: message, requestManualAirdrop };
}