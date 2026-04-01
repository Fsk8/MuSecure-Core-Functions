const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// La wallet que firma (Debe ser la misma que pusiste en el Smart Contract)
const signerWallet = new ethers.Wallet(process.env.SCORE_SIGNER_PRIVATE_KEY);

app.post('/api/sign-music', async (req, res) => {
    try {
        const { fingerprintHash, score, userAddress } = req.body;
        const chainId = 421614; // Arbitrum Sepolia

        // Replicar el hash que espera el contrato (abi.encodePacked)
        const messageHash = ethers.solidityPackedKeccak256(
            ["bytes32", "uint256", "address", "uint256"],
            [fingerprintHash, score, userAddress, chainId]
        );

        // Firmar el hash para que el contrato lo valide con ecrecover
        const signature = await signerWallet.signMessage(ethers.toBeArray(messageHash));

        res.json({
            success: true,
            signature: signature,
            signer: signerWallet.address
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`MuSecure Signer activo en puerto ${PORT}`);
});