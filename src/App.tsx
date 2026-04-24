import { FingerprintUploader } from "@/components/FingerprintUploader";
import { Dashboard } from "@/pages/Dashboard";
import { Explorer } from "@/components/Explorer";
import { usePrivy } from "@privy-io/react-auth";
import { useGasAirdrop } from "@/hooks/useGasAirdrop";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AnimatePresence, motion } from "motion/react";
import { Shield, Upload, LayoutGrid, Wallet, LogOut } from "lucide-react";

// Importamos tu nuevo componente
import { BalanceBadge } from "@/components/ui/balancebadge";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="flex items-end gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full bg-emerald-500"
              animate={{ height: [8, 24, 8] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.12,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">
          Sincronizando
        </p>
      </motion.div>
    </div>
  );
}

function EmptyState({
  message,
  onAction,
  actionLabel,
}: {
  message: string;
  onAction: () => void;
  actionLabel: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-md rounded-5xl border-2 border-dashed border-surface-border bg-surface-raised/50 p-16 text-center"
    >
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
        <Wallet className="h-7 w-7 text-emerald-500" />
      </div>
      <p className="mb-6 font-mono text-xs uppercase tracking-wider text-zinc-500">
        {message}
      </p>
      <Button onClick={onAction} size="lg">
        {actionLabel}
      </Button>
    </motion.div>
  );
}

export default function App() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const address = user?.wallet?.address;
  
  const { airdropMessage } = useGasAirdrop(
    address || null,
    (user as any)?.isNewUser
  );

  if (!ready) return <LoadingScreen />;

  return (
    <div className="min-h-screen">
      {/* Radial glow behind header */}
      <div className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.04] blur-3xl" />

      <header className="border-b border-surface-border/50 bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/20">
              <Shield className="h-5 w-5 text-black" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight text-white">
                MuSecure
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                Proteccion de IP Musical
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {authenticated && address ? (
              <>
                {/* 1. Visor de Saldo */}
                <BalanceBadge address={address} />

                {/* 2. Info de Wallet con Logout */}
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="hidden sm:flex">Conectado</Badge>
                  <div className="group relative flex items-center gap-3 rounded-xl border border-surface-border bg-surface-raised px-4 py-2 hover:border-red-500/30 transition-all">
                    <span className="font-mono text-xs text-emerald-500">
                      {address.slice(0, 6)}...{address.slice(-4)}
                    </span>
                    <button 
                      onClick={logout}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                      title="Cerrar sesión"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <Button onClick={login} size="sm" className="rounded-xl">
                <Wallet className="mr-2 h-4 w-4" />
                Conectar
              </Button>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {airdropMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mx-auto max-w-6xl px-6 pt-4">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-3 text-center font-mono text-sm font-semibold text-emerald-500">
                {airdropMessage}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs defaultValue="upload" className="mx-auto max-w-6xl px-6 pt-8">
        <div className="flex justify-center">
          <TabsList>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-3.5 w-3.5" />
              Subir Obra
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-2">
              <Shield className="h-3.5 w-3.5" />
              Mis Obras
            </TabsTrigger>
            <TabsTrigger value="explorer" className="gap-2">
              <LayoutGrid className="h-3.5 w-3.5" />
              Explorar
            </TabsTrigger>
          </TabsList>
        </div>

        <Separator className="mt-8" />

        <TabsContent value="explorer">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Explorer />
          </motion.div>
        </TabsContent>

        <TabsContent value="upload">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {authenticated ? (
              <FingerprintUploader />
            ) : (
              <EmptyState
                message="Debes conectar tu identidad para subir obras"
                onAction={login}
                actionLabel="Conectar Ahora"
              />
            )}
          </motion.div>
        </TabsContent>

        <TabsContent value="dashboard">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {authenticated ? (
              <Dashboard />
            ) : (
              <EmptyState
                message="Conecta tu wallet para ver tu catalogo personal"
                onAction={login}
                actionLabel="Ver mi Dashboard"
              />
            )}
          </motion.div>
        </TabsContent>
      </Tabs>

      <div className="pb-16" />
    </div>
  );
}