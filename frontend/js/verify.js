import { getSafeIpfsUrl, isValidBytes32, safeDisplay } from "./security.js";

const API_BASE_URL = "https://trustedcert-backend.onrender.com";

let CONTRACT_ADDRESS;

async function loadConfig() {
  const res = await fetch(`${API_BASE_URL}/config`);
  const config = await res.json();
  CONTRACT_ADDRESS = config.contractAddress;
}

await loadConfig();



let contract;

//Ensure script waits until content is fully loaded

const provider = new ethers.providers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/PSyOkmTF8dSBO9VA2dDXPxjBJJfUblcy");

const res = await fetch("./abi/CertificateRegistry.json");
const abiJson = await res.json();

if (!abiJson || !abiJson.abi) throw new Error("Invalid ABI");

contract = new ethers.Contract(CONTRACT_ADDRESS, abiJson.abi, provider);

function getIpfsUrl(cid) {
  return getSafeIpfsUrl(cid);
}

function buildCertificatePreview(cid) {
  const fileUrl = getIpfsUrl(cid);

  if (!fileUrl) {
    return `<p class="error">No preview available</p>`;
  }

  return `
    <div class="certificate-preview-shell">
      <img
        class="certificate-preview-image"
        src="${fileUrl}"
        alt="Certificate preview"
        loading="lazy"
      />
      <iframe
        class="certificate-frame"
        src="${fileUrl}"
        title="Certificate preview"
        loading="lazy"
        sandbox
        referrerpolicy="no-referrer"
        hidden
      ></iframe>
    </div>
    <a class="preview-link" href="${fileUrl}" target="_blank" rel="noopener noreferrer">
      Open certificate in a new tab
    </a>
  `;
}

function attachCertificatePreviewFallbacks(root = document) {
  root.querySelectorAll(".certificate-preview-image").forEach((image) => {
    const markImageReady = () => {
      image.closest(".certificate-preview-shell")?.classList.add("image-ready");
    };
    const showFrameFallback = () => {
      image.hidden = true;
      const fallbackFrame = image.nextElementSibling;
      if (fallbackFrame) fallbackFrame.hidden = false;
      image.closest(".certificate-preview-shell")?.classList.add("frame-ready");
    };

    image.addEventListener("load", markImageReady, { once: true });
    image.addEventListener("error", showFrameFallback, { once: true });

    if (image.complete && image.naturalWidth > 0) {
      markImageReady();
    }
  });
}

function setTrustStep(step, status, message) {
  const stepEl = document.querySelector(`[data-step="${step}"]`);
  if (!stepEl) return;

  stepEl.dataset.status = status;
  const messageEl = stepEl.querySelector("p");
  if (messageEl && message) {
    messageEl.textContent = message;
  }
}

function resetTrustSteps() {
  [
    ["input", "Waiting for a certificate hash."],
    ["record", "Find the registry entry on Sepolia."],
    ["issuer", "Confirm the issuing wallet and institution."],
    ["document", "Load the attached IPFS certificate."]
  ].forEach(([step, message]) => {
    setTrustStep(step, "idle", message);
  });
}

function renderVerificationError(message) {
  document.getElementById("verifyEmptyState")?.classList.add("is-hidden");
  document.getElementById("result").innerHTML = `
    <div class="status-card status-card-error">
      <strong>Verification could not be completed</strong>
      <p>${message}</p>
    </div>
  `;
}

function buildCertificateDetailLink(certId) {
  return `/certificate/?id=${encodeURIComponent(certId)}`;
}

