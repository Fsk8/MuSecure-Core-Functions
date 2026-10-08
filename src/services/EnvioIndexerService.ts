/**
 * MuSecure – services/EnvioIndexerService.ts
 *
 * Cliente de solo lectura contra la API GraphQL del indexer Envio
 * (obras, certificados y autores ya indexados desde Arbitrum Sepolia / Monad).
 */

function getGraphQLUrl(): string {
  const url = import.meta.env.VITE_ENVIO_GRAPHQL_URL as string;
  if (!url) throw new Error("Falta VITE_ENVIO_GRAPHQL_URL en las variables de entorno");
  return url;
}

export interface IndexedCertificate {
  id: string;
  tokenId: string;
  ipfsCid: string;
  soulbound: boolean;
  owner: { id: string };
}

/** Crédito de co-autoría resumido, anidado en cada obra. */
export interface IndexedWorkCredit {
  /** Puntos base: 1 = 0,01 %. */
  bps: number;
  collaborator: { id: string };
}

export interface IndexedWork {
  id: string;
  fingerprintHash: string;
  ipfsCid: string;
  authenticityScore: string;
  riskLevel: number;
  tokenId: string;
  registeredAt: string;
  txHash: string;
  author: { id: string };
  certificate: IndexedCertificate | null;
  /** Co-autores acreditados on-chain (vacío si la obra no tiene). */
  credits: IndexedWorkCredit[];
}

async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(getGraphQLUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Envio GraphQL respondió ${res.status}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors[0]?.message ?? "Error desconocido de GraphQL");
  }
  return json.data as T;
}

const WORK_FIELDS_BASE = `
  id
  fingerprintHash
  ipfsCid
  authenticityScore
  riskLevel
  tokenId
  registeredAt
  txHash
  author { id }
  certificate {
    id
    tokenId
    ipfsCid
    soulbound
    owner { id }
  }
`;

const WORK_CREDITS_FIELDS = `
  credits {
    bps
    collaborator { id }
  }
`;

const WORK_FIELDS = `${WORK_FIELDS_BASE}${WORK_CREDITS_FIELDS}`;

/**
 * Consulta obras pidiendo también sus créditos. Si el Envio al que apunta la app
 * todavía corre con el esquema viejo (sin la entidad Credit), esa consulta falla con
 * "field 'credits' not found": en ese caso se reintenta sin créditos para que las
 * obras sigan viéndose (con credits = []) en vez de romper todas las vistas.
 */
async function queryWorks(
  build: (fields: string) => string,
  variables: Record<string, unknown>,
): Promise<IndexedWork[]> {
  try {
    const data = await graphqlRequest<{ Work: IndexedWork[] }>(build(WORK_FIELDS), variables);
    return data.Work;
  } catch (e) {
    if (!/credits?/i.test((e as Error).message)) throw e;
    console.warn("[Envio] El indexador desplegado no tiene créditos todavía; se muestran obras sin co-autores.");
    const data = await graphqlRequest<{ Work: Omit<IndexedWork, "credits">[] }>(build(WORK_FIELDS_BASE), variables);
    return data.Work.map((w) => ({ ...w, credits: [] }));
  }
}

/** Trae todas las obras indexadas de un autor (case-insensitive, filtrado en cliente). */
export async function getWorksByAuthor(address: string): Promise<IndexedWork[]> {
  const works = await queryWorks(
    (fields) => `
      query GetWorks($limit: Int!) {
        Work(limit: $limit, order_by: { registeredAt: desc }) {
          ${fields}
        }
      }
    `,
    { limit: 1000 },
  );
  const target = address.toLowerCase();
  return works.filter((w) => w.author.id.toLowerCase() === target);
}

/** Trae todas las obras indexadas (para una galería/dashboard general). */
export async function getAllWorks(limit = 100): Promise<IndexedWork[]> {
  return queryWorks(
    (fields) => `
      query GetAllWorks($limit: Int!) {
        Work(limit: $limit, order_by: { registeredAt: desc }) {
          ${fields}
        }
      }
    `,
    { limit },
  );
}

