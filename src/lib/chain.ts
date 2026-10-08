/**
 * MuSecure – lib/chain.ts
 *
 * Única fuente de verdad de la red activa. Nada más en el frontend debe tener
 * escrito a mano un chainId, un RPC, un explorer o el símbolo de la moneda.
 *
 * Se elige con VITE_CHAIN (en .env y en Vercel):
 *   VITE_CHAIN=monad-testnet      → Monad Testnet (10143)
 *   VITE_CHAIN=arbitrum-sepolia   → Arbitrum Sepolia (421614)  [por defecto]
 *
 * Las direcciones de los contratos siguen en sus env vars (VITE_REGISTRY_ADDRESS,
 * VITE_CREDITS_ADDRESS...), porque cambian con cada despliegue.
 *
 * VITE_RPC_URL (opcional) reemplaza el RPC público de la red activa, por ejemplo
 * por uno dedicado con más límite de peticiones.
 */

import { defineChain } from "viem";

export type ChainKey = "arbitrum-sepolia" | "monad-testnet";

interface ChainConfig {
  key: ChainKey;
  id: number;
  name: string;
  /** Símbolo de la moneda nativa, para textos de UI ("Pide MON de prueba"). */
  symbol: string;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl?: string;
}

const CHAINS: Record<ChainKey, ChainConfig> = {
  "arbitrum-sepolia": {
    key: "arbitrum-sepolia",
    id: 421614,
    name: "Arbitrum Sepolia",
    symbol: "ETH",
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io",
  },
  "monad-testnet": {
    key: "monad-testnet",
    id: 10143,
    name: "Monad Testnet",
    symbol: "MON",
    rpcUrl: "https://testnet-rpc.monad.xyz",
    explorerUrl: "https://testnet.monadscan.com",
    faucetUrl: "https://faucet.monad.xyz",
  },
};

const requested = import.meta.env.VITE_CHAIN as ChainKey | undefined;

/** Red activa. Si VITE_CHAIN no existe o es inválida, se queda en Arbitrum Sepolia. */
export const CHAIN: ChainConfig = (requested && CHAINS[requested]) || CHAINS["arbitrum-sepolia"];

// Compatibilidad: antes el RPC de Arbitrum venía en VITE_ARBITRUM_RPC.
const legacyArbitrumRpc =
  CHAIN.key === "arbitrum-sepolia" ? (import.meta.env.VITE_ARBITRUM_RPC as string | undefined) : undefined;

export const RPC_URL: string =
  (import.meta.env.VITE_RPC_URL as string | undefined) || legacyArbitrumRpc || CHAIN.rpcUrl;

/**
 * Objeto de red en formato viem, para PrivyProvider (defaultChain / supportedChains).
 * Se define a mano con defineChain porque viem 2.21 puede no traer Monad en viem/chains.
 */
export const viemChain = defineChain({
  id: CHAIN.id,
  name: CHAIN.name,
  nativeCurrency: { name: CHAIN.symbol, symbol: CHAIN.symbol, decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Explorer", url: CHAIN.explorerUrl } },
});

export const txUrl = (hash: string): string => `${CHAIN.explorerUrl}/tx/${hash}`;
export const addressUrl = (address: string): string => `${CHAIN.explorerUrl}/address/${address}`;
