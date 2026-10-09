/**
 * MuSecure – pages/ArtistProfile.tsx
 *
 * Perfil público de un artista: su wallet + todas sus obras registradas.
 * URL compartible vía ?artist=0x... (ver lib/artistNavigation.ts)
 */

import { useMemo, useState } from "react";
import { useIndexedWorks } from "@/hooks/useIndexedWorks";
import { exitArtistProfile } from "@/lib/Artistnavigation";
import { EncryptedAudioPlayer } from "@/components/Encryptedaudioplayer";
import { WorkCover } from "@/components/WorkCover";
import { CollaboratorsList } from "@/components/CollaboratorsList";
import { LicenseControl } from "@/components/LicenseControl";
import { addressUrl, txUrl } from "@/lib/chain";
import { LighthouseService } from "@/services/LighthouseService";
import { useWallet } from "@/hooks/useWallet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Copy, Check, ExternalLink, Music, Headphones, Shield } from "lucide-react";

interface Props {
  address: string;
}

export function ArtistProfile({ address }: Props) {
  const { works, loading, error } = useIndexedWorks(address);
  const { address: myAddress, signMessage, isReady } = useWallet();
  const [copied, setCopied] = useState(false);

  const isOwnProfile = myAddress?.toLowerCase() === address.toLowerCase();

  // Oculta obras cifradas "huérfanas" (metadata antigua sin atributo AudioCID) —
  // nunca serán reproducibles, así que no vale la pena mostrarlas en el perfil.
  const visibleWorks = useMemo(
    () => works.filter((w) => !w.isEncrypted || w.audioCid),
    [works],
  );

  const stats = useMemo(() => {
    if (visibleWorks.length === 0) return null;
    const avgScore = visibleWorks.reduce((sum, w) => sum + Number(w.authenticityScore), 0) / visibleWorks.length;
    const soulboundCount = visibleWorks.filter((w) => w.certificate?.soulbound).length;
    return {
      total: visibleWorks.length,
      avgScore: Math.round(avgScore * 10) / 10,
      soulboundCount,
    };
  }, [visibleWorks]);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 pb-16"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={exitArtistProfile}
        className="gap-2 text-zinc-500 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Volver
      </Button>

      {/* Header del perfil */}
      <div className="rounded-[2.5rem] border border-zinc-800 bg-zinc-900/30 p-8 backdrop-blur-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <Shield className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-white">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </h2>
                {isOwnProfile && <Badge variant="success" className="text-[9px]">TÚ</Badge>}
              </div>
              <button
                onClick={handleCopy}
                className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 hover:text-emerald-400 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> {address}
                  </>
                )}
              </button>
            </div>
          </div>

          <a
            href={addressUrl(address)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 self-start rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2 font-mono text-[10px] text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors no-underline sm:self-auto"
          >
            Ver en el explorer <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {stats && (
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-zinc-800 pt-6">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Obras</p>
              <p className="mt-1 font-display text-xl font-bold text-white">{stats.total}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Score Promedio</p>
              <p className="mt-1 font-display text-xl font-bold text-emerald-400">{stats.avgScore}%</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Soulbound</p>
              <p className="mt-1 font-display text-xl font-bold text-violet-400">{stats.soulboundCount}</p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 font-mono text-xs text-amber-400">
          {error}
        </p>
      )}

      {/* Grilla de obras */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-[2.5rem] bg-zinc-900/50" />
          ))}
        </div>
      ) : visibleWorks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[2.5rem] border border-dashed border-zinc-800 py-20">
          <Music className="h-8 w-8 text-zinc-700" />
          <p className="font-mono text-xs uppercase tracking-wider text-zinc-600">
            {works.length > 0
              ? "Todas las obras de esta wallet usan metadata antigua sin audio vinculado"
              : "Esta wallet no tiene obras registradas todavía"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visibleWorks.map((w) => (
              <motion.div key={w.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="flex h-full flex-col border-zinc-800 bg-zinc-900/30 p-6 hover:border-emerald-500/30 transition-all">
                  <div className="mb-4 flex items-center justify-between">
                    <Badge variant="secondary" className="font-mono text-[9px]">
                      ID #{w.certificate?.tokenId ?? "?"}
                    </Badge>
                    {w.certificate?.soulbound && (
                      <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-[9px]">
                        Soulbound
                      </Badge>
                    )}
                  </div>

                  <div className="mb-4">
                    <WorkCover urls={w.coverUrls} className="h-40" />
                  </div>

                  <h3 className="truncate font-display text-base font-bold uppercase text-white">
                    {w.title ?? `Obra #${w.certificate?.tokenId ?? ""}`}
                  </h3>
                  {w.artist && (
                    <p className="mt-1 mb-4 font-mono text-[10px] uppercase tracking-widest text-emerald-500/70">
                      {w.artist}
                    </p>
                  )}

                  <CollaboratorsList credits={w.credits} myAddress={myAddress} />

                  <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                      Score de Autenticidad
                    </p>
                    <p className="mt-1 font-display text-sm font-bold text-white">{w.authenticityScore}%</p>
                  </div>

                  <div className="mt-auto space-y-3">
                    <LicenseControl fingerprintHash={(w as any).fingerprintHash ?? (w as any).id} author={address} title={w.title ?? `Obra #${w.certificate?.tokenId ?? ""}`} audioUrl={w.audioCid ? LighthouseService.audioUrl(w.audioCid) : null} isEncrypted={w.isEncrypted} />
                    {w.isEncrypted ? (
                      !w.audioCid ? (
                        <div className="rounded-2xl border border-zinc-700 bg-zinc-800/30 p-3 text-center">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                            Metadata antigua — audio no vinculado
                          </p>
                        </div>
                      ) : isOwnProfile && isReady && myAddress && signMessage ? (
                        <EncryptedAudioPlayer cid={w.audioCid} ownerAddress={address} signMessage={signMessage} />
                      ) : (
                        <div className="rounded-2xl border border-zinc-700 bg-zinc-800/30 p-3 text-center">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                            {isOwnProfile
                              ? "Conecta tu wallet para desbloquear"
                              : "Cifrado — solo el propietario puede reproducirlo"}
                          </p>
                        </div>
                      )
                    ) : w.audioCid ? (
                      <a
                        href={LighthouseService.audioUrl(w.audioCid)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 hover:bg-emerald-500/10 transition-colors no-underline"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-black">
                          <Headphones className="h-4 w-4" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="m-0 text-sm font-bold text-white">Escuchar</p>
                          <p className="m-0 font-mono text-[9px] text-zinc-500">Open IPFS</p>
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
                      href={txUrl(w.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.3em] text-zinc-700 hover:text-emerald-500 transition-colors no-underline"
                    >
                      Blockchain Proof <ExternalLink className="h-2 w-2" />
                    </a>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}