export interface IndexerStats {
  totalWorks: number;
  uniqueAuthors: number;
  avgAuthenticityScore: number;
  soulboundPercentage: number;
  // Nota: no incluye "blocked" — ese riskLevel nunca se persiste, porque el
  // contrato revierte (revert) antes de que WorkRegistered llegue a emitirse
  // para ese caso. Ver discusión en el hilo del hackathon.
  riskBreakdown: { low: number; medium: number; high: number };
}

/**
 * Métricas globales del protocolo, calculadas en el cliente a partir de campos
 * livianos. No usamos `_aggregate` de Hasura a propósito: así no dependemos de
 * que esa funcionalidad esté habilitada en el hosted service, y con el volumen
 * de un hackathon esto es instantáneo igual.
 */
export async function getStats(): Promise<IndexerStats> {
  const query = `
    query GetStats($limit: Int!) {
      Work(limit: $limit) {
        authenticityScore
        riskLevel
        author { id }
      }
      Certificate(limit: $limit) {
        soulbound
      }
    }
  `;
  const data = await graphqlRequest<{
    Work: { authenticityScore: string; riskLevel: number; author: { id: string } }[];
    Certificate: { soulbound: boolean }[];
  }>(query, { limit: 5000 });

  const works = data.Work;
  const certificates = data.Certificate;
  const totalWorks = works.length;

  const avgAuthenticityScore = totalWorks
    ? Math.round((works.reduce((sum, w) => sum + Number(w.authenticityScore), 0) / totalWorks) * 10) / 10
    : 0;

  const uniqueAuthors = new Set(works.map((w) => w.author.id.toLowerCase())).size;

  const soulboundPercentage = certificates.length
    ? Math.round((certificates.filter((c) => c.soulbound).length / certificates.length) * 100)
    : 0;

  const riskBreakdown = { low: 0, medium: 0, high: 0 };
  for (const w of works) {
    if (w.riskLevel === 0) riskBreakdown.low++;
    else if (w.riskLevel === 1) riskBreakdown.medium++;
    else if (w.riskLevel === 2) riskBreakdown.high++;
  }

  return {
    totalWorks,
    uniqueAuthors,
    avgAuthenticityScore,
    soulboundPercentage,
    riskBreakdown,
  };
}
/* ───────────────────────── Créditos de co-autoría (MuSecureCredits) ───────────────────────── */

export interface IndexedCredit {
  id: string;
  /** Puntos base: 1 = 0,01 %. */
  bps: number;
  creditedAt: string;
  txHash: string;
  author: { id: string };
  collaborator: { id: string };
  /** `credits` = todos los créditos de esa obra (para calcular el reparto). */
  work: IndexedWork;
}

const CREDIT_FIELDS = `
  id
  bps
  creditedAt
  txHash
  author { id }
  collaborator { id }
  work { ${WORK_FIELDS} }
`;

/** Créditos recibidos por una wallet (comparación case-insensitive con _ilike). */
export async function getCreditsByCollaborator(address: string): Promise<IndexedCredit[]> {
  const query = `
    query GetCredits($addr: String!) {
      Credit(where: { collaborator_id: { _ilike: $addr } }, order_by: { creditedAt: desc }) {
        ${CREDIT_FIELDS}
      }
    }
  `;
  const data = await graphqlRequest<{ Credit: IndexedCredit[] }>(query, { addr: address });
  const target = address.toLowerCase();
  return data.Credit.filter((c) => c.collaborator.id.toLowerCase() === target);
}

/** Créditos declarados sobre una obra (por fingerprintHash). */
export async function getCreditsByWork(fingerprintHash: string): Promise<IndexedCredit[]> {
  const query = `
    query GetWorkCredits($fp: String!) {
      Credit(where: { fingerprintHash: { _eq: $fp } }) {
        ${CREDIT_FIELDS}
      }
    }
  `;
  const data = await graphqlRequest<{ Credit: IndexedCredit[] }>(query, { fp: fingerprintHash });
  return data.Credit;
}