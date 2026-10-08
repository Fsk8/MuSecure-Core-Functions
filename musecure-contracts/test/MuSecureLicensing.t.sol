// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MuSecureRegistry}  from "../src/MuSecureRegistry.sol";
import {MuSecureAsset}     from "../src/MuSecureAsset.sol";
import {MuSecureCredits}   from "../src/MuSecureCredits.sol";
import {MuSecureLicensing} from "../src/MuSecureLicensing.sol";
import {Rejecter, GasBurner, Reenterer} from "./helpers/LicensingHelpers.sol";

contract MuSecureLicensingTest is Test {
    MuSecureRegistry  registry;
    MuSecureAsset     asset;
    MuSecureCredits   credits;
    MuSecureLicensing lic;

    address deployer = makeAddr("deployer");
    address artist   = makeAddr("artist");
    address collab1  = makeAddr("collab1");
    address collab2  = makeAddr("collab2");
    address buyer    = makeAddr("buyer");
    address buyer2   = makeAddr("buyer2");
    address stranger = makeAddr("stranger");

    uint256 nonce;

    event LicensePriceSet(bytes32 indexed fingerprintHash, address indexed author, uint256 price);
    event LicensePurchased(bytes32 indexed fingerprintHash, address indexed buyer, address indexed author, uint256 price);
    event RoyaltyPaid(bytes32 indexed fingerprintHash, address indexed recipient, uint256 amount, bool isAuthor, bool direct);
    event RoyaltyClaimed(address indexed account, uint256 amount);

    function setUp() public {
        vm.startPrank(deployer);
        asset    = new MuSecureAsset(deployer);
        // scoreSigner = address(0) desactiva la verificación de firma (modo dev del Registry)
        registry = new MuSecureRegistry(deployer, address(0));
        registry.setAssetContract(address(asset));
        asset.setRegistryContract(address(registry));
        credits  = new MuSecureCredits(address(registry));
        lic      = new MuSecureLicensing(address(registry), address(credits));
        vm.stopPrank();

        vm.deal(buyer, 100 ether);
        vm.deal(buyer2, 100 ether);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _register() internal returns (bytes32 fp) {
        fp = keccak256(abi.encodePacked("fp", nonce++));
        vm.prank(artist);
        registry.registerWork(fp, "bafyTEST", 20, false, "");
    }

    function _credit(bytes32 fp, address[] memory who, uint16[] memory bps) internal {
        vm.prank(artist);
        credits.creditCollaborators(fp, who, bps);
    }

    function _two(address a, uint16 x, address b, uint16 y)
        internal pure returns (address[] memory w, uint16[] memory p)
    {
        w = new address[](2); p = new uint16[](2);
        w[0] = a; p[0] = x; w[1] = b; p[1] = y;
    }

    function _one(address a, uint16 x) internal pure returns (address[] memory w, uint16[] memory p) {
        w = new address[](1); p = new uint16[](1);
        w[0] = a; p[0] = x;
    }

    function _price(bytes32 fp, uint256 price) internal {
        vm.prank(artist);
        lic.setLicensePrice(fp, price);
    }

    // ── Precio ────────────────────────────────────────────────────────────────

    function test_AuthorCanSetPrice() public {
        bytes32 fp = _register();
        vm.expectEmit(true, true, false, true);
        emit LicensePriceSet(fp, artist, 1 ether);
        _price(fp, 1 ether);
        assertEq(lic.licensePrice(fp), 1 ether);
    }

    function test_RevertIf_NonAuthorSetsPrice() public {
        bytes32 fp = _register();
        vm.prank(stranger);
        vm.expectRevert("MuSecureLicensing: not the author");
        lic.setLicensePrice(fp, 1 ether);
    }

    function test_RevertIf_PriceForUnregisteredWork() public {
        vm.prank(artist);
        vm.expectRevert("MuSecure: not found");
        lic.setLicensePrice(keccak256("nope"), 1 ether);
    }

    // ── Compra y reparto ──────────────────────────────────────────────────────

    function test_Buy_SplitsByCredits() public {
        bytes32 fp = _register();
        (address[] memory w, uint16[] memory p) = _two(collab1, 3000, collab2, 2000);
        _credit(fp, w, p);
        _price(fp, 1 ether);

        vm.expectEmit(true, true, true, true);
        emit LicensePurchased(fp, buyer, artist, 1 ether);

        vm.prank(buyer);
        lic.buyLicense{value: 1 ether}(fp);

        assertEq(collab1.balance, 0.3 ether);
        assertEq(collab2.balance, 0.2 ether);
        assertEq(artist.balance,  0.5 ether);
        assertEq(address(lic).balance, 0);
        assertTrue(lic.hasLicense(fp, buyer));
    }

    function test_Buy_NoCredits_AllToAuthor() public {
        bytes32 fp = _register();
        _price(fp, 1000);
        vm.prank(buyer);
        lic.buyLicense{value: 1000}(fp);
        assertEq(artist.balance, 1000);
    }

    function test_Buy_RoundingDustGoesToAuthor() public {
        bytes32 fp = _register();
        (address[] memory w, uint16[] memory p) = _two(collab1, 3333, collab2, 3333);
        _credit(fp, w, p);
        _price(fp, 10001);

        vm.prank(buyer);
        lic.buyLicense{value: 10001}(fp);

        assertEq(collab1.balance, 3333);
        assertEq(collab2.balance, 3333);
        assertEq(artist.balance,  3335);
        assertEq(address(lic).balance, 0);
    }

    function test_Buy_TinyShareRoundsToZeroAndIsSkipped() public {
        bytes32 fp = _register();
        (address[] memory w, uint16[] memory p) = _one(collab1, 1); // 0,01 %
        _credit(fp, w, p);
        _price(fp, 9999); // 9999 * 1 / 10000 = 0
        vm.prank(buyer);
        lic.buyLicense{value: 9999}(fp);
        assertEq(collab1.balance, 0);
        assertEq(artist.balance, 9999);
    }

    function test_RevertIf_NotForSale() public {
        bytes32 fp = _register();
        vm.prank(buyer);
        vm.expectRevert("MuSecureLicensing: not for sale");
        lic.buyLicense{value: 1}(fp);
    }

    function test_RevertIf_WrongPayment() public {
        bytes32 fp = _register();
        _price(fp, 1 ether);
        vm.startPrank(buyer);
        vm.expectRevert("MuSecureLicensing: wrong payment");
        lic.buyLicense{value: 0.5 ether}(fp);
        vm.expectRevert("MuSecureLicensing: wrong payment");
        lic.buyLicense{value: 2 ether}(fp);
        vm.stopPrank();
    }

    function test_RevertIf_BuyTwice() public {
        bytes32 fp = _register();
        _price(fp, 1 ether);
        vm.startPrank(buyer);
        lic.buyLicense{value: 1 ether}(fp);
        vm.expectRevert("MuSecureLicensing: already licensed");
        lic.buyLicense{value: 1 ether}(fp);
        vm.stopPrank();
    }

    function test_PriceChange_KeepsExistingLicenses_AndProtectsBuyers() public {
        bytes32 fp = _register();
        _price(fp, 1 ether);
        vm.prank(buyer);
        lic.buyLicense{value: 1 ether}(fp);

        _price(fp, 2 ether);
        assertTrue(lic.hasLicense(fp, buyer));

        // Alguien que había visto el precio viejo no paga otro importe sin enterarse: revierte.
        vm.prank(buyer2);
        vm.expectRevert("MuSecureLicensing: wrong payment");
        lic.buyLicense{value: 1 ether}(fp);
    }

    function test_PriceZero_WithdrawsFromSale() public {
        bytes32 fp = _register();
        _price(fp, 1 ether);
        _price(fp, 0);
        vm.prank(buyer);
        vm.expectRevert("MuSecureLicensing: not for sale");
        lic.buyLicense{value: 1 ether}(fp);
    }

    // ── Receptores problemáticos ──────────────────────────────────────────────

    function test_RejectingRecipient_GoesToClaimable_ThenWithdraws() public {
        Rejecter rej = new Rejecter(lic);
        bytes32 fp = _register();
        (address[] memory w, uint16[] memory p) = _one(address(rej), 5000);
        _credit(fp, w, p);
        _price(fp, 1 ether);

        vm.expectEmit(true, true, false, true);
        emit RoyaltyPaid(fp, address(rej), 0.5 ether, false, false);
        vm.prank(buyer);
        lic.buyLicense{value: 1 ether}(fp); // la venta NO se bloquea

        assertEq(lic.claimable(address(rej)), 0.5 ether);
        assertEq(address(lic).balance, 0.5 ether);
        assertEq(artist.balance, 0.5 ether);

        vm.expectRevert(); // sigue rechazando
        rej.claim();
        assertEq(lic.claimable(address(rej)), 0.5 ether);

        rej.setAccept(true, true); // ahora acepta e intenta re-entrar en withdraw()
        rej.claim();
        assertEq(address(rej).balance, 0.5 ether);
        assertEq(lic.claimable(address(rej)), 0);
        assertTrue(rej.reenterBlocked());
        assertEq(address(lic).balance, 0);
    }

    function test_GasBurnerRecipient_DoesNotBlockSale() public {
        GasBurner burner = new GasBurner();
        bytes32 fp = _register();
        (address[] memory w, uint16[] memory p) = _one(address(burner), 4000);
        _credit(fp, w, p);
        _price(fp, 1 ether);

        vm.prank(buyer);
        uint256 g = gasleft();
        lic.buyLicense{value: 1 ether}(fp);
        assertLt(g - gasleft(), 500_000);

        assertEq(lic.claimable(address(burner)), 0.4 ether);
        assertEq(artist.balance, 0.6 ether);
    }

    function test_ReentrancyIntoBuy_IsBlocked() public {
        Reenterer re = new Reenterer{value: 5 ether}(lic);
        bytes32 fp = _register();
        (address[] memory w, uint16[] memory p) = _one(address(re), 5000);
        _credit(fp, w, p);
        _price(fp, 1 ether);
        re.arm(fp, 1 ether);

        vm.prank(buyer2);
        lic.buyLicense{value: 1 ether}(fp);

        assertTrue(re.attempted());
        assertFalse(re.succeeded());
        assertFalse(lic.hasLicense(fp, address(re)));
        assertEq(address(lic).balance, 0);
    }

    function test_RevertIf_WithdrawWithNothing() public {
        vm.prank(stranger);
        vm.expectRevert("MuSecureLicensing: nothing to claim");
        lic.withdraw();
    }

    // ── Fuzz ──────────────────────────────────────────────────────────────────

    /// @dev Cada wei pagado llega a alguien: suma de pagos == precio y el contrato no retiene nada.
    function testFuzz_FundsConserved(uint96 priceRaw, uint16 bps1, uint16 bps2) public {
        uint256 price = bound(uint256(priceRaw), 1, 1_000_000 ether);
        uint16 b1 = uint16(bound(bps1, 1, 5000));
        uint16 b2 = uint16(bound(bps2, 1, 5000));

        bytes32 fp = _register();
        (address[] memory w, uint16[] memory p) = _two(collab1, b1, collab2, b2);
        _credit(fp, w, p);
        _price(fp, price);

        vm.deal(buyer, price);
        vm.prank(buyer);
        lic.buyLicense{value: price}(fp);

        assertEq(collab1.balance + collab2.balance + artist.balance, price);
        assertEq(address(lic).balance, 0);
        assertEq(collab1.balance, (price * b1) / 10_000);
        assertEq(collab2.balance, (price * b2) / 10_000);
    }
}
