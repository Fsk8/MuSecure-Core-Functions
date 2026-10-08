/**
 * MuSecure – Explorer v3 (Envio + Lighthouse)
 *
 * Dos fuentes, reconciliadas por CID:
 *  1) Envio HyperIndex → obras registradas on-chain (certificado, score, riesgo,
 *     fecha, soulbound). Carga instantánea + polling cada POLL_MS.
 *  2) Lighthouse → obras que NUNCA llegan al indexador:
 *       · "MB Verified": grabaciones ya existentes en MusicBrainz; el protocolo
 *         no permite registrarlas on-chain.
 *       · "Solo IPFS": metadata + audio subidos, pero ninguna obra indexada por
 *         Envio apunta a ellos (registro fallido, contrato anterior, metadata
 *         re-subida…). Se etiquetan explícitamente para no confundirlas con
 *         obras certificadas.
 *
 * Una obra de Lighthouse se descarta si Envio ya la tiene (mismo CID de metadata
 * o mismo CID de audio), así nunca aparece duplicada.
 *
 * En desarrollo, la consola imprime una tabla de reconciliación para diagnosticar
 * por qué una obra aparece en un lado y no en el otro.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LighthouseService, DEFAULT_NFT_METADATA_IMAGE } from "@/services/LighthouseService";
import {
  getAllWorks,
  getStats,
  type IndexedWork,
  type IndexerStats,
} from "@/services/EnvioIndexerService";
import { goToArtistProfile } from "@/lib/Artistnavigation";
import { EncryptedAudioPlayer } from "@/components/Encryptedaudioplayer";
import { CollaboratorsList } from "@/components/CollaboratorsList";
import { LicenseControl } from "@/components/LicenseControl";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "motion/react";
import {
  Music, ExternalLink, CheckCircle2, Sparkles, Headphones, Lock, Globe,
  RefreshCw, Search, X, User, Shield, Users, BarChart3, Loader2,
} from "lucide-react";
import { CHAIN, txUrl } from "@/lib/chain";

const POLL_MS = 15_000;
const RISK_LABEL = ["Bajo Riesgo", "Riesgo Medio", "Alto Riesgo", "Bloqueado"];

// CIDs de audio problemáticos que fuerzan descarga (curados previamente).
const EXCLUDED_CIDS = new Set([
  "bafybeig3gauun6xlp4r66rdjo5ye4mdztn54b6anyo3yt4piwy3snaawhy",
  "bafybeiaiwsqeqtfuwt5ogr72q6yyqfkqw3cpmusfbgu4ulaha4upawjabi",
  "bafybeia5t43wnb3rn6rig4lrcbpcchvmbbk5iavh3mbpka4kdli3frqdvy",
  "bafybeib2l2lm6uq4rcvz5pb5f3ecmjaesc44pgo2ge3zg5on36bz26mvle",
  "bafybeihygixd32wmzy65hmyhrc7hnvnjqjz3tinrjmtq5rp7xu5uypm3wm",
]);

const getRiskVariant = (
  level: number,
): "success" | "warning" | "danger" | "violet" | "secondary" => {
  switch (level) {
    case 0: return "success";
    case 1: return "warning";
    case 2: return "danger";
    case 3: return "violet";
    default: return "secondary";
  }
};

/* ─────────────────────────── Tipos ─────────────────────────── */

interface MBInfo {
  recordingId: string;
  releaseId?: string | null;
  title: string;
  artist: string;
  scorePercent: number;
  releaseTitle?: string;
}

/** onchain = indexada por Envio · mb = MusicBrainz Verified · ipfs = solo en IPFS */
type Source = "onchain" | "mb" | "ipfs";
type Filter = "all" | Source | "collab";

/** ¿La wallet figura como co-autora de esta obra? */
const isCollaboratorOn = (w: { credits?: { collaborator: { id: string } }[] }, addr?: string | null) =>
  !!addr && !!w.credits?.some((c) => c.collaborator.id.toLowerCase() === addr.toLowerCase());

