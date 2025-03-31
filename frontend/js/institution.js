// import { CONTRACT_ADDRESS, PINATA_JWT } from "../config.js";

let CONTRACT_ADDRESS, PINATA_JWT;

async function loadConfig() {
  const res = await fetch("https://trustedcert-backend.onrender.com/config");
  const config = await res.json();
  CONTRACT_ADDRESS = config.contractAddress;
  PINATA_JWT = config.pinataJWT;
}

await loadConfig();



let provider, signer, contract, uploadedCID = "";

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
      document.getElementById("institutionDetailsTab").innerHTML = `
        <p style="color:red">❌ You are not registered as an institution.</p>
      `;
    }
  } catch (err) {
    console.error("Error fetching institution details:", err);
  }
}


async function uploadToIPFS(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: PINATA_JWT
      },
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
  const fileInput = document.getElementById("certificateFile");

  // const fileInput = document.getElementById("previewArea");

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const fileURL = URL.createObjectURL(file);
    const previewArea = document.getElementById("previewArea");

    if (file.type.startsWith("image/")) {
      previewArea.innerHTML = `<img src="${fileURL}" width="200" />`;
    } else if (file.type === "application/pdf") {
      previewArea.innerHTML = `<embed src="${fileURL}" width="300" height="400" type="application/pdf" />`;
    } else {
      previewArea.innerHTML = `<p>Preview not available for this file type.</p>`;
    }

    // document.getElementById("cidDisplay").innerText = "Uploading to IPFS...";
    await uploadToIPFS(file);
  });


  document.getElementById("registerBtn").onclick = async () => {
    const name = document.getElementById("recipientName").value.trim();
    const title = document.getElementById("title").value.trim();
    const externalId = document.getElementById("externalId").value.trim();
    const previewArea = document.getElementById("previewArea");
    // const loadingIndicator = document.getElementById("loadingIndicatorRegistering");

    if (!uploadedCID) {
        showToast("❌ Please upload a certificate file first!", "warning");
        return;
    }

    try {
        // ✅ Show loading indicator
        // loadingIndicator.style.display = "flex";

        // ✅ Show loading animation
        document.getElementById("loadingOverlayRegister").style.display = "flex"; // Show


        // ✅ Disable button to prevent multiple clicks
        document.getElementById("registerBtn").disabled = true;

        // ✅ Register the certificate on the blockchain
        const tx = await contract.registerCertificate(name, title, uploadedCID, externalId);
        await tx.wait();

        showToast("✅ Certificate registered successfully!", "success");

        // ✅ Hide loading indicator
        // loadingIndicator.style.display = "none";

        
    // ✅ Hide loading animation
document.getElementById("loadingOverlayRegister").style.display = "none"; // Hide


        // ✅ Clear input fields
        document.getElementById("recipientName").value = "";
        document.getElementById("title").value = "";
        document.getElementById("externalId").value = "";
        previewArea.innerHTML = ""; // Clear preview

        // ✅ Show the newly registered certificate
        showRegisteredCertificateCard(name, title, uploadedCID, id);

        // ✅ Load all certificates again
        loadCertificates();

    } catch (err) {
        console.error("Register Error:", err);
        showToast("❌ Error registering certificate.", "error");

        // ✅ Hide loading indicator if error occurs
        // loadingIndicator.style.display = "none";
    }

    // ✅ Re-enable the button after completion
    document.getElementById("registerBtn").disabled = false;
};

// ✅ Function to show the newly registered certificate
function showRegisteredCertificateCard(name, title, cid, id) {
    const certCard = document.getElementById("registeredCert"); // Ensure this exists in HTML
    // const certCard = document.createElement("li");
    certCard.className = "document-item";
    certCard.innerHTML = `
        <div class="cert-details">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Title:</strong> ${title}</p>
            <p><strong>ID:</strong> ${id}
        </span> 
          <button class="copy-btn" onclick="copyToClipboard('${id}')">
            copy
          </button>
        </p>
            <img src="https://ipfs.io/ipfs/${cid}" class="file-preview" alt="Certificate Preview"/>
        </div>
    `;
    // certList.prepend(certCard); // Add new certificate at the top
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

    // Create a list item for each certificate
    const certCard = document.createElement("li");
    certCard.className = "document-item";

    // File preview logic
    let filePreview = "";
    if (cert.cid) {
      filePreview = cert.cid.endsWith(".pdf")
        ? `<embed src="https://ipfs.io/ipfs/${cert.cid}" width="120" height="160" type="application/pdf" class="file-preview"/>`
        : `<img src="https://ipfs.io/ipfs/${cert.cid}" class="file-preview" />`;
    }

    // Set inner HTML for the certificate item
    certCard.innerHTML = `

      <div class="cert-details">
        <p><strong>ID:</strong> ${id}
        </span> 
          <button class="copy-btn" onclick="copyToClipboard('${id}')">
            copy
          </button>
        </p>
        <p><strong>Name:</strong> ${cert.recipientName}</p>
        <p><strong>Title:</strong> ${cert.title}</p>
        <p><strong>Issued:</strong> ${issueDate}</p>
        <p><strong>Status:</strong> ${cert.isRevoked ? "❌ Revoked" : "✅ Active"}</p>
        <button class="button-action revokeCerts-button" onclick="revokeCert('${id}')">Revoke</button>
      </div>
      <div class="file-preview-container">
                    ${cert.cid ? `<img class="file-preview" src="https://ipfs.io/ipfs/${cert.cid}" alt="Certificate Preview"/>` : ""}
                </div>
      

    `;
    certContainer.appendChild(certCard);
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
  const certs = await contract.getInstitutionCertificates(await signer.getAddress());
  document.getElementById("totalCerts").innerText = certs.length;
  document.getElementById("revokedCerts").innerText = certs.filter(cert => cert.isRevoked).length;
}

// Revocation globally exposed
window.revokeCert = async function (id) {
  try {
    const tx = await contract.revokeCertificate(id);
    await tx.wait();
    showToast("✅ Certificate revoked!", "success");
  } catch (err) {
    console.error("Revoke Error:", err);
    showToast("❌ Error revoking certificate.", "error");
  }
};



// ✅ **TAB SWITCHING FUNCTIONALITY**
document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", function () {
    document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));

    this.classList.add("active");
    document.getElementById(this.dataset.tab).classList.add("active");
  });
});
