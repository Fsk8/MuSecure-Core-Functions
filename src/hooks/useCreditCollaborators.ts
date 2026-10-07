/**
 * MuSecure – hooks/useCreditCollaborators.ts
 *
 * Segunda transacción del flujo de co-autores:
 *   1. /api/resolve-collaborators → wallet embebida (pregenerada) de cada correo
 *   2. MuSecureCredits.creditCollaborators(fingerprintHash, wallets[], bps[])
 *
 * Mismo patrón que useRegisterWork: lecturas y gas por RPC público, y el provider
 * de Privy SOLO para enviar la tx (eth_sendTransaction directo).
 *
 * Los créditos son inmutables on-chain (una sola vez por obra), así que si algún
 * correo no se puede resolver NO se acredita parcialmente: se aborta y se puede
 * reintentar (resolver es idempotente).
 */

import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useIdentityToken } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";
import { resolveCollaborators } from "@/lib/resolveCollaborators";

export type CreditStep =
  | "idle"
  | "resolving"
  | "checking"
  | "waiting-wallet"
  | "confirming"
  | "done"
  | "error";

export interface CreditState {
  step: CreditStep;
  message: string;
  txHash?: string;
  error?: string;
}

export interface CreditInput {
  /** Misma huella que se usó en registerWork (0x + 64 hex). */
  fingerprintHash: string;
  collaborators: { email: string; sharePercentage: number }[];
}

export interface CreditResult {
  txHash: string;
  credited: { email: string; address: string; bps: number }[];
}

const CREDITS_ABI = [
  "function hasCredits(bytes32 fingerprintHash) view returns (bool)",
  "function creditCollaborators(bytes32 fingerprintHash, address[] collaborators, uint16[] bps)",
  "event CollaboratorCredited(bytes32 indexed fingerprintHash, address indexed author, address indexed collaborator, uint16 bps)",
];

const STEP_MESSAGES: Record<CreditStep, string> = {
  idle: "",
  resolving: "Preparando las wallets de tus colaboradores...",
  checking: "Verificando créditos previos...",
  "waiting-wallet": "Confirmando en tu wallet...",
  confirming: "Confirmando en Arbitrum Sepolia...",
  done: "¡Co-autores acreditados on-chain!",
  error: "Error en el proceso",
};