interface ExplorerWork {
  key: string;
  source: Source;
  metadataCid: string;
  /** ms epoch (registro on-chain o subida a Lighthouse). 0 = desconocido. */
  registeredAt: number;
  // ── Solo obras on-chain (Envio) ──
  tokenId?: number;
  author?: string;
  /** fingerprintHash = Work.id en Envio (para licencias). */
  fingerprintHash?: string;
  authenticityScore?: number;
  riskLevel?: number;
  txHash?: string;
  soulbound?: boolean;
  /** Co-autores acreditados on-chain (MuSecureCredits). */
  credits?: { bps: number; collaborator: { id: string } }[];
  // ── Resueltos desde la metadata IPFS ──
  title: string;
  artist: string;
  audioCid: string;
  isEncrypted: boolean;
  mbInfo?: MBInfo;
  coverCandidates: string[];
  metaLoading: boolean;
  metaFailed: boolean;
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function cleanCid(raw: string): string {
  return String(raw).trim().replace(/^ipfs:\/\//i, "").split("?")[0].split("/")[0];
}

const shortAddress = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const formatDate = (ms: number) =>
  ms
    ? new Date(ms).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

const isMobile = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Lighthouse a veces da segundos, ms o ISO; normaliza a ms (0 si no hay dato). */
function normalizeTs(v: unknown, fileName = ""): number {
  let n = typeof v === "string" && Number.isNaN(Number(v)) ? Date.parse(v) : Number(v ?? 0);
  if (!n || Number.isNaN(n)) n = Number(fileName.match(/\d{13}/)?.[0] ?? 0) || 0;
  if (!n) return 0;
  return n < 1e12 ? n * 1000 : n;
}

function indexedToWork(w: IndexedWork): ExplorerWork {
  return {
    key: `chain:${w.tokenId}`,
    source: "onchain",
    metadataCid: cleanCid(w.ipfsCid),
    registeredAt: Number(w.registeredAt) * 1000,
    tokenId: Number(w.tokenId),
    author: w.author.id,
    fingerprintHash: (w as any).fingerprintHash ?? (w as any).id,
    authenticityScore: Number(w.authenticityScore),
    riskLevel: Number(w.riskLevel),
    txHash: w.txHash,
    soulbound: !!w.certificate?.soulbound,
    credits: w.credits ?? [],
    title: `Obra #${Number(w.tokenId)}`,
    artist: "...",
    audioCid: "",
    isEncrypted: false,
    coverCandidates: [],
    metaLoading: true,
    metaFailed: false,
  };
}

/** Portada de MusicBrainz: Weserv en dev, rewrite de vercel.json en producción. */
function getCoverArtUrl(releaseId: string | null | undefined): string | null {
  if (!releaseId) return null;
  if (import.meta.env.DEV) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(`https://coverartarchive.org/release/${releaseId}/front-500`)}&w=400&h=400&fit=contain&output=jpeg&default=404`;
  }
  return `/api/cover/${releaseId}`;
}

/** Gateways de fallback para audio (Lighthouse da 404 en CIDs antiguos). */
function getAudioFallbackUrls(audioCid: string): string[] {
  if (!audioCid) return [];
  return [
    LighthouseService.audioUrl(audioCid, "audio/mpeg"),
    `https://ipfs.io/ipfs/${audioCid}?filename=audio.mp3`,
    `https://cloudflare-ipfs.com/ipfs/${audioCid}`,
    `https://dweb.link/ipfs/${audioCid}?filename=audio.mp3`,
  ];
}

