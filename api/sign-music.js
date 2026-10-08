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
    const { fingerprintHash, score, ipfsCid, soulbound, userAddress, chainId: bodyChainId } = req.body;
    
    // Validación básica de entrada para evitar errores 500 silenciosos
    if (!fingerprintHash || !userAddress || score === undefined || typeof ipfsCid !== 'string' || typeof soulbound !== 'boolean') {
      return res.status(400).json({ error: 'Faltan parámetros en el body (fingerprintHash, score, ipfsCid, soulbound, userAddress)' });
    }

    // CHAIN_ID (env del servidor) manda; el body es respaldo. El contrato valida con block.chainid.
    // Monad Testnet = 10143, Arbitrum Sepolia = 421614.
    const chainId = Number(process.env.CHAIN_ID ?? bodyChainId ?? 10143);

    // Verificación de la Variable de Entorno
    if (!process.env.SCORE_SIGNER_PRIVATE_KEY) {
      throw new Error("Falta la variable SCORE_SIGNER_PRIVATE_KEY en el servidor");
    }

    const signerWallet = new ethers.Wallet(process.env.SCORE_SIGNER_PRIVATE_KEY);

    // En ethers v6 (que es la que probablemente instalaste), 
    // se usa solidityPackedKeccak256 y getBytes
    // Debe coincidir EXACTO con MuSecureRegistry._verifyScoreSignature:
    // keccak256(abi.encodePacked(fingerprintHash, score, ipfsCid, soulbound, msg.sender, block.chainid, address(this)))
    const registryAddress = process.env.REGISTRY_ADDRESS ?? process.env.VITE_REGISTRY_ADDRESS;
    if (!registryAddress || !ethers.isAddress(registryAddress)) {
      throw new Error("Falta REGISTRY_ADDRESS (o VITE_REGISTRY_ADDRESS) válida en el servidor");
    }

    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "uint256", "string", "bool", "address", "uint256", "address"],
      [fingerprintHash, score, ipfsCid, soulbound, userAddress, chainId, registryAddress]
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