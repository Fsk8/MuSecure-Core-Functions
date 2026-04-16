import { PrivyProvider } from "@privy-io/react-auth";
import { arbitrumSepolia } from "viem/chains";

interface Props {
  children: React.ReactNode;
}

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
          accentColor: "#10b981",
        },

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