function attachVerifyButton() {

  const verifyBtn = document.getElementById("verifyBtn");
  const resultDiv = document.getElementById("result");
  const copySampleCertId = document.getElementById("copySampleCertId");


  if (!verifyBtn || !copySampleCertId) {
    console.warn("⏳ Waiting for verify button...");
    setTimeout(attachVerifyButton, 500); // Retry in 500ms
    return;
  }

  console.log("✅ verifyBtn found!");
  resetTrustSteps();

  copySampleCertId.onclick = () => {
    const sampleId = "0x3452d84f970deb9e00aec0b6e1704c6943565c2754c27e2f8bb8a77619a0dd75";
    document.getElementById("certId").value = sampleId;
    copyToClipboard(sampleId);
    resetTrustSteps();
    setTrustStep("input", "complete", "Sample certificate ID copied into the lookup field.");
  };

  verifyBtn.onclick = async () => {
    const certId = document.getElementById("certId").value.trim();
    resultDiv.innerHTML = "";
    document.getElementById("verifyEmptyState")?.classList.add("is-hidden");
    resetTrustSteps();

    if (!certId) {
      setTrustStep("input", "error", "A certificate ID is required before verification can start.");
      renderVerificationError("Please enter a valid certificate ID before running the trust check.");
      showToast("❌ Please enter a valid Certificate ID!", "warning");
      return;
    }

    if (!isValidBytes32(certId)) {
      setTrustStep("input", "error", "Certificate IDs must be 32-byte hex values.");
      renderVerificationError("Please enter a valid 0x-prefixed certificate ID.");
      showToast("❌ Invalid certificate ID format.", "warning");
      return;
    }

    try {
      setTrustStep("input", "complete", "Certificate ID accepted.");
      setTrustStep("record", "active", "Querying the certificate registry.");
      // ✅ Show loading animation
      document.getElementById("loadingOverlayVerify").style.display = "flex"; // Show

      resultDiv.innerHTML = "";

      const cert = await contract.verifyCertificate(certId);
      setTrustStep("record", "complete", "Certificate record found on-chain.");


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
      const safeIssuerName = safeDisplay(issuerName);
      setTrustStep("issuer", "complete", issuingInstitution ? "Issuer wallet matched to a registered institution." : "Issuer wallet found, but no institution name was returned.");

      const issueDate = new Date(cert.issuedAt.toNumber() * 1000).toLocaleDateString();



      const fileUrl = cert.cid ? getIpfsUrl(cert.cid) : "";
      const filePreview = buildCertificatePreview(cert.cid);
      setTrustStep("document", cert.cid ? "complete" : "error", cert.cid ? "Certificate preview source is ready." : "No certificate file was attached to this record.");

      // ✅ Display results
      resultDiv.innerHTML = `
      <div class="status-card status-card-success">
        <strong>${cert.isRevoked ? "Certificate found, but revoked" : "Certificate verified"}</strong>
        <p>${cert.isRevoked ? "This record exists on-chain, but it is no longer active." : "The certificate record, issuer, and document reference were checked successfully."}</p>
      </div>
      <div class="result-wrapper">
          <div class="cert-card">

            <h3>✅ Certificate Found</h3>
            <p><strong>Recipient:</strong> ${safeDisplay(cert.recipientName)}</p>
            <p><strong>Title:</strong> ${safeDisplay(cert.title)}</p>
            <p><strong>Issued By:</strong> ${safeIssuerName}</p>

        
              <p><strong>Issuer ID:</strong> ${safeDisplay(cert.issuedBy)}</p>
            <p><strong>Issue Date:</strong> ${issueDate}</p>
            <p><strong>Status:</strong> ${cert.isRevoked ? "❌ Revoked" : "✅ Active"}</p>
            <p><strong>CID:</strong> ${fileUrl ? `<a href="${fileUrl}" target="_blank" rel="noopener noreferrer">Download Certificate</a>` : "Not available"}</p>
            <div class="cert-actions">
              <a class="button-action detail-link" href="${buildCertificateDetailLink(certId)}">View trust details</a>
            </div>

          </div>
          <div class="preview-container">${filePreview}</div>
      </div>
          `;
      attachCertificatePreviewFallbacks(resultDiv);

    } catch (err) {
      console.error("Verification Error:", err);
      document.getElementById("loadingOverlayVerify").style.display = "none"; // Hide

      setTrustStep("record", "error", "No valid certificate record was returned.");
      showToast("❌ Certificate not found or is invalid!", "error");
      renderVerificationError("Certificate not found or the certificate ID is invalid.");
    }
  };
}

attachVerifyButton();
// });
