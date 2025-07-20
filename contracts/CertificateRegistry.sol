// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Import OpenZeppelin's role-based access control and pausable functionality
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title CertificateRegistry
 * @dev Smart contract to manage issuance, revocation, and verification of certificates.
 */
contract CertificateRegistry is AccessControl, Pausable {
    // Custom role for institutions allowed to issue certificates
    bytes32 public constant INSTITUTION_ROLE = keccak256("INSTITUTION_ROLE");

    // Structure to store details of each certificate
    struct Certificate {
        string recipientName; // Name of the certificate recipient
        string title; // Title of the certificate (e.g., BSc, MSc)
        string cid; // IPFS CID (Content Identifier) of the certificate file
        uint256 issuedAt; // Timestamp when the certificate was issued
        bool isRevoked; // Flag to indicate if the certificate is revoked
        address issuedBy; // Address of the issuing institution
    }

    // Structure to store institution details
    struct Institution {
        string name;
        string description;
        address wallet;
    }
    // Mapping from certificate ID to its corresponding certificate data
    mapping(bytes32 => Certificate) public certificates;

    // Mapping to track all certificates issued by a specific institution
    mapping(address => bytes32[]) public institutionCertificates;

    // Mapping of institution addresses to their details
    mapping(address => Institution) public institutions;

    // Array to store all registered institution addresses
    address[] private institutionList;

    // Events for logging actions
    event CertificateRegistered(bytes32 indexed certId, address indexed institution, string recipientName, string title, string cid);
    event CertificateRevoked(bytes32 indexed certId, address indexed institution);
    event InstitutionAdded(address indexed institution, string name, string description);
    event InstitutionRemoved(address indexed institution);

    /**
     * @dev Constructor sets the deployer as the default admin.
     */
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Modifier to ensure that only the original issuer of a certificate can revoke it.
     */
    modifier onlyIssuer(bytes32 certId) {
        require(
            certificates[certId].issuedBy == msg.sender,
            "Not issuer of this certificate"
        );
        _;
    }

    /**
     * @dev Allows admin to pause all contract functions marked with `whenNotPaused`.
     */
    function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
        emit Paused(msg.sender);
    }

    /**
     * @dev Allows admin to unpause the contract.
     */
    function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
        emit Unpaused(msg.sender);
    }

/**
     * @dev Admin assigns INSTITUTION_ROLE to an address and stores institution details.
     * @param institution The address to be assigned as an institution.
     * @param name The name of the institution.
     * @param description A short description of the institution.
     */
    function addInstitution(address institution, string memory name, string memory description)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        grantRole(INSTITUTION_ROLE, institution);
        institutions[institution] = Institution(name, description, institution);
        institutionList.push(institution);
        emit InstitutionAdded(institution, name, description);
    }

    /**
     * @dev Admin revokes INSTITUTION_ROLE and removes institution details.
     * @param institution The institution address to revoke.
     */
    function removeInstitution(address institution) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(INSTITUTION_ROLE, institution);
        delete institutions[institution];

        // Remove from institutionList
        for (uint i = 0; i < institutionList.length; i++) {
            if (institutionList[i] == institution) {
                institutionList[i] = institutionList[institutionList.length - 1];
                institutionList.pop();
                break;
            }
        }

        emit InstitutionRemoved(institution);
    }
/**
     * @dev Returns an array of all registered institutions.
     * @return names List of institution names.
     * @return descriptions List of institution descriptions.
     * @return wallets List of institution addresses.
     */
    function getInstitutions() external view returns (string[] memory names, 
    string[] memory descriptions, address[] memory wallets) {
        uint length = institutionList.length;
        names = new string[](length);
        descriptions = new string[](length);
        wallets = new address[](length);

        for (uint i = 0; i < length; i++) {
            Institution memory inst = institutions[institutionList[i]];
            names[i] = inst.name;
            descriptions[i] = inst.description;
            wallets[i] = inst.wallet;
        }
    }

    /**
     * @dev Allows an institution to register a new certificate.
     * @param recipientName Name of the recipient.
     * @param title Title of the certificate.
     * @param cid IPFS CID of the certificate.
     * @param externalId Optional external ID.
     * @return certId The generated certificate ID.
     */
    function registerCertificate(
        string calldata recipientName,
        string calldata title,
        string calldata cid,
        string calldata externalId
    ) external onlyRole(INSTITUTION_ROLE) whenNotPaused returns (bytes32 certId) {
        certId = bytes(externalId).length == 0
            ? keccak256(abi.encodePacked(msg.sender, recipientName, block.timestamp))
            : keccak256(abi.encodePacked(msg.sender, externalId));

        require(certificates[certId].issuedAt == 0, "Certificate already exists");

        certificates[certId] = Certificate(recipientName, title, cid, block.timestamp, false, msg.sender);
        institutionCertificates[msg.sender].push(certId);

        emit CertificateRegistered(certId, msg.sender, recipientName, title, cid);
    }

    /**
     * @dev Allows the issuing institution to revoke a certificate.
     * @param certId The certificate ID to revoke.
     */
    function revokeCertificate(bytes32 certId)
        external onlyRole(INSTITUTION_ROLE) onlyIssuer(certId) whenNotPaused
    {
        require(!certificates[certId].isRevoked, "Already revoked");
        certificates[certId].isRevoked = true;
        emit CertificateRevoked(certId, msg.sender);
    }

    /**
     * @dev Verifies a certificate’s details.
     * @param certId The certificate ID.
     * @return recipientName The recipient's name.
     * @return title The certificate title.
     * @return cid The IPFS CID.
     * @return issuedAt The timestamp of issuance.
     * @return isRevoked Whether the certificate is revoked.
     * @return issuedBy The issuing institution.
     */
    function verifyCertificate(bytes32 certId)
        external view returns (string memory recipientName, string memory title, 
        string memory cid, uint256 issuedAt, bool isRevoked, address issuedBy)
    {
        Certificate memory cert = certificates[certId];
        require(cert.issuedAt != 0, "Certificate does not exist");

        return (cert.recipientName, cert.title, cert.cid, cert.issuedAt, cert.isRevoked, cert.issuedBy);
    }

    /**
     * @dev Returns a list of certificate IDs issued by an institution.
     * @param institution The institution's address.
     * @return Array of certificate IDs.
     */
    function getInstitutionCertificates(address institution)
        external view returns (bytes32[] memory)
    {
        return institutionCertificates[institution];
    }
}