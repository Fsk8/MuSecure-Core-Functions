/**
 * MuSecure – src/types/ethereum.d.ts
 * Extiende Window para que TypeScript reconozca window.ethereum (MetaMask / EIP-1193)
 */

interface EthereumProvider {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    isMetaMask?: boolean;
    selectedAddress?: string | null;
    chainId?: string;
  }
  
  declare global {
    interface Window {
      ethereum?: EthereumProvider;
    }
  }
  
  export {};