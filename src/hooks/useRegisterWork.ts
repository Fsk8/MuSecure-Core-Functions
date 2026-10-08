/**
 * MuSecure – hooks/useRegisterWork.ts
 *
 * Estrategia definitiva para embedded wallets + MetaMask en Privy:
 * - NO usar useSendTransaction() → causa "Recovery method not supported"
 * - NO usar window.ethereum → rompe con embedded wallets
 * - SÍ usar getProvider() de useWallet() → BrowserProvider(eip1193) de ethers v6
 *
 * Por qué BrowserProvider funciona y useSendTransaction no:
 * - useSendTransaction() de Privy usa un path interno que no soporta
 * eth_signTransaction estándar en embedded wallets.
 * - BrowserProvider + send("eth_sendTransaction") usa el estándar directo
 * que SÍ está soportado en todos los tipos de wallet de Privy.
 */

import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { CHAIN, RPC_URL } from "@/lib/chain";

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
  "idle":                 "",
  "checking-duplicate":   "Verificando registro previo...",
  "requesting-signature": "Solicitando firma al backend...",
  "waiting-wallet":       "Confirma en tu wallet...",
  "confirming":           `Confirmando en ${CHAIN.name}...`,
  "done":                 "¡Registro exitoso!",
  "error":                "Error en el proceso",
};

