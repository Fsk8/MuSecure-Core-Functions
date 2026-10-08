/**
 * MuSecure – hooks/useLicensingTx.ts
 *
 * Envía setLicensePrice / buyLicense / withdraw con el mismo patrón que
 * useCreditCollaborators: lecturas y gas por RPC, y el provider de Privy SOLO para
 * enviar (eth_sendTransaction). estimateGas simula la tx, así que si el contrato
 * revertiría (precio distinto, ya licenciada, no eres el autor…) se avisa antes de firmar.
 */
import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { CHAIN } from "@/lib/chain";
import { LICENSING_ABI, LICENSING_ADDRESS, normHash, rpc } from "@/lib/licensing";

export type LicensingStep = "idle" | "waiting-wallet" | "confirming" | "done" | "error";
export interface LicensingTxState {
  step: LicensingStep;
  message: string;
  txHash?: string;
  error?: string;
}

const MESSAGES: Record<LicensingStep, string> = {
  idle: "",
  "waiting-wallet": "Confirmando en tu wallet...",
  confirming: `Confirmando en ${CHAIN.name}...`,
  done: "¡Listo!",
  error: "Error en el proceso",
};

const REVERTS: [RegExp, string][] = [
  [/not the author/i, "Solo el autor de la obra puede fijar el precio."],
  [/not for sale/i, "Esta obra no está a la venta."],
  [/wrong payment/i, "El precio cambió. Actualiza la página e inténtalo de nuevo."],
  [/already licensed/i, "Ya tienes una licencia de esta obra."],
  [/nothing to claim/i, "No tienes fondos pendientes por retirar."],
  [/not found/i, "La obra no existe en el Registry."],
];

type Call =
  | { fn: "setLicensePrice"; args: [string, bigint]; value?: undefined }
  | { fn: "buyLicense"; args: [string]; value: bigint }
  | { fn: "withdraw"; args: []; value?: undefined };

export function useLicensingTx() {
  const [state, setState] = useState<LicensingTxState>({ step: "idle", message: "" });
  const { getProvider, address, isReady } = useWallet();

  const set = (step: LicensingStep, extra?: Partial<LicensingTxState>) =>
    setState((p) => ({ ...p, step, message: MESSAGES[step], error: undefined, ...extra }));

  const send = useCallback(
    async (call: Call): Promise<string> => {
      try {
        if (!LICENSING_ADDRESS) throw new Error("Falta VITE_LICENSING_ADDRESS en .env");
        if (!isReady || !getProvider || !address) throw new Error("Wallet no disponible. Reconecta tu cuenta.");

        const args = call.fn === "withdraw" ? [] : [normHash(call.args[0] as string), ...call.args.slice(1)];
        const iface = new ethers.Interface(LICENSING_ABI);
        const data = iface.encodeFunctionData(call.fn, args);
        const value = call.value ?? 0n;

        const provider = rpc();
        const net = await provider.getNetwork();
        if (net.chainId.toString() !== String(CHAIN.id)) throw new Error(`RPC en una red distinta a ${CHAIN.name}.`);

        if (value > 0n) {
          const bal = await provider.getBalance(address);
          if (bal < value) throw new Error(`Saldo insuficiente: necesitas más ${CHAIN.symbol} (pide en la faucet).`);
        }

        // Simulación: aquí aparecen los reverts con motivo, sin gastar gas.
        let gas = 400_000n;
        try {
          const est = await provider.estimateGas({ from: address, to: LICENSING_ADDRESS, data, value });
          gas = (est * 150n) / 100n;
        } catch (e: any) {
          const text = `${e?.reason ?? ""} ${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
          const known = REVERTS.find(([re]) => re.test(text));
          if (known) throw new Error(known[1]);
          if (e?.code === "CALL_EXCEPTION" || /revert/i.test(text)) throw new Error("El contrato rechazó la transacción.");
          // Otro error (RPC caído…): se usa el gas fijo.
        }

        const fee = await provider.getFeeData();
        const maxFeePerGas = (fee.maxFeePerGas! * 130n) / 100n;
        const maxPriorityFeePerGas = ((fee.maxPriorityFeePerGas ?? 0n) * 130n) / 100n;

        set("waiting-wallet");
        const privy = await getProvider();
        try {
          await privy.send("wallet_switchEthereumChain", [{ chainId: ethers.toBeHex(CHAIN.id) }]);
        } catch (e) {
          console.warn("[Licensing] switchChain falló (se continúa):", e);
        }
        const txHash: string = await privy.send("eth_sendTransaction", [
          {
            from: address,
            to: LICENSING_ADDRESS,
            data,
            value: ethers.toBeHex(value),
            gas: ethers.toBeHex(gas),
            maxFeePerGas: ethers.toBeHex(maxFeePerGas),
            maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
          },
        ]);
        if (!txHash) throw new Error("No se recibió hash de transacción.");

        set("confirming", { txHash });
        const receipt = await provider.waitForTransaction(txHash, 1, 120_000);
        if (!receipt) throw new Error("La transacción no se confirmó en 2 minutos.");
        if (receipt.status === 0) throw new Error("La transacción fue revertida por el contrato.");

        set("done", { txHash });
        return txHash;
      } catch (err: any) {
        console.error("[Licensing] Error:", err);
        let msg: string = err.reason ?? err.error?.message ?? err.message ?? "Error desconocido";
        if (msg.toLowerCase().includes("user rejected") || msg.includes("4001")) msg = "Transacción cancelada por el usuario.";
        else if (msg.toLowerCase().includes("insufficient funds")) msg = `Fondos insuficientes (${CHAIN.symbol}) para el gas.`;
        set("error", { error: msg });
        throw new Error(msg);
      }
    },
    [getProvider, address, isReady],
  );

  const reset = useCallback(() => setState({ step: "idle", message: "" }), []);
  return { send, state, reset };
}
