/*
 * Handlers para el contrato MuSecureRegistry
 * Ver: https://docs.envio.dev
 */
import { indexer, type Author, type Work, type WorkBlockedEvent } from "envio";

// Crea el Author si todavía no existe (id = wallet address)
async function ensureAuthor(context: any, address: string) {
  const existing = await context.Author.get(address);
  if (!existing) {
    const author: Author = { id: address };
    context.Author.set(author);
  }
}

indexer.onEvent(
  { contract: "MuSecureRegistry", event: "WorkRegistered" },
  async ({ event, context }) => {
    const {
      author,
      fingerprintHash,
      ipfsCid,
      authenticityScore,
      riskLevel,
      tokenId,
      timestamp,
    } = event.params;

    await ensureAuthor(context, author);

    const work: Work = {
      id: fingerprintHash,
      fingerprintHash,
      ipfsCid,
      authenticityScore,
      riskLevel: Number(riskLevel),
      tokenId,
      registeredAt: timestamp,
      txHash: event.transaction.hash ?? "",
      author_id: author,
      certificate_id: tokenId.toString(),
    };

    context.Work.set(work);
  },
);

indexer.onEvent(
  { contract: "MuSecureRegistry", event: "WorkBlocked" },
  async ({ event, context }) => {
    const { author, fingerprintHash, authenticityScore, timestamp } = event.params;

    await ensureAuthor(context, author);

    const blockedEvent: WorkBlockedEvent = {
      id: `${event.transaction.hash ?? "unknown"}-${event.logIndex}`,
      fingerprintHash,
      authenticityScore,
      blockedAt: timestamp,
      txHash: event.transaction.hash ?? "",
      author_id: author,
    };

    context.WorkBlockedEvent.set(blockedEvent);
  },
);