import type {
  AcoustIdLookupJson,
  AcoustIdRecording,
  AcoustIdResult,
  CatalogAuthenticityReport,
  CatalogMatchRow,
} from "@/types/acoustid";

function riskFromScore(score: number): CatalogAuthenticityReport["registrationRisk"] {
  if (score >= 0.85) return "alto";
  if (score >= 0.45) return "medio";
  return "bajo";
}

function pickReleaseTitle(rec: AcoustIdRecording): string | undefined {
  const fromRelease = rec.releases?.find((x) => x.title)?.title;
  if (fromRelease) return fromRelease;
  return rec.releasegroups?.find((x) => x.title)?.title;
}

function pickReleaseGroupType(rec: AcoustIdRecording): string | undefined {
  return rec.releasegroups?.find((x) => x.type)?.type;
}

/**
 * Grabaciones MusicBrainz asociadas a la huella, ordenadas por score AcoustID.
 */
function collectMatches(results: AcoustIdResult[]): CatalogMatchRow[] {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const byRecording = new Map<string, CatalogMatchRow>();

  for (const r of sorted) {
    const pct = Math.round(Math.min(1, Math.max(0, r.score)) * 100);
    for (const rec of r.recordings ?? []) {
      const recordingId = rec.id;
      if (!recordingId) continue;
      const row: CatalogMatchRow = {
        recordingId,
        title: rec.title,
        artist: rec.artists?.map((a) => a.name).filter(Boolean).join(", "),
        releaseTitle: pickReleaseTitle(rec),
        releaseGroupType: pickReleaseGroupType(rec),
        scorePercent: pct,
      };
      const prev = byRecording.get(recordingId);
      if (!prev || row.scorePercent > prev.scorePercent) {
        byRecording.set(recordingId, row);
      }
    }
  }

  return Array.from(byRecording.values())
    .sort((a, b) => b.scorePercent - a.scorePercent)
    .slice(0, 25);
}

/** Pistas AcoustID sin bloque recordings en la respuesta. */
function collectAcoustIdOnlyTracks(
  results: AcoustIdResult[]
): CatalogAuthenticityReport["acoustIdOnlyTracks"] {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const out: CatalogAuthenticityReport["acoustIdOnlyTracks"] = [];
  for (const r of sorted) {
    const recs = r.recordings ?? [];
    if (r.id && recs.length === 0) {
      out.push({
        trackId: r.id,
        scorePercent: Math.round(Math.min(1, Math.max(0, r.score)) * 100),
      });
    }
  }
  return out;
}

export function interpretAcoustIdLookup(
  json: AcoustIdLookupJson
): CatalogAuthenticityReport {
  if (json.status === "error") {
    const msg = json.error?.message ?? "Error AcoustID";
    return {
      error: msg,
      catalogMatchScore: 0,
      originalityScore: 0,
      registrationRisk: "bajo",
      bestAcoustIdTrackId: null,
      bestMatchScore: 0,
      matches: [],
      acoustIdOnlyTracks: [],
      summary: `No se pudo consultar el catálogo: ${msg}`,
    };
  }

  const results = json.results ?? [];
  if (results.length === 0) {
    return {
      catalogMatchScore: 0,
      originalityScore: 100,
      registrationRisk: "bajo",
      bestAcoustIdTrackId: null,
      bestMatchScore: 0,
      matches: [],
      acoustIdOnlyTracks: [],
      summary:
        "Sin coincidencias en AcoustID con esta huella. Suele indicar obra poco indexada o material propio; no garantiza ausencia total en otros catálogos.",
    };
  }

  let best = results[0];
  for (const r of results) {
    if (r.score > best.score) best = r;
  }

  const bestMatchScore = Math.min(1, Math.max(0, best.score));
  const catalogMatchScore = Math.round(bestMatchScore * 100);
  const originalityScore = Math.round((1 - bestMatchScore) * 100);
  const registrationRisk = riskFromScore(bestMatchScore);
  const matches = collectMatches(results);
  const acoustIdOnlyTracks = collectAcoustIdOnlyTracks(results);

  const summary =
    bestMatchScore >= 0.85
      ? "Coincidencia fuerte con grabaciones conocidas en AcoustID/MusicBrainz. Revisa derechos antes de registrar como obra nueva."
      : bestMatchScore >= 0.45
        ? "Hay coincidencias parciales. Conviene revisar títulos y artistas listados abajo."
        : "Coincidencias débiles o ambiguas; menor probabilidad de ser una copia directa de una master comercial indexada.";

  return {
    catalogMatchScore,
    originalityScore,
    registrationRisk,
    bestAcoustIdTrackId: best.id ?? null,
    bestMatchScore,
    matches,
    acoustIdOnlyTracks,
    summary,
  };
}
