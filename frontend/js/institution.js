import { getSafeIpfsUrl, isLikelyPdfCid, safeDisplay } from "./security.js";

const API_BASE_URL = "https://trustedcert-backend.onrender.com";

let CONTRACT_ADDRESS;

async function loadConfig() {
  const res = await fetch(`${API_BASE_URL}/config`);
  const config = await res.json();
  CONTRACT_ADDRESS = config.contractAddress;
}

await loadConfig();



let provider, signer, contract, uploadedCID = "";

function getIpfsUrl(cid) {
  return getSafeIpfsUrl(cid);
}

function attachInstitutionActionHandlers() {
  if (window.trustedCertInstitutionHandlersBound) return;

  document.addEventListener("click", (event) => {
    const copyButton = event.target.closest("[data-copy-scope='institution']");
    if (copyButton) {
      copyToClipboard(copyButton.dataset.copyValue || "");
      return;
    }

    const revokeButton = event.target.closest("[data-revoke-cert-id]");
    if (revokeButton) {
      revokeCert(revokeButton.dataset.revokeCertId || "");
    }
  });

  window.trustedCertInstitutionHandlersBound = true;
}

function createUploadNonce() {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
}

function buildUploadMessage({ address, timestamp, nonce, fileName, fileSize }) {
  return [
    "TrustedCert certificate upload",
    `Wallet: ${ethers.utils.getAddress(address)}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
    `File: ${fileName}`,
    `Size: ${fileSize}`,
  ].join("\n");
}

function validateCertificateFile(file) {
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  const maxSize = 12 * 1024 * 1024;

  if (!allowedTypes.includes(file.type)) {
    return "Only PDF, PNG, JPG, and WebP certificate files can be uploaded.";
  }

  if (file.size > maxSize) {
    return "Certificate files must be 12MB or smaller.";
  }

  return "";
}

(async () => {
  if (!window.ethereum) {
    showToast("⚠️ Please install MetaMask!", "warning");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();

  const address = await signer.getAddress();

  const res = await fetch("./abi/CertificateRegistry.json");
  const abiJson = await res.json();

  contract = new ethers.Contract(CONTRACT_ADDRESS, abiJson.abi, signer);

  // 🧠 Role check already handled by index.js — we assume access is valid
  enableInstitutionActions();
  loadInstitutionDetails(address); // Load institution info on page load
  loadStats(); // Load statistics when page loads
  loadCertificates(); // Load certificates when page loads

})();


// 🔍 Fetch institution details for the logged-in user
async function loadInstitutionDetails(walletAddress) {
  try {
    const institutionsRaw = await contract.getInstitutions(); // Fetch institution data
    console.log("Fetched Institutions:", institutionsRaw); // Debugging log

    // Rebuild institutions as an array of objects
    const institutions = institutionsRaw.wallets.map((wallet, index) => ({
      name: institutionsRaw.names[index],
      description: institutionsRaw.descriptions[index],
      wallet: wallet
    }));

    console.log("Reconstructed Institutions:", institutions);

    // Find the institution by wallet
    const institution = institutions.find(inst =>
      inst.wallet && inst.wallet.toLowerCase() === walletAddress.toLowerCase()
    );

    console.log("Matching Institution:", institution);

    if (institution) {
      document.getElementById("instName").innerText = institution.name || "N/A";
      document.getElementById("instDesc").innerText = institution.description || "N/A";
      document.getElementById("instWallet").innerText = institution.wallet || "N/A";
    } else {
      document.querySelector(".institution-info").innerHTML = `
        <p style="color:red">❌ You are not registered as an institution.</p>
      `;
    }
  } catch (err) {
    console.error("Error fetching institution details:", err);
  }
}


async function uploadToIPFS(file) {
  const address = await signer.getAddress();
  const timestamp = Date.now().toString();
  const nonce = createUploadNonce();
  const message = buildUploadMessage({
    address,
    timestamp,
    nonce,
    fileName: file.name || "certificate",
    fileSize: file.size,
  });
  const signature = await signer.signMessage(message);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("address", address);
  formData.append("timestamp", timestamp);
  formData.append("nonce", nonce);
  formData.append("signature", signature);

  try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error("Failed to upload to IPFS");

    const result = await response.json();
    uploadedCID = result.IpfsHash;
    // document.getElementById("cidDisplay").innerText = `✅ CID: ${uploadedCID}`;
    document.getElementById("registerBtn").disabled = false;
  } catch (err) {
    console.error("IPFS Upload Error:", err);
    showToast("❌ Upload to IPFS failed.", "error");
  }
}



function enableInstitutionActions() {
  attachFileInputHandler();

  async function handleCertificateFileChange() {
    const fileInput = document.getElementById("certificateFile");
    const file = fileInput.files[0];
    if (!file) return;
    const fileError = validateCertificateFile(file);
    if (fileError) {
      showToast(fileError, "warning");
      fileInput.value = "";
      return;
    }

    const fileURL = URL.createObjectURL(file);
    const previewArea = document.getElementById("previewArea");

    if (file.type.startsWith("image/")) {
      previewArea.innerHTML = `
        <div class="upload-preview">
          <img src="${fileURL}" alt="Selected certificate preview" />
          <button class="button-secondary" type="button" id="replaceFileBtn">Replace file</button>
        </div>
      `;
    } else if (file.type === "application/pdf") {
      previewArea.innerHTML = `
        <div class="upload-preview">
          <iframe src="${fileURL}" title="Selected certificate PDF preview" sandbox></iframe>
          <button class="button-secondary" type="button" id="replaceFileBtn">Replace file</button>
        </div>
      `;
    } else {
      previewArea.innerHTML = `
        <div class="empty-state">
          <strong>Preview unavailable</strong>
          <p>This file type can be uploaded, but it cannot be previewed here.</p>
          <button class="button-secondary" type="button" id="replaceFileBtn">Choose another file</button>
        </div>
      `;
    }

    document.getElementById("replaceFileBtn")?.addEventListener("click", () => {
      uploadedCID = "";
      document.getElementById("registerBtn").disabled = true;
      resetUploadArea();
    });

    // document.getElementById("cidDisplay").innerText = "Hang on, uploading to IPFS...";
    document.getElementById("cidDisplay").style.display = "flex"; // Hide
    await uploadToIPFS(file);
    document.getElementById("cidDisplay").style.display = "none"; // Hide
  }

  function attachFileInputHandler() {
    const fileInput = document.getElementById("certificateFile");
    fileInput?.addEventListener("change", handleCertificateFileChange);
  }

  function resetUploadArea() {
    document.getElementById("previewArea").innerHTML = `
      <input type="file" id="certificateFile" placeholder="Choose a file" />
      <p class="upload-hint">Upload a certificate image or PDF for preview and IPFS storage.</p>
    `;
    attachFileInputHandler();
  }

  // Register certificate 
  document.getElementById("registerBtn").onclick = async () => {
  const name = document.getElementById("recipientName").value.trim();
  const title = document.getElementById("title").value.trim();
  const externalId = document.getElementById("externalId").value.trim();
  const previewArea = document.getElementById("previewArea");

  if (!uploadedCID) {
    showToast("❌ Please upload a certificate file first!", "warning");
    return;
  }

  // Populate modal
  document.getElementById("confirmCertName").innerText = name;
  document.getElementById("confirmCertTitle").innerText = title;
  document.getElementById("confirmCertExternalId").innerText = externalId;
  document.getElementById("confirmCertPreview").innerHTML = previewArea.querySelector("img, iframe")?.outerHTML || previewArea.innerHTML;
  document.getElementById("confirmCertModal").style.display = "block";

  // Confirm
  document.getElementById("confirmCertYesBtn").onclick = async () => {
    document.getElementById("confirmCertModal").style.display = "none";
    document.getElementById("loadingOverlayRegister").style.display = "flex";
    document.getElementById("registerBtn").disabled = true;

    try {
      const tx = await contract.registerCertificate(name, title, uploadedCID, externalId);
      await tx.wait();

      const address = await signer.getAddress();
      const certIds = await contract.getInstitutionCertificates(address);
      const latestId = certIds[certIds.length - 1];

      showToast("✅ Certificate registered successfully!", "success");

      // Clear inputs and reload
      const registeredCID = uploadedCID;
      document.getElementById("recipientName").value = "";
      document.getElementById("title").value = "";
      document.getElementById("externalId").value = "";
      uploadedCID = "";
      resetUploadArea();

      showRegisteredCertificateCard(name, title, registeredCID, latestId);
      loadStats();
      loadCertificates();

    } catch (err) {
      console.error("Register Error:", err);
      showToast("❌ Error registering certificate.", "error");
    }

    document.getElementById("loadingOverlayRegister").style.display = "none";
    document.getElementById("registerBtn").disabled = false;
  };

  // Cancel
  document.getElementById("confirmCertNoBtn").onclick = () => {
    document.getElementById("confirmCertModal").style.display = "none";
  };
};


  // ✅ Function to show the newly registered certificate
  function showRegisteredCertificateCard(name, title, cid, id) {
    const certCard = document.getElementById("registeredCert");
    const safeId = safeDisplay(id);
    certCard.innerHTML = ""; // Clear previous card if it exists

    certCard.className = "result-wrapper"; // or use your custom success class
    certCard.innerHTML = `
      <div class="cert-card">
          <h3>✅Certificate Registered</h3>
          <p><strong>Name:</strong> ${safeDisplay(name)}</p>
          <p><strong>Title:</strong> ${safeDisplay(title)}</p>
          <p><strong>ID:</strong> ${safeId}
            <button class="copy-btn" type="button" data-copy-scope="institution" data-copy-value="${safeId}">Copy</button>
          </p>
          <div class="cert-actions">
            <a class="button-secondary detail-link" href="/certificate/?id=${encodeURIComponent(id)}">View trust details</a>
          </div>
          
      </div>

      <div class="preview-container">${getIpfsUrl(cid) ? `<img src="${getIpfsUrl(cid)}" class="file-preview" alt="Certificate Preview"/>` : `<p class="error">Preview unavailable</p>`}</div>
  `;
  }




  document.getElementById("loadCertsBtn").onclick = async () => {
    loadCertificates();
  };
}
// Load all issued certificates
async function loadCertificates() {
  const address = await signer.getAddress();
  const certIds = await contract.getInstitutionCertificates(address);


  const certificateList = document.getElementById("certificateList");
  certificateList.innerHTML = ""; // Clear previous content

  // Create a parent container with class "document-list"
  const certContainer = document.createElement("ul");
  certContainer.className = "document-list";

  for (const id of certIds.slice().reverse()) {
    const cert = await contract.verifyCertificate(id);
    const issueDate = new Date(Number(cert.issuedAt) * 1000).toLocaleDateString();
    const safeId = safeDisplay(id);

    // Create a list item for each certificate
    const certCard = document.createElement("li");
    certCard.className = "document-item";

    // File preview logic
    let filePreview = "";
    if (cert.cid) {
      const fileUrl = getIpfsUrl(cert.cid);

      if (isLikelyPdfCid(cert.cid)) {
        filePreview = `
      <iframe class="certificate-frame" src="${fileUrl}" title="Certificate PDF preview" loading="lazy" sandbox referrerpolicy="no-referrer"></iframe>
      <p><a href="${fileUrl}" target="_blank" rel="noopener noreferrer">Open PDF in new tab</a></p>
    `;
      } else {
        filePreview = `<img src="${fileUrl}" class="file-preview" alt="No PDF Preview" />`;
      }
    }


    certCard.innerHTML = `

      <div class="cert-details">
        <p><strong>ID:</strong> ${safeId}
        </span> 
          <button class="copy-btn" type="button" data-copy-scope="institution" data-copy-value="${safeId}">
            Copy
          </button>
        </p>
        <p><strong>Name:</strong> ${safeDisplay(cert.recipientName)}</p>
        <p><strong>Title:</strong> ${safeDisplay(cert.title)}</p>
        <p><strong>Issued:</strong> ${issueDate}</p>
        <p><strong>Status:</strong> ${cert.isRevoked ? "❌ Revoked" : "✅ Active"}</p>
        <div class="cert-actions">
          <a class="button-secondary detail-link" href="/certificate/?id=${encodeURIComponent(id)}">View trust details</a>
          <button class="button-action revokeCerts-button" type="button" data-revoke-cert-id="${safeId}">Revoke</button>
        </div>
      </div>
      <div class="file-preview-container">${filePreview}</div>
      

    `;
    certContainer.appendChild(certCard);
  }

  if (!certContainer.children.length) {
    certContainer.innerHTML = `
      <li class="empty-state">
        <strong>No certificates issued yet</strong>
        <p>Registered credentials will appear here after your institution anchors its first certificate.</p>
      </li>
    `;
  }


  // Append the list container to the main certificateList div
  certificateList.appendChild(certContainer);

  // ✅ Ensure `searchCertificates` exists before setting event
  const searchInput = document.getElementById("searchCertificates");
  if (searchInput) {
    searchInput.onkeyup = debounce(() => {
      filterList("certificateList", searchInput.value);
    }, 300);
  } else {
    console.warn("⚠️ 'searchCertificates' input not found. Search functionality disabled.");
  }
}


// Load statistics
async function loadStats() {
  const certIds = await contract.getInstitutionCertificates(await signer.getAddress());

  let revokedCount = 0;

  for (const id of certIds) {
    const cert = await contract.verifyCertificate(id);
    if (cert.isRevoked) {
      revokedCount++;
    }
  }

  document.getElementById("totalCerts").innerText = certIds.length;
  document.getElementById("revokedCerts").innerText = revokedCount;
}


async function revokeCert(id) {
  try {
    const cert = await contract.verifyCertificate(id);

    // Populate modal
    document.getElementById("confirmRevokeId").innerText = id;
    document.getElementById("confirmRevokeName").innerText = cert.recipientName;
    document.getElementById("confirmRevokeTitle").innerText = cert.title;
    document.getElementById("confirmRevokeExternalId").innerText = cert.externalId;
    const revokeFileUrl = getIpfsUrl(cert.cid);
    document.getElementById("confirmRevokePreview").innerHTML = revokeFileUrl
      ? `<img src="${revokeFileUrl}" width="200" alt="Certificate preview" />`
      : `<p class="error">Preview unavailable</p>`;
    document.getElementById("confirmRevokeCertModal").style.display = "block";

    // Confirm revocation
    document.getElementById("confirmRevokeCertBtn").onclick = async () => {
      document.getElementById("confirmRevokeCertModal").style.display = "none";
      document.getElementById("loadingOverlayRevoke").style.display = "flex";

      try {
        const tx = await contract.revokeCertificate(id);
        await tx.wait();

        showToast("✅ Certificate revoked!", "success");
        loadStats();
        loadCertificates();
      } catch (err) {
        console.error("Revoke Error:", err);
        showToast("❌ Error revoking certificate.", "error");
      }

      document.getElementById("loadingOverlayRevoke").style.display = "none";
    };

    // Cancel button
    document.getElementById("cancelRevokeCertBtn").onclick = () => {
      document.getElementById("confirmRevokeCertModal").style.display = "none";
    };
  } catch (err) {
    console.error("Error loading certificate for revocation:", err);
    showToast("❌ Could not load certificate info.", "error");
  }
}

// Keep the legacy global available for already-open pages and console use.
window.revokeCert = revokeCert;
attachInstitutionActionHandlers();




// ✅ **TAB SWITCHING FUNCTIONALITY**
document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", function () {
    document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));

    this.classList.add("active");
    document.getElementById(this.dataset.tab).classList.add("active");
  });
});
