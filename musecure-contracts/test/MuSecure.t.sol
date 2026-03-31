// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MuSecureRegistry} from "../src/MuSecureRegistry.sol";
import {MuSecureAsset}    from "../src/MuSecureAsset.sol";
import {IMuSecureRegistry} from "../src/interfaces/IMuSecure.sol";

contract MuSecureTest is Test {
    MuSecureRegistry registry;
    MuSecureAsset    asset;

    address deployer = makeAddr("deployer");
    address artist   = makeAddr("artist");
    address attacker = makeAddr("attacker");

    // Clave privada del scoreSigner (solo para tests)
    uint256 signerPk = 0xB0B;
    address scoreSigner;

    bytes32 constant FP_HASH = keccak256("test-fingerprint");
    string  constant CID     = "bafybeig3gauun6xlp4r66rdjo5ye4mdztn54b6anyo3yt4piwy3snaawhy";

    function setUp() public {
        scoreSigner = vm.addr(signerPk);

        vm.startPrank(deployer);
        asset    = new MuSecureAsset(deployer);
        registry = new MuSecureRegistry(deployer, scoreSigner);
        registry.setAssetContract(address(asset));
        asset.setRegistryContract(address(registry));
        vm.stopPrank();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _sign(bytes32 fpHash, uint256 score, address sender)
        internal view returns (bytes memory)
    {
        bytes32 msgHash = keccak256(
            abi.encodePacked(fpHash, score, sender, block.chainid)
        );
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _register(
        address who,
        bytes32 fpHash,
        uint256 score,
        bool soulbound
    ) internal returns (uint256 tokenId) {
        bytes memory sig = _sign(fpHash, score, who);
        vm.prank(who);
        tokenId = registry.registerWork(fpHash, CID, score, soulbound, sig);
    }

    // ── Tests básicos ─────────────────────────────────────────────────────────

    function test_RegisterWork_Low() public {
        uint256 tokenId = _register(artist, FP_HASH, 20, false);

        assertTrue(registry.workExists(FP_HASH));
        assertEq(tokenId, 1);
        assertEq(asset.ownerOf(tokenId), artist);

        IMuSecureRegistry.WorkRecord memory w = registry.getWork(FP_HASH);
        assertEq(uint8(w.riskLevel), uint8(IMuSecureRegistry.RiskLevel.Low));
        assertEq(w.authorAddress, artist);
        assertEq(w.ipfsCid, CID);
    }

    function test_RegisterWork_Medium() public {
        uint256 tokenId = _register(artist, FP_HASH, 60, false);
        IMuSecureRegistry.WorkRecord memory w = registry.getWork(FP_HASH);
        assertEq(uint8(w.riskLevel), uint8(IMuSecureRegistry.RiskLevel.Medium));
        assertEq(tokenId, 1);
    }

    function test_RegisterWork_High() public {
        uint256 tokenId = _register(artist, FP_HASH, 85, false);
        IMuSecureRegistry.WorkRecord memory w = registry.getWork(FP_HASH);
        assertEq(uint8(w.riskLevel), uint8(IMuSecureRegistry.RiskLevel.High));
        assertEq(tokenId, 1);
    }

    function test_RegisterWork_Blocked() public {
        bytes memory sig = _sign(FP_HASH, 96, artist);
        vm.prank(artist);
        vm.expectRevert(bytes("MuSecure: work blocked - too similar to existing catalog"));
        registry.registerWork(FP_HASH, CID, 96, false, sig);
        assertFalse(registry.workExists(FP_HASH));
    }

    function test_RevertIf_DuplicateFingerprint() public {
        _register(artist, FP_HASH, 20, false);

        bytes memory sig = _sign(FP_HASH, 20, attacker);
        vm.prank(attacker);
        vm.expectRevert("MuSecure: already registered");
        registry.registerWork(FP_HASH, CID, 20, false, sig);
    }

    function test_RevertIf_InvalidScoreSignature() public {
        // Firma con clave distinta al scoreSigner
        uint256 fakePk = 0xDEAD;
        bytes32 msgHash = keccak256(
            abi.encodePacked(FP_HASH, uint256(20), artist, block.chainid)
        );
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(fakePk, ethHash);
        bytes memory fakeSig = abi.encodePacked(r, s, v);

        vm.prank(artist);
        vm.expectRevert("MuSecure: invalid score signature");
        registry.registerWork(FP_HASH, CID, 20, false, fakeSig);
    }

    function test_RevertIf_WrongSender_InSignature() public {
        // Firma válida pero para otro sender — replay attack entre wallets
        bytes memory sig = _sign(FP_HASH, 20, artist); // firmado para artist
        vm.prank(attacker);                              // attacker intenta usarla
        vm.expectRevert("MuSecure: invalid score signature");
        registry.registerWork(FP_HASH, CID, 20, false, sig);
    }

    // ── Soulbound ─────────────────────────────────────────────────────────────

    function test_Soulbound_BlocksTransfer() public {
        uint256 tokenId = _register(artist, FP_HASH, 20, true);
        assertTrue(asset.isSoulbound(tokenId));

        vm.prank(artist);
        vm.expectRevert(bytes("MuSecureAsset: soulbound token - non-transferable"));
        asset.transferFrom(artist, attacker, tokenId);
    }

    function test_NonSoulbound_AllowsTransfer() public {
        uint256 tokenId = _register(artist, FP_HASH, 20, false);
        assertFalse(asset.isSoulbound(tokenId));

        vm.prank(artist);
        asset.transferFrom(artist, attacker, tokenId);
        assertEq(asset.ownerOf(tokenId), attacker);
    }

    // ── TokenURI ──────────────────────────────────────────────────────────────

    function test_TokenURI_PointsToIPFS() public {
        uint256 tokenId = _register(artist, FP_HASH, 20, false);
        string memory uri = asset.tokenURI(tokenId);
        assertEq(uri, string(abi.encodePacked("ipfs://", CID)));
    }

    // ── Author works ──────────────────────────────────────────────────────────

    function test_GetAuthorWorks() public {
        bytes32 fp2 = keccak256("second-fingerprint");
        _register(artist, FP_HASH, 20, false);
        _register(artist, fp2,     30, true);

        bytes32[] memory works = registry.getAuthorWorks(artist);
        assertEq(works.length, 2);
        assertEq(works[0], FP_HASH);
        assertEq(works[1], fp2);
    }

    // ── Pause ─────────────────────────────────────────────────────────────────

    function test_Paused_BlocksRegistration() public {
        vm.prank(deployer);
        registry.pause();

        bytes memory sig = _sign(FP_HASH, 20, artist);
        vm.prank(artist);
        vm.expectRevert();
        registry.registerWork(FP_HASH, CID, 20, false, sig);
    }

    // ── Fuzz ──────────────────────────────────────────────────────────────────

    function testFuzz_RiskLevelAssignment(uint256 score) public {
        score = bound(score, 0, 94); // < 95 para que no sea Blocked
        bytes32 fp = keccak256(abi.encodePacked(score, "fuzz"));
        uint256 tokenId = _register(artist, fp, score, false);
        assertTrue(tokenId > 0);

        IMuSecureRegistry.WorkRecord memory w = registry.getWork(fp);
        if (score >= 80) {
            assertEq(uint8(w.riskLevel), uint8(IMuSecureRegistry.RiskLevel.High));
        } else if (score >= 45) {
            assertEq(uint8(w.riskLevel), uint8(IMuSecureRegistry.RiskLevel.Medium));
        } else {
            assertEq(uint8(w.riskLevel), uint8(IMuSecureRegistry.RiskLevel.Low));
        }
    }
    // ── Fee refund ────────────────────────────────────────────────────────────

    function test_ExcessFeeRefunded() public {
        // Configurar fee de 0.001 ETH
        vm.prank(deployer);
        registry.setRegistrationFee(0.001 ether);

        vm.deal(artist, 1 ether);
        uint256 balanceBefore = artist.balance;

        bytes memory sig = _sign(FP_HASH, 20, artist);
        vm.prank(artist);
        // Manda 0.01 ETH pero el fee es 0.001 — debe devolver 0.009
        registry.registerWork{value: 0.01 ether}(FP_HASH, CID, 20, false, sig);

        // Balance debe haber bajado exactamente en el fee (0.001 ETH)
        assertApproxEqAbs(artist.balance, balanceBefore - 0.001 ether, 1);
    }

    // ── setSoulbound por token owner ──────────────────────────────────────────

    function test_TokenOwner_CanChangeSoulbound() public {
        uint256 tokenId = _register(artist, FP_HASH, 20, false);
        assertFalse(asset.isSoulbound(tokenId));

        // El dueño del token puede activar soulbound
        vm.prank(artist);
        asset.setSoulbound(tokenId, true);
        assertTrue(asset.isSoulbound(tokenId));
    }

    function test_Attacker_CannotChangeSoulbound() public {
        uint256 tokenId = _register(artist, FP_HASH, 20, false);

        vm.prank(attacker);
        vm.expectRevert(bytes("MuSecureAsset: not token owner or contract owner"));
        asset.setSoulbound(tokenId, true);
    }

}
