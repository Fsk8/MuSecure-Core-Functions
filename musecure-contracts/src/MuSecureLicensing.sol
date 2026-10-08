// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMuSecureRegistry} from "./interfaces/IMuSecure.sol";

/// @dev Lo único que Licensing necesita de MuSecureCredits (mismo layout ABI que su struct Credit).
interface IMuSecureCreditsView {
    struct Credit {
        address collaborator;
        uint16 bps; // 1 = 0,01 %
    }

    function getCredits(bytes32 fingerprintHash) external view returns (Credit[] memory);
}

/// @title MuSecureLicensing
/// @notice Venta de licencias de uso por obra. El autor fija un precio (en moneda nativa) y,
///         cuando alguien compra, el pago se reparte en la misma transacción entre los
///         colaboradores acreditados en MuSecureCredits (según sus bps); el remanente
///         —incluido el polvo del redondeo— es del autor.
/// @dev Standalone: no modifica Registry, Asset ni Credits.
///      Los pagos son PUSH (se envían al colaborador dentro de la compra, sin que tenga que
///      firmar nada). Si un envío falla, la compra NO se revierte: ese importe queda en
///      `claimable` y su dueño lo retira con `withdraw()`. Así un destinatario que rechaza
///      fondos (o que consume todo el gas) no puede bloquear las ventas de la obra.
///      Seguridad: efectos antes de interacciones, `nonReentrant` en las funciones que mueven
///      fondos y límite de gas por pago.
contract MuSecureLicensing is ReentrancyGuard {
    // ── Constantes ────────────────────────────────────────────────────────────

    uint256 public constant TOTAL_BPS = 10_000;

    /// @notice Gas máximo reenviado en cada pago. Suficiente para una wallet de contrato
    ///         típica; evita que un receptor malicioso consuma el gas de la venta.
    uint256 public constant PAYOUT_GAS = 100_000;

    // ── Estado ────────────────────────────────────────────────────────────────

    IMuSecureRegistry public immutable registry;
    IMuSecureCreditsView public immutable credits;

    /// @notice fingerprintHash → precio de la licencia en wei (0 = no está a la venta)
    mapping(bytes32 => uint256) public licensePrice;

    /// @notice fingerprintHash → comprador → ¿tiene licencia?
    mapping(bytes32 => mapping(address => bool)) public hasLicense;

    /// @notice Fondos cuyo envío directo falló; se retiran con `withdraw()`
    mapping(address => uint256) public claimable;

    // ── Eventos (Envio los indexa) ────────────────────────────────────────────

    event LicensePriceSet(bytes32 indexed fingerprintHash, address indexed author, uint256 price);

    event LicensePurchased(
        bytes32 indexed fingerprintHash,
        address indexed buyer,
        address indexed author,
        uint256 price
    );

    /// @param direct true = enviado a la wallet; false = quedó en `claimable`
    event RoyaltyPaid(
        bytes32 indexed fingerprintHash,
        address indexed recipient,
        uint256 amount,
        bool isAuthor,
        bool direct
    );

    event RoyaltyClaimed(address indexed account, uint256 amount);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address registryAddress, address creditsAddress) {
        require(registryAddress != address(0), "MuSecureLicensing: zero registry");
        require(creditsAddress != address(0), "MuSecureLicensing: zero credits");
        registry = IMuSecureRegistry(registryAddress);
        credits = IMuSecureCreditsView(creditsAddress);
    }

    // ── Autor: fijar precio ───────────────────────────────────────────────────

    /// @notice El autor fija (o cambia) el precio de la licencia. 0 retira la obra de la venta.
    /// @dev Cambiar el precio no afecta a licencias ya compradas.
    function setLicensePrice(bytes32 fingerprintHash, uint256 price) external {
        // getWork revierte con "not found" si la obra no está registrada.
        address author = registry.getWork(fingerprintHash).authorAddress;
        require(msg.sender == author, "MuSecureLicensing: not the author");

        licensePrice[fingerprintHash] = price;
        emit LicensePriceSet(fingerprintHash, author, price);
    }

    // ── Comprador: comprar licencia ───────────────────────────────────────────

    /// @notice Compra una licencia pagando EXACTAMENTE el precio vigente. Una por wallet y obra.
    /// @dev Exigir msg.value == precio protege al comprador si el autor cambia el precio
    ///      mientras su transacción está pendiente (revierte en vez de cobrarle otro importe).
    function buyLicense(bytes32 fingerprintHash) external payable nonReentrant {
        uint256 price = licensePrice[fingerprintHash];
        require(price > 0, "MuSecureLicensing: not for sale");
        require(msg.value == price, "MuSecureLicensing: wrong payment");
        require(!hasLicense[fingerprintHash][msg.sender], "MuSecureLicensing: already licensed");

        address author = registry.getWork(fingerprintHash).authorAddress;

        // Efectos
        hasLicense[fingerprintHash][msg.sender] = true;
        emit LicensePurchased(fingerprintHash, msg.sender, author, price);

        // Reparto (interacciones)
        IMuSecureCreditsView.Credit[] memory list = credits.getCredits(fingerprintHash);
        uint256 distributed;
        for (uint256 i = 0; i < list.length; ++i) {
            uint256 amount = (price * list[i].bps) / TOTAL_BPS;
            if (amount == 0) continue;
            distributed += amount;
            _payout(fingerprintHash, list[i].collaborator, amount, false);
        }

        // Remanente (porción del autor + redondeo). distributed <= price porque suma(bps) <= 10_000.
        uint256 authorAmount = price - distributed;
        if (authorAmount > 0) {
            _payout(fingerprintHash, author, authorAmount, true);
        }
    }

    // ── Retiro de pagos que fallaron ──────────────────────────────────────────

    /// @notice Retira lo acumulado en `claimable` (pagos directos que no pudieron entregarse).
    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "MuSecureLicensing: nothing to claim");

        claimable[msg.sender] = 0; // efecto antes de la interacción
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "MuSecureLicensing: transfer failed");

        emit RoyaltyClaimed(msg.sender, amount);
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    function _payout(bytes32 fingerprintHash, address to, uint256 amount, bool isAuthor) internal {
        (bool ok, ) = to.call{value: amount, gas: PAYOUT_GAS}("");
        if (!ok) {
            claimable[to] += amount;
        }
        emit RoyaltyPaid(fingerprintHash, to, amount, isAuthor, ok);
    }
}
