/**
 * MuSecure – hooks/useRegisterWork.ts
 * * SOLUCIÓN DEFINITIVA:
 * 1. Alchemy RPC: Maneja lecturas y esperas para evitar el Rate Limit de MetaMask.
 * 2. Gas Manual: Obtenemos maxFee y priorityFee de Alchemy.
 * 3. Fix Envelope: Formato hexadecimal estricto para evitar error "0x02".
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

const REGISTRY_ABI = [
  "function workExists(bytes32 fingerprintHash) view returns (bool)",
  "function registerWork(bytes32 fingerprintHash, string ipfsCid, uint256 authenticityScore, bool soulbound, bytes scoreSig) payable returns (uint256)",
  "event WorkRegistered(address indexed author, bytes32 indexed fingerprintHash, string ipfsCid, uint256 authenticityScore, uint8 riskLevel, uint256 tokenId, uint256 timestamp)"
];

const STEP_MESSAGES: Record<RegisterStep, string> = {
  "idle": "",
  "checking-duplicate": "Verificando registro previo en blockchain...",
  "requesting-signature": "Generando firma de autenticidad (Backend)...",
  "waiting-wallet": "Confirma la transacción en tu wallet...",
  "confirming": "Procesando registro en Arbitrum Sepolia...",
  "done": "¡Obra protegida exitosamente!",
  "error": "Error en el registro",
};

export function useRegisterWork() {
  const [state, setState] = useState<RegisterState>({ step: "idle", message: "" });
  const { getProvider, address } = useWallet();

  const set = (step: RegisterStep, extra?: Partial<RegisterState>) =>
    setState(prev => ({ ...prev, step, message: STEP_MESSAGES[step], ...extra }));

  const registerWork = useCallback(async (input: {
    fingerprintHash: string;
    ipfsCid: string;
    authenticityScore: number;
    soulbound: boolean;
  }) => {
    try {
      const registryAddress = import.meta.env.VITE_REGISTRY_ADDRESS;
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const alchemyRpc = import.meta.env.VITE_RPC_URL; 

      if (!getProvider || !address) throw new Error("Wallet no conectada");
      if (!alchemyRpc) throw new Error("Falta VITE_RPC_URL en el archivo .env");

      // 1. Configuración de Providers
      const walletProvider = await getProvider();
      const alchemyProvider = new ethers.JsonRpcProvider(alchemyRpc);
      
      const signer = await walletProvider.getSigner();
      const realAddress = await signer.getAddress();
      
      let cleanHash = input.fingerprintHash;
      if (!cleanHash.startsWith("0x")) cleanHash = "0x" + cleanHash;

      // 2. Verificación de duplicados vía Alchemy
      set("checking-duplicate");
      const readRegistry = new ethers.Contract(registryAddress, REGISTRY_ABI, alchemyProvider);
      const exists = await readRegistry.workExists(cleanHash);
      if (exists) throw new Error("Esta obra ya se encuentra registrada en el sistema.");

      // 3. Obtención de firma del Backend
      set("requesting-signature");
      const sigRes = await fetch(`${backendUrl}/api/sign-music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprintHash: cleanHash,
          score: input.authenticityScore,
          userAddress: realAddress,
          chainId: 421614 // Arbitrum Sepolia
        }),
      });

      const sigData = await sigRes.json();
      if (!sigData.success) throw new Error(sigData.error || "Error al obtener la firma del servidor");

      // 4. Preparación de Gas y Transacción
      set("waiting-wallet");

      // Obtenemos los precios actuales del gas desde Alchemy (Bypass Rate Limit de MM)
      const feeData = await alchemyProvider.getFeeData();

      // Formateamos fees asegurando que no sean null
      const maxFee = feeData.maxFeePerGas 
        ? ethers.toBeHex(feeData.maxFeePerGas) 
        : ethers.toBeHex(ethers.parseUnits("0.1", "gwei"));

      const priorityFee = feeData.maxPriorityFeePerGas 
        ? ethers.toBeHex(feeData.maxPriorityFeePerGas) 
        : ethers.toBeHex(ethers.parseUnits("0.01", "gwei"));

      // Encodear la función del contrato
      const txData = readRegistry.interface.encodeFunctionData("registerWork", [
        cleanHash,
        input.ipfsCid,
        BigInt(input.authenticityScore),
        input.soulbound,
        sigData.signature
      ]);

      const txParams = {
        from: realAddress,
        to: registryAddress,
        data: txData,
        gas: ethers.toBeHex(500000), // Gas suficiente para el minting
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: priorityFee,
        type: "0x2" // EIP-1559 estricto
      };

      // 5. Envío directo a la Wallet
      const txHash = await walletProvider.send("eth_sendTransaction", [txParams]);

      set("confirming", { txHash });

      // 6. Esperar confirmación vía Alchemy
      const receipt = await alchemyProvider.waitForTransaction(txHash, 1, 120_000);
      
      if (!receipt || receipt.status === 0) throw new Error("La transacción falló en la blockchain.");

      // 7. Parse de Logs para obtener el TokenID
      let tokenId = 0;
      const iface = new ethers.Interface(REGISTRY_ABI);
      receipt.logs.forEach(log => {
        try {
          const p = iface.parseLog({ topics: [...log.topics], data: log.data });
          if (p?.name === "WorkRegistered") tokenId = Number(p.args.tokenId);
        } catch (e) {
          // Log no relacionado con este evento
        }
      });

      set("done", { txHash, tokenId });
      return { txHash, tokenId };

    } catch (err: any) {
      console.error("[RegisterWork Error]", err);
      
      let errorMessage = err.message || "Error inesperado";
      
      if (errorMessage.includes("rate limited")) {
        errorMessage = "Nodo saturado. Por favor, espera 10 segundos e intenta de nuevo.";
      } else if (errorMessage.includes("user rejected")) {
        errorMessage = "Registro cancelado en la wallet.";
      }

      set("error", { error: errorMessage });
      throw err;
    }
  }, [getProvider, address]);

  const reset = useCallback(() => setState({ step: "idle", message: "" }), []);

  return { registerWork, state, reset };
}