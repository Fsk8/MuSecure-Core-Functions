/**
 * MuSecure – hooks/useWallet.ts
 *
 * Hook unificado para wallet — resuelve el error s11 de Privy.
 *
 * El error s11 ("User must have an embedded wallet to sign a message") ocurre
 * cuando se usa signMessage() de usePrivy() directamente con una wallet externa
 * (MetaMask, Rabby). La solución es siempre firmar a través del provider
 * de ethers obtenido desde useWallets().
 *
 * Este hook es la única fuente de verdad para address, signMessage y provider.
 * Úsalo en lugar de extraer signMessage de usePrivy().
 * 
 * CORREGIDO PARA VERCEL: Usa user.wallet.address como fallback si activeWallet no está lista.
 */

import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";

export interface WalletState {
  /** Dirección de la wallet activa (checksummed) */
  address: string | null;
  /** true mientras Privy inicializa */
  connecting: boolean;
  /** Firma un mensaje con la wallet activa (embedded o externa) */
  signMessage: ((message: string) => Promise<string>) | null;
  /** Provider de ethers de la wallet activa — para enviar txs */
  getProvider: (() => Promise<ethers.BrowserProvider>) | null;
  /** true si hay una wallet activa lista */
  isReady: boolean;
}

export function useWallet(): WalletState {
  const { ready, authenticated, user } = usePrivy(); // ✨ Añadir user
  const { wallets } = useWallets();

  // Wallet activa: priorizar embedded (Privy) sobre externa (MetaMask/Rabby)
  // Si el usuario conectó MetaMask, será la primera — si usa email/Google, será la embedded
  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    // Preferred: embedded wallet de Privy
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    return embedded ?? wallets[0];
  }, [wallets]);

  // ✨ Para Vercel: Usar user.wallet.address como fallback si activeWallet no está lista
  const address = activeWallet?.address ?? user?.wallet?.address ?? null;
  // ✨ Para Vercel: Considerar lista si hay address (no solo activeWallet)
  const isReady = ready && authenticated && !!address;

  /**
   * Firma un mensaje usando el provider de ethers.
   * Funciona con CUALQUIER tipo de wallet (embedded o externa).
   * Evita el error s11 que ocurre con signMessage() de usePrivy().
   */
  const signMessage = useMemo(() => {
    if (!activeWallet) return null;
    return async (message: string): Promise<string> => {
      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      return signer.signMessage(message);
    };
  }, [activeWallet]);

  /**
   * Devuelve un BrowserProvider de ethers para enviar transacciones.
   */
  const getProvider = useMemo(() => {
    if (!activeWallet) return null;
    return async (): Promise<ethers.BrowserProvider> => {
      const ethereumProvider = await activeWallet.getEthereumProvider();
      return new ethers.BrowserProvider(ethereumProvider);
    };
  }, [activeWallet]);

  return useMemo(
    () => ({ address, connecting: !ready, signMessage, getProvider, isReady }),
    [address, ready, signMessage, getProvider, isReady]
  );
}