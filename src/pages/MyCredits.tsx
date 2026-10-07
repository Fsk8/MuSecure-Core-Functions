/**
 * MuSecure – pages/MyCredits.tsx
 *
 * "Mis créditos": obras registradas por OTROS autores donde el correo de la
 * sesión de Privy figura como co-autor en la metadata.
 *
 * Flujo del bounty "beyond login":
 *   creador agrega correo → metadata IPFS (collaborators) → el colaborador inicia
 *   sesión con ese correo → Privy le aprovisiona la Embedded Wallet (JIT) → aquí ve
 *   las obras en las que fue acreditado.
 *
 * Las participaciones son DECLARADAS por el autor en la metadata que registró
 * on-chain: no mueven fondos ni se ejecutan automáticamente.
 */

import { useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";
import { useMyCredits, type CreditEntry } from "@/hooks/useMyCredits";
import { goToArtistProfile } from "@/lib/Artistnavigation";
import { LighthouseService } from "@/services/LighthouseService";
import { WorkCover } from "@/components/WorkCover";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import {
  Mail, Wallet, RefreshCw, Headphones, Lock, ExternalLink, CheckCircle2,
  Loader2, User, Users, Shield,
} from "lucide-react";

const shortAddress = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
const pct = (n: number) => Number(n.toFixed(2));
const formatDate = (unixSeconds: string) =>
  new Date(Number(unixSeconds) * 1000).toLocaleDateString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** Todos los correos verificados que Privy tiene vinculados a la sesión (email + OAuth). */
function collectEmails(user: any): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.includes("@")) out.add(v.trim().toLowerCase());
  };
  add(user?.email?.address);
  add(user?.google?.email);
  add(user?.discord?.email);
  add(user?.github?.email);
  add(user?.apple?.email);
  add(user?.linkedin?.email);
  for (const a of user?.linkedAccounts ?? []) add(a?.type === "email" ? a?.address : a?.email);
  return Array.from(out);
}

/* ─────────────────────────── Tarjeta ─────────────────────────── */

function CreditCard({ entry, index }: { entry: CreditEntry; index: number }) {
  const { work } = entry;
  const author = work.author.id;
  const soulbound = !!work.certificate?.soulbound;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 12) * 0.04 }}
    >
      <Card className="group flex h-full flex-col transition-all hover:border-violet/30 hover:shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Badge variant="secondary" className="font-mono text-[9px]">
            ID #{work.tokenId}
          </Badge>
          {soulbound ? (
            <Badge className="border-violet-500/30 bg-violet-500/20 text-[9px] text-violet-400">
              Soulbound
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[9px]">Transferible</Badge>
          )}
        </div>

        <div className="mb-4">
          <WorkCover urls={entry.coverUrls} className="h-40" />
        </div>

        <h3 className="truncate font-display text-base font-bold uppercase tracking-tight text-white">
          {entry.title}
        </h3>
        <p className="mb-1 mt-1 truncate font-mono text-[11px] text-emerald-500/70">{entry.artist}</p>

        <button
          onClick={() => goToArtistProfile(author)}
          title={`Ver perfil de ${author}`}
          className="mb-4 flex items-center gap-1 self-start font-mono text-[9px] text-zinc-600 transition-colors hover:text-emerald-400"
        >
          <User className="h-2.5 w-2.5" />
          Creador: {shortAddress(author)}
        </button>

        {/* Mi participación declarada */}
        <div className="mb-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="flex items-end justify-between">
            <p className="font-mono text-[9px] uppercase tracking-widest text-violet-400/70">
              Tu participación declarada
            </p>
            <p className="font-display text-2xl font-bold text-violet-400">{pct(entry.share)}%</p>
          </div>

          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="bg-violet-500" style={{ width: `${entry.share}%` }} />
            {entry.othersShare > 0 && (
              <div className="bg-zinc-500" style={{ width: `${entry.othersShare}%` }} />
            )}
            <div className="bg-emerald-500/60" style={{ width: `${entry.creatorShare}%` }} />
          </div>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Tú {pct(entry.share)}%
            </span>
            {entry.othersShare > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" /> Otros {pct(entry.othersShare)}%
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" /> Creador{" "}
              {pct(entry.creatorShare)}%
            </span>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Score</p>
            <p className="mt-1 font-display text-sm font-bold text-white">{work.authenticityScore}%</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Registro</p>
            <p className="mt-1 font-mono text-[10px] font-bold text-white">{formatDate(work.registeredAt)}</p>
          </div>
        </div>

        <div className="mt-auto space-y-4">
          {entry.isEncrypted ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-800/30 p-3">
              <Lock className="h-3 w-3 text-zinc-500" />
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                Cifrado — solo el creador puede reproducirlo
              </p>
            </div>
          ) : entry.audioCid ? (
            <a
              href={LighthouseService.audioUrl(entry.audioCid)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 no-underline transition-colors hover:bg-emerald-500/10"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-black">
                <Headphones className="h-4 w-4" />
              </div>
              <div className="flex-1 text-left">
                <p className="m-0 text-sm font-bold text-white">Escuchar</p>
                <p className="m-0 font-mono text-[9px] text-zinc-500">Abrir en IPFS</p>
              </div>
            </a>
          ) : (
            <div className="rounded-2xl border border-zinc-700 bg-zinc-800/30 p-3 text-center">
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                Sin audio disponible
              </p>
            </div>
          )}

          <a
            href={`https://sepolia.arbiscan.io/tx/${work.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.3em] text-zinc-700 no-underline transition-colors hover:text-emerald-500"
          >
            Registro de la obra <ExternalLink className="h-2 w-2" />
          </a>
          <a
            href={`https://sepolia.arbiscan.io/tx/${entry.creditTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.3em] text-zinc-700 no-underline transition-colors hover:text-violet-400"
          >
            Tu crédito on-chain <ExternalLink className="h-2 w-2" />
          </a>
        </div>
      </Card>
    </motion.div>
  );
}

