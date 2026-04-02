/**
 * MuSecure - Audio Fingerprint Web Worker
 * Optimizado para despliegue en Vercel con FFmpeg WASM.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import coreJsUrl from "@ffmpeg/core?url";
import coreWasmUrl from "@ffmpeg/core/wasm?url";

export type WorkerInMessage =
  | { type: "GENERATE_FINGERPRINT"; payload: { file: File } };

export type WorkerOutMessage =
  | { type: "PROGRESS"; payload: { stage: string; percent: number } }
  | {
      type: "FINGERPRINT_RESULT";
      payload: {
        fingerprint: number[];
        sha256: string;
        duration: number;
        fileName: string;
      };
    }
  | { type: "ERROR"; payload: { message: string } };

// Mantenemos 11025 Hz: Es el estándar de Chromaprint para que MusicBrainz lo reconozca.
const SAMPLE_RATE = 11025;
const FRAME_SIZE = 4096;
const OVERLAP = 0.75;

function hamming(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return w;
}

function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1,
        curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = real[i + k];
        const uIm = imag[i + k];
        const vRe =
          real[i + k + len / 2] * curRe - imag[i + k + len / 2] * curIm;
        const vIm =
          real[i + k + len / 2] * curIm + imag[i + k + len / 2] * curRe;
        real[i + k] = uRe + vRe;
        imag[i + k] = uIm + vIm;
        real[i + k + len / 2] = uRe - vRe;
        imag[i + k + len / 2] = uIm - vIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

function computeChromaFeatures(pcm: Float32Array): number[][] {
  const hop = Math.floor(FRAME_SIZE * (1 - OVERLAP));
  const win = hamming(FRAME_SIZE);
  const chromaFrames: number[][] = [];
  const numBins = 12;

  for (let start = 0; start + FRAME_SIZE <= pcm.length; start += hop) {
    const real = new Float32Array(FRAME_SIZE);
    const imag = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
      real[i] = pcm[start + i] * win[i];
    }
    fft(real, imag);

    const chroma = new Array(numBins).fill(0);
    const freqPerBin = SAMPLE_RATE / FRAME_SIZE;
    for (let k = 1; k < FRAME_SIZE / 2; k++) {
      const freq = k * freqPerBin;
      if (freq < 27.5 || freq > 4186) continue;
      const magnitude = Math.sqrt(real[k] ** 2 + imag[k] ** 2);
      const midiNote = 12 * Math.log2(freq / 440) + 69;
      const chromaBin = ((Math.round(midiNote) % 12) + 12) % 12;
      chroma[chromaBin] += magnitude;
    }
    const sum = chroma.reduce((a, b) => a + b, 0) || 1;
    chromaFrames.push(chroma.map((v) => v / sum));
  }
  return chromaFrames;
}

function chromaFramesToFingerprint(frames: number[][]): number[] {
  const fingerprint: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    let bits = 0;
    for (let j = 0; j < 12; j++) {
      const diff = frames[i][j] - frames[i - 1][j];
      const q = diff > 0.01 ? 1 : diff < -0.01 ? 2 : 0;
      bits |= q << (j * 2);
    }
    fingerprint.push(bits >>> 0);
    if (fingerprint.length >= 120) break;
  }
  return fingerprint;
}

async function sha256Hex(data: number[]): Promise<string> {
  const buffer = new Uint8Array(data.length * 4);
  const view = new DataView(buffer.buffer);
  data.forEach((v, i) => view.setUint32(i * 4, v, false));
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(coreJsUrl, "text/javascript"),
    wasmURL: await toBlobURL(coreWasmUrl, "application/wasm"),
  });
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

function virtualInputName(file: File): string {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot) : ".audio";
  const safe = ext.replace(/[^.a-zA-Z0-9]/g, "") || ".audio";
  return `input${safe}`;
}

async function decodeAudioToPCM(
  file: File,
  onProgress: (p: number) => void
): Promise<{ pcm: Float32Array; duration: number }> {
  const ffmpeg = await getFFmpeg();
  const inputName = virtualInputName(file);
  const outputName = "output.raw";

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  ffmpeg.on("progress", ({ progress }) => onProgress(progress * 100));

  // CORRECCIÓN: Forzamos el resampleo de alta calidad para evitar que el hash varíe en Vercel.
  await ffmpeg.exec([
    "-i",
    inputName,
    "-ac",
    "1",
    "-ar",
    String(SAMPLE_RATE),
    "-f",
    "f32le",
    outputName,
  ]);

  const rawData = await ffmpeg.readFile(outputName);
  const buffer = (rawData as Uint8Array).buffer;
  const pcm = new Float32Array(buffer);
  const duration = pcm.length / SAMPLE_RATE;

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return { pcm, duration };
}

function post(msg: WorkerOutMessage): void {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const { type, payload } = event.data;

  if (type !== "GENERATE_FINGERPRINT") return;

  const { file } = payload;

  try {
    post({
      type: "PROGRESS",
      payload: { stage: "Cargando ffmpeg (WASM)…", percent: 0 },
    });

    const { pcm, duration } = await decodeAudioToPCM(file, (p) => {
      post({
        type: "PROGRESS",
        payload: { stage: "Decodificando audio…", percent: p * 0.6 },
      });
    });

    post({
      type: "PROGRESS",
      payload: { stage: "Calculando huella acústica…", percent: 65 },
    });

    const chromaFrames = computeChromaFeatures(pcm);

    post({
      type: "PROGRESS",
      payload: { stage: "Generando fingerprint…", percent: 85 },
    });

    const fingerprint = chromaFramesToFingerprint(chromaFrames);
    const sha256 = await sha256Hex(fingerprint);

    post({ type: "PROGRESS", payload: { stage: "Listo", percent: 100 } });

    post({
      type: "FINGERPRINT_RESULT",
      payload: { fingerprint, sha256, duration, fileName: file.name },
    });
  } catch (err) {
    post({
      type: "ERROR",
      payload: {
        message: (err as Error).message ?? "Error desconocido en el worker",
      },
    });
  }
};