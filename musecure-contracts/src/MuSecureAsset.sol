// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IMuSecure.sol";

/// @title MuSecureAsset
/// @notice NFT certificado de propiedad intelectual musical.
///         Cada token representa una obra registrada en MuSecureRegistry.
///         Soulbound configurable por token: si está activado el NFT no puede
///         transferirse (permanece vinculado a la identidad del autor).
contract MuSecureAsset is IMuSecureAsset, ERC721URIStorage, Ownable, Pausable {

    // ── Estado ────────────────────────────────────────────────────────────────

    /// @notice Solo el Registry puede mintear
    address public registryContract;

    /// @notice Contador de tokens (reemplaza OZ Counters deprecado en v5)
    uint256 private _nextTokenId = 1;

    /// @notice tokenId → soulbound
    mapping(uint256 => bool) private _soulbound;

    // ── Eventos ───────────────────────────────────────────────────────────────

    event CertificateMinted(
        address indexed to,
        uint256 indexed tokenId,
        string  ipfsCid,
        bool    soulbound
    );

    event SoulboundStatusChanged(uint256 indexed tokenId, bool soulbound);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address initialOwner)
        ERC721("MuSecure IP Certificate", "MSIP")
        Ownable(initialOwner)
    {}

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setRegistryContract(address _registry) external onlyOwner {
        require(_registry != address(0), "MuSecureAsset: zero address");
        registryContract = _registry;
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Permite al dueño del token o al owner del contrato cambiar soulbound.
    function setSoulbound(uint256 tokenId, bool _isSoulbound) external {
        require(_ownerOf(tokenId) != address(0), "MuSecureAsset: token does not exist");
        require(
            msg.sender == ownerOf(tokenId) || msg.sender == owner(),
            "MuSecureAsset: not token owner or contract owner"
        );
        _soulbound[tokenId] = _isSoulbound;
        emit SoulboundStatusChanged(tokenId, _isSoulbound);
    }

    // ── Mint ─────────────────────────────────────────────────────────────────

    /// @notice Mintea un certificado NFT. Solo llamable desde MuSecureRegistry.
    function mintCertificate(
        address to,
        string calldata ipfsCid,
        bool soulbound
    )
        external
        whenNotPaused
        returns (uint256 tokenId)
    {
        require(msg.sender == registryContract, "MuSecureAsset: only registry");
        require(to != address(0), "MuSecureAsset: zero address");

        tokenId = _nextTokenId++;

        _safeMint(to, tokenId);

        // tokenURI apunta al metadata JSON en IPFS
        string memory uri = string(abi.encodePacked("ipfs://", ipfsCid));
        _setTokenURI(tokenId, uri);

        _soulbound[tokenId] = soulbound;

        emit CertificateMinted(to, tokenId, ipfsCid, soulbound);
    }

    // ── Soulbound ─────────────────────────────────────────────────────────────

    function isSoulbound(uint256 tokenId) external view returns (bool) {
        return _soulbound[tokenId];
    }

    /// @dev Bloquea transferencias si el token es soulbound.
    ///      _update se llama en mint, transfer y burn.
    ///      Permitimos mint (from == address(0)) pero bloqueamos transferencias.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // Mint siempre permitido
        if (from != address(0) && _soulbound[tokenId]) {
            // Burn también bloqueado para soulbound - la obra existe para siempre
            revert("MuSecureAsset: soulbound token - non-transferable");
        }

        return super._update(to, tokenId, auth);
    }

    // ── ERC-165 ───────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
