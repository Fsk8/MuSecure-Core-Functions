/**
 * MuSecure – components/EarningsPanel.tsx  ("Mis ganancias")
 * Regalías recibidas por licencias vendidas, saldo retirable y últimas operaciones.
 * Uso:  <EarningsPanel address={address} />
 */
import { useEarnings } from "@/hooks/useEarnings";
import { useLicensingTx } from "@/hooks/useLicensingTx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, RefreshCw, Loader2, ExternalLink, Wallet } from "lucide-react";
import { CHAIN, txUrl } from "@/lib/chain";
import { formatMon } from "@/lib/licensing";

export function EarningsPanel({ address }: { address: string | null | undefined }) {
  const { summary, claimable, loading, indexerDown, error, reload } = useEarnings(address);
  const { send, state, reset } = useLicensingTx();
  const busy = state.step === "waiting-wallet" || state.step === "confirming";

  const withdraw = async () => {
    try {
      await send({ fn: "withdraw", args: [] });
      await reload();
    } catch {
      /* el hook ya expone el error en state */
    }
  };

  return (
    <div className="rounded-[2.5rem] border border-zinc-800 bg-zinc-900/30 p-6 backdrop-blur-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-emerald-400" />
          <h3 className="font-display text-lg font-bold text-white">Mis ganancias</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={loading} className="gap-2 text-zinc-500 hover:text-white">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total recibido" value={`${formatMon(summary?.totalEarned ?? 0n)} ${CHAIN.symbol}`} />
        <Stat label="Licencias vendidas" value={String(summary?.salesCount ?? 0)} />
        <Stat label="Por retirar" value={`${formatMon(claimable)} ${CHAIN.symbol}`} accent={claimable > 0n} />
      </div>

      {claimable > 0n && (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="mb-3 text-[11px] leading-relaxed text-zinc-400">
            Algunos pagos no pudieron enviarse directo a tu wallet y quedaron guardados en el contrato. Retíralos aquí.
          </p>
          <Button onClick={withdraw} disabled={busy} size="sm" className="gap-2">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
            {busy ? state.message : `Retirar ${formatMon(claimable)} ${CHAIN.symbol}`}
          </Button>
        </div>
      )}
      {state.step === "error" && (
        <p className="mt-3 text-[11px] text-red-400">
          {state.error}{" "}
          <button className="underline" onClick={reset}>
            cerrar
          </button>
        </p>
      )}
      {error && <p className="mt-3 text-[11px] text-amber-400">{error}</p>}
      {indexerDown && <p className="mt-3 text-[11px] text-zinc-500">Historial no disponible (indexador). El saldo por retirar sí es on-chain.</p>}

      <div className="mt-6 border-t border-zinc-800 pt-4">
        <p className="mb-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Últimos pagos</p>
        {summary && summary.royalties.length > 0 ? (
          <ul className="space-y-2">
            {summary.royalties.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-zinc-400">{r.fingerprintHash.slice(0, 10)}…{r.fingerprintHash.slice(-6)}</p>
                  <p className="font-mono text-[9px] text-zinc-600">{new Date(r.paidAt * 1000).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[9px]">{r.isAuthor ? "Autor" : "Co-autor"}</Badge>
                  {!r.direct && <Badge variant="secondary" className="font-mono text-[9px]">Pendiente</Badge>}
                  <span className="font-mono text-xs text-emerald-400">+{formatMon(r.amount)} {CHAIN.symbol}</span>
                  <a href={txUrl(r.txHash)} target="_blank" rel="noreferrer" className="text-zinc-600 hover:text-violet-400">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-zinc-600">Aún no has recibido regalías.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/20 p-3">
      <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{label}</p>
      <p className={`mt-1 font-display text-base font-bold ${accent ? "text-emerald-400" : "text-white"}`}>{value}</p>
    </div>
  );
}
