import type { AcoustIdLookupJson } from "@/types/acoustid";

const LOOKUP_URL = "https://api.acoustid.org/v2/lookup";

export async function lookupAcoustId(params: {
  client: string;
  fingerprint: string;
  durationSec: number;
}): Promise<AcoustIdLookupJson> {

  if (!params.client || params.client === "undefined") {
    throw new Error("AcoustID Client Key no configurada (VITE_ACOUSTID_CLIENT_KEY)");
  }

  console.log("[AcoustID] Enviando lookup:", {
    fingerprintLen: params.fingerprint.length,
    fingerprintHead: params.fingerprint.slice(0, 20),
    duration: params.durationSec,
  });

  const body = new URLSearchParams({
    format: "json",
    client: params.client.trim(),
    duration: String(Math.round(params.durationSec)),
    fingerprint: params.fingerprint,
    meta: "recordings releases releasegroups",
  });

  const res = await fetch(LOOKUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error("AcoustID HTTP " + res.status + ": " + txt);
  }

  const json = (await res.json()) as AcoustIdLookupJson;

  const results = (json as any).results ?? [];
  
  // PROCESAMIENTO: Aplanamos la estructura anidada de AcoustID para react
  const externalMatches = results.flatMap((res: any) => 
    (res.recordings ?? []).map((rec: any) => ({
      title: rec.title,
      artist: rec.artists?.map((a: any) => a.name).join(", ") || "Unknown Artist",
      score: res.score,
      recordingId: rec.id // ID clave para MusicBrainz
    }))
  );

  console.log("[AcoustID] Respuesta cruda:", {
    status: json.status,
    resultsCount: results.length,
    firstScore: results[0]?.score,
    firstRecordingsCount: results[0]?.recordings?.length ?? 0,
    firstRecordingTitle: results[0]?.recordings?.[0]?.title,
  });

  console.log("[AcoustID] Coincidencias procesadas:", externalMatches);

  // Inyectamos las coincidencias procesadas directamente en el JSON de respuesta
  return {
    ...json,
    externalMatches
  } as any;
}