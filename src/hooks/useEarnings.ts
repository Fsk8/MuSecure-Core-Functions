/**
 * MuSecure – hooks/useEarnings.ts
 * Totales e historial desde Envio; el saldo retirable SIEMPRE se lee on-chain
 * (claimable) porque es lo que withdraw() realmente entrega.
 */
import { useCallback, useEffect, useState } from "react";
import { fetchEarnings, readClaimable, type EarningsSummary } from "@/lib/licensing";

export function useEarnings(address: string | null | undefined) {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [claimable, setClaimable] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [indexerDown, setIndexerDown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    const [s, c] = await Promise.allSettled([fetchEarnings(address), readClaimable(address)]);
    if (s.status === "fulfilled") {
      setSummary(s.value);
      setIndexerDown(null);
    } else {
      const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
      console.error("[Earnings] Envio falló:", s.reason);
      setIndexerDown(msg);
    }
    if (c.status === "fulfilled") setClaimable(c.value);
    else setError("No se pudo leer tu saldo on-chain.");
    setLoading(false);
  }, [address]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { summary, claimable, loading, indexerDown, error, reload };
}