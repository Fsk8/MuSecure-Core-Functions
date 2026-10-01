/**
 * MuSecure – api/resolve-collaborators.js
 *
 * Vercel Serverless Function (Node runtime, ESM → requiere "type": "module"
 * en el package.json de la raíz, que es el valor por defecto de Vite).
 *
 * Recibe los correos de los colaboradores y devuelve la dirección de su Embedded
 * Wallet de Privy (pregenerada si hace falta) SIN que hayan iniciado sesión.
 * Esa dirección es la que se escribe on-chain en MuSecureCredits.
 *
 * Requisitos (una sola vez):
 *  - Env vars en Vercel, SIN prefijo VITE_ (si no, acabarían en el bundle público):
 *      PRIVY_APP_ID, PRIVY_APP_SECRET
 *  - Privy Dashboard → activar "Return user data in an identity token".
 *    El frontend manda ese identity token en `idToken`.
 *
 * Verificado contra la documentación de @privy-io/node (no contra tu cuenta):
 *  users().get({ id_token }), users().getByEmailAddress({ address }),
 *  users().create({ linked_accounts, wallets }) y
 *  users().pregenerateWallets(userId, { wallets }).
 */

import { PrivyClient } from "@privy-io/node";

const MAX_COLLABORATORS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ETH_WALLET = [{ chain_type: "ethereum" }];

let client = null;
function getClient() {
  if (client) return client;
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const missing = [];
  if (!appId) missing.push("PRIVY_APP_ID");
  if (!appSecret) missing.push("PRIVY_APP_SECRET");
  if (missing.length > 0) {
    const e = new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
    e.missing = missing; // solo nombres, nunca valores
    throw e;
  }
  client = new PrivyClient({ appId, appSecret });
  return client;
}

/**
 * Dirección de la Embedded Wallet de Privy en Ethereum.
 * Se filtra por wallet_client === "privy": si el usuario tiene vinculada una wallet
 * externa (MetaMask…), NO debe usarse, porque su sesión en la app usa la embebida
 * y los créditos no le aparecerían.
 */
function extractEmbeddedEthAddress(user) {
  const accounts = user?.linked_accounts ?? user?.linkedAccounts ?? [];
  const wallet = accounts.find(
    (a) =>
      a?.type === "wallet" &&
      (a?.chain_type ?? a?.chainType) === "ethereum" &&
      (a?.wallet_client ?? a?.walletClient) === "privy",
  );
  if (!wallet && accounts.length > 0) {
    // Ayuda a depurar si el shape real difiere. No incluye correos ni direcciones.
    console.warn(
      "[resolve-collaborators] Sin wallet embebida ETH. linked_accounts:",
      JSON.stringify(
        accounts.map((a) => ({
          type: a?.type,
          chain_type: a?.chain_type ?? a?.chainType,
          wallet_client: a?.wallet_client ?? a?.walletClient,
        })),
      ),
    );
  }
  return wallet?.address ?? null;
}

async function findByEmail(privy, email) {
  try {
    return await privy.users().getByEmailAddress({ address: email });
  } catch (err) {
    if (err?.status === 404) return null; // no existe todavía
    throw err;
  }
}

/** Devuelve { email, address } o lanza. Idempotente: reintentar es seguro. */
async function resolveOne(privy, email) {
  let user = await findByEmail(privy, email);

  // Caso A: usuario nuevo → se crea con wallet pregenerada en un solo paso.
  if (!user) {
    try {
      user = await privy.users().create({
        linked_accounts: [{ type: "email", address: email }],
        wallets: ETH_WALLET,
      });
    } catch (err) {
      // Carrera: otra petición lo creó entre medias. Se relee.
      user = await findByEmail(privy, email);
      if (!user) throw err;
    }
    const address = extractEmbeddedEthAddress(user);
    if (address) return { email, address };
    // Se creó pero sin wallet embebida visible: cae al caso C.
  }

  // Caso B: ya existe y ya tiene wallet embebida.
  const current = extractEmbeddedEthAddress(user);
  if (current) return { email, address: current };

  // Caso C: existe sin wallet embebida ETH → se la agregamos.
  // Nota de Privy: si el usuario ya tiene alguna embedded wallet, las adicionales
  // solo se pueden crear desde el cliente; en ese caso esto falla y se reporta.
  const updated = await privy.users().pregenerateWallets(user.id, { wallets: ETH_WALLET });
  const address = extractEmbeddedEthAddress(updated);
  if (!address) throw new Error("La respuesta de Privy no incluyó una wallet embebida");
  return { email, address };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let privy;
  try {
    privy = getClient();
  } catch (err) {
    console.error("[resolve-collaborators]", err.message);
    // VERCEL_ENV = "production" | "preview" | "development" (con `vercel dev`).
    // Revela el error típico: variables definidas solo para Production y probando en Preview.
    const where = process.env.VERCEL_ENV ?? "sin VERCEL_ENV (¿no es Vercel?)";
    res.status(500).json({
      error: err.missing
        ? `Servidor mal configurado: falta ${err.missing.join(" y ")} (entorno: ${where})`
        : "Servidor mal configurado",
    });
    return;
  }

  // Vercel parsea JSON automáticamente; esto cubre el caso de body como string.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const { idToken, emails } = body ?? {};

  if (typeof idToken !== "string" || !idToken) {
    res.status(401).json({ error: "Falta idToken" });
    return;
  }

  // Solo usuarios autenticados de Privy pueden crear/consultar usuarios con tu secret.
  try {
    await privy.users().get({ id_token: idToken });
  } catch (err) {
    // Distingue en los logs de Vercel un token inválido de un App Secret mal copiado
    // o del toggle de identity tokens apagado. Nunca se loguea el token.
    console.error("[resolve-collaborators] verificación de token falló:", err?.status, err?.message);
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  if (!Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ error: "emails debe ser un array no vacío" });
    return;
  }

  const unique = Array.from(
    new Set(emails.map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))),
  );
  if (unique.length > MAX_COLLABORATORS) {
    res.status(400).json({ error: `Máximo ${MAX_COLLABORATORS} colaboradores por obra` });
    return;
  }
  if (unique.some((e) => e.length > 254 || !EMAIL_RE.test(e))) {
    res.status(400).json({ error: "Hay correos con formato inválido" });
    return;
  }

  // En paralelo (≤10): secuencial podía rozar el timeout de 10 s de Vercel Hobby.
  const settled = await Promise.allSettled(unique.map((email) => resolveOne(privy, email)));

  const collaborators = [];
  const failed = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      collaborators.push(r.value);
    } else {
      // Sin correo en los logs (dato personal); el detalle técnico sí.
      console.error(`[resolve-collaborators] fallo en #${i}:`, r.reason?.status, r.reason?.message);
      failed.push({ email: unique[i], reason: "No se pudo preparar la wallet de este colaborador" });
    }
  });

  // 200 incluso con fallos parciales: el cliente decide (reintentar o quitar al colaborador).
  // Los usuarios ya creados quedan creados; reintentar es seguro (idempotente).
  res.status(200).json({ collaborators, failed });
}