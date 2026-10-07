/**
 * MuSecure – hooks/useMyCredits.ts
 *
 * Obras en las que la wallet conectada fue acreditada como co-autora on-chain
 * (MuSecureCredits, indexado por Envio). Una sola query GraphQL + metadata IPFS
 * solo de las obras que coinciden (título, portada).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getCreditsByCollaborator, type IndexedWork } from "@/services/EnvioIndexerService";
import {
  fetchMetadata,
  mapWithConcurrency,
  extractAudioCid,
  extractArtist,
  isEncryptedMeta,
  coverUrlsFromImage,
  isMobile,
} from "@/lib/ipfsMetadata";

export interface CreditEntry {
  work: IndexedWork;
  title: string;
  artist: string;
  audioCid: string;
  isEncrypted: boolean;
  coverUrls: string[];
  /** Mi participación declarada (%). */
  share: number;
  /** Suma de la participación de los demás colaboradores (%). */
  othersShare: number;
  /** Remanente del creador (%). */
  creatorShare: number;
  /** Tx en la que se me acreditó. */
  creditTxHash: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function useMyCredits(address: string | null | undefined) {
  const [credits, setCredits] = useState<CreditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++runId.current;
    const alive = () => id === runId.current;

    setError(null);
    if (!address) {
      setCredits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await getCreditsByCollaborator(address);
      if (!alive()) return;

      // Primero las tarjetas con lo que ya sabemos on-chain; la metadata las completa después.
      const base: CreditEntry[] = rows.map((c) => {
        const mine = c.bps / 100;
        const total = c.work.credits.reduce((s, x) => s + x.bps, 0) / 100;
        const others = Math.max(0, total - mine);
        return {
          work: c.work,
          title: `Obra #${c.work.tokenId}`,
          artist: "...",
          audioCid: "",
          isEncrypted: false,
          coverUrls: [],
          share: round2(mine),
          othersShare: round2(others),
          creatorShare: round2(Math.max(0, 100 - total)),
          creditTxHash: c.txHash,
        };
      });
      setCredits(base);
      setLoading(false);

      await mapWithConcurrency(base, isMobile() ? 3 : 5, async (entry) => {
        const meta = await fetchMetadata(entry.work.ipfsCid);
        if (!meta || !alive()) return;
        setCredits((prev) =>
          prev.map((p) =>
            p.work.id === entry.work.id
              ? {
                  ...p,
                  title: String(meta?.title || meta?.name || p.title),
                  artist: extractArtist(meta),
                  audioCid: extractAudioCid(meta),
                  isEncrypted: isEncryptedMeta(meta),
                  coverUrls: coverUrlsFromImage(meta?.image),
                }
              : p,
          ),
        );
      });
    } catch (e) {
      if (alive()) setError((e as Error).message || "No se pudieron cargar los créditos");
    } finally {
      if (alive()) setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void reload();
    return () => {
      runId.current++;
    };
  }, [reload]);

  return { credits, loading, error, reload };
}