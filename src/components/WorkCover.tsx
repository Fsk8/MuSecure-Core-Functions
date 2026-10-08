/**
 * MuSecure – components/WorkCover.tsx
 *
 * Portada de una obra con fallback en cadena:
 *   urls[0] → urls[1] → … → ícono de audífonos
 *
 * Avanza a la siguiente URL si la imagen da error (404/402/HTML de error) o si
 * tarda más de LOAD_TIMEOUT_MS en cargar (gateway IPFS colgado).
 */

import { useEffect, useState } from "react";
import { Headphones } from "lucide-react";

const LOAD_TIMEOUT_MS = 8000;

interface Props {
  /** URLs candidatas, en orden de preferencia. Vacío → solo el ícono. */
  urls?: string[];
  /** Clases de tamaño del contenedor (alto). Por defecto h-40. */
  className?: string;
  tone?: "emerald" | "blue";
  fit?: "cover" | "contain";
}

export function WorkCover({ urls = [], className = "h-40", tone = "emerald", fit = "cover" }: Props) {
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const urlsKey = urls.join("|");
  const src = urls[idx];

  // Si cambia la lista de candidatas, se empieza de nuevo.
  useEffect(() => {
    setIdx(0);
    setLoaded(false);
  }, [urlsKey]);

  // Gateway colgado: si no carga a tiempo, pasa a la siguiente candidata.
  useEffect(() => {
    if (!src || loaded) return;
    const t = setTimeout(() => setIdx((i) => i + 1), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [src, loaded]);

  const wrapper =
    tone === "blue"
      ? "border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-600/5"
      : "border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5";
  const icon = tone === "blue" ? "text-blue-400/50" : "text-emerald-400/50";

  return (
    <div className={`overflow-hidden rounded-xl border ${wrapper}`}>
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setIdx((i) => i + 1)}
          className={`w-full ${className} ${fit === "cover" ? "object-cover" : "object-contain"}`}
        />
      ) : (
        <div className={`flex w-full items-center justify-center ${className}`}>
          <Headphones className={`h-14 w-14 ${icon}`} strokeWidth={1.25} />
        </div>
      )}
    </div>
  );
}