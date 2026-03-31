/**
 * Clave de **aplicación** AcoustID (parámetro `client` en /v2/lookup).
 * Debe crearse en https://acoustid.org/new-application — no es la clave de usuario del perfil.
 */
export function getAcoustIdClientKey(): string {
  const raw = import.meta.env.VITE_ACOUSTID_CLIENT_KEY;
  if (typeof raw !== "string") return "";
  let k = raw.trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  return k.replace(/\r?\n/g, "");
}
