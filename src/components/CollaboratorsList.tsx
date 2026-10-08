/**
 * MuSecure – components/CollaboratorsList.tsx
 *
 * Co-autores acreditados on-chain (MuSecureCredits) dentro de la tarjeta de una obra.
 * No renderiza nada si la obra no tiene créditos, así que se puede poner en todas
 * las tarjetas sin condicionales.
 *
 * Solo hay direcciones: el contrato guarda wallets, no correos.
 */

import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

interface Credit {
  /** Puntos base: 1 = 0,01 %. */
  bps: number;
  collaborator: { id: string };
}

interface Props {
  credits?: Credit[] | null;
  /** Wallet conectada: marca con "TÚ" su propia fila. */
  myAddress?: string | null;
}

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
const pct = (bps: number) => Number((bps / 100).toFixed(2));

export function CollaboratorsList({ credits, myAddress }: Props) {
  if (!credits || credits.length === 0) return null;

  const me = myAddress?.toLowerCase();
  const sorted = [...credits].sort((a, b) => b.bps - a.bps);
  const totalBps = sorted.reduce((s, c) => s + c.bps, 0);
  const creatorPct = pct(Math.max(0, 10_000 - totalBps));

  return (
    <div className="mb-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-violet-400/80">
          <Users className="h-3 w-3" />
          Co-autores ({sorted.length})
        </p>
        <span className="font-mono text-[9px] text-zinc-600">Creador {creatorPct}%</span>
      </div>

      <ul className="space-y-1">
        {sorted.map((c) => {
          const isMe = !!me && c.collaborator.id.toLowerCase() === me;
          return (
            <li key={c.collaborator.id} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="truncate font-mono text-[10px] text-zinc-400"
                  title={c.collaborator.id}
                >
                  {short(c.collaborator.id)}
                </span>
                {isMe && (
                  <Badge variant="success" className="h-4 px-1 text-[8px]">
                    TÚ
                  </Badge>
                )}
              </span>
              <span className="shrink-0 font-mono text-[10px] font-bold text-violet-400">{pct(c.bps)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}