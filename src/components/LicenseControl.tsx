/**
 * MuSecure – components/LicenseControl.tsx
 *
 * Licencias de una obra, dentro de cualquier tarjeta (catálogo, perfil, dashboard):
 *   · Autor      → fija / cambia / retira el precio en MON.
 *   · Comprador  → botón "Comprar licencia" (pago exacto; se reparte entre autor y co-autores).
 *
 * Lecturas: Envio en bloque (una consulta para todo el catálogo) con respaldo on-chain
 * por obra si el indexador no responde. Antes de comprar se relee el precio on-chain.
 */
import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";
import { useLicensingTx } from "@/hooks/useLicensingTx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, Loader2, Tag, ExternalLink, FileText, Download } from "lucide-react";
import { LicenseCertificate } from "@/components/LicenseCertificate";
import { CHAIN, txUrl } from "@/lib/chain";
import {
  LICENSING_ADDRESS,
  formatMon,
  getListings,
  getMyLicenses,
  invalidateLicenseCache,
  isFingerprint,
  parseMon,
  readHasLicense,
  readPrice,
  normHash,
} from "@/lib/licensing";

interface Props {
  /** Huella de la obra (Work.id en Envio). Si no es una huella válida no se muestra nada. */
  fingerprintHash?: string | null;
  /** Wallet del autor registrado en el Registry. */
  author?: string | null;
  /** Para el certificado y la descarga del licenciado. */
  title?: string;
  /** URL del audio público (omitir u ocultar si la obra es cifrada). */
  audioUrl?: string | null;
  isEncrypted?: boolean;
}

const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg",
  "audio/flac": "flac", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/webm": "webm",
};

async function downloadAudio(url: string, title: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    const ext = AUDIO_EXT[blob.type.split(";")[0]] ?? "mp3";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "obra"}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, "_blank", "noopener"); // el gateway no permite fetch: se abre para guardar
  }
}

