function createAudioContext(): AudioContext {
  const AnyWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return new (AnyWindow.AudioContext || AnyWindow.webkitAudioContext!)();
}

export async function generateChromaprintForAcoustId(
  file: File
): Promise<{ fingerprint: string; durationSec: number }> {
  console.log("[Chromaprint] Archivo:", file.name, file.type, file.size + "bytes");

  const buf = await file.arrayBuffer();
  const forDecode = buf.slice(0);
  const forChromaprint = buf.slice(0);

  const ac = createAudioContext();
  let durationSec = 1;
  try {
    const decoded = await ac.decodeAudioData(forDecode);
    durationSec = Math.max(1, Math.round(decoded.duration));
    console.log("[Chromaprint] Duracion:", durationSec, "s");
  } catch (e) {
    console.error("[Chromaprint] Error decodificando:", e);
    throw new Error("No se pudo decodificar el audio: " + (e as Error).message);
  } finally {
    await ac.close();
  }

  const maxDuration = Math.min(Math.ceil(durationSec) + 5, 7200);

  console.log("[Chromaprint] Importando WASM...");
  const { processAudioFile, ChromaprintAlgorithm } = await import("@unimusic/chromaprint");
  console.log("[Chromaprint] WASM cargado OK");

  let fingerprint = "";
  for await (const fp of processAudioFile(forChromaprint, {
    maxDuration,
    chunkDuration: 0,
    algorithm: ChromaprintAlgorithm.Default,
    rawOutput: false,
    overlap: false,
  })) {
    fingerprint = fp as string;
    break;
  }

  if (!fingerprint) throw new Error("Fingerprint vacio. Prueba WAV/MP3/OGG.");

  console.log("[Chromaprint] OK - longitud:", fingerprint.length, "primeros chars:", fingerprint.slice(0, 20));
  return { fingerprint, durationSec };
}