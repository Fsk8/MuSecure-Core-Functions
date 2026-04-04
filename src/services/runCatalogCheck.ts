import { generateChromaprintForAcoustId } from "@/services/chromaprintAcoustId";
import { lookupAcoustId } from "@/services/acoustidLookup";
import { interpretAcoustIdLookup } from "@/services/authenticityFromAcoustId";
import type { CatalogAuthenticityReport } from "@/types/acoustid";

export type CatalogCheckStage =
  | "chromaprint"
  | "acoustid"
  | "done";

/**
 * Chromaprint oficial + lookup AcoustID (metadatos MusicBrainz vía AcoustID).
 * Requiere clave de aplicación: https://acoustid.org/new-application
 */
export async function runCatalogAuthenticityCheck(
  file: File,
  clientKey: string,
  onStage?: (stage: CatalogCheckStage) => void
): Promise<{
  report: CatalogAuthenticityReport;
  acoustIdFingerprint: string;
  durationSec: number;
  rawJson: any; // <-- AGREGADO para no perder los datos de MusicBrainz
}> {
  onStage?.("chromaprint");
  const { fingerprint, durationSec } = await generateChromaprintForAcoustId(file);

  onStage?.("acoustid");
  const json = await lookupAcoustId({
    client: clientKey,
    fingerprint,
    durationSec,
  });

  onStage?.("done");
  const report = interpretAcoustIdLookup(json);
  
  // <-- Pasamos el 'json' también en la respuesta
  return { report, acoustIdFingerprint: fingerprint, durationSec, rawJson: json };
}