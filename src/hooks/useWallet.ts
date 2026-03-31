import { useCallback, useMemo, useState } from "react";
import { ethers } from "ethers";

export interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  signMessage: ((message: string) => Promise<string>) | null;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signMessageFn, setSignMessageFn] = useState<
    ((message: string) => Promise<string>) | null
  >(null);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        throw new Error(
          "No se detectó window.ethereum. Instala MetaMask u otro wallet compatible."
        );
      }
      const provider = new ethers.BrowserProvider(eth);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();

      setAddress(addr);
      setSignMessageFn(() => (message: string) => signer.signMessage(message));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  return useMemo(
    () => ({
      address,
      connecting,
      error,
      connect,
      signMessage: signMessageFn,
    }),
    [address, connecting, error, connect, signMessageFn]
  );
}

