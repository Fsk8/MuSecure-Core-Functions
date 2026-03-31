// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./interfaces/IMuSecure.sol";

/// @title MuSecureRegistry
/// @notice Registro on-chain de huellas acústicas musicales con evaluación de riesgo.
/// @dev Desplegado en Arbitrum One. El authenticityScore debe venir firmado
///      por el backend de MuSecure (scoreSigner) para evitar manipulación.
contract MuSecureRegistry is IMuSecureRegistry, Ownable, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;

    // ── Estado ────────────────────────────────────────────────────────────────

    /// @notice Contrato NFT que mintea los certificados
    IMuSecureAsset public assetContract;

    /// @notice Dirección del backend que firma los authenticityScores
    /// Si es address(0), la verificación de firma está desactivada (solo dev)
    address public scoreSigner;

    /// @notice Registro principal: fingerprintHash → WorkRecord
    mapping(bytes32 => WorkRecord) private _works;

    /// @notice Registro inverso: author → lista de fingerprintHashes
    mapping(address => bytes32[]) private _authorWorks;

    /// @notice Precio de registro (0 por defecto, configurable)
    uint256 public registrationFee;

    // ── Umbrales de riesgo (configurables por owner) ───────────────────────────
    // Score de AcoustID/catálogo: 0 = sin coincidencia, 100 = copia exacta
    uint256 public thresholdBlocked = 95;  // ≥ 95 → Blocked (no se registra)
    uint256 public thresholdHigh    = 80;  // 80–94 → High Risk
    uint256 public thresholdMedium  = 45;  // 45–79 → Medium Risk
                                           // < 45  → Low Risk

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address initialOwner, address _scoreSigner)
        Ownable(initialOwner)
    {
        scoreSigner = _scoreSigner;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setAssetContract(address _assetContract) external onlyOwner {
        require(_assetContract != address(0), "MuSecure: zero address");
        assetContract = IMuSecureAsset(_assetContract);
    }

    event ScoreSignerUpdated(address indexed oldSigner, address indexed newSigner);

    function setScoreSigner(address _signer) external onlyOwner {
        emit ScoreSignerUpdated(scoreSigner, _signer);
        scoreSigner = _signer;
    }

    function setThresholds(
        uint256 _blocked,
        uint256 _high,
        uint256 _medium
    ) external onlyOwner {
        require(_blocked > _high && _high > _medium, "MuSecure: invalid thresholds");
        thresholdBlocked = _blocked;
        thresholdHigh    = _high;
        thresholdMedium  = _medium;
    }

    function setRegistrationFee(uint256 _fee) external onlyOwner {
        registrationFee = _fee;
    }

    function withdrawFees() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "MuSecure: no balance");
        (bool ok, ) = owner().call{value: bal}("");
        require(ok, "MuSecure: transfer failed");
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Core ──────────────────────────────────────────────────────────────────

    /// @notice Registra una obra musical on-chain y mintea un NFT certificado.
    /// @param fingerprintHash SHA-256 del fingerprint acústico (bytes32)
    /// @param ipfsCid         CID del metadata JSON en IPFS
    /// @param authenticityScore Coincidencia con catálogo 0–100
    /// @param soulbound       Si true, el NFT es intransferible
    /// @param scoreSig        Firma ECDSA del backend sobre (fingerprintHash, authenticityScore, sender)
    function registerWork(
        bytes32 fingerprintHash,
        string calldata ipfsCid,
        uint256 authenticityScore,
        bool soulbound,
        bytes calldata scoreSig
    )
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId)
    {
        // ── Validaciones básicas ───────────────────────────────────────────
        require(fingerprintHash != bytes32(0), "MuSecure: empty fingerprint");
        require(bytes(ipfsCid).length > 0,     "MuSecure: empty CID");
        require(authenticityScore <= 100,       "MuSecure: score out of range");
        require(_works[fingerprintHash].timestamp == 0, "MuSecure: already registered");
        require(msg.value >= registrationFee,   "MuSecure: insufficient fee");

        // Devolver exceso de ETH al usuario
        if (msg.value > registrationFee && registrationFee > 0) {
            (bool refunded, ) = msg.sender.call{value: msg.value - registrationFee}("");
            require(refunded, "MuSecure: refund failed");
        }

        // ── Verificar firma del score (si hay signer configurado) ──────────
        if (scoreSigner != address(0)) {
            _verifyScoreSignature(fingerprintHash, authenticityScore, scoreSig);
        }

        // ── Evaluar riesgo ─────────────────────────────────────────────────
        RiskLevel risk = _evaluateRisk(authenticityScore);

        if (risk == RiskLevel.Blocked) {
            emit WorkBlocked(msg.sender, fingerprintHash, authenticityScore, block.timestamp);
            revert("MuSecure: work blocked - too similar to existing catalog");
        }

        // ── Mintear NFT certificado ────────────────────────────────────────
        require(address(assetContract) != address(0), "MuSecure: asset contract not set");
        tokenId = assetContract.mintCertificate(msg.sender, ipfsCid, soulbound);

        // ── Guardar registro ───────────────────────────────────────────────
        _works[fingerprintHash] = WorkRecord({
            fingerprintHash:   fingerprintHash,
            ipfsCid:           ipfsCid,
            authenticityScore: authenticityScore,
            riskLevel:         risk,
            timestamp:         block.timestamp,
            authorAddress:     msg.sender,
            tokenId:           tokenId,
            soulbound:         soulbound
        });

        _authorWorks[msg.sender].push(fingerprintHash);

        emit WorkRegistered(
            msg.sender,
            fingerprintHash,
            ipfsCid,
            authenticityScore,
            risk,
            tokenId,
            block.timestamp
        );
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getWork(bytes32 fingerprintHash)
        external view returns (WorkRecord memory)
    {
        require(_works[fingerprintHash].timestamp > 0, "MuSecure: not found");
        return _works[fingerprintHash];
    }

    function workExists(bytes32 fingerprintHash)
        external view returns (bool)
    {
        return _works[fingerprintHash].timestamp > 0;
    }

    function getAuthorWorks(address author)
        external view returns (bytes32[] memory)
    {
        return _authorWorks[author];
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    function _evaluateRisk(uint256 score) internal view returns (RiskLevel) {
        if (score >= thresholdBlocked) return RiskLevel.Blocked;
        if (score >= thresholdHigh)    return RiskLevel.High;
        if (score >= thresholdMedium)  return RiskLevel.Medium;
        return RiskLevel.Low;
    }

    /// @dev Verifica que el score fue firmado por el backend de MuSecure.
    ///      El mensaje firmado es: keccak256(fingerprintHash, score, sender, chainId)
    ///      Esto evita replay attacks entre redes y wallets.
    function _verifyScoreSignature(
        bytes32 fingerprintHash,
        uint256 score,
        bytes calldata sig
    ) internal view {
        bytes32 msgHash = keccak256(
            abi.encodePacked(fingerprintHash, score, msg.sender, block.chainid)
        );
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(msgHash);
        address recovered = ECDSA.recover(ethHash, sig);
        require(recovered == scoreSigner, "MuSecure: invalid score signature");
    }
}