/** Enlaza metadata ↔ CID de audio (`animation_url` o atributo `AudioCID`). */
function extractLinkedAudioCid(json: any): string {
  const anim = String(json?.animation_url ?? "").trim();
  if (anim) {
    if (anim.toLowerCase().startsWith("ipfs://")) {
      const cid = anim.slice(7).trim().split(/[/?#]/)[0];
      if (cid) return cid;
    }
    const first = anim.split(/[/?#]/)[0];
    if (/^(bafy|bafk|baf|Qm)/i.test(first)) return first;
  }

  const attrs = Array.isArray(json?.attributes) ? json.attributes : [];
  const keys = ["audiocid", "audio cid", "audio_cid"];
  for (const a of attrs) {
    const tt = String(a?.trait_type ?? "").trim().toLowerCase();
    if (!keys.includes(tt)) continue;
    const v = String(a?.value ?? "").trim();
    if (v) return cleanCid(v);
  }
  return "";
}

/* ─────────────────────────── Metadata IPFS ─────────────────────────── */

const metadataCache = new Map<string, any>();
/** CIDs que ya sabemos que no son JSON (audio, blobs cifrados…): no se re-descargan. */
const NON_METADATA = new Set<string>();

/**
 * Descarga y parsea un JSON de metadata. Prueba el gateway del servicio y luego
 * Lighthouse directo (evita el 402 del proxy en Vercel). Nunca descarga cuerpos
 * grandes: si es audio/imagen o pesa > 500 KB se descarta sin leerlo.
 */
async function fetchMetadata(cid: string): Promise<any | null> {
  if (metadataCache.has(cid)) return metadataCache.get(cid);
  if (NON_METADATA.has(cid)) return null;

  const urls = [
    LighthouseService.gatewayUrl(cid),
    `https://gateway.lighthouse.storage/ipfs/${cid}`,
  ];

  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (res.status === 429 || res.status >= 500) {
          await sleep(600 * (attempt + 1));
          continue;
        }
        if (!res.ok) break; // 404/402 → siguiente gateway

        const type = res.headers.get("content-type") ?? "";
        const len = Number(res.headers.get("content-length") ?? 0);
        if (/^(audio|video|image)\//i.test(type) || len > 500_000) {
          NON_METADATA.add(cid);
          return null;
        }

        const text = (await res.text()).trim();
        if (!text.startsWith("{")) {
          NON_METADATA.add(cid);
          return null;
        }
        const json = JSON.parse(text);
        metadataCache.set(cid, json);
        return json;
      } catch (e) {
        if (e instanceof SyntaxError) {
          NON_METADATA.add(cid);
          return null;
        }
        await sleep(350 * (attempt + 1));
      }
    }
  }
  return null;
}

/** Pool de concurrencia para no disparar 429 en el gateway. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await mapper(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Aplica la metadata IPFS resuelta sobre una obra base (on-chain u off-chain). */
function applyMetadata(w: ExplorerWork, meta: any): ExplorerWork {
  const attrs: any[] = Array.isArray(meta?.attributes) ? meta.attributes : [];
  const attr = (...names: string[]) =>
    attrs.find((a) => names.includes(String(a?.trait_type ?? "").trim()))?.value;

  const ciphertextCid = String(meta?.encryptedAudio?.ciphertextCid ?? "").trim();
  const audioCid = ciphertextCid ? cleanCid(ciphertextCid) : extractLinkedAudioCid(meta);

  const prot = attr("Protección", "Encrypted");
  const isEncrypted =
    meta?.encryptedAudio?.encrypted === true || prot === "Cifrado" || prot === true;

  let mbInfo: MBInfo | undefined;
  const mbRaw = attr("MusicBrainz");
  if (mbRaw) {
    try {
      const p = typeof mbRaw === "string" ? JSON.parse(mbRaw) : mbRaw;
      mbInfo = {
        recordingId: p.recordingId,
        releaseId: p.releaseId || null,
        title: p.title,
        artist: p.artist,
        scorePercent: p.scorePercent,
        releaseTitle: p.releaseTitle,
      };
    } catch {
      /* metadata MB malformada: se ignora */
    }
  }

  // Portada: primero la custom del NFT, luego la de MusicBrainz.
  const rawImage = typeof meta?.image === "string" ? meta.image.trim() : "";
  const customCover =
    rawImage &&
    rawImage !== DEFAULT_NFT_METADATA_IMAGE &&
    rawImage.toLowerCase().startsWith("ipfs://")
      ? LighthouseService.gatewayUrl(cleanCid(rawImage))
      : null;
  const coverCandidates = [customCover, getCoverArtUrl(mbInfo?.releaseId)].filter(
    Boolean,
  ) as string[];

  return {
    ...w,
    title: meta?.title || meta?.name || w.title,
    artist: String(meta?.artist || attr("Artista", "Artist") || "Artista desconocido"),
    audioCid,
    isEncrypted,
    mbInfo,
    coverCandidates,
    metaLoading: false,
    metaFailed: false,
  };
}

/* ─────────────────────────── Lighthouse (obras fuera del indexador) ─────────────────────────── */

/** ¿Este archivo de Lighthouse puede ser un JSON de metadata? */
function isMetadataFile(f: any): boolean {
  const name = String(f?.fileName ?? "").toLowerCase();
  const mime = String(f?.mimeType ?? "").toLowerCase();
  if (/^(audio|video|image)\//.test(mime)) return false;
  if (Number(f?.fileSizeInBytes ?? 0) > 500_000) return false;
  return (
    name.endsWith(".json") ||
    mime === "application/json" ||
    name === "blob" ||
    name === "text" ||
    name.startsWith("metadata_")
  );
}

/** Desempate entre versiones de una misma obra: con portada MB > más reciente. */
function better(a: ExplorerWork, b: ExplorerWork): ExplorerWork {
  const rel = (w: ExplorerWork) => (w.mbInfo?.releaseId ? 1 : 0);
  if (rel(a) !== rel(b)) return rel(a) > rel(b) ? a : b;
  if (a.registeredAt !== b.registeredAt) return a.registeredAt > b.registeredAt ? a : b;
  return a.metadataCid > b.metadataCid ? a : b;
}

function dedupeCandidates(items: ExplorerWork[]): ExplorerWork[] {
  const byAudio = new Map<string, ExplorerWork>();
  for (const w of items) {
    const prev = byAudio.get(w.audioCid);
    byAudio.set(w.audioCid, prev ? better(prev, w) : w);
  }
  const byTitle = new Map<string, ExplorerWork>();
  for (const w of Array.from(byAudio.values())) {
    const k = `${w.title.toLowerCase().trim()}__${w.artist.toLowerCase().trim()}`;
    const prev = byTitle.get(k);
    byTitle.set(k, prev ? better(prev, w) : w);
  }
  return Array.from(byTitle.values());
}

/**
 * Metadata-first: recorre los JSON de la cuenta de Lighthouse y devuelve las obras
 * con audio vinculado y presente en la cuenta. Todavía NO filtra las que Envio ya
 * conoce — eso se hace al renderizar, cuando ya se sabe qué hay on-chain.
 */
async function loadOffchainCandidates(): Promise<ExplorerWork[]> {
  const files: any[] = await LighthouseService.getInstance().listAllUploads();
  const knownCids = new Set(files.map((f) => String(f.cid)));
  const metaFiles = files.filter(isMetadataFile);
  const found: ExplorerWork[] = [];

  await mapWithConcurrency(metaFiles, isMobile() ? 3 : 5, async (f) => {
    const cid = String(f.cid);
    const json = await fetchMetadata(cid);
    if (!json || !(json.name || json.title)) return;

    const base: ExplorerWork = {
      key: `ipfs:${cid}`,
      source: "ipfs",
      metadataCid: cid,
      registeredAt: normalizeTs(f.createdAt ?? f.lastUpdate, String(f.fileName ?? "")),
      title: String(f.fileName ?? "Sin título"),
      artist: "—",
      audioCid: "",
      isEncrypted: false,
      coverCandidates: [],
      metaLoading: false,
      metaFailed: false,
    };
    const w = applyMetadata(base, json);
    if (!w.audioCid || EXCLUDED_CIDS.has(w.audioCid) || !knownCids.has(w.audioCid)) return;
    found.push({ ...w, source: w.mbInfo ? "mb" : "ipfs" });
  });

  return dedupeCandidates(found);
}

/* ─────────────────────────── Subcomponentes ─────────────────────────── */

function CardSkeleton() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="mt-auto pt-4">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </Card>
  );
}

