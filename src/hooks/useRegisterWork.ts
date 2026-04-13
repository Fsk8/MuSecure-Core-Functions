import { useState, useCallback } from "react";
import { ethers } from "ethers";

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
  "idle": "",
  "checking-duplicate": "Verificando registro previo...",
  "requesting-signature": "Solicitando firma al backend...",
  "waiting-wallet": "Confirma en tu MetaMask...",
  "confirming": "Confirmando en Arbitrum Sepolia...",
  "done": "¡Registro exitoso!",
  "error": "Error en el proceso",
};

export function useRegisterWork() {
  const [state, setState] = useState<RegisterState>({ step: "idle", message: "" });

  const set = (step: RegisterStep, extra?: Partial<RegisterState>) =>
    setState(prev => ({ ...prev, step, message: STEP_MESSAGES[step], ...extra }));

  const registerWork = useCallback(async (input: {
    fingerprintHash: string;
    ipfsCid: string;
    authenticityScore: number;
    soulbound: boolean;
  }): Promise<RegisterResult> => {
    try {
      const registryAddress = import.meta.env.VITE_REGISTRY_ADDRESS;
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "https://tu-backend.vercel.app";

      if (!window.ethereum) throw new Error("MetaMask no detectado");

      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const network = await provider.getNetwork();
      const currentChainId = network.chainId; // Obtenemos el chainId numérico

      if (currentChainId.toString() !== "421614") {
        throw new Error(`Cambia a Arbitrum Sepolia (421614) en MetaMask.`);
      }

      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

      let cleanHash = input.fingerprintHash;
      if (!cleanHash.startsWith("0x")) cleanHash = "0x" + cleanHash;

      // 1. Duplicados
      set("checking-duplicate");
      const exists = await registry.workExists(cleanHash);
      if (exists) throw new Error("Esta huella ya está registrada.");

      // 2. Firma del Backend (ACTUALIZADO: Mandamos todos los parámetros del contrato)
      set("requesting-signature");
      const sigRes = await fetch(`${backendUrl}/api/sign-music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprintHash: cleanHash,
          score: input.authenticityScore,
          ipfsCid: input.ipfsCid,
          soulbound: input.soulbound,
          userAddress: userAddress,
          chainId: Number(currentChainId),
          contractAddress: registryAddress
        }),
      });

      const sigData = await sigRes.json();
      if (!sigData.success) throw new Error(sigData.error || "Falla en firma del backend");

      // 3. Transacción
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
        {
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit: 600000 
        }
      );

      // 4. Confirmación
      set("confirming", { txHash: tx.hash });
      const receipt = await tx.wait(1);

      let tokenId = 0;
      const iface = new ethers.Interface(REGISTRY_ABI);
      receipt?.logs.forEach((log: any) => {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "WorkRegistered") tokenId = Number(parsed.args.tokenId);
        } catch (e) {}
      });

      const res = { txHash: tx.hash, tokenId };
      set("done", res);
      return res;

    } catch (err: any) {
      console.error("🔴 Error MuSecure:", err);
      const msg = err.error?.message || err.reason || err.message || "Error desconocido";
      set("error", { error: msg });
      throw err;
    }
  }, []);

  return { registerWork, state, reset: () => setState({ step: "idle", message: "" }) };
}