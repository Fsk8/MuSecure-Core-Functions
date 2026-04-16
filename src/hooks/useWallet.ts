import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";

export interface WalletState {
  address: string | null;
  connecting: boolean;
  signMessage: ((message: string) => Promise<string>) | null;
  getProvider: (() => Promise<ethers.BrowserProvider>) | null;
  getEip1193Provider: (() => Promise<any>) | null; // 👈 AGREGADO
  isReady: boolean;
}

async function getEthereumProviderWithRetry(
  wallet: any,
  maxRetries = 5,
  delayMs = 600
): Promise<any> {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const provider = await wallet.getEthereumProvider();

      if (provider && typeof provider.request === "function") {
        return provider;
      }
    } catch (e) {
      lastError = e;
    }

    await new Promise((res) => setTimeout(res, delayMs));
  }

  throw lastError ?? new Error("No se pudo obtener provider válido");
}

export function useWallet(): WalletState {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    return embedded ?? wallets[0];
  }, [wallets]);

  const address = activeWallet?.address ?? user?.wallet?.address ?? null;
  const isReady = ready && authenticated && !!address;

  // 👇 provider EIP-1193 puro (CLAVE para evitar el error)
  const getEip1193Provider = useMemo(() => {
    if (!activeWallet) return null;

    return async () => {
      return await getEthereumProviderWithRetry(activeWallet);
    };
  }, [activeWallet]);

  // 👇 ethers provider (para contratos)
  const getProvider = useMemo(() => {
    if (!activeWallet) return null;

    return async () => {
      const eip1193 = await getEthereumProviderWithRetry(activeWallet);
      return new ethers.BrowserProvider(eip1193);
    };
  }, [activeWallet]);

  // 👇 FIX REAL (sin usar signer.signMessage)
  const signMessage = useMemo(() => {
    if (!activeWallet || !address) return null;

    return async (message: string) => {
      const provider = await getEthereumProviderWithRetry(activeWallet);

      const hexMessage = ethers.hexlify(ethers.toUtf8Bytes(message));

      const signature = await provider.request({
        method: "personal_sign",
        params: [hexMessage, address],
      });

      return signature;
    };
  }, [activeWallet, address]);

  return useMemo(
    () => ({
      address,
      connecting: !ready,
      signMessage,
      getProvider,
      getEip1193Provider, // 👈 AGREGADO AL RETURN
      isReady,
    }),
    [address, ready, signMessage, getProvider, getEip1193Provider, isReady]
  );
}