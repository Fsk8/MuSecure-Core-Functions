import { useEffect, useState, useCallback } from "react";
import { CHAIN } from "@/lib/chain";

type AirdropStatus = "idle" | "sending" | "done" | "skipped" | "error";

export function useGasAirdrop(address: string | null, isNewUser?: boolean) {
  const [status, setStatus] = useState<AirdropStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const requestManualAirdrop = useCallback(async (targetAddress: string) => {
    setStatus("sending");
    setMessage(`Funding your account with testnet ${CHAIN.symbol}...`);

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
        setMessage(data.reason === "has_balance" ? "✅ You already have enough funds" : "You already received your airdrop");
        setTimeout(() => setMessage(null), 5000);
        return;
      }

      if (!data.success) {
        throw new Error(data.error ?? "Airdrop error");
      }

      setStatus("done");
      setMessage(`✅ You received ${data.amount} ${CHAIN.symbol} for gas`);
      setTimeout(() => setMessage(null), 5000);
    } catch (e) {
      setStatus("error");
      setMessage("Error requesting gas");
      console.warn("[Airdrop] Failed:", (e as Error).message);
      setTimeout(() => setMessage(null), 5000);
    }
  }, []);

  useEffect(() => {
    if (!address || !isNewUser || status !== "idle") return;
    requestManualAirdrop(address);
  }, [address, isNewUser, status, requestManualAirdrop]);

  return { airdropStatus: status, airdropMessage: message, requestManualAirdrop };
}