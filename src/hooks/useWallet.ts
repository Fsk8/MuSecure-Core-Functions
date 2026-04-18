/**
 * MuSecure – hooks/useWallet.ts
 *
 * Fixes para Vercel + incógnito:
 * 1. Priorizar embedded wallet de Privy sobre MetaMask
 *    → wallets[0] puede ser MetaMask en navegadores con extensión
 *    → buscar explícitamente walletClientType === "privy" primero
 * 2. Retry en getEthereumProvider()
 *    → en Vercel (cold start) la wallet tarda más en inicializarse
 *    → 5 intentos × 600ms antes de lanzar error
 * 3. noPromptOnSignature: true en PrivyProviderWrapper (ya lo tienes ✓)
 *    → sin ese flag Privy muestra modal de confirmación en cada firma
 */

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

/**
 * Retry para getEthereumProvider().
 * Resuelve el race condition en Vercel donde la embedded wallet
 * no está lista inmediatamente tras el login.
 */
async function getProviderWithRetry(wallet: any, retries = 5, delay = 600): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const provider = await wallet.getEthereumProvider();
      if (provider && typeof provider.request === "function") return provider;
    } catch (e) {
      if (i === retries - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("No se pudo obtener el provider después de varios intentos.");
}

export function useWallet(): WalletState {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    // CLAVE: priorizar embedded wallet de Privy.
    // Sin esto, en navegadores con MetaMask instalado wallets[0] = MetaMask,
    // lo que rompe embedded wallets de email/Google en incógnito y Vercel.
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    return embedded ?? wallets[0];
  }, [wallets]);

  const address = activeWallet?.address ?? user?.wallet?.address ?? null;
  const isReady = ready && authenticated && !!activeWallet && !!address;

  const getProvider = useMemo(() => {
    if (!activeWallet) return null;
    return async (): Promise<ethers.BrowserProvider> => {
      const eip1193 = await getProviderWithRetry(activeWallet);
      return new ethers.BrowserProvider(eip1193);
    };
  }, [activeWallet]);

  const signMessage = useMemo(() => {
    if (!getProvider) return null;
    return async (message: string): Promise<string> => {
      const provider = await getProvider();
      const signer = await provider.getSigner();
      return signer.signMessage(message);
    };
  }, [getProvider]);

  return useMemo(
    () => ({ address, connecting: !ready, signMessage, getProvider, isReady }),
    [address, ready, signMessage, getProvider, isReady]
  );
}