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
            resolve(payload);
            break;

          case "ERROR":
            worker.removeEventListener("message", handleMessage);
            reject(new Error(payload.message));
            break;
        }
      };

      worker.addEventListener("message", handleMessage);

      const msg: WorkerInMessage = {
        type: "GENERATE_FINGERPRINT",
        payload: { file },
      };
      worker.postMessage(msg);
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}