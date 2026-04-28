import { PrivyProvider } from "@privy-io/react-auth";
import { arbitrumSepolia } from "viem/chains";

interface Props {
  children: React.ReactNode;
}

export function PrivyProviderWrapper({ children }: Props) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID as string;
  if (!appId) throw new Error("Falta VITE_PRIVY_APP_ID en .env");

  const clientId = import.meta.env.VITE_PRIVY_CLIENT_ID as string;
  if (!clientId) throw new Error("Falta VITE_PRIVY_CLIENT_ID en .env");

  const walletConnectProjectId =
    (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim() || undefined;

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={{
        loginMethods: ["email", "wallet", "google"],

        appearance: {
          theme: "dark",
          accentColor: "#10b981",
          /** WalletConnect primero mejora conexión en móvil (MetaMask / Rainbow, etc.). */
          walletList: [
            "wallet_connect",
            "coinbase_wallet",
            "metamask",
            "detected_ethereum_wallets",
          ],
        },

        ...(walletConnectProjectId
          ? { walletConnectCloudProjectId: walletConnectProjectId }
          : {}),

        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          requireUserPasswordOnCreate: false,

          // 🔥 ESTA LÍNEA ES LA CLAVE
          noPromptOnSignature: true,
        },

        defaultChain: arbitrumSepolia,
        supportedChains: [arbitrumSepolia],
      }}
    >
      {children}
    </PrivyProvider>
  );
}