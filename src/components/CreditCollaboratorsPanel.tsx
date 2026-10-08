/**
 * MuSecure – components/CreditCollaboratorsPanel.tsx
 *
 * Segundo paso tras registrar la obra: acreditar on-chain a los co-autores
 * (MuSecureCredits). Se muestra solo si el formulario tenía colaboradores.
 *
 * Es un paso explícito y reintentable: si falla (gas, rechazo, red), el registro
 * de la obra ya está hecho y solo se repite este paso.
 */

import { useCreditCollaborators } from "@/hooks/useCreditCollaborators";
import { useWallet } from "@/hooks/useWallet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { Users, Mail, Loader2, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react";
import { txUrl } from "@/lib/chain";

interface Props {
  /** Misma huella con la que se registró la obra (0x + 64 hex). */
  fingerprintHash: string;
  collaborators: { email: string; sharePercentage: number }[];
}

export function CreditCollaboratorsPanel({ fingerprintHash, collaborators }: Props) {
  const { creditCollaborators, state } = useCreditCollaborators();
  const { isReady, address } = useWallet();

  const busy = ["resolving", "checking", "waiting-wallet", "confirming"].includes(state.step);
  const total = collaborators.reduce((s, c) => s + c.sharePercentage, 0);
  const creatorPct = Math.max(0, Math.round((100 - total) * 100) / 100);

  const run = () => {
    // El hook ya registra y expone el error en `state`; aquí solo evitamos el unhandled rejection.
    creditCollaborators({ fingerprintHash, collaborators }).catch(() => {});
  };

  if (state.step === "done") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 text-left"
      >
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-violet-400" />
          <p className="font-mono text-xs font-bold uppercase text-violet-400">Co-autores acreditados on-chain</p>
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-400">
          Cada colaborador verá esta obra en <span className="text-zinc-200">Mis Créditos</span> al iniciar sesión
          con su correo: su wallet embebida de Privy ya existe y está registrada en el contrato.
        </p>
        {state.txHash && (
          <a
            href={txUrl(state.txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 no-underline transition-colors hover:text-violet-400"
          >
            Ver transacción <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </motion.div>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 text-left">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Users className="h-4 w-4 text-violet-400" />
        <p className="font-mono text-xs font-bold uppercase text-violet-400">Acreditar co-autores on-chain</p>
        <span className="font-mono text-[9px] text-zinc-500">(Powered by Privy)</span>
      </div>

      <ul className="space-y-1.5">
        {collaborators.map((c) => (
          <li
            key={c.email}
            className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/20 px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Mail className="h-3 w-3 shrink-0 text-zinc-500" />
              <span className="truncate font-mono text-[11px] text-zinc-300">{c.email}</span>
            </span>
            <Badge variant="secondary" className="shrink-0 font-mono text-[9px]">
              {c.sharePercentage}%
            </Badge>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-3 py-1">
          <span className="font-mono text-[11px] text-zinc-500">Tú (creador)</span>
          <span className="font-mono text-[10px] text-emerald-500">{creatorPct}%</span>
        </li>
      </ul>

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-500">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
        Es permanente: los créditos se escriben una sola vez y no se pueden editar. Se crea una wallet embebida
        de Privy para cada correo y se declara su porcentaje en el contrato.
      </p>

      <Button onClick={run} disabled={busy || !isReady || !address} className="w-full" size="lg">
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {state.message}
          </>
        ) : state.step === "error" ? (
          "Reintentar acreditación"
        ) : (
          <>
            <Users className="mr-2 h-4 w-4" />
            Acreditar co-autores
          </>
        )}
      </Button>

      {state.step === "error" && (
        <p className="text-center font-mono text-[10px] text-red-400">{state.error}</p>
      )}
    </div>
  );
}