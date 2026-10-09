/**
 * MuSecure – components/LicenseCertificate.tsx
 * Certificado de licencia (modal) con verificación on-chain, descarga (.html) e impresión/PDF.
 * El certificado es una vista de datos reales de la blockchain: no es un documento legal.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, ShieldCheck, Download, Printer, Loader2, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";
import { CHAIN, addressUrl, txUrl } from "@/lib/chain";
import { LICENSING_ADDRESS, fetchLicenseRecord, formatMon, readHasLicense, type LicenseRecord } from "@/lib/licensing";

interface Props {
  fingerprintHash: string;
  title: string;
  licensee: string;
  /** Hash de la tx de compra si se acaba de comprar (Envio puede tardar en indexarla). */
  knownTx?: string;
  knownPrice?: bigint;
  onClose: () => void;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function certificateHtml(p: {
  title: string; hash: string; licensee: string; price: string; date: string; tx: string; txLink: string;
}): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Licencia – ${esc(p.title)}</title>
<style>
body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 24px;color:#111}
h1{font-size:28px;margin:0 0 4px}.tag{font:12px monospace;letter-spacing:.2em;text-transform:uppercase;color:#047857}
dl{margin:28px 0}dt{font:11px monospace;text-transform:uppercase;letter-spacing:.15em;color:#666;margin-top:16px}
dd{margin:4px 0 0;font:14px monospace;word-break:break-all}.box{border:2px solid #047857;padding:28px;border-radius:12px}
.note{font-size:12px;color:#555;margin-top:24px;line-height:1.5}a{color:#047857}
</style></head><body><div class="box">
<div class="tag">MuSecure · Certificado de licencia · ${esc(CHAIN.name)}</div>
<h1>${esc(p.title)}</h1>
<p>Se certifica que la siguiente wallet adquirió una licencia de uso de esta obra, con el pago repartido on-chain entre su autor y co-autores.</p>
<dl>
<dt>Licenciatario</dt><dd>${esc(p.licensee)}</dd>
<dt>Huella de la obra (fingerprintHash)</dt><dd>${esc(p.hash)}</dd>
<dt>Precio pagado</dt><dd>${esc(p.price)}</dd>
<dt>Fecha</dt><dd>${esc(p.date)}</dd>
<dt>Transacción de compra</dt><dd>${p.txLink ? `<a href="${esc(p.txLink)}">${esc(p.tx)}</a>` : esc(p.tx)}</dd>
<dt>Contrato</dt><dd>MuSecureLicensing ${esc(LICENSING_ADDRESS)}</dd>
</dl>
<p class="note">Verificación: llamar <code>hasLicense(${esc(p.hash)}, ${esc(p.licensee)})</code> en el contrato debe devolver <code>true</code>.
Este certificado refleja datos de la blockchain; es una demostración y no constituye asesoría ni documento legal.</p>
</div></body></html>`;
}

export function LicenseCertificate({ fingerprintHash, title, licensee, knownTx, knownPrice, onClose }: Props) {
  const [record, setRecord] = useState<LicenseRecord | null>(null);
  const [verified, setVerified] = useState<"checking" | "yes" | "no">("checking");

  useEffect(() => {
    let alive = true;
    void fetchLicenseRecord(fingerprintHash, licensee).then((r) => alive && setRecord(r));
    readHasLicense(fingerprintHash, licensee)
      .then((ok) => alive && setVerified(ok ? "yes" : "no"))
      .catch(() => alive && setVerified("no"));
    return () => {
      alive = false;
    };
  }, [fingerprintHash, licensee]);

  const tx = record?.txHash || knownTx || "";
  const price = record?.price ?? knownPrice;
  const data = {
    title,
    hash: fingerprintHash,
    licensee,
    price: price !== undefined ? `${formatMon(price, 6)} ${CHAIN.symbol}` : "—",
    date: record?.purchasedAt ? new Date(record.purchasedAt * 1000).toLocaleString() : "—",
    tx: tx || "—",
    txLink: tx ? txUrl(tx) : "",
  };

  const download = () => {
    const blob = new Blob([certificateHtml(data)], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `licencia-${fingerprintHash.slice(2, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(certificateHtml(data));
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-3xl border border-emerald-500/30 bg-zinc-950 p-6 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Certificado de licencia
            </p>
            <h3 className="mt-1 font-display text-lg font-bold text-white">{title}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="space-y-3 font-mono text-[11px]">
          <Row k="Licenciatario" v={licensee} />
          <Row k="Obra (fingerprintHash)" v={fingerprintHash} />
          <Row k="Precio pagado" v={data.price} />
          <Row k="Fecha" v={data.date} />
          <div>
            <dt className="text-[9px] uppercase tracking-widest text-zinc-600">Transacción</dt>
            <dd className="mt-0.5 break-all text-zinc-300">
              {tx ? (
                <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 no-underline hover:underline">
                  {tx.slice(0, 18)}…{tx.slice(-8)} <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[9px] uppercase tracking-widest text-zinc-600">Contrato</dt>
            <dd className="mt-0.5 break-all">
              <a href={addressUrl(LICENSING_ADDRESS)} target="_blank" rel="noreferrer" className="text-zinc-300 no-underline hover:text-emerald-400">
                MuSecureLicensing {LICENSING_ADDRESS}
              </a>
            </dd>
          </div>
        </dl>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/30 p-3 font-mono text-[10px]">
          {verified === "checking" ? (
            <span className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Verificando on-chain…
            </span>
          ) : verified === "yes" ? (
            <span className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Verificado en {CHAIN.name}: hasLicense = true
            </span>
          ) : (
            <span className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> No se pudo verificar la licencia on-chain.
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={download} className="gap-2">
            <Download className="h-3.5 w-3.5" /> Descargar certificado
          </Button>
          <Button size="sm" variant="secondary" onClick={print} className="gap-2">
            <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-widest text-zinc-600">{k}</dt>
      <dd className="mt-0.5 break-all text-zinc-300">{v}</dd>
    </div>
  );
}