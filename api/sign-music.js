import { ethers } from 'ethers';

export default async function handler(req, res) {
    // Configuración de CORS para que tu frontend en Vercel pueda llamar a la API
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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
    
    // Validación básica de entrada para evitar errores 500 silenciosos
    if (!fingerprintHash || !userAddress || score === undefined) {
      return res.status(400).json({ error: 'Faltan parámetros en el body' });
    }

    const chainId = 421614; // Arbitrum Sepolia

    // Verificación de la Variable de Entorno
    if (!process.env.SCORE_SIGNER_PRIVATE_KEY) {
      throw new Error("Falta la variable SCORE_SIGNER_PRIVATE_KEY en el servidor");
    }

    const signerWallet = new ethers.Wallet(process.env.SCORE_SIGNER_PRIVATE_KEY);

    // En ethers v6 (que es la que probablemente instalaste), 
    // se usa solidityPackedKeccak256 y getBytes
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
    console.error("Error en el worker:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}