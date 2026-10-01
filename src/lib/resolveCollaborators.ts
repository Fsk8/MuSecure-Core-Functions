/**
 * MuSecure – lib/resolveCollaborators.ts
 *
 * Cliente del endpoint serverless /api/resolve-collaborators.
 * Devuelve la dirección de la Embedded Wallet de Privy (pregenerada) de cada
 * correo, sin que el colaborador haya iniciado sesión.
 */

export interface ResolvedCollaborator {
  email: string;
  address: string;
}

export interface FailedCollaborator {
  email: string;
  reason: string;
}

export interface ResolveResult {
  collaborators: ResolvedCollaborator[];
  failed: FailedCollaborator[];
}

/**
 * @param idToken Identity token de Privy (hook `useIdentityToken`). Requiere activar
 *                "Return user data in an identity token" en el Dashboard de Privy.
 */
export async function resolveCollaborators(
  idToken: string | null | undefined,
  emails: string[],
): Promise<ResolveResult> {
  if (!idToken) {
    throw new Error("No hay identity token de Privy. Cierra sesión, vuelve a entrar e inténtalo de nuevo.");
  }

  const res = await fetch("/api/resolve-collaborators", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, emails }),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // Típico cuando /api no existe (pnpm dev de Vite) o un rewrite de SPA captura la ruta.
    throw new Error(
      `El endpoint no devolvió JSON (status ${res.status}). ¿Estás usando "vercel dev" o un deploy con la función publicada?`,
    );
  }

  if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
  return data as ResolveResult;
}