export function useCreditCollaborators() {
  const [state, setState] = useState<CreditState>({ step: "idle", message: "" });
  const { getProvider, address, isReady } = useWallet();
  const { identityToken } = useIdentityToken();

  const set = (step: CreditStep, extra?: Partial<CreditState>) =>
    setState((prev) => ({ ...prev, step, message: STEP_MESSAGES[step], error: undefined, ...extra }));

  const creditCollaborators = useCallback(
    async (input: CreditInput): Promise<CreditResult> => {
      const creditsAddress = import.meta.env.VITE_CREDITS_ADDRESS as string;
      const rpcUrl =
        (import.meta.env.VITE_ARBITRUM_RPC as string) ?? "https://sepolia-rollup.arbitrum.io/rpc";

      try {
        if (!creditsAddress) throw new Error("Falta VITE_CREDITS_ADDRESS en .env");
        if (!isReady || !getProvider || !address) throw new Error("Wallet no disponible. Reconecta tu cuenta.");
        if (input.collaborators.length === 0) throw new Error("No hay colaboradores que acreditar.");

        const hash = input.fingerprintHash.startsWith("0x")
          ? input.fingerprintHash
          : `0x${input.fingerprintHash}`;

        // ── 1. Correo → wallet embebida de Privy (pregenerada) ────────────────
        set("resolving");
        const resolved = await resolveCollaborators(
          identityToken,
          input.collaborators.map((c) => c.email),
        );
        if (resolved.failed.length > 0) {
          throw new Error(
            `No se pudo preparar la wallet de: ${resolved.failed.map((f) => f.email).join(", ")}. ` +
              "Nada se acreditó (es inmutable); inténtalo de nuevo.",
          );
        }

        const addrByEmail = new Map(resolved.collaborators.map((c) => [c.email.toLowerCase(), c.address]));
        const rows = input.collaborators.map((c) => {
          const wallet = addrByEmail.get(c.email.trim().toLowerCase());
          if (!wallet) throw new Error(`Sin wallet para ${c.email}.`);
          return {
            email: c.email.trim().toLowerCase(),
            address: ethers.getAddress(wallet),
            bps: Math.round(c.sharePercentage * 100),
          };
        });

        // Validaciones que el contrato también aplica (revertir cuesta gas y es confuso).
        const seen = new Set<string>();
        for (const r of rows) {
          const key = r.address.toLowerCase();
          if (key === address.toLowerCase()) throw new Error(`${r.email} resolvió a tu propia wallet.`);
          if (seen.has(key)) throw new Error("Dos correos resolvieron a la misma wallet.");
          seen.add(key);
          if (!Number.isInteger(r.bps) || r.bps <= 0 || r.bps > 10_000) throw new Error(`Porcentaje inválido (${r.email}).`);
        }
        if (rows.reduce((s, r) => s + r.bps, 0) > 10_000) throw new Error("La suma de participaciones supera el 100%.");

        // ── 2. ¿Ya se acreditó esta obra? (el contrato solo lo permite una vez) ──
        set("checking");
        const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
        const network = await rpcProvider.getNetwork();
        if (network.chainId.toString() !== "421614") throw new Error("RPC en una red distinta a Arbitrum Sepolia.");

        const read = new ethers.Contract(creditsAddress, CREDITS_ABI, rpcProvider);
        if (await read.hasCredits(hash)) throw new Error("Esta obra ya tiene co-autores acreditados.");

        // ── 3. Calldata, gas y envío ──────────────────────────────────────────
        const iface = new ethers.Interface(CREDITS_ABI);
        const calldata = iface.encodeFunctionData("creditCollaborators", [
          hash,
          rows.map((r) => r.address),
          rows.map((r) => r.bps),
        ]);

        // estimateGas simula la tx: si el contrato revertiría (no eres el autor, la obra
        // no existe en el Registry…) lo descubrimos aquí y no gastamos gas.
        let gas = 350_000n + 150_000n * BigInt(rows.length);
        try {
          const est = await rpcProvider.estimateGas({ from: address, to: creditsAddress, data: calldata });
          gas = (est * 150n) / 100n;
        } catch (e: any) {
          if (e?.code === "CALL_EXCEPTION" || /revert/i.test(String(e?.message))) {
            const reason = e?.reason ?? e?.shortMessage ?? e?.message ?? "revert";
            throw new Error(
              /not the author/i.test(reason)
                ? "Solo el autor de la obra puede acreditar co-autores (¿otra wallet?)."
                : `El contrato rechazó la transacción: ${reason}`,
            );
          }
          // Otro error (RPC caído, etc.): se usa el gas fijo de arriba.
        }

        const feeData = await rpcProvider.getFeeData();
        const maxFeePerGas = (feeData.maxFeePerGas! * 130n) / 100n;
        const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas! * 130n) / 100n;

        set("waiting-wallet");
        const privyProvider = await getProvider();
        const txHash: string = await privyProvider.send("eth_sendTransaction", [
          {
            from: address,
            to: creditsAddress,
            data: calldata,
            gas: ethers.toBeHex(gas),
            maxFeePerGas: ethers.toBeHex(maxFeePerGas),
            maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
          },
        ]);
        if (!txHash) throw new Error("No se recibió hash de transacción.");

        // ── 4. Confirmación ───────────────────────────────────────────────────
        set("confirming", { txHash });
        const receipt = await rpcProvider.waitForTransaction(txHash, 1, 120_000);
        if (!receipt) throw new Error("La transacción no se confirmó en 2 minutos.");
        if (receipt.status === 0) throw new Error("La transacción fue revertida por el contrato.");

        set("done", { txHash });
        return { txHash, credited: rows };
      } catch (err: any) {
        console.error("[CreditCollaborators] Error:", err);
        let msg = err.reason ?? err.error?.message ?? err.message ?? "Error desconocido";
        if (msg.toLowerCase().includes("user rejected") || msg.includes("4001")) {
          msg = "Transacción cancelada por el usuario.";
        } else if (msg.toLowerCase().includes("insufficient funds")) {
          msg = "Fondos insuficientes para el gas.";
        }
        set("error", { error: msg });
        throw new Error(msg);
      }
    },
    [getProvider, address, isReady, identityToken],
  );

  const reset = useCallback(() => setState({ step: "idle", message: "" }), []);
  return { creditCollaborators, state, reset };
}