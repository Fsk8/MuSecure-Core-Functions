/** Respuesta JSON del lookup AcoustID v2 (subconjunto usado por MuSecure). */

export interface AcoustIdRecording {
  id?: string;
  title?: string;
  duration?: number;
  artists?: Array<{ id?: string; name?: string }>;
  releases?: Array<{ id?: string; title?: string; country?: string; date?: string }>;
  releasegroups?: Array<{ id?: string; title?: string; type?: string }>;
}

export interface AcoustIdResult {
  id?: string;
  score: number;
  recordings?: AcoustIdRecording[];
}

export type AcoustIdLookupJson =
  | { status: "ok"; results: AcoustIdResult[] }
  | { status: "error"; error: { code?: number; message?: string } };

/** Interpretación orientada a “¿registrar en cadena?” */
export interface CatalogAuthenticityReport {
  /** Si hubo fallo de API o parseo, los scores no aplican. */
  error?: string;
  /** Confianza de coincidencia con la base AcoustID (0–100). Alto = muy parecido a grabaciones indexadas. */
  catalogMatchScore: number;
  /** Qué tan “nueva” parece la obra respecto al catálogo (0–100). Alto = pocas o ninguna coincidencia fuerte. */
  originalityScore: number;
  /** Riesgo de que sea una grabación ya catalogada (falso “estreno”). */
  registrationRisk: "bajo" | "medio" | "alto";
  bestAcoustIdTrackId: string | null;
  bestMatchScore: number;
  matches: CatalogMatchRow[];
  /**
   * Huella reconocida en AcoustID pero sin bloque `recordings` en la respuesta
   * (solo id de pista AcoustID).
   */
  acoustIdOnlyTracks: Array<{ trackId: string; scorePercent: number }>;
  /** Texto breve para la UI */
  summary: string;
}

export interface CatalogMatchRow {
  recordingId: string;
  releaseId?: string | null;
  title?: string;
  artist?: string;
  releaseTitle?: string;
  releaseGroupType?: string;
  /** Confianza del grupo AcoustID al que pertenece esta fila (0–100). */
  scorePercent: number;
}
