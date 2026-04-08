/**
 * MuSecure – PrivyProviderWrapper.tsx
 * Usa viem/chains para el tipo Chain correcto — evita "Privy iframe failed to load"
 *
 * Instalar si no está:
 *   npm install @privy-io/react-auth viem
 */

import { PrivyProvider } from "@privy-io/react-auth";
import { arbitrumSepolia } from "viem/chains";

interface Props { children: React.ReactNode; }

export function PrivyProviderWrapper({ children }: Props) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID as string;
  if (!appId) throw new Error("Falta VITE_PRIVY_APP_ID en .env");

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "wallet", "google"],
        appearance: {
          theme: "dark",
          accentColor: "#6366f1",
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          requireUserPasswordOnCreate: false,
        },
        // arbitrumSepolia viene de viem/chains — tipo correcto para Privy v2
        defaultChain: arbitrumSepolia,
        supportedChains: [arbitrumSepolia],
      }}
    >
      {children}
    </PrivyProvider>
  );
}