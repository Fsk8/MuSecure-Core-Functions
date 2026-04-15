/**
 * MuSecure – hooks/useWallet.ts
 *
 * Hook unificado para wallet — resuelve el error s11 de Privy.
 * VERSIÓN ROBUSTA PARA VERCEL: Solo utiliza activeWallet de useWallets.
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
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  // Wallet activa: priorizar embedded (Privy) sobre externa (MetaMask/Rabby)
  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    return embedded ?? wallets[0];
  }, [wallets]);

  // Dirección: de activeWallet o de user.wallet (fallback)
  const address = activeWallet?.address ?? user?.wallet?.address ?? null;
  const isReady = ready && authenticated && !!address;

  /**
   * Obtiene un BrowserProvider de ethers v6.
   * Solo utiliza activeWallet porque es la fuente más confiable.
   */
  const getProvider = useMemo(() => {
    if (!activeWallet) return null;
    
    return async (): Promise<ethers.BrowserProvider> => {
      try {
        const ethereumProvider = await activeWallet.getEthereumProvider();
        return new ethers.BrowserProvider(ethereumProvider);
      } catch (error) {
        console.error("Error al obtener el proveedor de la wallet:", error);
        throw new Error("No se pudo conectar con la wallet. Asegúrate de haber iniciado sesión correctamente.");
      }
    };
  }, [activeWallet]);

  /**
   * Firma un mensaje usando el provider de ethers.
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

  return useMemo(
    () => ({ address, connecting: !ready, signMessage, getProvider, isReady }),
    [address, ready, signMessage, getProvider, isReady]
  );
}