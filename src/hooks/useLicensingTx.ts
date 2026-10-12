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
  "waiting-wallet": "Confirm in your wallet...",
  confirming: `Confirming on ${CHAIN.name}...`,
  done: "Done!",
  error: "Process error",
};

const REVERTS: [RegExp, string][] = [
  [/not the author/i, "Only the author of the work can set the price."],
  [/not for sale/i, "This work is not for sale."],
  [/wrong payment/i, "The price changed. Refresh the page and try again."],
  [/already licensed/i, "You already have a license for this work."],
  [/nothing to claim/i, "You have no pending funds to withdraw."],
  [/not found/i, "The work does not exist in the Registry."],
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
        if (!LICENSING_ADDRESS) throw new Error("Missing VITE_LICENSING_ADDRESS in .env");
        if (!isReady || !getProvider || !address) throw new Error("Wallet unavailable. Reconnect your account.");

        const args = call.fn === "withdraw" ? [] : [normHash(call.args[0] as string), ...call.args.slice(1)];
        const iface = new ethers.Interface(LICENSING_ABI);
        const data = iface.encodeFunctionData(call.fn, args);
        const value = call.value ?? 0n;

        const provider = rpc();
        const net = await provider.getNetwork();
        if (net.chainId.toString() !== String(CHAIN.id)) throw new Error(`RPC is on a network other than ${CHAIN.name}.`);

        if (value > 0n) {
          const bal = await provider.getBalance(address);
          if (bal < value) throw new Error(`Insufficient balance: you need more ${CHAIN.symbol} (request some from the faucet).`);
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
          if (e?.code === "CALL_EXCEPTION" || /revert/i.test(text)) throw new Error("The contract rejected the transaction.");
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
        if (!txHash) throw new Error("No transaction hash received.");

        set("confirming", { txHash });
        const receipt = await provider.waitForTransaction(txHash, 1, 120_000);
        if (!receipt) throw new Error("The transaction was not confirmed within 2 minutes.");
        if (receipt.status === 0) throw new Error("The transaction was reverted by the contract.");

        set("done", { txHash });
        return txHash;
      } catch (err: any) {
        console.error("[Licensing] Error:", err);
        let msg: string = err.reason ?? err.error?.message ?? err.message ?? "Unknown error";
        if (msg.toLowerCase().includes("user rejected") || msg.includes("4001")) msg = "Transaction cancelled by the user.";
        else if (msg.toLowerCase().includes("insufficient funds")) msg = `Insufficient funds (${CHAIN.symbol}) for gas.`;
        set("error", { error: msg });
        throw new Error(msg);
      }
    },
    [getProvider, address, isReady],
  );

  const reset = useCallback(() => setState({ step: "idle", message: "" }), []);
  return { send, state, reset };
}