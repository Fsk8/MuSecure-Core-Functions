// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MuSecureCredits}  from "../src/MuSecureCredits.sol";

/// @notice Script para desplegar únicamente MuSecureCredits usando un Registry existente.
contract DeployCredits is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registryAddr = vm.envAddress("VITE_REGISTRY_ADDRESS");
        address deployer     = vm.addr(deployerKey);

        console.log("Deployer:          ", deployer);
        console.log("Registry Existente:", registryAddr);
        console.log("Chain ID:          ", block.chainid);

        require(registryAddr != address(0), "Falta VITE_REGISTRY_ADDRESS en el .env");

        vm.startBroadcast(deployerKey);

        // Deploy solo de MuSecureCredits pasando deployer como owner y la address del Registry
        MuSecureCredits credits = new MuSecureCredits(registryAddr);

        vm.stopBroadcast();

        console.log("\n--- Contrato Desplegado con Exito ---");
        console.log("MuSecureCredits: ", address(credits));
        console.log("\nAgrega esto a tu .env:");
        console.log("VITE_CREDITS_ADDRESS=", address(credits));
    }
}