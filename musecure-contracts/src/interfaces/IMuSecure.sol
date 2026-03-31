// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IMuSecure
/// @notice Interfaz compartida entre MuSecureRegistry y MuSecureAsset
interface IMuSecureRegistry {
    enum RiskLevel { Low, Medium, High, Blocked }

    struct WorkRecord {
        bytes32 fingerprintHash;   // SHA-256 del fingerprint acústico
        string  ipfsCid;           // CID del metadata JSON en Lighthouse/IPFS
        uint256 authenticityScore; // 0–100 (100 = idéntico a obra conocida)
        RiskLevel riskLevel;
        uint256 timestamp;
        address authorAddress;
        uint256 tokenId;           // NFT asociado (0 si aún no minteado)
        bool    soulbound;         // ¿NFT intransferible?
    }

    event WorkRegistered(
        address indexed author,
        bytes32 indexed fingerprintHash,
        string  ipfsCid,
        uint256 authenticityScore,
        RiskLevel riskLevel,
        uint256 tokenId,
        uint256 timestamp
    );

    event WorkBlocked(
        address indexed author,
        bytes32 indexed fingerprintHash,
        uint256 authenticityScore,
        uint256 timestamp
    );

    function registerWork(
        bytes32 fingerprintHash,
        string calldata ipfsCid,
        uint256 authenticityScore,
        bool soulbound,
        bytes calldata scoreSig
    ) external payable returns (uint256 tokenId);

    function getWork(bytes32 fingerprintHash)
        external view returns (WorkRecord memory);

    function workExists(bytes32 fingerprintHash)
        external view returns (bool);
}

interface IMuSecureAsset {
    function mintCertificate(
        address to,
        string calldata ipfsCid,
        bool soulbound
    ) external returns (uint256 tokenId);

    function isSoulbound(uint256 tokenId) external view returns (bool);
}
