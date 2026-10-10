/**
 * MuSecure – api/alchemy-webhook.js
 * Vercel serverless function: recibe el Custom Webhook de Alchemy (GraphQL, Monad Testnet)
 * con los logs de MuSecureLicensing y avisa de cada venta y reparto de regalías.
 *
 * Flujo:
 *   Alchemy detecta logs de MuSecureLicensing → POST firmado a /api/alchemy-webhook
 *   → se verifica la firma (HMAC-SHA256 del cuerpo crudo) → se decodifican los eventos
 *   → se envía el aviso (Discord, opcional) y se deja traza en los logs de Vercel.
 *
 * Variables de entorno en Vercel:
 *   ALCHEMY_SIGNING_KEY      — "Signing Key" del webhook (Dashboard → Webhooks → tu webhook)  [obligatoria]
 *   LICENSING_ADDRESS        — o VITE_LICENSING_ADDRESS; contrato de licencias
 *   REGISTRY_ADDRESS         — o VITE_REGISTRY_ADDRESS; contrato Registry (avisa de obras registradas / certificado NFT)
 *   DISCORD_WEBHOOK_URL      — opcional; sin ella solo se registra en logs
 *   EXPLORER_URL             — opcional (default https://testnet.monadscan.com)
 */
import crypto from "node:crypto";
import { ethers } from "ethers";

// Necesitamos el cuerpo CRUDO para verificar la firma: se desactiva el parseo automático.
export const config = { api: { bodyParser: false } };

const ABI = [
  "event LicensePriceSet(bytes32 indexed fingerprintHash, address indexed author, uint256 price)",
  "event LicensePurchased(bytes32 indexed fingerprintHash, address indexed buyer, address indexed author, uint256 price)",
  "event RoyaltyPaid(bytes32 indexed fingerprintHash, address indexed recipient, uint256 amount, bool isAuthor, bool direct)",
  "event RoyaltyClaimed(address indexed account, uint256 amount)",
  "event WorkRegistered(address indexed author, bytes32 indexed fingerprintHash, string ipfsCid, uint256 authenticityScore, uint8 riskLevel, uint256 tokenId, uint256 timestamp)",
];
const RISK = ["bajo riesgo", "riesgo medio", "alto riesgo"];
const iface = new ethers.Interface(ABI);

const EXPLORER = process.env.EXPLORER_URL ?? "https://testnet.monadscan.com";
const short = (s) => `${s.slice(0, 6)}…${s.slice(-4)}`;
const mon = (wei) => `${ethers.formatEther(wei)} MON`;

// Alchemy reintenta si no recibe 2xx: evita avisar dos veces el mismo log (por instancia).
const seen = new Set();

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export function validSignature(raw, signature, key) {
  if (!signature || !key) return false;
  const expected = crypto.createHmac("sha256", key).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Extrae los logs del payload GRAPHQL de Alchemy (event.data.block.logs[]). */
export function extractLogs(payload) {
  const block = payload?.event?.data?.block;
  const logs = block?.logs ?? [];
  return logs.map((l) => ({
    address: l.account?.address ?? l.address,
    topics: l.topics ?? [],
    data: l.data ?? "0x",
    index: l.index,
    txHash: l.transaction?.hash ?? "",
  }));
}

export function describe(log) {
  let parsed;
  try {
    parsed = iface.parseLog({ topics: log.topics, data: log.data });
  } catch {
    return null; // no es un evento nuestro
  }
  if (!parsed) return null;
  const a = parsed.args;
  const work = short(a.fingerprintHash ?? "0x0000000000");
  switch (parsed.name) {
    case "WorkRegistered":
      return `🎵 **Obra registrada** · certificado NFT #${a.tokenId} · obra \`${work}\` · autor \`${short(a.author)}\` · score ${a.authenticityScore}% (${RISK[Number(a.riskLevel)] ?? "—"})`;
    case "LicensePurchased":
      return `🎫 **Licencia vendida** · obra \`${work}\` · ${mon(a.price)} · comprador \`${short(a.buyer)}\``;
    case "RoyaltyPaid":
      return `💸 **Regalía** · \`${short(a.recipient)}\` ${a.isAuthor ? "(autor)" : "(co-autor)"} recibe ${mon(a.amount)}${
        a.direct ? "" : " — pendiente de retiro"
      } · obra \`${work}\``;
    case "RoyaltyClaimed":
      return `🏦 **Retiro** · \`${short(a.account)}\` retiró ${mon(a.amount)}`;
    case "LicensePriceSet":
      return `🏷️ **Precio fijado** · obra \`${work}\` · ${a.price === 0n ? "fuera de venta" : mon(a.price)}`;
    default:
      return null;
  }
}

async function notify(lines, txHash) {
  const text = [...lines, txHash ? `[Ver transacción](${EXPLORER}/tx/${txHash})` : ""].filter(Boolean).join("\n");
  console.log("[alchemy-webhook]\n" + text);
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text.slice(0, 1900) }),
  });
  if (!r.ok) console.warn("[alchemy-webhook] Discord respondió", r.status);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST" });

  const key = process.env.ALCHEMY_SIGNING_KEY;
  if (!key) return res.status(500).json({ error: "Falta ALCHEMY_SIGNING_KEY" });

  const raw = await readRaw(req);
  if (!validSignature(raw, req.headers["x-alchemy-signature"], key)) {
    return res.status(401).json({ error: "Firma inválida" });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "JSON inválido" });
  }

  const watched = new Set(
    [
      process.env.LICENSING_ADDRESS ?? process.env.VITE_LICENSING_ADDRESS,
      process.env.REGISTRY_ADDRESS ?? process.env.VITE_REGISTRY_ADDRESS,
    ]
      .filter(Boolean)
      .map((a) => a.toLowerCase()),
  );
  if (watched.size === 0) return res.status(500).json({ error: "Falta LICENSING_ADDRESS / REGISTRY_ADDRESS" });

  // Agrupa por transacción: una compra emite 1 LicensePurchased + varios RoyaltyPaid.
  const byTx = new Map();
  for (const log of extractLogs(payload)) {
    if (!watched.has(String(log.address).toLowerCase())) continue;
    const id = `${log.txHash}-${log.index}`;
    if (seen.has(id)) continue;
    const line = describe(log);
    if (!line) continue;
    seen.add(id);
    if (!byTx.has(log.txHash)) byTx.set(log.txHash, []);
    byTx.get(log.txHash).push(line);
  }
  if (seen.size > 5000) seen.clear();

  // Un fallo al avisar (p. ej. Discord caído) NO debe devolver error: Alchemy pausa el webhook
  // si recibe respuestas no-2xx durante 24 h. El evento ya se verificó y quedó en los logs.
  for (const [tx, lines] of byTx) {
    try {
      await notify(lines, tx);
    } catch (e) {
      console.error("[alchemy-webhook] notify falló (se responde 200 igualmente):", e);
    }
  }

  return res.status(200).json({ ok: true, transactions: byTx.size });
}