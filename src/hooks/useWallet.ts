/**
 * MuSecure – hooks/useWallet.ts
 *
 * Hook unificado para wallet — resuelve el error s11 de Privy.
 * CORREGIDO PARA VERCEL: Utiliza getEthersProvider de Privy como fallback
 * cuando activeWallet no está disponible, manejando la compatibilidad entre ethers v5 y v6.
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
  const { ready, authenticated, user, getEthersProvider } = usePrivy();
  const { wallets } = useWallets();

  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    return embedded ?? wallets[0];
  }, [wallets]);

  const address = activeWallet?.address ?? user?.wallet?.address ?? null;
  const isReady = ready && authenticated && !!address;

  /**
   * Obtiene un BrowserProvider de ethers v6.
   * Prioriza activeWallet, pero si no está disponible (común en Vercel),
   * utiliza getEthersProvider de Privy manejando la compatibilidad entre versiones.
   */
  const getProvider = useMemo(() => {
    return async (): Promise<ethers.BrowserProvider> => {
      // Opción 1: activeWallet (funciona en desarrollo)
      if (activeWallet) {
        const ethereumProvider = await activeWallet.getEthereumProvider();
        return new ethers.BrowserProvider(ethereumProvider);
      }
      
      // Opción 2: getEthersProvider de Privy (más robusto en Vercel)
      if (getEthersProvider) {
        const privyProvider = await getEthersProvider(); // Web3Provider de ethers v5
        
        // Intentar extraer el provider nativo compatible con ethers v6
        const rawProvider = (privyProvider as any).provider;
        if (rawProvider && typeof rawProvider.request === 'function') {
          return new ethers.BrowserProvider(rawProvider);
        }
        
        // Si no tiene provider subyacente, intentar usarlo directamente
        // (puede funcionar si ya es compatible)
        return privyProvider as unknown as ethers.BrowserProvider;
      }
      
      throw new Error("No se pudo obtener un proveedor Ethereum. Asegúrate de estar conectado.");
    };
  }, [activeWallet, getEthersProvider]);

  /**
   * Firma un mensaje usando el provider de ethers.
   * Funciona con cualquier tipo de wallet (embedded o externa).
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