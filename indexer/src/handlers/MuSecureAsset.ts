/*
 * Handlers para el contrato MuSecureAsset (ERC-721 de certificados)
 * Ver: https://docs.envio.dev
 */
import { indexer, type Author, type Certificate } from "envio";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Crea el Author si todavía no existe (id = wallet address)
async function ensureAuthor(context: any, address: string) {
  const existing = await context.Author.get(address);
  if (!existing) {
    const author: Author = { id: address };
    context.Author.set(author);
  }
}

indexer.onEvent(
  { contract: "MuSecureAsset", event: "CertificateMinted" },
  async ({ event, context }) => {
    const { to, tokenId, ipfsCid, soulbound } = event.params;

    await ensureAuthor(context, to);

    const certificate: Certificate = {
      id: tokenId.toString(),
      tokenId,
      owner_id: to,
      ipfsCid,
      soulbound,
      mintedAt: BigInt(event.block.timestamp),
      txHash: event.transaction.hash ?? "",
    };

    context.Certificate.set(certificate);
  },
);

indexer.onEvent(
  { contract: "MuSecureAsset", event: "SoulboundStatusChanged" },
  async ({ event, context }) => {
    const { tokenId, soulbound } = event.params;

    const certificate = await context.Certificate.get(tokenId.toString());
    if (!certificate) {
      // No debería pasar en orden normal (CertificateMinted siempre va antes),
      // pero por seguridad lo ignoramos si el certificado aún no existe.
      return;
    }

    context.Certificate.set({
      ...certificate,
      soulbound,
    });
  },
);

indexer.onEvent(
  { contract: "MuSecureAsset", event: "Transfer" },
  async ({ event, context }) => {
    const { from, to, tokenId } = event.params;

    // El mint también dispara Transfer(from=0x0...). Ese caso ya lo maneja CertificateMinted.
    if (from.toLowerCase() === ZERO_ADDRESS) {
      return;
    }

    await ensureAuthor(context, to);

    const certificate = await context.Certificate.get(tokenId.toString());
    if (!certificate) {
      return;
    }

    context.Certificate.set({
      ...certificate,
      owner_id: to,
    });
  },
);