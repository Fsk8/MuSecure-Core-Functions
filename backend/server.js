const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const signerWallet = new ethers.Wallet(process.env.SCORE_SIGNER_PRIVATE_KEY);
console.log("✍️  Signer del Backend Activo:", signerWallet.address);

app.post('/api/sign-music', async (req, res) => {
  try {
    const { fingerprintHash, score, userAddress } = req.body;
    const chainId = 421614; // Arbitrum Sepolia

    // Normalizar a Checksum para que coincida con msg.sender del contrato
    const checksumAddress = ethers.getAddress(userAddress);
    const cleanHash = fingerprintHash.startsWith('0x') ? fingerprintHash : `0x${fingerprintHash}`;

    // Replicar: keccak256(abi.encodePacked(fingerprintHash, score, msg.sender, chainid))
    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "uint256", "address", "uint256"],
      [cleanHash, BigInt(score), checksumAddress, BigInt(chainId)]
    );

    // Firmar con el prefijo EIP-191
    const signature = await signerWallet.signMessage(ethers.getBytes(messageHash));

    res.json({ success: true, signature });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3001, () => console.log("🚀 Server running on port 3001"));