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
 * Obtiene releaseId desde la API de MusicBrainz
 */
async function fetchReleaseIdFromMusicBrainz(recordingId: string): Promise<string | null> {
  try {
    // Rate limiting: 1 segundo entre llamadas (MusicBrainz permite 1 req/seg)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const url = `https://musicbrainz.org/ws/2/recording/${recordingId}?inc=releases&fmt=json`;
    console.log(`🔍 [MusicBrainz] Buscando releases para recording: ${recordingId}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MuSecure/1.0 (https://musecure.app)',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn(`⚠️ MusicBrainz API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const releases = data.releases || [];
    
    console.log(`📋 [MusicBrainz] ${releases.length} releases encontrados`);
    
    // Priorizar releases oficiales y tipo Album
    const officialRelease = releases.find((r: any) => 
      r.status === 'Official' && r.release_group?.primary_type === 'Album'
    );
    
    if (officialRelease?.id) {
      console.log(`✅ [MusicBrainz] Release oficial (Album): ${officialRelease.id}`);
      return officialRelease.id;
    }
    
    // Fallback: cualquier release oficial
    const anyOfficial = releases.find((r: any) => r.status === 'Official');
    if (anyOfficial?.id) {
      console.log(`✅ [MusicBrainz] Release oficial: ${anyOfficial.id}`);
      return anyOfficial.id;
    }
    
    // Último fallback: cualquier release con ID
    const anyRelease = releases.find((r: any) => r.id);
    if (anyRelease?.id) {
      console.log(`✅ [MusicBrainz] Release (fallback): ${anyRelease.id}`);
      return anyRelease.id;
    }
    
    console.log(`❌ [MusicBrainz] No se encontró releaseId`);
    return null;
    
  } catch (e) {
    console.warn('❌ [MusicBrainz] Error fetching releaseId:', e);
    return null;
  }
}

/**
 * Extrae el releaseId para Cover Art Archive.
 * AHORA CON LLAMADA A MUSICBRAINZ SI NO ESTÁ EN ACOUSTID
 */
async function pickReleaseId(rec: AcoustIdRecording): Promise<string | undefined> {
  // 1. Intentar obtener de AcoustID
  if (rec.releases && rec.releases.length > 0) {
    const album = rec.releases.find((r: any) => r.releasegroup?.type === "Album" && r.id);
    if (album?.id) {
      console.log(`✅ [AcoustID] ReleaseId encontrado en AcoustID: ${album.id}`);
      return album.id;
    }
    const first = rec.releases.find((r: any) => r.id);
    if (first?.id) {
      console.log(`✅ [AcoustID] ReleaseId encontrado en AcoustID (fallback): ${first.id}`);
      return first.id;
    }
  }
  
  // 2. Si no, buscar en MusicBrainz usando recordingId
  if (rec.id) {
    console.log(`🔍 [AcoustID] No tiene releaseId, buscando en MusicBrainz...`);
    const releaseId = await fetchReleaseIdFromMusicBrainz(rec.id);
    if (releaseId) return releaseId;
  }
  
  return undefined;
}

/**
 * Grabaciones MusicBrainz asociadas a la huella, ordenadas por score AcoustID.
 */
async function collectMatches(results: AcoustIdResult[]): Promise<CatalogMatchRow[]> {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const byRecording = new Map<string, CatalogMatchRow>();

  for (const r of sorted) {
    const pct = Math.round(Math.min(1, Math.max(0, r.score)) * 100);
    for (const rec of r.recordings ?? []) {
      const recordingId = rec.id;
      if (!recordingId) continue;
      
      // ✨ Obtener releaseId (con llamada a MusicBrainz si es necesario)
      const releaseId = await pickReleaseId(rec);
      
      const row: CatalogMatchRow = {
        recordingId,
        title: rec.title,
        artist: rec.artists?.map((a) => a.name).filter(Boolean).join(", "),
        releaseTitle: pickReleaseTitle(rec),
        releaseGroupType: pickReleaseGroupType(rec),
        releaseId: releaseId || null, // ✨ AHORA SÍ VIENE CON releaseId
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

export async function interpretAcoustIdLookup(
  json: AcoustIdLookupJson
): Promise<CatalogAuthenticityReport> {
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
  
  // ✨ AHORA collectMatches ES ASYNC y obtiene releaseId
  const matches = await collectMatches(results);
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