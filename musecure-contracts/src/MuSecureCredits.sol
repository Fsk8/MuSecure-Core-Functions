// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Solo lo que MuSecureCredits necesita del Registry. Es una función pública
///      de MuSecureRegistry (no depende del struct WorkRecord ni de IMuSecure.sol).
interface IMuSecureWorkRegistry {
    function getAuthorWorks(address author) external view returns (bytes32[] memory);
}

/// @title MuSecureCredits
/// @notice Créditos de co-autoría por obra: el autor de una obra registrada en
///         MuSecureRegistry declara, una sola vez, qué wallets participan y con qué
///         porcentaje (en puntos base). Standalone: no modifica Registry ni Asset.
/// @dev Los créditos son una DECLARACIÓN inmutable del autor, indexable por Envio.
///      Este contrato no mueve fondos ni hace cumplir repartos: otros contratos
///      (regalías, marketplaces) podrían leerlos en el futuro.
///      El autor se conserva el remanente: 10_000 − suma(bps).
contract MuSecureCredits {
    // ── Constantes ────────────────────────────────────────────────────────────

    uint256 public constant MAX_COLLABORATORS = 10;
    uint256 public constant TOTAL_BPS = 10_000; // 100,00 %

    // ── Estado ────────────────────────────────────────────────────────────────

    /// @notice Registry contra el que se verifica la autoría de cada obra
    IMuSecureWorkRegistry public immutable registry;

    struct Credit {
        address collaborator;
        uint16 bps; // 1 = 0,01 %
    }

    /// @notice fingerprintHash → créditos de esa obra
    mapping(bytes32 => Credit[]) private _credits;

    /// @notice colaborador → obras en las que figura (para consultas on-chain)
    mapping(address => bytes32[]) private _creditedWorks;

    // ── Eventos ───────────────────────────────────────────────────────────────

    /// @notice Un evento por colaborador acreditado. Envio indexa este evento.
    event CollaboratorCredited(
        bytes32 indexed fingerprintHash,
        address indexed author,
        address indexed collaborator,
        uint16 bps
    );

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address registryAddress) {
        require(registryAddress != address(0), "MuSecureCredits: zero registry");
        registry = IMuSecureWorkRegistry(registryAddress);
    }

    // ── Core ──────────────────────────────────────────────────────────────────

    /// @notice Acredita colaboradores de una obra ya registrada. Solo el autor, una vez por obra.
    /// @param fingerprintHash Huella de la obra (la misma usada en registerWork)
    /// @param collaborators   Wallets (Embedded Wallets de Privy) de los colaboradores
    /// @param bps             Participación de cada uno en puntos base; suma ≤ 10_000
    function creditCollaborators(
        bytes32 fingerprintHash,
        address[] calldata collaborators,
        uint16[] calldata bps
    ) external {
        uint256 n = collaborators.length;
        require(n > 0 && n <= MAX_COLLABORATORS, "MuSecureCredits: invalid collaborator count");
        require(n == bps.length, "MuSecureCredits: length mismatch");
        require(_credits[fingerprintHash].length == 0, "MuSecureCredits: already credited");
        require(_isAuthor(msg.sender, fingerprintHash), "MuSecureCredits: not the author");

        uint256 total;
        for (uint256 i = 0; i < n; ++i) {
            address collaborator = collaborators[i];
            uint16 share = bps[i];

            require(collaborator != address(0), "MuSecureCredits: zero address");
            require(collaborator != msg.sender, "MuSecureCredits: author cannot credit self");
            require(share > 0, "MuSecureCredits: zero share");
            for (uint256 j = 0; j < i; ++j) {
                require(collaborators[j] != collaborator, "MuSecureCredits: duplicate collaborator");
            }

            total += share;
            _credits[fingerprintHash].push(Credit({collaborator: collaborator, bps: share}));
            _creditedWorks[collaborator].push(fingerprintHash);

            emit CollaboratorCredited(fingerprintHash, msg.sender, collaborator, share);
        }

        require(total <= TOTAL_BPS, "MuSecureCredits: shares exceed 100%");
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getCredits(bytes32 fingerprintHash) external view returns (Credit[] memory) {
        return _credits[fingerprintHash];
    }

    function hasCredits(bytes32 fingerprintHash) external view returns (bool) {
        return _credits[fingerprintHash].length > 0;
    }

    function getCreditedWorks(address collaborator) external view returns (bytes32[] memory) {
        return _creditedWorks[collaborator];
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    /// @dev Recorre las obras del autor en el Registry (O(n) en sus obras).
    ///      Aceptable a escala de hackathon; con IMuSecure.sol se puede pasar a O(1)
    ///      usando getWork(fingerprintHash).authorAddress.
    function _isAuthor(address account, bytes32 fingerprintHash) internal view returns (bool) {
        bytes32[] memory works = registry.getAuthorWorks(account);
        for (uint256 i = 0; i < works.length; ++i) {
            if (works[i] == fingerprintHash) return true;
        }
        return false;
    }
}
