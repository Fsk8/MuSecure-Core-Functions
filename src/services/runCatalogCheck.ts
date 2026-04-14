/**
 * MuSecure – services/runCatalogCheck.ts
 *
 * Actualizado: interpretAcoustIdLookup ahora es async y obtiene releaseId de MusicBrainz
 */

import { generateChromaprintForAcoustId } from "@/services/chromaprintAcoustId";
import { lookupAcoustId } from "@/services/acoustidLookup";
import { interpretAcoustIdLookup } from "@/services/authenticityFromAcoustId";
import type { CatalogAuthenticityReport } from "@/types/acoustid";

export type CatalogCheckStage = "chromaprint" | "acoustid" | "musicbrainz" | "done";

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

  onStage?.("musicbrainz");
  // ✨ interpretAcoustIdLookup ahora es async y obtiene releaseId de MusicBrainz
  const report = await interpretAcoustIdLookup(json);

  onStage?.("done");
  return { report, acoustIdFingerprint: fingerprint, durationSec };
}