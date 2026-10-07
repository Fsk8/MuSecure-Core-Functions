/*
 * Handlers para el contrato MuSecureCredits (co-autorías por obra)
 */
import { indexer, type Author, type Credit } from "envio";

async function ensureAuthor(context: any, address: string) {
  const existing = await context.Author.get(address);
  if (!existing) {
    const author: Author = { id: address };
    context.Author.set(author);
  }
}

indexer.onEvent(
  { contract: "MuSecureCredits", event: "CollaboratorCredited" },
  async ({ event, context }) => {
    const { fingerprintHash, author, collaborator, bps } = event.params;

    await ensureAuthor(context, author);
    await ensureAuthor(context, collaborator);

    const credit: Credit = {
      id: `${fingerprintHash}-${collaborator}`,
      work_id: fingerprintHash, // Work.id = fingerprintHash (ver MuSecureRegistry.ts)
      fingerprintHash,
      author_id: author,
      collaborator_id: collaborator,
      bps: Number(bps),
      creditedAt: BigInt(event.block.timestamp),
      txHash: event.transaction.hash ?? "",
    };

    context.Credit.set(credit);
  },
);