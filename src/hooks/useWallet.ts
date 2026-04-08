/**
 * MuSecure – hooks/useWallet.ts (Privy v2 — corregido)
 *
 * Fixes:
 * - Usa getEthereumProvider() correctamente para embedded + external wallets
 * - isNewUser basado en createdAt del user de Privy
 * - Interface idéntica al useWallet anterior (drop-in replacement)
 */

import { useCallback, useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";

export interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  logout: () => Promise<void>;
  signMessage: ((message: string) => Promise<string>) | null;
  isNewUser: boolean;
}

export function useWallet(): WalletState {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  // Priorizar embedded wallet de Privy, luego la primera externa
  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    return embedded ?? wallets[0];
  }, [wallets]);

  const address = activeWallet?.address ?? null;

  const signMessage = useMemo(() => {
    if (!activeWallet) return null;

    return async (message: string): Promise<string> => {
      // getEthereumProvider() funciona tanto para embedded como external wallets
      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      return signer.signMessage(message);
    };
  }, [activeWallet]);

  const connect = useCallback(async () => {
    if (!authenticated) login();
  }, [authenticated, login]);

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  // Usuario nuevo: cuenta creada hace menos de 60 segundos
  const isNewUser = useMemo(() => {
    if (!user?.createdAt) return false;
    const createdAt = new Date(user.createdAt).getTime();
    return Date.now() - createdAt < 60_000;
  }, [user?.createdAt]);

  return useMemo(() => ({
    address,
    connecting: !ready,
    error: null,
    connect,
    logout: handleLogout,
    signMessage,
    isNewUser,
  }), [address, ready, connect, handleLogout, signMessage, isNewUser]);
}