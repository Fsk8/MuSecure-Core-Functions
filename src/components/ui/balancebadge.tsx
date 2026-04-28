import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { motion } from "motion/react";

export function BalanceBadge({ address }: { address: string | null }) {
  const [balance, setBalance] = useState<string>("0.00");

  useEffect(() => {
    if (!address) return;

    const fetchBalance = async () => {
      try {
        const provider = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
        const b = await provider.getBalance(address);
        // Formateamos a 4 decimales para que se vea pro
        const formatted = parseFloat(ethers.formatEther(b)).toFixed(4);
        setBalance(formatted);
      } catch (e) {
        console.error("Error balance:", e);
      }
    };

    fetchBalance();
    // Opcional: Refrescar cada 10 segundos por si llega el airdrop
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [address]);

  if (!address) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1"
    >
      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      <span className="font-mono text-[11px] font-medium text-zinc-300">
        {balance} ETH
      </span>
    </motion.div>
  );
}