export function LicenseControl({ fingerprintHash, author, title, audioUrl, isEncrypted }: Props) {
  const { authenticated, login } = usePrivy();
  const { address } = useWallet();
  const { send, state, reset } = useLicensingTx();

  const [price, setPrice] = useState<bigint | null>(null); // null = cargando
  const [owned, setOwned] = useState(false);
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showCert, setShowCert] = useState(false);
  const [boughtTx, setBoughtTx] = useState<string | undefined>();
  const [downloading, setDownloading] = useState(false);

  const valid = isFingerprint(fingerprintHash) && !!LICENSING_ADDRESS;
  const hash = valid ? normHash(fingerprintHash!).toLowerCase() : "";
  const isAuthor = !!address && !!author && address.toLowerCase() === author.toLowerCase();
  const busy = state.step === "waiting-wallet" || state.step === "confirming";

  const load = useCallback(async () => {
    if (!valid) return;
    try {
      const listings = await getListings();
      setPrice(listings.get(hash) ?? 0n);
      if (address) setOwned((await getMyLicenses(address)).has(hash));
      else setOwned(false);
    } catch {
      // Envio caído → respaldo on-chain solo para esta obra
      try {
        setPrice(await readPrice(hash));
        setOwned(address ? await readHasLicense(hash, address) : false);
      } catch {
        setPrice(0n);
      }
    }
  }, [valid, hash, address]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!valid) return null;

  const fail = (e: unknown) => setLocalError(e instanceof Error ? e.message : "Error desconocido");

  const savePrice = async (clear = false) => {
    setLocalError(null);
    try {
      const value = clear ? 0n : parseMon(input);
      await send({ fn: "setLicensePrice", args: [hash, value] });
      invalidateLicenseCache();
      setPrice(value); // on-chain ya confirmado; Envio llega unos segundos después
      setInput("");
    } catch (e) {
      fail(e);
    }
  };

  const buy = async () => {
    setLocalError(null);
    if (!authenticated) return login();
    try {
      // Precio real on-chain (Envio puede ir unos segundos atrás).
      const onchain = await readPrice(hash);
      if (onchain === 0n) {
        setPrice(0n);
        throw new Error("Esta obra ya no está a la venta.");
      }
      if (onchain !== price) {
        setPrice(onchain);
        throw new Error(`El precio cambió a ${formatMon(onchain)} ${CHAIN.symbol}. Revisa y vuelve a pulsar comprar.`);
      }
      const tx = await send({ fn: "buyLicense", args: [hash], value: onchain });
      setBoughtTx(tx);
      invalidateLicenseCache();
      setOwned(true);
    } catch (e) {
      fail(e);
    }
  };

  const error = localError ?? (state.step === "error" ? state.error : null);
  const dismiss = () => {
    setLocalError(null);
    reset();
  };

  return (
    <>
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-left">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-amber-400/80">
          <Tag className="h-3 w-3" /> Licencia
        </p>
        {price === null ? (
          <Loader2 className="h-3 w-3 animate-spin text-zinc-600" />
        ) : price > 0n ? (
          <span className="font-display text-sm font-bold text-white">
            {formatMon(price)} {CHAIN.symbol}
          </span>
        ) : (
          <span className="font-mono text-[9px] text-zinc-600">No está a la venta</span>
        )}
      </div>

      {isAuthor ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="decimal"
              placeholder={`Precio en ${CHAIN.symbol} (ej. 0.5)`}
              disabled={busy}
              className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none"
            />
            <Button size="sm" onClick={() => void savePrice()} disabled={busy || !input.trim()} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {price && price > 0n ? "Cambiar" : "Poner a la venta"}
            </Button>
          </div>
          {price !== null && price > 0n && (
            <button
              onClick={() => void savePrice(true)}
              disabled={busy}
              className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-red-400 disabled:opacity-50"
            >
              Retirar de la venta
            </button>
          )}
        </div>
      ) : owned ? (
        <div className="space-y-2">
          <Badge variant="success" className="gap-1 text-[10px]">
            <BadgeCheck className="h-3 w-3" /> Licencia adquirida
          </Badge>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowCert(true)} className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Ver certificado
            </Button>
            {audioUrl && !isEncrypted && (
              <Button
                size="sm"
                disabled={downloading}
                onClick={async () => {
                  setDownloading(true);
                  await downloadAudio(audioUrl, title ?? "obra");
                  setDownloading(false);
                }}
                className="gap-1.5"
              >
                {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Descargar audio
              </Button>
            )}
          </div>
          {isEncrypted && (
            <p className="font-mono text-[9px] text-zinc-600">Obra cifrada: la descarga no está disponible en esta demo.</p>
          )}
        </div>
      ) : price !== null && price > 0n ? (
        <>
          <Button onClick={() => void buy()} disabled={busy} size="sm" className="w-full gap-2">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {busy ? state.message : authenticated ? `Comprar licencia · ${formatMon(price)} ${CHAIN.symbol}` : "Conectar para comprar"}
          </Button>
          <p className="mt-2 font-mono text-[9px] leading-relaxed text-zinc-600">
            El pago se reparte al instante entre el autor y sus co-autores.
          </p>
        </>
      ) : null}

      {state.step === "done" && state.txHash && (
        <a
          href={txUrl(state.txHash)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[9px] text-emerald-400 no-underline hover:underline"
        >
          Confirmado · ver transacción <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
      {error && (
        <p className="mt-2 text-[10px] leading-snug text-red-400">
          {error}{" "}
          <button className="underline" onClick={dismiss}>
            cerrar
          </button>
        </p>
      )}
    </div>
    {showCert && address && (
      <LicenseCertificate
        fingerprintHash={hash}
        title={title ?? "Obra"}
        licensee={address}
        knownTx={boughtTx}
        knownPrice={price ?? undefined}
        onClose={() => setShowCert(false)}
      />
    )}
    </>
  );
}