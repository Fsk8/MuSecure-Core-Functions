/**
 * Genera fingerprint Chromaprint/AcoustID. Chromaprint se importa con import()
 * para no bloquear el arranque de la app (el paquete usa top-level await + WASM).
 */

function createAudioContext(): AudioContext {
  const AnyWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return new (AnyWindow.AudioContext || AnyWindow.webkitAudioContext!)();
}

/**
 * @returns fingerprint para el parámetro `fingerprint` de AcoustID y duración en segundos (entero).
 */
export async function generateChromaprintForAcoustId(
  file: File
): Promise<{ fingerprint: string; durationSec: number }> {
  const buf = await file.arrayBuffer();
  const forDecode = buf.slice(0);
  const forChromaprint = buf.slice(0);

  const ac = createAudioContext();
  let durationSec = 1;
  try {
    const decoded = await ac.decodeAudioData(forDecode);
    durationSec = Math.max(1, Math.round(decoded.duration));
  } finally {
    await ac.close();
  }

  const maxDuration = Math.min(Math.ceil(durationSec) + 5, 7200);

  const { processAudioFile, ChromaprintAlgorithm } = await import(
    "@unimusic/chromaprint"
  );

  let fingerprint = "";
  for await (const fp of processAudioFile(forChromaprint, {
    maxDuration,
    chunkDuration: 0,
    algorithm: ChromaprintAlgorithm.Default,
    rawOutput: false,
    overlap: false,
  })) {
    fingerprint = fp;
    break;
  }

  if (!fingerprint) {
    throw new Error(
      "No se generó fingerprint Chromaprint. Prueba WAV/MP3/OGG o convierte el audio en el navegador."
    );
  }

  return { fingerprint, durationSec };
}
