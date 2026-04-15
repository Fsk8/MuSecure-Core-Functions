/**
 * MuSecure – hooks/useWallet.ts
 *
 * Hook unificado para wallet — resuelve el error s11 de Privy.
 * CORREGIDO PARA VERCEL: Utiliza getEthersProvider de Privy como fallback
 * cuando activeWallet no está disponible, con espera de inicialización.
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
   * utiliza getEthersProvider de Privy con espera de inicialización.
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
        
        // Extraer el provider nativo (EIP-1193)
        const rawProvider = (privyProvider as any).provider;
        if (!rawProvider || typeof rawProvider.request !== 'function') {
          throw new Error("El proveedor de Privy no es válido.");
        }

        // Crear BrowserProvider de ethers v6
        const browserProvider = new ethers.BrowserProvider(rawProvider);

        // ⚠️ Esperar a que el proveedor esté listo para recibir solicitudes
        // Privy a veces devuelve el proveedor antes de que esté completamente inicializado.
        let attempts = 0;
        while (attempts < 10) {
          try {
            // Intentar una operación simple para verificar que el proveedor funciona
            await browserProvider.getNetwork();
            return browserProvider; // Éxito
          } catch (error: any) {
            // Si falla por "before setting a wallet provider", esperamos y reintentamos
            if (error?.message?.includes("before setting a wallet provider")) {
              await new Promise(resolve => setTimeout(resolve, 300));
              attempts++;
            } else {
              throw error; // Otro error, no reintentar
            }
          }
        }
        throw new Error("El proveedor de Privy no está respondiendo. Intenta recargar la página.");
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