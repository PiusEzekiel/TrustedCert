const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TrustedCert Integration Tests", function () {
  let certificateRegistry;
  let deployer, institution, randomUser;
  let certId;

  const recipientName = "John Doe";
  const title = "BSc Software Engineering";
  const cid = "QmTestIPFSHashExample";
  const externalId = "JD-2025";

  beforeEach(async () => {
    [deployer, institution, randomUser] = await ethers.getSigners();

    const CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");
    certificateRegistry = await CertificateRegistry.deploy();
    await certificateRegistry.waitForDeployment();
  });

  it("Should deploy, assign role, register, verify, and revoke certificate end-to-end", async function () {
    // Add institution with role and metadata
    await expect(
      certificateRegistry.connect(deployer).addInstitution(
        institution.address,
        "ALU Kigali",
        "Accredited Institution in Rwanda"
      )
    ).to.emit(certificateRegistry, "InstitutionAdded");

    // Register certificate
    const tx = await certificateRegistry.connect(institution).registerCertificate(
      recipientName,
      title,
      cid,
      externalId
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.eventName === "CertificateRegistered");
    certId = event.args.certId;

    // Verify the certificate exists
    const certData = await certificateRegistry.verifyCertificate(certId);
    expect(certData.recipientName).to.equal(recipientName);
    expect(certData.title).to.equal(title);
    expect(certData.cid).to.equal(cid);
    expect(certData.issuedBy).to.equal(institution.address);
    expect(certData.isRevoked).to.equal(false);

    // Revoke the certificate
    await expect(
      certificateRegistry.connect(institution).revokeCertificate(certId)
    ).to.emit(certificateRegistry, "CertificateRevoked");

    // Confirm revoked status
    const revoked = await certificateRegistry.verifyCertificate(certId);
    expect(revoked.isRevoked).to.equal(true);
  });

  it("Should fail if unauthorized user tries to register a certificate", async function () {
  await expect(
    certificateRegistry.connect(randomUser).registerCertificate(
      "Fake User",
      "MSc",
      "FakeCID",
      "F001"
    )
  ).to.be.revertedWith(/AccessControl/);
});


  it("Should fail to verify non-existent certificate", async function () {
    const fakeId = ethers.keccak256(ethers.toUtf8Bytes("NonExistent"));
    await expect(
      certificateRegistry.verifyCertificate(fakeId)
    ).to.be.revertedWith("Certificate does not exist");
  });
});