/* ─────────────────────────── Página ─────────────────────────── */

export function MyCredits() {
  const { ready, authenticated, login, user } = usePrivy();
  const { address } = useWallet();

  const emails = useMemo(() => collectEmails(user), [user]);
  const { credits, loading, error, reload } = useMyCredits(authenticated ? address : null);

  const stats = useMemo(() => {
    if (credits.length === 0) return null;
    return {
      count: credits.length,
      avgShare: pct(credits.reduce((s, c) => s + c.share, 0) / credits.length),
      soulbound: credits.filter((c) => c.work.certificate?.soulbound).length,
    };
  }, [credits]);

  const header = (
    <div>
      <h2 className="font-display text-2xl font-bold tracking-tight text-white">Mis Créditos</h2>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-violet-400/70">
        Co-autorías declaradas · Powered by Privy
      </p>
    </div>
  );

  if (!ready) {
    return (
      <div className="space-y-8 pb-12 pt-2">
        {header}
        <Skeleton className="h-40 w-full rounded-[2.5rem] bg-zinc-900/50" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="space-y-8 pb-12 pt-2">
        {header}
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/10">
            <Mail className="h-6 w-6 text-violet-400" />
          </div>
          <p className="max-w-md text-sm text-zinc-400">
            ¿Un productor o co-autor te agregó a una obra? Inicia sesión con el correo que usó: Privy creará tu
            wallet embebida y aquí verás tus créditos.
          </p>
          <Button onClick={() => login()} size="lg">
            Iniciar sesión
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 pt-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {header}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void reload()}
          disabled={loading}
          className="gap-2 self-start text-zinc-500 hover:text-white sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Identidad: correo verificado → wallet embebida */}
      <div className="rounded-[2.5rem] border border-zinc-800 bg-zinc-900/30 p-6 backdrop-blur-sm">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Sesión verificada por Privy
            </p>
            <div className="flex flex-wrap gap-2">
              {emails.map((e) => (
                <Badge key={e} variant="secondary" className="font-mono text-[10px]">
                  <Mail className="mr-1 h-2.5 w-2.5" />
                  {e}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
              <Wallet className="h-3 w-3 text-violet-400" /> Tu wallet embebida (Privy)
            </p>
            <p className="font-mono text-xs text-white">
              {address ? address : <span className="text-zinc-500">Aprovisionando…</span>}
            </p>
          </div>
        </div>

        {stats && (
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-zinc-800 pt-6">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Obras acreditadas</p>
              <p className="mt-1 font-display text-xl font-bold text-white">{stats.count}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Participación media</p>
              <p className="mt-1 font-display text-xl font-bold text-violet-400">{stats.avgShare}%</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Soulbound</p>
              <p className="mt-1 font-display text-xl font-bold text-emerald-400">{stats.soulbound}</p>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" />
          <p className="font-mono text-xs font-bold text-violet-400">Consultando tus créditos en el indexador…</p>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 font-mono text-xs text-amber-400">
          {error}
        </p>
      )}

      {/* Resultados */}
      {credits.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {credits.map((entry, i) => (
            <CreditCard key={entry.work.id} entry={entry} index={i} />
          ))}
        </div>
      ) : (
        !loading &&
        !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 py-20 text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
              <Users className="h-7 w-7 text-zinc-600" />
            </div>
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-600">
              Todavía nadie te ha acreditado como co-autor
            </p>
            <p className="max-w-sm text-[11px] leading-relaxed text-zinc-600">
              Cuando un creador te acredite con tu correo, tu wallet embebida quedará registrada en el contrato
              y la obra aparecerá aquí.
            </p>
          </motion.div>
        )
      )}

      <p className="flex items-start justify-center gap-1.5 text-center font-mono text-[9px] leading-relaxed text-zinc-700">
        <Shield className="mt-0.5 h-3 w-3 shrink-0" />
        Las participaciones las declara el autor y quedan inmutables en el contrato MuSecureCredits. No mueven fondos ni se
        ejecutan automáticamente.
      </p>
    </div>
  );
}