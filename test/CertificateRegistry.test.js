const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TrustedCert CertificateRegistry Unit Tests", function () {
  let CertificateRegistry;
  let registry;
  let admin, institution1, institution2, user;

  beforeEach(async function () {
    [admin, institution1, institution2, user] = await ethers.getSigners();
    CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");
    registry = await CertificateRegistry.connect(admin).deploy();
  });

  describe("Deployment & Roles", function () {
    it("should allow admin to add and remove institutions and emit events", async function () {
      const tx = await registry.connect(admin).addInstitution(institution1.address, "Inst A", "First Institution");
      
      // ✅ Expect the event to have 3 arguments now
      await expect(tx).to.emit(registry, "InstitutionAdded")
        .withArgs(institution1.address, "Inst A", "First Institution");
    
      const [names, descriptions, wallets] = await registry.getInstitutions();
      expect(names[0]).to.equal("Inst A");
      expect(wallets[0]).to.equal(institution1.address);
    
      const removeTx = await registry.connect(admin).removeInstitution(institution1.address);
      
      // ✅ Remove institution event should still match
      await expect(removeTx).to.emit(registry, "InstitutionRemoved").withArgs(institution1.address);
    
      const [updatedNames] = await registry.getInstitutions();
      expect(updatedNames.length).to.equal(0);
    });
    
  });

  describe("Certificate Registration", function () {
    beforeEach(async function () {
      await registry.connect(admin).addInstitution(institution1.address, "Inst B", "Second Institution");
    });

    it("should register a certificate with auto-generated ID and emit event", async function () {
      const tx = await registry.connect(institution1).registerCertificate("Alice", "BSc", "cid1", "");
      const receipt = await tx.wait();
      const iface = registry.interface;

      let certId;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === "CertificateRegistered") {
            certId = parsed.args.certId;
            expect(parsed.args.recipientName).to.equal("Alice");
            expect(parsed.args.title).to.equal("BSc");
            expect(parsed.args.cid).to.equal("cid1");
            break;
          }
        } catch {}
      }

      await expect(tx).to.emit(registry, "CertificateRegistered").withArgs(certId, institution1.address, "Alice", "BSc", "cid1");

      const cert = await registry.certificates(certId);
      expect(cert.recipientName).to.equal("Alice");
    });

    it("should prevent duplicate certificates with same external ID", async function () {
      const id = "DUPLICATE-ID";
      await registry.connect(institution1).registerCertificate("Eve", "Cert A", "cid3", id);

      await expect(
        registry.connect(institution1).registerCertificate("Eve", "Cert B", "cid4", id)
      ).to.be.revertedWith("Certificate already exists");
    });
  });

  describe("Certificate Revocation", function () {
    let certId;

    beforeEach(async function () {
      await registry.connect(admin).addInstitution(institution1.address, "Inst C", "Third Institution");
      const tx = await registry.connect(institution1).registerCertificate("Alice", "Cert", "cid5", "");
      const receipt = await tx.wait();
      const iface = registry.interface;

      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === "CertificateRegistered") {
            certId = parsed.args.certId;
            break;
          }
        } catch {}
      }
    });

    it("should allow issuer to revoke certificate and emit event", async function () {
      const tx = await registry.connect(institution1).revokeCertificate(certId);
      await expect(tx).to.emit(registry, "CertificateRevoked").withArgs(certId, institution1.address);

      const cert = await registry.certificates(certId);
      expect(cert.isRevoked).to.be.true;
    });

    it("should NOT allow another institution to revoke", async function () {
      await registry.connect(admin).addInstitution(institution2.address, "Inst D", "Fourth Institution");
      await expect(
        registry.connect(institution2).revokeCertificate(certId)
      ).to.be.revertedWith("Not issuer of this certificate");
    });

    it("should NOT allow revoking twice", async function () {
      await registry.connect(institution1).revokeCertificate(certId);
      await expect(
        registry.connect(institution1).revokeCertificate(certId)
      ).to.be.revertedWith("Already revoked");
    });
  });

  describe("Verification", function () {
    it("should return correct metadata for a valid certificate", async function () {
      await registry.connect(admin).addInstitution(institution1.address, "Inst E", "Fifth Institution");
      const tx = await registry.connect(institution1).registerCertificate("Charlie", "Diploma", "cid6", "");
      const receipt = await tx.wait();
      const iface = registry.interface;

      let certId;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === "CertificateRegistered") {
            certId = parsed.args.certId;
            break;
          }
        } catch {}
      }

      const cert = await registry.verifyCertificate(certId);
      expect(cert.recipientName).to.equal("Charlie");
    });

    it("should revert when verifying non-existent certificate", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      await expect(registry.verifyCertificate(fakeId)).to.be.revertedWith("Certificate does not exist");
    });
  });

  describe("Pause Functionality", function () {
    beforeEach(async function () {
      await registry.connect(admin).addInstitution(institution1.address, "Inst F", "Sixth Institution");
    });

    it("should not allow registration when paused and emit event", async function () {
      const tx = await registry.connect(admin).pause();
      await expect(tx).to.emit(registry, "Paused").withArgs(admin.address);

      await expect(
        registry.connect(institution1).registerCertificate("Test", "Pause", "cid7", "")
      ).to.be.revertedWith("Pausable: paused");
    });

    it("should not allow revocation when paused and emit event", async function () {
      const tx = await registry.connect(institution1).registerCertificate("Test", "PauseCert", "cid8", "");
      const receipt = await tx.wait();
      const iface = registry.interface;

      let certId;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === "CertificateRegistered") {
            certId = parsed.args.certId;
            break;
          }
        } catch {}
      }

      await registry.connect(admin).pause();
      await expect(
        registry.connect(institution1).revokeCertificate(certId)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("should allow actions after unpause and emit event", async function () {
      await registry.connect(admin).pause();
      const tx = await registry.connect(admin).unpause();
      await expect(tx).to.emit(registry, "Unpaused").withArgs(admin.address);

      await expect(
        registry.connect(institution1).registerCertificate("Unpaused", "Back", "cid9", "")
      ).to.not.be.reverted;
    });
  });
});
