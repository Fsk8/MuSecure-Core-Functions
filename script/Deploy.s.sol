// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MuSecureRegistry} from "../src/MuSecureRegistry.sol";
import {MuSecureAsset}    from "../src/MuSecureAsset.sol";

/// @notice Script de despliegue para MuSecure en Arbitrum.
///
/// Uso (testnet):
///   forge script script/Deploy.s.sol \
///     --rpc-url arbitrum_sepolia \
///     --broadcast \
///     --verify \
///     -vvvv
///
/// Uso (mainnet):
///   forge script script/Deploy.s.sol \
///     --rpc-url arbitrum_one \
///     --broadcast \
///     --verify \
///     -vvvv
///
/// Variables de entorno requeridas (.env):
///   DEPLOYER_PRIVATE_KEY   — clave privada del deployer
///   SCORE_SIGNER_ADDRESS   — address del backend que firma scores
///                            (usa address(0) en dev para desactivar)
contract Deploy is Script {
    function run() external {
        // Leer vars de entorno
        uint256 deployerKey     = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address scoreSigner     = vm.envOr("SCORE_SIGNER_ADDRESS", address(0));
        address deployer        = vm.addr(deployerKey);

        console.log("Deployer:     ", deployer);
        console.log("Score signer: ", scoreSigner);
        console.log("Chain ID:     ", block.chainid);

        vm.startBroadcast(deployerKey);

        // ── 1. Deploy MuSecureAsset (NFT) ─────────────────────────────────
        MuSecureAsset asset = new MuSecureAsset(deployer);
        console.log("MuSecureAsset:   ", address(asset));

        // ── 2. Deploy MuSecureRegistry ─────────────────────────────────────
        MuSecureRegistry registry = new MuSecureRegistry(deployer, scoreSigner);
        console.log("MuSecureRegistry:", address(registry));

        // ── 3. Conectar contratos ──────────────────────────────────────────
        registry.setAssetContract(address(asset));
        asset.setRegistryContract(address(registry));
        console.log("Contratos conectados");

        vm.stopBroadcast();

        // ── 4. Resumen para el .env del frontend ───────────────────────────
        console.log("\n--- Copia al .env del frontend ---");
        console.log("VITE_REGISTRY_ADDRESS=", address(registry));
        console.log("VITE_ASSET_ADDRESS=   ", address(asset));
        console.log("VITE_ARBITRUM_CHAIN_ID=42161");
    }
}
