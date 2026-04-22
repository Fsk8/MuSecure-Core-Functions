🎵 MuSecure-Core: Decentralized Music IP Protection

Note: Scroll down for the Spanish version / Desliza hacia abajo para la versión en español.

🇺🇸 English Version

MuSecure is a decentralized platform designed to grant sovereignty and integrity to musical intellectual property. By utilizing Acoustic Fingerprinting, local WASM processing, and the Arbitrum network, MuSecure creates an immutable and verifiable record of authorship.

🛠️ Tech Stack

Frontend: React, Vite, Next.js, Tailwind CSS, Framer Motion.

Blockchain: Arbitrum (L2), Ethers.js v6.

Auth & Wallet: Privy (Embedded Wallets for seamless UX).

Storage: Lighthouse (IPFS + Filecoin) with encryption.

Processing: WASM Worker for local Acoustic Fingerprinting.

Data Oracle: MusicBrainz API Integration.

🔄 Workflow

Local Fingerprinting: Audio is processed in the browser via a WebAssembly (WASM) worker. A unique "acoustic DNA" is generated locally.

Anti-Plagiarism Validation: The system queries MusicBrainz. If a match is found, official metadata and cover art are displayed, and on-chain registration is blocked.

Certification & Signing: A backend service validates originality and signs an "Attestation" using the SCORE_SIGNER_KEY.

Registration & Faucet: The work is registered on Arbitrum. If the user has no funds, the Integrated Faucet (Treasury Key) automatically covers the gas cost.

⚙️ Environment Setup

Create a .env file with the following variables:

VITE_PRIVY_APP_ID=        # Privy App ID
VITE_PRIVY_CLIENT_ID=     # Privy Client ID
VITE_LIGHTHOUSE_API_KEY=  # Lighthouse IPFS Key
VITE_ACOUSTID_CLIENT_KEY= # AcoustID/MusicBrainz Key
VITE_REGISTRY_ADDRESS=    # Smart Contract Address
VITE_RPC_URL=             # Node RPC
VITE_BACKEND_URL=         # Validation Server URL

# Sensitive Keys (Server-side)

SCORE_SIGNER_PRIVATE_KEY= # Oracle signing key
TREASURY_PRIVATE_KEY=    # Faucet wallet key

🚀 Installation

git clone https://github.com/Fsk8/MuSecure-Core-Functions.git
cd MuSecure-Core-Functions
npm install
npm run dev

🇪🇸 Versión en Español

MuSecure es una plataforma descentralizada diseñada para otorgar soberanía e integridad a la propiedad intelectual musical. Mediante el uso de Huellas Acústicas (Fingerprinting), procesamiento local en WASM y la red de Arbitrum, MuSecure crea un registro inmutable y verificable de la autoría de una obra.

🛠️ Stack Tecnológico

Frontend: React, Vite, Next.js, Tailwind CSS, Framer Motion.

Blockchain: Arbitrum (L2), Ethers.js v6.

Auth & Wallet: Privy (Embedded Wallets para UX fluida).

Almacenamiento: Lighthouse (IPFS + Filecoin) con encriptación.

Procesamiento: WASM Worker para Fingerprinting acústico local.

Oráculo de Datos: Integración con MusicBrainz API.

🔄 Flujo de Trabajo

Fingerprinting Local: El audio se procesa en el navegador mediante un worker de WebAssembly (WASM), generando un "ADN acústico" único sin que el archivo salga de tu control.

Validación Anti-Plagio: El sistema consulta MusicBrainz. Si se detecta una coincidencia, se muestra la metadata oficial y se bloquea el registro on-chain.

Certificación & Firma: Un servicio de backend valida la originalidad y firma un "Attestation" usando la SCORE_SIGNER_KEY.

Registro & Faucet: La obra se registra en Arbitrum. Si el usuario no tiene fondos, la Faucet Integrada (Treasury Key) cubre automáticamente el costo del gas.

⚙️ Configuración del Entorno

Crea un archivo .env con las siguientes variables:

VITE_PRIVY_APP_ID=        # ID de aplicación de Privy
VITE_PRIVY_CLIENT_ID=     # Client ID de Privy
VITE_LIGHTHOUSE_API_KEY=  # API Key de Lighthouse
VITE_ACOUSTID_CLIENT_KEY= # Key de AcoustID/MusicBrainz
VITE_REGISTRY_ADDRESS=    # Dirección del Smart Contract
VITE_RPC_URL=             # URL del nodo RPC
VITE_BACKEND_URL=         # URL del servidor de validación

# Llaves Sensibles (Lado del servidor)
SCORE_SIGNER_PRIVATE_KEY= # Llave para firma de oráculo
TREASURY_PRIVATE_KEY=    # Llave de la Faucet (gas para usuarios)

🚀 Instalación

git clone https://github.com/Fsk8/MuSecure-Core-Functions.git
cd MuSecure-Core-Functions
npm install
npm run dev

📧 Contact | Contacto
Favio Montealegre
Sound Engineer & Blockchain Developer
Founder of CochaBlock | Ethereum Bolivia Core Member
