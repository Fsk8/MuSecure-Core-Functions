/*
 * Handlers para MuSecureLicensing (venta de licencias + reparto de regalías)
 * Ubicación: junto a MuSecureCredits.ts / MuSecureRegistry.ts
 */
import {
  indexer,
  type LicenseListing,
  type License,
  type Royalty,
  type RoyaltyClaim,
  type Earnings,
} from "envio";

const lc = (a: string) => a.toLowerCase();

async function getEarnings(context: any, address: string): Promise<Earnings> {
  const existing = await context.Earnings.get(address);
  return existing ?? { id: address, totalEarned: 0n, pending: 0n, salesCount: 0 };
}

indexer.onEvent(
  { contract: "MuSecureLicensing", event: "LicensePriceSet" },
  async ({ event, context }) => {
    const { fingerprintHash, author, price } = event.params;
    const listing: LicenseListing = {
      id: fingerprintHash,
      fingerprintHash,
      author: lc(author),
      price,
      updatedAt: BigInt(event.block.timestamp),
    };
    context.LicenseListing.set(listing);
  },
);

indexer.onEvent(
  { contract: "MuSecureLicensing", event: "LicensePurchased" },
  async ({ event, context }) => {
    const { fingerprintHash, buyer, author, price } = event.params;
    const license: License = {
      id: `${fingerprintHash}-${lc(buyer)}`,
      fingerprintHash,
      buyer: lc(buyer),
      author: lc(author),
      price,
      purchasedAt: BigInt(event.block.timestamp),
      txHash: event.transaction.hash ?? "",
    };
    context.License.set(license);

    // Ventas del autor (se cuenta aquí, no en RoyaltyPaid, por si su parte fuese 0)
    const a = await getEarnings(context, lc(author));
    context.Earnings.set({ ...a, salesCount: a.salesCount + 1 });
  },
);

indexer.onEvent(
  { contract: "MuSecureLicensing", event: "RoyaltyPaid" },
  async ({ event, context }) => {
    const { fingerprintHash, recipient, amount, isAuthor, direct } = event.params;
    const who = lc(recipient);

    const royalty: Royalty = {
      id: `${event.transaction.hash ?? "unknown"}-${event.logIndex}`,
      fingerprintHash,
      recipient: who,
      amount,
      isAuthor,
      direct,
      paidAt: BigInt(event.block.timestamp),
      txHash: event.transaction.hash ?? "",
    };
    context.Royalty.set(royalty);

    const e = await getEarnings(context, who);
    context.Earnings.set({
      ...e,
      totalEarned: e.totalEarned + amount,
      pending: direct ? e.pending : e.pending + amount,
    });
  },
);

indexer.onEvent(
  { contract: "MuSecureLicensing", event: "RoyaltyClaimed" },
  async ({ event, context }) => {
    const { account, amount } = event.params;
    const who = lc(account);

    const claim: RoyaltyClaim = {
      id: `${event.transaction.hash ?? "unknown"}-${event.logIndex}`,
      account: who,
      amount,
      claimedAt: BigInt(event.block.timestamp),
      txHash: event.transaction.hash ?? "",
    };
    context.RoyaltyClaim.set(claim);

    const e = await getEarnings(context, who);
    context.Earnings.set({ ...e, pending: e.pending > amount ? e.pending - amount : 0n });
  },
);
