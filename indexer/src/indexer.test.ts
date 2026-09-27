import { describe, it } from "vitest";
import { createTestIndexer } from "envio";

describe("Indexer smoke test", () => {
  it("processes the first block with events on chain 421614", async (t) => {
    const indexer = createTestIndexer();

    const result = await indexer.process({ chains: { 421614: {} } });

    t.expect(result.changes.length, "Should have at least one change").toBeGreaterThan(0);
    const firstChange = result.changes[0]!;
    t.expect(firstChange.chainId).toBe(421614);
    t.expect(firstChange.eventsProcessed).toBeGreaterThan(0);
  }, 60_000);
});