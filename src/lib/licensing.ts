/**
 * MuSecure – lib/licensing.ts
 * ABI + lecturas de MuSecureLicensing (RPC) y consultas a Envio (GraphQL).
 * Env: VITE_LICENSING_ADDRESS, VITE_ENVIO_GRAPHQL_URL (opcional; sin él, solo RPC).
 */
import { ethers } from "ethers";
import { RPC_URL } from "@/lib/chain";

export const LICENSING_ADDRESS = (import.meta.env.VITE_LICENSING_ADDRESS as string | undefined) ?? "";
export const ENVIO_URL = (import.meta.env.VITE_ENVIO_GRAPHQL_URL as string | undefined) ?? "";

export const LICENSING_ABI = [
  "function licensePrice(bytes32) view returns (uint256)",
  "function hasLicense(bytes32,address) view returns (bool)",
  "function claimable(address) view returns (uint256)",
  "function setLicensePrice(bytes32 fingerprintHash, uint256 price)",
  "function buyLicense(bytes32 fingerprintHash) payable",
  "function withdraw()",
];

let _provider: ethers.JsonRpcProvider | null = null;
export function rpc(): ethers.JsonRpcProvider {
  return (_provider ??= new ethers.JsonRpcProvider(RPC_URL));
}

function reader() {
  if (!LICENSING_ADDRESS) throw new Error("Falta VITE_LICENSING_ADDRESS en .env");
  return new ethers.Contract(LICENSING_ADDRESS, LICENSING_ABI, rpc());
}

export const normHash = (h: string) => (h.startsWith("0x") ? h : `0x${h}`);

export async function readPrice(hash: string): Promise<bigint> {
  return (await reader().licensePrice(normHash(hash))) as bigint;
}
export async function readHasLicense(hash: string, buyer: string): Promise<boolean> {
  return (await reader().hasLicense(normHash(hash), buyer)) as boolean;
}
export async function readClaimable(account: string): Promise<bigint> {
  return (await reader().claimable(account)) as bigint;
}

/** "0.5" → wei. Lanza si el texto no es un número válido > 0. */
export function parseMon(input: string): bigint {
  const v = ethers.parseEther(input.trim().replace(",", "."));
  if (v <= 0n) throw new Error("El precio debe ser mayor que 0.");
  return v;
}
export const formatMon = (wei: bigint, digits = 4): string => {
  const n = Number(ethers.formatEther(wei));
  return n === 0 ? "0" : n < 10 ** -digits ? `<${10 ** -digits}` : n.toLocaleString("en-US", { maximumFractionDigits: digits });
};

/* ───────────────────────── Envio (Hasura GraphQL) ───────────────────────── */

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!ENVIO_URL) throw new Error("Envio no configurado");
  const res = await fetch(ENVIO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

export interface RoyaltyRow {
  id: string;
  fingerprintHash: string;
  amount: bigint;
  isAuthor: boolean;
  direct: boolean;
  paidAt: number;
  txHash: string;
}
export interface EarningsSummary {
  totalEarned: bigint;
  salesCount: number;
  royalties: RoyaltyRow[];
}

export async function fetchEarnings(address: string): Promise<EarningsSummary> {
  const a = address.toLowerCase();
  const data = await gql<{
    Earnings_by_pk: { totalEarned: string; salesCount: number } | null;
    Royalty: { id: string; fingerprintHash: string; amount: string; isAuthor: boolean; direct: boolean; paidAt: string; txHash: string }[];
  }>(
    `query($id: String!, $a: String!) {
      Earnings_by_pk(id: $id) { totalEarned salesCount }
      Royalty(where: { recipient: { _eq: $a } }, order_by: { paidAt: desc }, limit: 25) {
        id fingerprintHash amount isAuthor direct paidAt txHash
      }
    }`,
    { id: a, a },
  );
  return {
    totalEarned: BigInt(data.Earnings_by_pk?.totalEarned ?? "0"),
    salesCount: data.Earnings_by_pk?.salesCount ?? 0,
    royalties: data.Royalty.map((r) => ({
      id: r.id,
      fingerprintHash: r.fingerprintHash,
      amount: BigInt(r.amount),
      isAuthor: r.isAuthor,
      direct: r.direct,
      paidAt: Number(r.paidAt),
      txHash: r.txHash,
    })),
  };
}

/* ─────────── Lecturas en bloque para catálogos (1 consulta, no 1 por tarjeta) ─────────── */

const TTL_MS = 20_000;
let listingsCache: { at: number; p: Promise<Map<string, bigint>> } | null = null;
const licensesCache = new Map<string, { at: number; p: Promise<Set<string>> }>();

/** Descarta la caché (llamar tras una tx propia). */
export function invalidateLicenseCache() {
  listingsCache = null;
  licensesCache.clear();
}

/** hash(minúsculas) → precio, solo obras a la venta (price > 0). Lanza si Envio no responde. */
export function getListings(): Promise<Map<string, bigint>> {
  if (listingsCache && Date.now() - listingsCache.at < TTL_MS) return listingsCache.p;
  const p = gql<{ LicenseListing: { fingerprintHash: string; price: string }[] }>(
    `query { LicenseListing(where: { price: { _gt: "0" } }, limit: 5000) { fingerprintHash price } }`,
    {},
  ).then((d) => new Map(d.LicenseListing.map((l) => [l.fingerprintHash.toLowerCase(), BigInt(l.price)])));
  p.catch(() => {
    if (listingsCache?.p === p) listingsCache = null;
  });
  listingsCache = { at: Date.now(), p };
  return p;
}

/** Hashes (minúsculas) de las obras que `buyer` ya licenció. */
export function getMyLicenses(buyer: string): Promise<Set<string>> {
  const key = buyer.toLowerCase();
  const hit = licensesCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = gql<{ License: { fingerprintHash: string }[] }>(
    `query($b: String!) { License(where: { buyer: { _eq: $b } }, limit: 5000) { fingerprintHash } }`,
    { b: key },
  ).then((d) => new Set(d.License.map((l) => l.fingerprintHash.toLowerCase())));
  p.catch(() => licensesCache.delete(key));
  licensesCache.set(key, { at: Date.now(), p });
  return p;
}

export const isFingerprint = (h: unknown): h is string => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h);
