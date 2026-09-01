import { getSafeIpfsUrl, isValidBytes32, safeDisplay } from "./security.js";

const API_BASE_URL = "https://trustedcert-backend.onrender.com";
const SEPOLIA_RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/PSyOkmTF8dSBO9VA2dDXPxjBJJfUblcy";

let CONTRACT_ADDRESS;

async function loadConfig() {
  const response = await fetch(`${API_BASE_URL}/config`);
  const config = await response.json();
  CONTRACT_ADDRESS = config.contractAddress;
}

function getIpfsUrl(cid) {
  return getSafeIpfsUrl(cid);
}

function buildCertificatePreview(cid) {
  const fileUrl = getIpfsUrl(cid);

  if (!fileUrl) {
    return `<div class="empty-state"><strong>No document attached</strong><p>This certificate record did not include an IPFS file reference.</p></div>`;
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
    <a class="preview-link" href="${fileUrl}" target="_blank" rel="noopener noreferrer">Open certificate document</a>
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

function attachCopyHandlers(root = document) {
  root.querySelectorAll("[data-copy-value]").forEach((button) => {
    button.addEventListener("click", () => {
      copyToClipboard(button.dataset.copyValue || "");
    });
  });
}

function renderError(message) {
  document.getElementById("certificateDetail").innerHTML = `
    <div class="status-card status-card-error">
      <strong>Certificate details unavailable</strong>
      <p>${message}</p>
      <a class="button-action detail-link" href="index.html#app">Return to verifier</a>
    </div>
  `;
}

async function loadCertificateDetail() {
  const params = new URLSearchParams(window.location.search);
  const certId = params.get("id");

  if (!certId) {
    renderError("No certificate ID was supplied in the page URL.");
    return;
  }

  if (!isValidBytes32(certId)) {
    renderError("The certificate ID in the page URL is not a valid 0x-prefixed 32-byte value.");
    return;
  }

  try {
    await loadConfig();
    const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const abiResponse = await fetch("./abi/CertificateRegistry.json");
    const abiJson = await abiResponse.json();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abiJson.abi, provider);
    const cert = await contract.verifyCertificate(certId);
    const institutionsRaw = await contract.getInstitutions();
    const institutions = institutionsRaw.wallets.map((wallet, index) => ({
      name: institutionsRaw.names[index],
      description: institutionsRaw.descriptions[index],
      wallet: wallet.toLowerCase()
    }));
    const issuingInstitution = institutions.find((institution) => institution.wallet === cert.issuedBy.toLowerCase());
    const issuerName = issuingInstitution ? issuingInstitution.name : cert.issuedBy;
    const issueDate = new Date(cert.issuedAt.toNumber() * 1000).toLocaleDateString();
    const fileUrl = cert.cid ? getIpfsUrl(cert.cid) : "";
    const safeCertId = safeDisplay(certId);

    const certificateDetail = document.getElementById("certificateDetail");
    certificateDetail.innerHTML = `
      <div class="certificate-detail-hero">
        <div>
          <span class="eyebrow">Certificate trust report</span>
          <h2>${cert.isRevoked ? "Record found, but revoked" : "Certificate verified"}</h2>
          <p>${cert.isRevoked ? "The certificate exists on-chain, but the issuer has marked it as inactive." : "The registry record, issuer wallet, and attached certificate reference are available for review."}</p>
        </div>
        <div class="trust-score ${cert.isRevoked ? "trust-score-warning" : ""}">
          <span>Status</span>
          <strong>${cert.isRevoked ? "Revoked" : "Active"}</strong>
        </div>
      </div>

      <div class="certificate-detail-grid">
        <section class="certificate-proof-panel">
          <div class="section-heading">
            <h2>Trust details</h2>
            <p>Use this page as a shareable verification report for employers, admissions teams, and auditors.</p>
          </div>
          <div class="proof-list">
            <p><strong>Certificate ID</strong><span>${safeCertId}</span></p>
            <p><strong>Recipient</strong><span>${safeDisplay(cert.recipientName)}</span></p>
            <p><strong>Title</strong><span>${safeDisplay(cert.title)}</span></p>
            <p><strong>Issuer</strong><span>${safeDisplay(issuerName)}</span></p>
            <p><strong>Issuer wallet</strong><span>${safeDisplay(cert.issuedBy)}</span></p>
            <p><strong>Issue date</strong><span>${issueDate}</span></p>
            <p><strong>IPFS CID</strong><span>${safeDisplay(cert.cid, "Not available")}</span></p>
          </div>
          <div class="detail-actions">
            <button class="button-secondary" type="button" data-copy-value="${safeCertId}">Copy certificate ID</button>
            ${fileUrl ? `<a class="button-action detail-link" href="${fileUrl}" target="_blank" rel="noopener noreferrer">Download certificate</a>` : ""}
          </div>
        </section>

        <section class="preview-container certificate-detail-preview">
          ${buildCertificatePreview(cert.cid)}
        </section>
      </div>
    `;
    attachCopyHandlers(certificateDetail);
    attachCertificatePreviewFallbacks(certificateDetail);
  } catch (error) {
    console.error("Certificate detail error:", error);
    renderError("The certificate could not be found or the registry request failed.");
  }
}

window.showToast = function(message, type) {
  const bgColor = {
    success: "green",
    error: "red",
    warning: "orange"
  }[type] || "gray";

  Toastify({
    text: message,
    duration: 3000,
    gravity: "top",
    position: "right",
    style: {
      background: bgColor
    }
  }).showToast();
};

window.copyToClipboard = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("Certificate ID copied", "success");
  }).catch(() => {
    showToast("Copy failed", "error");
  });
};

loadCertificateDetail();
