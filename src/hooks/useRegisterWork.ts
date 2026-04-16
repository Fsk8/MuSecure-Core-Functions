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
  idle: "",
  "checking-duplicate": "Verificando registro previo...",
  "requesting-signature": "Solicitando firma...",
  "waiting-wallet": "Confirma la transacción...",
  confirming: "Confirmando en blockchain...",
  done: "¡Obra protegida!",
  error: "Error",
};

export function useRegisterWork() {
  const [state, setState] = useState<RegisterState>({ step: "idle", message: "" });
  const { getProvider, address } = useWallet();

  const set = (step: RegisterStep, extra?: Partial<RegisterState>) =>
    setState((prev) => ({ ...prev, step, message: STEP_MESSAGES[step], ...extra }));

  const registerWork = useCallback(async (input: {
    fingerprintHash: string;
    ipfsCid: string;
    authenticityScore: number;
    soulbound: boolean;
  }): Promise<RegisterResult> => {
    try {
      if (!getProvider || !address) {
        throw new Error("Wallet no lista");
      }

      const registryAddress = import.meta.env.VITE_REGISTRY_ADDRESS;
      const backendUrl = import.meta.env.VITE_BACKEND_URL;

      // 👇 IMPORTANTE: provider limpio
      const provider = await getProvider();
      const signer = await provider.getSigner();

      const registry = new ethers.Contract(
        registryAddress,
        REGISTRY_ABI,
        signer
      );

      let cleanHash = input.fingerprintHash;
      if (!cleanHash.startsWith("0x")) cleanHash = "0x" + cleanHash;

      set("checking-duplicate");
      const exists = await registry.workExists(cleanHash);
      if (exists) throw new Error("Ya registrado");

      set("requesting-signature");

      const res = await fetch(`${backendUrl}/api/sign-music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprintHash: cleanHash,
          score: input.authenticityScore,
          userAddress: address,
          chainId: 421614,
        }),
      });

      const sig = await res.json();
      if (!sig.success) throw new Error("Error backend");

      set("waiting-wallet");

      // 👇 CLAVE: esto ahora usa ethers directo (no Privy flow)
      const tx = await registry.registerWork(
        cleanHash,
        input.ipfsCid,
        BigInt(input.authenticityScore),
        input.soulbound,
        sig.signature
      );

      set("confirming", { txHash: tx.hash });

      const receipt = await tx.wait();

      let tokenId = 0;
      const iface = new ethers.Interface(REGISTRY_ABI);

      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "WorkRegistered") {
            tokenId = Number(parsed.args.tokenId);
          }
        } catch {}
      }

      set("done", { txHash: tx.hash, tokenId });

      return { txHash: tx.hash, tokenId };

    } catch (err: any) {
      console.error(err);
      set("error", { error: err.message });
      throw err;
    }
  }, [getProvider, address]);

  return { registerWork, state };
}