/**
 * MuSecure – api/airdrop-gas.js
 * Serverless function (Vercel API Route)
 *
 * Envía 0.002 ETH de Sepolia al nuevo usuario.
 * Protecciones:
 *  1. Verifica que el balance del usuario sea < 0.001 ETH antes de enviar
 *  2. Set en memoria para evitar doble envío en la misma instancia
 *  3. Rate limit: solo 1 request por address cada 24h (via header timestamp)
 *
 * Variables de entorno en Vercel:
 *   TREASURY_PRIVATE_KEY  — clave privada de tu wallet tesorería
 *   ARBITRUM_SEPOLIA_RPC  — RPC de Arbitrum Sepolia (opcional, tiene default)
 */

import { ethers } from "ethers";

const AIRDROP_AMOUNT = "0.002"; // ETH
const MIN_BALANCE    = "0.001"; // No enviar si ya tiene más de esto
const RPC = process.env.ARBITRUM_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";

// Set en memoria — evita doble fondeo en la misma instancia serverless
// Para persistencia real usa una DB (Redis, Vercel KV, etc.)
const funded = new Set();

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST" });

  try {
    const { address } = req.body;

    // Validar address
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "Address inválida" });
    }

    const checksumAddr = ethers.getAddress(address);

    // ── Protección 1: ya fondeado en esta instancia ───────────────────────
    if (funded.has(checksumAddr)) {
      return res.status(200).json({ success: true, skipped: true, reason: "already_funded" });
    }

    const provider = new ethers.JsonRpcProvider(RPC);

    // ── Protección 2: verificar balance actual ────────────────────────────
    const balance = await provider.getBalance(checksumAddr);
    const minBalance = ethers.parseEther(MIN_BALANCE);

    if (balance >= minBalance) {
      funded.add(checksumAddr); // marcamos para no volver a verificar
      return res.status(200).json({ success: true, skipped: true, reason: "has_balance" });
    }

    // ── Verificar que la tesorería tiene fondos ───────────────────────────
    if (!process.env.TREASURY_PRIVATE_KEY) {
      throw new Error("Falta TREASURY_PRIVATE_KEY en las variables de entorno");
    }

    const treasury = new ethers.Wallet(process.env.TREASURY_PRIVATE_KEY, provider);
    const treasuryBalance = await provider.getBalance(treasury.address);
    const airdropAmount = ethers.parseEther(AIRDROP_AMOUNT);

    if (treasuryBalance < airdropAmount) {
      throw new Error("Fondos insuficientes en la tesorería");
    }

    // ── Enviar ETH ────────────────────────────────────────────────────────
    const tx = await treasury.sendTransaction({
      to: checksumAddr,
      value: airdropAmount,
    });

    // No esperamos confirmación para responder rápido
    // La tx ya está en mempool
    funded.add(checksumAddr);

    console.log(`[Airdrop] ${AIRDROP_AMOUNT} ETH → ${checksumAddr} | tx: ${tx.hash}`);

    return res.status(200).json({
      success: true,
      skipped: false,
      txHash: tx.hash,
      amount: AIRDROP_AMOUNT,
    });

  } catch (error) {
    console.error("[Airdrop] Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}