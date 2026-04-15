/**
 * MuSecure – hooks/useRegisterWork.ts
 *
 * Usa useWallet().getProvider() en lugar de window.ethereum.
 * Funciona transparentemente con embedded wallets (email/Google)
 * y wallets externas (MetaMask/Rabby) sin distinción.
 */

import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";

export type RegisterStep =
  | "idle"
  | "checking-duplicate"
  | "requesting-signature"
  | "waiting-wallet"
  | "confirming"
  | "done"
  | "error";

export interface RegisterState {
  step: RegisterStep;
  message: string;
  txHash?: string;
  tokenId?: number;
  error?: string;
}

export interface RegisterResult {
  txHash: string;
  tokenId: number;
}

const REGISTRY_ABI = [
  "function workExists(bytes32 fingerprintHash) view returns (bool)",
  "function registerWork(bytes32 fingerprintHash, string ipfsCid, uint256 authenticityScore, bool soulbound, bytes scoreSig) payable returns (uint256)",
  "event WorkRegistered(address indexed author, bytes32 indexed fingerprintHash, string ipfsCid, uint256 authenticityScore, uint8 riskLevel, uint256 tokenId, uint256 timestamp)"
];

const STEP_MESSAGES: Record<RegisterStep, string> = {
  "idle":                  "",
  "checking-duplicate":    "Verificando registro previo...",
  "requesting-signature":  "Solicitando firma al backend...",
  "waiting-wallet":        "Confirma en tu wallet...",
  "confirming":            "Confirmando en Arbitrum Sepolia...",
  "done":                  "¡Registro exitoso!",
  "error":                 "Error en el proceso",
};

export function useRegisterWork() {
  const [state, setState] = useState<RegisterState>({ step: "idle", message: "" });

  // getProvider() usa useWallets internamente — funciona con cualquier tipo de wallet
  const { getProvider, address } = useWallet();

  const set = (step: RegisterStep, extra?: Partial<RegisterState>) =>
    setState(prev => ({ ...prev, step, message: STEP_MESSAGES[step], ...extra }));

  const registerWork = useCallback(async (input: {
    fingerprintHash: string;
    ipfsCid: string;
    authenticityScore: number;
    soulbound: boolean;
  }): Promise<RegisterResult> => {
    try {
      const registryAddress = import.meta.env.VITE_REGISTRY_ADDRESS as string;
      const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? "";

      if (!registryAddress) throw new Error("Falta VITE_REGISTRY_ADDRESS en .env");
      if (!getProvider) throw new Error("No hay wallet conectada. Inicia sesión primero.");

      // ── Obtener provider y signer desde Privy ────────────────────────────
      // getProvider() usa wallet.getEthereumProvider() internamente,
      // lo que funciona igual para embedded wallets y MetaMask/Rabby.
      const provider = await getProvider();
      const network = await provider.getNetwork();

      if (network.chainId.toString() !== "421614") {
        throw new Error("Cambia tu wallet a Arbitrum Sepolia (421614).");
      }

      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

      let cleanHash = input.fingerprintHash;
      if (!cleanHash.startsWith("0x")) cleanHash = "0x" + cleanHash;

      // 1. Verificar duplicado
      set("checking-duplicate");
      const exists = await registry.workExists(cleanHash);
      if (exists) throw new Error("Esta huella ya está registrada en MuSecure.");

      // 2. Firma del backend
      set("requesting-signature");
      const sigRes = await fetch(`${backendUrl}/api/sign-music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprintHash: cleanHash,
          score: input.authenticityScore,
          userAddress,
          chainId: Number(network.chainId),
        }),
      });

      if (!sigRes.ok) {
        const txt = await sigRes.text();
        throw new Error(`Backend error ${sigRes.status}: ${txt}`);
      }

      const sigData = await sigRes.json();
      if (!sigData.success) throw new Error(sigData.error ?? "Falla en firma del backend");

      // 3. Enviar transacción
      set("waiting-wallet");
      const feeData = await provider.getFeeData();
      const maxFeePerGas = (feeData.maxFeePerGas! * 130n) / 100n;
      const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas! * 130n) / 100n;

      const tx = await registry.registerWork(
        cleanHash,
        input.ipfsCid,
        BigInt(input.authenticityScore),
        input.soulbound,
        sigData.signature,
        { maxFeePerGas, maxPriorityFeePerGas, gasLimit: 600000n }
      );

      // 4. Esperar confirmación
      set("confirming", { txHash: tx.hash });
      const receipt = await tx.wait(1);

      let tokenId = 0;
      const iface = new ethers.Interface(REGISTRY_ABI);
      for (const log of receipt?.logs ?? []) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "WorkRegistered") {
            tokenId = Number(parsed.args.tokenId);
          }
        } catch {}
      }

      const result = { txHash: tx.hash, tokenId };
      set("done", result);
      return result;

    } catch (err: any) {
      console.error("[RegisterWork] Error:", err);
      const msg = err.reason ?? err.error?.message ?? err.message ?? "Error desconocido";
      set("error", { error: msg });
      throw err;
    }
  }, [getProvider]);

  const reset = useCallback(() => {
    setState({ step: "idle", message: "" });
  }, []);

  return { registerWork, state, reset };
}