/** Portada con cadena de fallbacks: custom → MusicBrainz → ícono de audífonos. */
function Cover({ candidates, isVerified }: { candidates: string[]; isVerified: boolean }) {
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];

  const wrapper = isVerified
    ? "border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-600/5"
    : "border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5";

  return (
    <div className={`mb-4 overflow-hidden rounded-xl border ${wrapper}`}>
      {src ? (
        <div className="flex items-center justify-center bg-black/20 p-2">
          <img
            key={src}
            src={src}
            alt=""
            className="h-48 w-full object-contain"
            loading="lazy"
            onError={() => setIdx((i) => i + 1)}
          />
        </div>
      ) : (
        <div className="flex h-48 w-full items-center justify-center">
          <Headphones
            className={`h-16 w-16 ${isVerified ? "text-blue-400/50" : "text-emerald-400/50"}`}
            strokeWidth={1.25}
          />
        </div>
      )}
    </div>
  );
}

/** AudioLink — abre el audio público; si un gateway da 404, avanza al siguiente. */
function AudioLink({ audioCid, isVerified }: { audioCid: string; isVerified: boolean }) {
  const [urlIndex, setUrlIndex] = useState(0);
  const urls = getAudioFallbackUrls(audioCid);
  const currentUrl = urls[urlIndex] ?? urls[0];

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    try {
      const res = await fetch(currentUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
      if (!res.ok && urlIndex < urls.length - 1) {
        e.preventDefault();
        setUrlIndex(urlIndex + 1);
        setTimeout(() => window.open(urls[urlIndex + 1], "_blank", "noreferrer"), 100);
      }
    } catch {
      if (urlIndex < urls.length - 1) {
        e.preventDefault();
        const nextIdx = urlIndex + 1;
        setUrlIndex(nextIdx);
        window.open(urls[nextIdx], "_blank", "noreferrer");
      }
    }
  };

  return (
    <a
      href={currentUrl}
      target="_blank"
      rel="noreferrer"
      onClick={handleClick}
      className={[
        "group/play flex w-full items-center gap-3 rounded-2xl border p-3 no-underline transition-all",
        isVerified
          ? "border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 hover:bg-blue-500/10"
          : "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 hover:bg-emerald-500/10",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-lg transition-transform group-hover/play:scale-105",
          isVerified ? "bg-blue-500 shadow-blue-500/25" : "bg-emerald-500 shadow-emerald-500/25",
        ].join(" ")}
      >
        <Headphones className="h-4 w-4 text-black" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">Escuchar</p>
        <p className="truncate font-mono text-[10px] text-zinc-500">Abrir en IPFS Gateway</p>
      </div>
      <ExternalLink
        className={`h-3.5 w-3.5 shrink-0 transition-colors ${
          isVerified
            ? "text-blue-500/40 group-hover/play:text-blue-500"
            : "text-emerald-500/40 group-hover/play:text-emerald-500"
        }`}
      />
    </a>
  );
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "onchain", label: "On-chain" },
  { id: "mb", label: "MB Verified" },
  { id: "ipfs", label: "Solo IPFS" },
  { id: "collab", label: "Mis colaboraciones" },
];

