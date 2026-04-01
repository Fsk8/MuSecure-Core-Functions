const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// La wallet que firma (Asegúrate que coincida con scoreSigner en el contrato)
const signerWallet = new ethers.Wallet(process.env.SCORE_SIGNER_PRIVATE_KEY);

app.post('/api/sign-music', async (req, res) => {
    try {
        const { fingerprintHash, score, userAddress } = req.body;
        const chainId = 421614; // Arbitrum Sepolia exacto

        console.log(`✍️ Firmando para: ${userAddress} | Score: ${score}`);

        // REPLICAR EXACTAMENTE EL abi.encodePacked DEL CONTRATO
        // Importante: El orden y los tipos deben ser idénticos al .sol
        const messageHash = ethers.solidityPackedKeccak256(
            ["bytes32", "uint256", "address", "uint256"],
            [fingerprintHash, score, userAddress, chainId]
        );

        // Firmar el hash con el prefijo de Ethereum (\x19Ethereum Signed Message:\n32)
        // signMessage ya aplica el prefijo automáticamente sobre los bytes
        const signature = await signerWallet.signMessage(ethers.getBytes(messageHash));

        res.json({
            success: true,
            signature: signature,
            signer: signerWallet.address
        });
    } catch (error) {
        console.error("❌ Error en firma:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`MuSecure Signer activo en puerto ${PORT}`);
    console.log(`Dirección del Signer: ${signerWallet.address}`);
});