// import { CONTRACT_ADDRESS } from "../config.js";

let CONTRACT_ADDRESS, PINATA_JWT;

async function loadConfig() {
  const res = await fetch("https://trustedcert-backend.onrender.com/config");
  const config = await res.json();
  CONTRACT_ADDRESS = config.contractAddress;
  PINATA_JWT = config.pinataJWT;
}

await loadConfig();



let contract;

//Ensure script waits until content is fully loaded

const provider = new ethers.providers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/PSyOkmTF8dSBO9VA2dDXPxjBJJfUblcy");

const res = await fetch("./abi/CertificateRegistry.json");
const abiJson = await res.json();

if (!abiJson || !abiJson.abi) throw new Error("Invalid ABI");

contract = new ethers.Contract(CONTRACT_ADDRESS, abiJson.abi, provider);

function attachVerifyButton() {

  const verifyBtn = document.getElementById("verifyBtn");
  const resultDiv = document.getElementById("result");


  if (!verifyBtn) {
    console.warn("⏳ Waiting for verify button...");
    setTimeout(attachVerifyButton, 500); // Retry in 500ms
    return;
  }

  console.log("✅ verifyBtn found!");
  verifyBtn.onclick = async () => {
    const certId = document.getElementById("certId").value.trim();
    resultDiv.innerHTML = "";

    if (!certId) {
      resultDiv.innerHTML = `<p class="error">❌ Please enter a valid Certificate ID.</p>`;
      showToast("❌ Please enter a valid Certificate ID!", "warning");
      return;
    }

    try {
      // ✅ Show loading animation
      document.getElementById("loadingOverlayVerify").style.display = "flex"; // Show

      resultDiv.innerHTML = "";

      const cert = await contract.verifyCertificate(certId);


      // ✅ Hide loading animation
      document.getElementById("loadingOverlayVerify").style.display = "none"; // Hide

      // Hide Copy certificate ID button
      document.getElementById("copySampleCertId").style.display = "none"; // Hide



      // Fetch all institutions to find the name of the issuer
      const institutionsRaw = await contract.getInstitutions();
      const institutions = institutionsRaw.wallets.map((wallet, index) => ({
        name: institutionsRaw.names[index],
        description: institutionsRaw.descriptions[index],
        wallet: wallet.toLowerCase(),
      }));

      // Find the institution name by wallet address
      const issuingInstitution = institutions.find(inst => inst.wallet === cert.issuedBy.toLowerCase());
      const issuerName = issuingInstitution ? issuingInstitution.name : cert.issuedBy;

      const issueDate = new Date(cert.issuedAt.toNumber() * 1000).toLocaleDateString();



      // ✅ Improved file preview logic
      let filePreview = "";
      if (cert.cid) {
        if (cert.cid.endsWith(".pdf")) {
          filePreview = `<embed src="https://ipfs.io/ipfs/${cert.cid}" width="100%" height="500px" type="application/pdf" />`;
        } else {
          filePreview = `<img src="https://ipfs.io/ipfs/${cert.cid}" width="100%" alt="Certificate Preview" class="certificate-image"/>`;
        }
      } else {
        filePreview = `<p class="error">⚠️ No preview available</p>`;
      }

      // ✅ Display results
      resultDiv.innerHTML = `
      <div class="result-wrapper">
          <div class="cert-card">

            <h3>✅ Certificate Found</h3>
            <p><strong>Recipient:</strong> ${cert.recipientName}</p>
            <p><strong>Title:</strong> ${cert.title}</p>
            <p><strong>Issued By:</strong> ${issuerName}</p>

        
              <p><strong>Issuer ID:</strong> ${cert.issuedBy}</p>
            <p><strong>Issue Date:</strong> ${issueDate}</p>
            <p><strong>Status:</strong> ${cert.isRevoked ? "❌ Revoked" : "✅ Active"}</p>
            <p><strong>CID:</strong> <a href="https://ipfs.io/ipfs/${cert.cid}" target="_blank">Download Certificate</a></p>

          </div>
          <div class="preview-container">${filePreview}</div>
      </div>
          `;

    } catch (err) {
      console.error("Verification Error:", err);
      document.getElementById("loadingOverlayVerify").style.display = "none"; // Hide

      showToast("❌ Certificate not found or is invalid!", "error");
      resultDiv.innerHTML = `<p class="error">❌ Certificate not found or is invalid.</p>`;
    }
  };
}

// Copy Sample Certificate ID Button
const copySampleCertId = document.getElementById("copySampleCertId");

if (copySampleCertId) {
  copySampleCertId.onclick = () => {
    const sampleId = "0x3452d84f970deb9e00aec0b6e1704c6943565c2754c27e2f8bb8a77619a0dd75"; //  test ID
    document.getElementById("certId").value = sampleId;
    copyToClipboard(sampleId); //
  };
}


attachVerifyButton();
// });