/* ─────────────────────────── Explorer ─────────────────────────── */

export const Explorer = () => {
  const { authenticated, login } = usePrivy();
  const { address, signMessage, isReady } = useWallet();

  const [works, setWorks] = useState<ExplorerWork[]>([]); // on-chain (Envio)
  const [candidates, setCandidates] = useState<ExplorerWork[]>([]); // Lighthouse
  const [stats, setStats] = useState<IndexerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lhLoaded, setLhLoaded] = useState(false);
  const [lhError, setLhError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Espejo síncrono del estado on-chain: evita efectos dentro de setState.
  const worksRef = useRef<ExplorerWork[]>([]);
  const inFlight = useRef<Set<string>>(new Set());

  const commit = useCallback((next: ExplorerWork[]) => {
    worksRef.current = next;
    setWorks(next);
  }, []);

  const patch = useCallback(
    (key: string, fn: (w: ExplorerWork) => ExplorerWork) =>
      commit(worksRef.current.map((w) => (w.key === key ? fn(w) : w))),
    [commit],
  );

  /** Resuelve la metadata IPFS de las obras on-chain pendientes. */
  const hydrate = useCallback(
    async (items: ExplorerWork[]) => {
      const todo = items.filter((w) => !inFlight.current.has(w.key));
      todo.forEach((w) => inFlight.current.add(w.key));

      await mapWithConcurrency(todo, isMobile() ? 3 : 5, async (w) => {
        const meta = await fetchMetadata(w.metadataCid);
        patch(w.key, (cur) =>
          meta ? applyMetadata(cur, meta) : { ...cur, metaLoading: false, metaFailed: true },
        );
        inFlight.current.delete(w.key);
      });
    },
    [patch],
  );

  const loadEnvio = useCallback(
    async (manual = false) => {
      try {
        const indexed = await getAllWorks(500);
        const fresh = indexed.map(indexedToWork);
        const prevByKey = new Map(worksRef.current.map((w) => [w.key, w]));

        // Conserva lo ya hidratado; solo las obras nuevas (o las fallidas, en
        // refresh manual) vuelven a pedir metadata.
        const merged = fresh.map((f) => {
          const old = prevByKey.get(f.key);
          if (!old || old.metadataCid !== f.metadataCid) return f;
          const onchain = {
            author: f.author,
            authenticityScore: f.authenticityScore,
            riskLevel: f.riskLevel,
            registeredAt: f.registeredAt,
            txHash: f.txHash,
            soulbound: f.soulbound,
            credits: f.credits,
          };
          if (old.metaFailed && manual) {
            return { ...old, ...onchain, metaLoading: true, metaFailed: false };
          }
          return { ...old, ...onchain };
        });

        commit(merged);
        setError(null);
        setLastUpdated(new Date());
        void hydrate(merged.filter((w) => w.metaLoading));

        getStats()
          .then(setStats)
          .catch((e) => console.warn("[Explorer] Stats no disponibles:", e));
      } catch (e) {
        console.warn("[Explorer] Envio no disponible:", e);
        setError("No se pudo conectar con el indexador Envio. Reintentando automáticamente…");
      } finally {
        setLoading(false);
      }
    },
    [commit, hydrate],
  );

  const loadLighthouse = useCallback(async () => {
    try {
      setCandidates(await loadOffchainCandidates());
      setLhError(null);
    } catch (e) {
      console.warn("[Explorer] Lighthouse no disponible:", e);
      setLhError(
        "No se pudo leer Lighthouse: solo se muestran las obras on-chain (sin MB Verified ni Solo IPFS).",
      );
    } finally {
      setLhLoaded(true);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadEnvio(true), loadLighthouse()]);
    setRefreshing(false);
  }, [loadEnvio, loadLighthouse]);

  // Envio: al montar + polling. Lighthouse: solo al montar y en refresh manual
  // (listar y descargar metadata es más pesado que una query GraphQL).
  useEffect(() => {
    void loadEnvio();
    void loadLighthouse();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadEnvio();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadEnvio, loadLighthouse]);

  /* ── Reconciliación ── */

  // Obras de Lighthouse que Envio ya conoce se descartan (mismo CID de metadata o de audio).
  const offchain = useMemo(() => {
    const metaCids = new Set(works.map((w) => w.metadataCid));
    const audioCids = new Set(works.filter((w) => w.audioCid).map((w) => w.audioCid));
    return candidates.filter((c) => !metaCids.has(c.metadataCid) && !audioCids.has(c.audioCid));
  }, [works, candidates]);

  // On-chain sin audio vinculado (metadata antigua/inaccesible): no reproducibles → ocultas.
  const playableOnchain = useMemo(
    () => works.filter((w) => w.metaLoading || !!w.audioCid),
    [works],
  );
  const hiddenCount = works.length - playableOnchain.length;

  const combined = useMemo(
    () => [...playableOnchain, ...offchain].sort((a, b) => b.registeredAt - a.registeredAt),
    [playableOnchain, offchain],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: combined.length, onchain: 0, mb: 0, ipfs: 0, collab: 0 };
    for (const w of combined) {
      c[w.source]++;
      if (isCollaboratorOn(w, address)) c.collab++;
    }
    return c;
  }, [combined, address]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combined.filter((w) => {
      if (filter === "collab") {
        if (!isCollaboratorOn(w, address)) return false;
      } else if (filter !== "all" && w.source !== filter) return false;
      if (!q) return true;
      return (
        w.title.toLowerCase().includes(q) ||
        w.artist.toLowerCase().includes(q) ||
        (w.author ?? "").toLowerCase().includes(q) ||
        (w.credits ?? []).some((c) => c.collaborator.id.toLowerCase().includes(q))
      );
    });
  }, [combined, filter, query, address]);

  /* ── Diagnóstico (solo dev): ¿por qué una obra está en un lado y no en el otro? ── */
  const diagSig = useRef("");
  useEffect(() => {
    if (!import.meta.env.DEV || loading || !lhLoaded || lhError) return;
    if (works.some((w) => w.metaLoading)) return;

    const hidden = works.filter((w) => !w.audioCid);
    const ipfsOnly = offchain.filter((w) => w.source === "ipfs");
    const sig = `${works.length}|${hidden.length}|${offchain.length}|${ipfsOnly.length}`;
    if (sig === diagSig.current) return;
    diagSig.current = sig;

    const norm = (w: ExplorerWork) => `${w.title}__${w.artist}`.toLowerCase();
    const offByTitle = new Map(offchain.map((w) => [norm(w), w]));

    console.groupCollapsed(
      `[Explorer] Reconciliación Envio ↔ Lighthouse — on-chain: ${works.length}, ` +
        `MB Verified: ${offchain.length - ipfsOnly.length}, solo IPFS: ${ipfsOnly.length}, ` +
        `on-chain ocultas: ${hidden.length}`,
    );
    console.log("On-chain OCULTAS (Envio las tiene, pero su metadata no permite reproducirlas):");
    console.table(
      hidden.map((w) => ({
        tokenId: w.tokenId,
        author: w.author,
        metadataCid: w.metadataCid,
        motivo: w.metaFailed ? "metadata inaccesible" : "metadata sin AudioCID / animation_url",
        "¿misma obra re-subida a IPFS?": offByTitle.get(norm(w))?.metadataCid ?? "—",
      })),
    );
    console.log("SOLO IPFS (en Lighthouse, ninguna obra de Envio apunta a ellas):");
    console.table(
      ipfsOnly.map((w) => ({
        title: w.title,
        artist: w.artist,
        metadataCid: w.metadataCid,
        audioCid: w.audioCid,
        cifrada: w.isEncrypted,
      })),
    );
    console.groupEnd();
  }, [works, offchain, loading, lhLoaded, lhError]);

  const showSkeletons = loading || (combined.length === 0 && !lhLoaded);

  return (
    <div className="space-y-8 pb-12 pt-2">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">
            Explorar Obras
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
            {CHAIN.name} Ledger · ⚡ Indexed by Envio
          </p>
        </div>

        <div className="flex items-center gap-3 self-start rounded-2xl border border-zinc-800 bg-zinc-900/80 py-1.5 pl-4 pr-1.5 sm:self-auto">
          <span className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            En vivo{lastUpdated && ` · ${lastUpdated.toLocaleTimeString("es")}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refreshAll()}
            disabled={refreshing}
            className="h-8 w-8 rounded-xl hover:bg-zinc-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-emerald-500 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats del indexador (solo obras on-chain) */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-2 text-zinc-600">
              <Shield className="h-3 w-3" />
              <p className="font-mono text-[9px] uppercase tracking-widest">On-chain</p>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-white">{stats.totalWorks}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-2 text-zinc-600">
              <Users className="h-3 w-3" />
              <p className="font-mono text-[9px] uppercase tracking-widest">Autores</p>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-white">{stats.uniqueAuthors}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-emerald-400/70">
              <BarChart3 className="h-3 w-3" />
              <p className="font-mono text-[9px] uppercase tracking-widest">Score Promedio</p>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-emerald-400">
              {stats.avgAuthenticityScore}%
            </p>
          </div>
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
            <div className="flex items-center gap-2 text-violet-400/70">
              <Shield className="h-3 w-3" />
              <p className="font-mono text-[9px] uppercase tracking-widest">% Soulbound</p>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-violet-400">
              {stats.soulboundPercentage}%
            </p>
          </div>
        </div>
      )}

      {/* Búsqueda + filtros (sobre datos ya cargados) */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, artista o wallet"
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/50 py-3 pl-10 pr-10 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0 || filter === f.id).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 font-mono text-[10px] transition-colors ${
                filter === f.id
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                  : "border-zinc-800 text-zinc-500 hover:text-white"
              }`}
            >
              {f.label} <span className="text-zinc-600">{counts[f.id]}</span>
            </button>
          ))}
          {!lhLoaded && (
            <span className="ml-1 flex items-center gap-1.5 font-mono text-[10px] text-zinc-600">
              <Loader2 className="h-3 w-3 animate-spin" /> Buscando obras en IPFS…
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 font-mono text-xs text-amber-400">
          {error}
        </p>
      )}
      {lhError && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 font-mono text-xs text-amber-400">
          {lhError}
        </p>
      )}

      {/* Grilla */}
      {showSkeletons ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4 py-24"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
            <Music className="h-7 w-7 text-zinc-600" />
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-zinc-600">
            {query || filter !== "all"
              ? "Ninguna obra coincide con el filtro"
              : "Todavía no hay obras registradas"}
          </p>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((work, index) => {
              const isOnchain = work.source === "onchain";
              const isVerified = !!work.mbInfo;
              const isOwner =
                isOnchain &&
                !!address &&
                !!work.author &&
                work.author.toLowerCase() === address.toLowerCase();
              const hover = isVerified
                ? "hover:border-blue-500/30 hover:shadow-blue-500/10"
                : "hover:border-emerald-500/20 hover:shadow-emerald-500/5";

              return (
                <motion.div
                  key={work.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(index, 12) * 0.04 }}
                >
                  <Card className={`group flex h-full flex-col transition-all hover:shadow-lg ${hover}`}>
                    {/* Badges */}
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isOnchain && (
                          <Badge variant="secondary" className="font-mono text-[9px]">
                            ID #{work.tokenId}
                          </Badge>
                        )}
                        {!work.metaLoading && (
                          <Badge variant={work.isEncrypted ? "default" : "secondary"}>
                            {work.isEncrypted ? (
                              <><Lock className="mr-1 h-2.5 w-2.5" />Privado</>
                            ) : (
                              <><Globe className="mr-1 h-2.5 w-2.5" />Público</>
                            )}
                          </Badge>
                        )}
                      </div>

                      {!work.metaLoading &&
                        (isVerified ? (
                          <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-400">
                            <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                            MB Verified
                          </Badge>
                        ) : isOnchain ? (
                          work.soulbound ? (
                            <Badge className="border-violet-500/30 bg-violet-500/20 text-violet-400">
                              Soulbound
                            </Badge>
                          ) : (
                            <Badge className="border-emerald-500/30 bg-emerald-500/20 text-emerald-400">
                              <Sparkles className="mr-1 h-2.5 w-2.5" />
                              Original
                            </Badge>
                          )
                        ) : (
                          <Badge
                            className="border-amber-500/30 bg-amber-500/20 text-amber-400"
                            title="Ninguna obra indexada por Envio apunta a esta metadata"
                          >
                            Solo IPFS
                          </Badge>
                        ))}
                    </div>

                    {/* Portada */}
                    {work.metaLoading ? (
                      <Skeleton className="mb-4 h-48 w-full rounded-xl" />
                    ) : (
                      <Cover candidates={work.coverCandidates} isVerified={isVerified} />
                    )}

                    {/* Título / artista */}
                    {work.metaLoading ? (
                      <div className="mb-3 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    ) : (
                      <>
                        <h3 className="truncate font-display text-base font-bold uppercase tracking-tight text-white">
                          {work.title}
                        </h3>
                        <p
                          className={`mb-1 mt-1 truncate font-mono text-[11px] ${
                            isVerified ? "text-blue-400/70" : "text-emerald-500/70"
                          }`}
                        >
                          {work.artist}
                        </p>
                      </>
                    )}

                    {isOnchain && work.author && (
                      <button
                        onClick={() => goToArtistProfile(work.author!)}
                        title={`Ver perfil de ${work.author}`}
                        className="mb-4 flex items-center gap-1 self-start font-mono text-[9px] text-zinc-600 transition-colors hover:text-emerald-400"
                      >
                        <User className="h-2.5 w-2.5" />
                        {shortAddress(work.author)}
                        {isOwner && (
                          <Badge variant="success" className="ml-1 h-4 px-1 text-[8px]">
                            TÚ
                          </Badge>
                        )}
                      </button>
                    )}

                    {/* Co-autores acreditados on-chain */}
                    {isOnchain && <CollaboratorsList credits={work.credits} myAddress={address} />}

                    {/* Certificado on-chain (datos del indexador) */}
                    {isOnchain ? (
                      <div className="mb-4 mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Score</p>
                          <p className="mt-1 font-display text-sm font-bold text-white">
                            {work.authenticityScore}%
                          </p>
                        </div>
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Riesgo</p>
                          <Badge variant={getRiskVariant(work.riskLevel ?? -1)} className="mt-1 text-[8px]">
                            {RISK_LABEL[work.riskLevel ?? -1] ?? "—"}
                          </Badge>
                        </div>
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Registro</p>
                          <p className="mt-1 font-mono text-[10px] font-bold text-white">
                            {formatDate(work.registeredAt)}
                          </p>
                        </div>
                      </div>
                    ) : isVerified && work.mbInfo ? (
                      <div className="mb-4 mt-3 space-y-1 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                        <p className="font-mono text-[9px] uppercase tracking-wider text-blue-400/60">
                          ✓ Verificado en MusicBrainz · {work.mbInfo.scorePercent}%
                        </p>
                        <p className="font-mono text-[9px] text-blue-400/50">
                          Grabación ya existente: el protocolo no la registra on-chain.
                        </p>
                        <a
                          href={`https://musicbrainz.org/recording/${work.mbInfo.recordingId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[9px] text-blue-400/60 transition-colors hover:text-blue-400"
                        >
                          Ver en MusicBrainz <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    ) : (
                      <div className="mb-4 mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                        <p className="font-mono text-[9px] uppercase tracking-wider text-amber-400/70">
                          Sin certificado on-chain
                        </p>
                        <p className="mt-1 font-mono text-[9px] text-amber-400/50">
                          Subida el {formatDate(work.registeredAt)}. Envio no tiene ninguna obra que apunte a esta metadata.
                        </p>
                      </div>
                    )}

                    {/* Reproductor */}
                    <div className="mt-auto space-y-4">
                      {isOnchain && <LicenseControl fingerprintHash={work.fingerprintHash} author={work.author} />}
                      {work.metaLoading ? (
                        <Skeleton className="h-14 w-full rounded-2xl" />
                      ) : work.isEncrypted ? (
                        !authenticated ? (
                          <Button onClick={() => login()} className="w-full" size="lg">
                            <Lock className="h-3.5 w-3.5" />
                            Conectar para Escuchar
                          </Button>
                        ) : isOnchain && !isOwner ? (
                          <div className="rounded-2xl border border-zinc-700 bg-zinc-800/30 p-3 text-center">
                            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                              Cifrado — solo el propietario puede reproducirlo
                            </p>
                          </div>
                        ) : isReady && signMessage && address ? (
                          // Obras solo-IPFS no tienen autor conocido: se intenta con la wallet
                          // conectada (si no es la dueña, el descifrado falla dentro del player).
                          <EncryptedAudioPlayer
                            cid={work.audioCid}
                            ownerAddress={address}
                            signMessage={signMessage}
                          />
                        ) : (
                          <Button onClick={() => login()} className="w-full" variant="secondary" size="lg">
                            <Shield className="h-3.5 w-3.5" />
                            Desbloquear
                          </Button>
                        )
                      ) : (
                        <AudioLink audioCid={work.audioCid} isVerified={isVerified} />
                      )}

                      {isOnchain && work.txHash && (
                        <a
                          href={txUrl(work.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.3em] text-zinc-700 no-underline transition-colors hover:text-emerald-500"
                        >
                          Blockchain Proof <ExternalLink className="h-2 w-2" />
                        </a>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {hiddenCount > 0 && !query && filter === "all" && (
            <p className="text-center font-mono text-[10px] text-zinc-600">
              {hiddenCount} obra{hiddenCount !== 1 ? "s" : ""} on-chain oculta{hiddenCount !== 1 ? "s" : ""} (su
              metadata no vincula audio)
            </p>
          )}
        </>
      )}
    </div>
  );
};