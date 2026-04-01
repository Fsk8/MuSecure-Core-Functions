const { ethers } = require('ethers');

export default async function handler(req, res) {
    // Configuración de CORS para que tu frontend en Vercel pueda llamar a la API
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Solo se permite POST' });
    }

    try {
        const { fingerprintHash, score, userAddress } = req.body;
        const chainId = 421614; // Arbitrum Sepolia

        // Usamos la variable de entorno que configuraremos en el dashboard de Vercel
        const signerWallet = new ethers.Wallet(process.env.SCORE_SIGNER_PRIVATE_KEY);

        const messageHash = ethers.solidityPackedKeccak256(
            ["bytes32", "uint256", "address", "uint256"],
            [fingerprintHash, score, userAddress, chainId]
        );

        const signature = await signerWallet.signMessage(ethers.getBytes(messageHash));

        return res.status(200).json({
            success: true,
            signature: signature,
            signer: signerWallet.address
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}