export function useRegisterWork() {
  const [state, setState] = useState<RegisterState>({ step: "idle", message: "" });
  const { getProvider, address, isReady } = useWallet();

  const set = (step: RegisterStep, extra?: Partial<RegisterState>) =>
    setState(prev => ({ ...prev, step, message: STEP_MESSAGES[step], ...extra }));

  const registerWork = useCallback(async (input: {
    fingerprintHash: string;
    ipfsCid: string;
    authenticityScore: number;
    soulbound: boolean;
  }): Promise<RegisterResult> => {
    const registryAddress = import.meta.env.VITE_REGISTRY_ADDRESS as string;
    const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? "";
    const rpcUrl = RPC_URL;

    try {
      if (!registryAddress) throw new Error("Falta VITE_REGISTRY_ADDRESS en .env");
      if (!isReady || !getProvider) throw new Error("Wallet no disponible. Reconecta tu cuenta.");

      let cleanHash = input.fingerprintHash;
      if (!cleanHash.startsWith("0x")) cleanHash = "0x" + cleanHash;

      // ── 1. Verificar duplicado (read-only, RPC público) ───────────────────
      // Usamos JsonRpcProvider para la lectura — más rápido y sin permisos de wallet
      set("checking-duplicate");
      const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      const registryRead = new ethers.Contract(registryAddress, REGISTRY_ABI, rpcProvider);
      const exists = await registryRead.workExists(cleanHash);
      if (exists) throw new Error("Esta huella ya está registrada en MuSecure.");

      // ── 2. Firma del backend ──────────────────────────────────────────────
      set("requesting-signature");
      const sigRes = await fetch(`${backendUrl}/api/sign-music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprintHash: cleanHash,
          score: input.authenticityScore,
          ipfsCid: input.ipfsCid,
          soulbound: input.soulbound,
          userAddress: address,
          chainId: CHAIN.id,
        }),
      });

      if (!sigRes.ok) {
        const txt = await sigRes.text().catch(() => sigRes.statusText);
        throw new Error(`Backend ${sigRes.status}: ${txt}`);
      }
      const sigData = await sigRes.json();
      if (!sigData.success) throw new Error(sigData.error ?? "Falla en firma del backend");

      // ── 3. Obtener provider de Privy ────────────────────────────────────────
      // IMPORTANTE: Separamos lectura de firma para evitar el error NETWORK_ERROR.
      // El provider de Privy usa rpc.privy.systems que puede estar bloqueado por CSP.
      // Solución: usamos rpcProvider (público) para getNetwork/getFeeData,
      // y el provider de Privy SOLO para enviar la tx bruta.
      set("waiting-wallet");
      const privyProvider = await getProvider();

      // getNetwork y getFeeData desde el RPC público — no pasa por rpc.privy.systems
      const network = await rpcProvider.getNetwork();
      if (network.chainId.toString() !== String(CHAIN.id)) {
        throw new Error(`El RPC configurado no es ${CHAIN.name} (chainId: ${CHAIN.id}).`);
      }

      // La wallet embebida/externa debe estar en la red correcta antes de enviar.
      try {
        await privyProvider.send("wallet_switchEthereumChain", [{ chainId: ethers.toBeHex(CHAIN.id) }]);
      } catch (e) {
        console.warn("[RegisterWork] switchChain falló (se continúa):", e);
      }

      const feeData = await rpcProvider.getFeeData();
      const maxFeePerGas = (feeData.maxFeePerGas! * 130n) / 100n;
      const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas! * 130n) / 100n;

      // ── 4. Encodear calldata y enviar via eth_sendTransaction directo ─────
      // provider.send("eth_sendTransaction") bypasea el handleSendTransaction
      // de Privy donde vive el bug "Recovery method not supported".
      const iface = new ethers.Interface(REGISTRY_ABI);
      const calldata = iface.encodeFunctionData("registerWork", [
        cleanHash,
        input.ipfsCid,
        BigInt(input.authenticityScore),
        input.soulbound,
        sigData.signature,
      ]);

      // En Monad el cobro se calcula sobre el gas LIMIT (no sobre el gas usado),
      // así que un límite fijo y holgado (600k) se paga completo. Se estima y se
      // aplica un margen; 600k queda solo como respaldo si la estimación falla.
      let gasLimit = 600_000n;
      try {
        const est = await rpcProvider.estimateGas({ from: address, to: registryAddress, data: calldata });
        gasLimit = (est * 130n) / 100n;
      } catch (e: any) {
        if (e?.code === "CALL_EXCEPTION" || /revert/i.test(String(e?.message))) {
          throw new Error(`El contrato rechazó la transacción: ${e?.reason ?? e?.shortMessage ?? "revert"}`);
        }
      }

      // MEJORA: Usamos ethers.toBeHex() para garantizar que los valores hex 
      // sean estrictamente válidos para el protocolo RPC.
      const txHash: string = await privyProvider.send("eth_sendTransaction", [{
        from: address,
        to: registryAddress,
        data: calldata,
        gas: ethers.toBeHex(gasLimit),
        maxFeePerGas: ethers.toBeHex(maxFeePerGas),
        maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
      }]);

      if (!txHash) throw new Error("No se recibió hash de transacción.");

      // ── 5. Esperar confirmación via RPC público ───────────────────────────
      set("confirming", { txHash });
      const receipt = await rpcProvider.waitForTransaction(txHash, 1, 120_000);
      if (!receipt) throw new Error("La transacción no se confirmó en 2 minutos.");
      if (receipt.status === 0) throw new Error("La transacción fue revertida por el contrato.");

      let tokenId = 0;
      for (const log of receipt.logs ?? []) {
        try {
          const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed?.name === "WorkRegistered") {
            tokenId = Number(parsed.args.tokenId);
          }
        } catch {}
      }

      const result = { txHash, tokenId };
      set("done", result);
      return result;

    } catch (err: any) {
      console.error("[RegisterWork] Error:", err);
      let msg = err.reason ?? err.error?.message ?? err.message ?? "Error desconocido";

      // Mensajes amigables para errores comunes
      if (msg.toLowerCase().includes("user rejected") || msg.includes("4001")) {
        msg = "Transacción cancelada por el usuario.";
      } else if (msg.toLowerCase().includes("insufficient funds")) {
        msg = `Fondos insuficientes para el gas. Pide ${CHAIN.symbol} de prueba abajo.`;
      } else if (msg.includes("recovery") || msg.includes("Recovery")) {
        // Si aparece este error, es un bug de compatibilidad de Privy
        msg = "Error de wallet. Intenta cerrar sesión y volver a conectar.";
      }

      set("error", { error: msg });
      throw new Error(msg);
    }
  }, [getProvider, address, isReady]);

  const reset = useCallback(() => setState({ step: "idle", message: "" }), []);
  return { registerWork, state, reset };
}