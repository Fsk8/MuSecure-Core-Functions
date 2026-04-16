import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";

export interface WalletState {
  address: string | null;
  connecting: boolean;
  signMessage: ((message: string) => Promise<string>) | null;
  getProvider: (() => Promise<ethers.BrowserProvider>) | null;
  isReady: boolean;
}

export function useWallet(): WalletState {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    return wallets[0];
  }, [wallets]);

  const address = activeWallet?.address ?? user?.wallet?.address ?? null;

  const isReady =
    ready &&
    authenticated &&
    !!activeWallet &&
    !!address;

  const getProvider = useMemo(() => {
    if (!activeWallet) return null;

    return async () => {
      const provider = await activeWallet.getEthereumProvider();

      if (!provider || typeof provider.request !== "function") {
        throw new Error("Provider inválido");
      }

      return new ethers.BrowserProvider(provider);
    };
  }, [activeWallet]);

  const signMessage = useMemo(() => {
    if (!getProvider) return null;

    return async (message: string) => {
      const provider = await getProvider();
      const signer = await provider.getSigner();
      return signer.signMessage(message);
    };
  }, [getProvider]);

  return {
    address,
    connecting: !ready,
    signMessage,
    getProvider,
    isReady,
  };
}