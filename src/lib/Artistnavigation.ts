/**
 * MuSecure – lib/artistNavigation.ts
 *
 * Navegación liviana a "páginas" de perfil de artista vía query param
 * (?artist=0x...), sin agregar react-router. pushState no dispara "popstate"
 * por sí solo, así que además emitimos un evento custom para que App.tsx
 * pueda reaccionar en la misma pestaña.
 */

const NAV_EVENT = "musecure:navigate";
const PARAM = "artist";

export function getArtistFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM);
}

export function goToArtistProfile(address: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, address);
  window.history.pushState({}, "", url.toString());
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function exitArtistProfile(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  window.history.pushState({}, "", url.toString());
  window.dispatchEvent(new Event(NAV_EVENT));
}

/** Suscribe a cambios de navegación (back/forward del navegador + nuestros pushState). */
export function onArtistNavigate(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(NAV_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(NAV_EVENT, callback);
  };
}