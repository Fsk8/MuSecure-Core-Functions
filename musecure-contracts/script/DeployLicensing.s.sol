// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MuSecureLicensing} from "../src/MuSecureLicensing.sol";

/// @notice Despliega solo MuSecureLicensing sobre el Registry y Credits ya desplegados.
///
/// Uso (Monad testnet):
///   forge script script/DeployLicensing.s.sol \
///     --rpc-url https://testnet-rpc.monad.xyz --broadcast -vvvv
///
/// Variables de entorno (.env):
///   DEPLOYER_PRIVATE_KEY
///   VITE_REGISTRY_ADDRESS   — Registry existente
///   VITE_CREDITS_ADDRESS    — Credits existente
contract DeployLicensing is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registryAddr = vm.envAddress("VITE_REGISTRY_ADDRESS");
        address creditsAddr  = vm.envAddress("VITE_CREDITS_ADDRESS");

        require(registryAddr != address(0), "Falta VITE_REGISTRY_ADDRESS");
        require(creditsAddr  != address(0), "Falta VITE_CREDITS_ADDRESS");

        console.log("Deployer:  ", vm.addr(deployerKey));
        console.log("Registry:  ", registryAddr);
        console.log("Credits:   ", creditsAddr);
        console.log("Chain ID:  ", block.chainid);

        vm.startBroadcast(deployerKey);
        MuSecureLicensing licensing = new MuSecureLicensing(registryAddr, creditsAddr);
        vm.stopBroadcast();

        console.log("\n--- Contrato desplegado ---");
        console.log("MuSecureLicensing:", address(licensing));
        console.log("\nAgrega a tu .env / Vercel:");
        console.log("VITE_LICENSING_ADDRESS=", address(licensing));
    }
}
