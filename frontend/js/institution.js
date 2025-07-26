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

    // document.getElementById("cidDisplay").innerText = "Hang on, uploading to IPFS...";
    document.getElementById("cidDisplay").style.display = "flex"; // Hide
    await uploadToIPFS(file);
    document.getElementById("cidDisplay").style.display = "none"; // Hide
  });


  document.getElementById("registerBtn").onclick = async () => {
    const name = document.getElementById("recipientName").value.trim();
    const title = document.getElementById("title").value.trim();
    const externalId = document.getElementById("externalId").value.trim();
    const previewArea = document.getElementById("previewArea");

    if (!uploadedCID) {
      showToast("❌ Please upload a certificate file first!", "warning");
      return;
    }

    try {

      // ✅ Show loading animation
      document.getElementById("loadingOverlayRegister").style.display = "flex"; // Show


      // ✅ Disable button to prevent multiple clicks
      document.getElementById("registerBtn").disabled = true;

      // ✅ Register the certificate on the blockchain
      const tx = await contract.registerCertificate(name, title, uploadedCID, externalId);
      await tx.wait();

      const address = await signer.getAddress();
      const certIds = await contract.getInstitutionCertificates(address);
      const latestId = certIds[certIds.length - 1];

      showToast("✅ Certificate registered successfully!", "success");

      // ✅ Hide loading animation
      document.getElementById("loadingOverlayRegister").style.display = "none"; // Hide


      // ✅ Clear input fields
      document.getElementById("recipientName").value = "";
      document.getElementById("title").value = "";
      document.getElementById("externalId").value = "";
      previewArea.innerHTML = ""; // Clear preview

      // ✅ Show the newly registered certificate
      showRegisteredCertificateCard(name, title, uploadedCID, latestId);
      loadStats()

      // ✅ Load all certificates again
      loadCertificates();

    } catch (err) {
      console.error("Register Error:", err);
      showToast("❌ Error registering certificate.", "error");

      //  ✅ Hide loading animation
      document.getElementById("loadingOverlayRegister").style.display = "none"; // Hide

    }

    // ✅ Re-enable the button after completion
    document.getElementById("registerBtn").disabled = false;
  };

  // ✅ Function to show the newly registered certificate
  function showRegisteredCertificateCard(name, title, cid, id) {
    const certCard = document.getElementById("registeredCert");
    certCard.innerHTML = ""; // Clear previous card if it exists

    certCard.className = "result-wrapper"; // or use your custom success class
    certCard.innerHTML = `
      <div class="cert-card">
          <h3>✅Certificate Registered</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Title:</strong> ${title}</p>
          <p><strong>ID:</strong> ${id}
            <button class="copy-btn" onclick="copyToClipboard('${id}')">Copy</button>
          </p>
          
      </div>

      <div class="preview-container"><img src="https://ipfs.io/ipfs/${cid}" class="file-preview" alt="Certificate Preview"/></div>
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

    // Create a list item for each certificate
    const certCard = document.createElement("li");
    certCard.className = "document-item";

    // File preview logic
    let filePreview = "";
    if (cert.cid) {
      const fileUrl = `https://gateway.pinata.cloud/ipfs/${cert.cid}` ? `https://ipfs.io/ipfs/${cert.cid}` : ""; // or try cloudflare-ipfs

      if (cert.cid.endsWith(".pdf")) {
        filePreview = `
      <embed src="${fileUrl}" width="300" height="400" type="application/pdf" />
      <p><a href="${fileUrl}" target="_blank" rel="noopener noreferrer">Open PDF in new tab</a></p>
    `;
      } else {
        filePreview = `<img src="${fileUrl}" class="file-preview" alt="No PDF Preview" />`;
      }
    }


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
      <div class="file-preview-container">${filePreview}</div>
      

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


// Revocation globally exposed
window.revokeCert = async function (id) {
  try {
    const tx = await contract.revokeCertificate(id);
    await tx.wait();
    loadStats(); // Reload stats after revocation
    loadCertificates(); // Reload certificates after revocation


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
