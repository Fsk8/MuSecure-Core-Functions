import type { AcoustIdLookupJson } from "@/types/acoustid";

const LOOKUP_URL = "https://api.acoustid.org/v2/lookup";

export async function lookupAcoustId(params: {
  client: string;
  fingerprint: string;
  durationSec: number;
}): Promise<AcoustIdLookupJson> {
  const body = new URLSearchParams({
    format: "json",
    client: params.client.trim(),
    duration: String(Math.round(params.durationSec)),
    fingerprint: params.fingerprint,
    // SIN "compress": ese flag devuelve recordings en formato comprimido
    // que no es compatible con el parser actual.
    meta: "recordings releases releasegroups",
  });

  console.log("[AcoustID] lookup →", {
    duration: params.durationSec,
    fingerprintLen: params.fingerprint.length,
    fingerprintHead: params.fingerprint.slice(0, 40),
  });

  const res = await fetch(LOOKUP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });

  const json = (await res.json()) as AcoustIdLookupJson;

  console.log("[AcoustID] raw response:", JSON.stringify(json, null, 2));

  return json;
}