/**
 * MuSecure – services/runCatalogCheck.ts
 *
 * Revertido — Gemini añadió inyección de externalMatches que no hace nada útil.
 * interpretAcoustIdLookup ya extrae matches y acoustIdOnlyTracks correctamente.
 */

import { generateChromaprintForAcoustId } from "@/services/chromaprintAcoustId";
import { lookupAcoustId } from "@/services/acoustidLookup";
import { interpretAcoustIdLookup } from "@/services/authenticityFromAcoustId";
import type { CatalogAuthenticityReport } from "@/types/acoustid";

export type CatalogCheckStage = "chromaprint" | "acoustid" | "done";

export async function runCatalogAuthenticityCheck(
  file: File,
  clientKey: string,
  onStage?: (stage: CatalogCheckStage) => void
): Promise<{
  report: CatalogAuthenticityReport;
  acoustIdFingerprint: string;
  durationSec: number;
}> {
  onStage?.("chromaprint");
  const { fingerprint, durationSec } = await generateChromaprintForAcoustId(file);

  onStage?.("acoustid");
  const json = await lookupAcoustId({ client: clientKey, fingerprint, durationSec });

  onStage?.("done");
  const report = interpretAcoustIdLookup(json);

  return { report, acoustIdFingerprint: fingerprint, durationSec };
}