/**
 * MuSecure – AudioFingerprintService
 * Envuelve el Web Worker con una API basada en promesas.
 */

import type {
  WorkerInMessage,
  WorkerOutMessage,
} from "@/workers/audioFingerprint.worker";

export interface FingerprintResult {
  fingerprint: number[];
  sha256: string;
  duration: number;
  fileName: string;
}

export type ProgressCallback = (stage: string, percent: number) => void;

export class AudioFingerprintService {
  private static instance: AudioFingerprintService | null = null;
  private worker: Worker | null = null;

  private constructor() {}

  static getInstance(): AudioFingerprintService {
    if (!AudioFingerprintService.instance) {
      AudioFingerprintService.instance = new AudioFingerprintService();
    }
    return AudioFingerprintService.instance;
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("../workers/audioFingerprint.worker.ts", import.meta.url),
        { type: "module" }
      );
    }
    return this.worker;
  }

  async generateFingerprint(
    file: File,
    onProgress?: ProgressCallback
  ): Promise<FingerprintResult> {
    return new Promise<FingerprintResult>((resolve, reject) => {
      const worker = this.getWorker();

      const handleMessage = (event: MessageEvent<WorkerOutMessage>) => {
        const { type, payload } = event.data;

        switch (type) {
          case "PROGRESS":
            onProgress?.(payload.stage, payload.percent);
            break;

          case "FINGERPRINT_RESULT":
            worker.removeEventListener("message", handleMessage);
            worker.removeEventListener("error", handleError);
            resolve(payload);
            break;

          case "ERROR":
            worker.removeEventListener("message", handleMessage);
            worker.removeEventListener("error", handleError);
            reject(new Error(payload.message));
            break;
        }
      };

      const handleError = (err: ErrorEvent) => {
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        reject(new Error(`Worker error: ${err.message}`));
      };

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);

      const msg: WorkerInMessage = {
        type: "GENERATE_FINGERPRINT",
        payload: { file },
      };
      worker.postMessage(msg);
    });
  }

  /**
   * Similitud 0–1 por Hamming normalizado sobre enteros 32-bit.
   * Umbral orientativo para duplicados: > ~0.65 según tus pruebas.
   */
  static similarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;
    let diffBits = 0;
    for (let i = 0; i < len; i++) {
      let xor = (a[i] ^ b[i]) >>> 0;
      xor = xor - ((xor >>> 1) & 0x55555555);
      xor = (xor & 0x33333333) + ((xor >>> 2) & 0x33333333);
      xor = (((xor + (xor >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
      diffBits += xor;
    }
    const totalBits = len * 32;
    return 1 - diffBits / totalBits;
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
