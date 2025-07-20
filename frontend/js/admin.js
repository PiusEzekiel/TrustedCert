// import { CONTRACT_ADDRESS } from "../config.js";

let CONTRACT_ADDRESS, PINATA_JWT;

async function loadConfig() {
  const res = await fetch("https://trustedcert-backend.onrender.com/config");
  const config = await res.json();
  CONTRACT_ADDRESS = config.contractAddress;
  PINATA_JWT = config.pinataJWT;
}

await loadConfig();



let provider, signer, contract;

(async () => {
  if (!window.ethereum) {
    showToast("Please install MetaMask", "error");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  const userAddress = await signer.getAddress();

  const res = await fetch("./abi/CertificateRegistry.json");
  const abiJson = await res.json();
  contract = new ethers.Contract(CONTRACT_ADDRESS, abiJson.abi, signer);

  const adminRole = await contract.DEFAULT_ADMIN_ROLE();
  const hasRole = await contract.hasRole(adminRole, userAddress);

  if (hasRole) {
    loadAllCertificates(); // ✅ Load certificates on page load
    enableAdminFunctions();
    loadStats(); // Load statistics on page load

  } else {
    document.getElementById("adminArea").innerHTML = `
      <p style="color:red">❌ You do not have admin access.</p>
    `;
  }
})();


// load all certificates on page load
document.getElementById("loadAllCertsBtn").onclick = async () => {
  loadAllCertificates();
}
async function loadAllCertificates() {


  try {
      const institutionsRaw = await contract.getInstitutions();

      

      // Convert to expected object format
      const institutions = institutionsRaw.wallets.map((wallet, index) => ({
          name: institutionsRaw.names[index],
          description: institutionsRaw.descriptions[index],
          wallet: wallet.toLowerCase(), // Ensure wallet addresses are in lowercase for consistency
      }));

      const certificateList = document.getElementById("certificateList");
      certificateList.innerHTML = ""; // Clear previous content

      // Create a parent container for certificate cards
      const certContainer = document.createElement("ul");
      certContainer.className = "document-list";

      for (let i = 0; i < institutions.length; i++) {
          const walletAddress = institutions[i].wallet;

          // Validate wallet address
          if (!ethers.utils.isAddress(walletAddress)) {
              console.warn(`⚠️ Skipping invalid address: ${walletAddress}`);
              continue;
          }

          // Fetch all issued certificates
          const instCerts = await contract.getInstitutionCertificates(walletAddress);
          // for (let j = 0; j < instCerts.length; j++) {
          //     const cert = await contract.verifyCertificate(instCerts[j]);

          const reversedCertIds = [...instCerts].reverse(); // Create a reversed copy
for (let j = 0; j < reversedCertIds.length; j++) {
  const cert = await contract.verifyCertificate(reversedCertIds[j]);

              
              const issueDate = new Date(Number(cert.issuedAt) * 1000).toLocaleDateString();


              // Find the issuing institution name
              const issuingInstitution = institutions.find(inst => inst.wallet === cert.issuedBy.toLowerCase());
              const issuerName = issuingInstitution ? issuingInstitution.name : cert.issuedBy;

              // Create certificate item
              const certCard = document.createElement("li");
              certCard.classList.add("document-item");

              certCard.innerHTML = `
                <div class="cert-details">
                    <p><strong>Recipient:</strong> ${cert.recipientName}</p>
                    <p><strong>Title:</strong> ${cert.title}</p>
                    <p><strong>Issued By:</strong> ${issuerName}</p>
                    <p><strong>Issue Date:</strong> ${issueDate}</p>
                    <p><strong>Status:</strong> ${cert.isRevoked ? "❌ Revoked" : "✅ Active"}</p>
                    <p><strong>ID:</strong> ${reversedCertIds[j]} 
            <button class="copy-btn" onclick="copyToClipboard('${reversedCertIds[j]}')">Copy</button>
        </p>
                </div>
                <div class="file-preview-container">
                    ${cert.cid ? `<img class="certificate-image" src="https://ipfs.io/ipfs/${cert.cid}" alt="Certificate Preview"/>` : ""}
                </div>
              `;

              // Append certificate card to container
              certContainer.appendChild(certCard);
          }
      }

      // Append certificate list to page
      certificateList.appendChild(certContainer);

      // Attach search functionality
      document.getElementById("searchCertificates").onkeyup = debounce(() => {
          filterList("certificateList", document.getElementById("searchCertificates").value);
      }, 300);

  } catch (error) {
      console.error("❌ Error loading certificates:", error);
  
      showToast("Error loading certificates.", "error");
  }
};

function enableAdminFunctions() {
  document.getElementById("assignRoleBtn").onclick = async () => {
    const name = document.getElementById("institutionName").value.trim();
    const description = document.getElementById("institutionDesc").value.trim();
    const address = document.getElementById("institutionAddress").value.trim();
  
    if (!name || !description || !ethers.utils.isAddress(address)) {
      
      showToast("❌ Please enter valid institution details.", "error");
      return;
    }
  
    // Check if already registered
    const existingInstitutions = await contract.getInstitutions();
    if (existingInstitutions.includes(address)) {
      
      showToast("⚠️ This wallet is already registered as an institution.", "warning");
      return;
    }
  
    try {
      // Ask for confirmation
      if (!confirm(`Are you sure you want to register "${name}" (${address})?`)) return;
  
      const tx = await contract.addInstitution(address, name, description);
      await tx.wait();
      showToast("✅ Institution Approved", "success");
      
  
      // Refresh institution list
      loadInstitutions();
      loadStats();
    } catch (err) {
      console.error("Error assigning role:", err);
      showToast("❌ Transaction failed", "error");

    }
  };
  




  document.getElementById("revokeRoleBtn").onclick = async () => {
    const address = document.getElementById("revokeAddress").value.trim();
    if (!ethers.utils.isAddress(address)) {
      showToast("❌ Invalid address", "error");

      return;
    }

    try {
      const tx = await contract.removeInstitution(address);
      await tx.wait();

      showToast("✅ Institution revoked!", "success");
      
      loadStats(); // Refresh stats
    } catch (err) {
      console.error("Error revoking role:", err);

      showToast("❌ Transaction failed", "error");
    }
  };

  document.getElementById("viewInstitutionsBtn").onclick = async () => {
    loadInstitutions();
  };

  async function loadInstitutions() {
    const institutions = await contract.getInstitutions();
    const list = document.getElementById("institutionList");

    list.innerHTML = institutions.map(addr => `<li>${addr}</li>`).join("");

    document.getElementById("searchInstitutions").onkeyup = debounce(() => {
      filterList("institutionList", document.getElementById("searchInstitutions").value);
    }, 300);
  }




  document.getElementById("pauseBtn").onclick = async () => {
    try {
      await contract.pause();
      showToast("✅ Contract Paused", "success");
    } catch (err) {
      console.error("Pause error:", err);
    }
  };

  document.getElementById("unpauseBtn").onclick = async () => {
    try {
      await contract.unpause();
      showToast("✅ Contract Resumed", "success");

    } catch (err) {
      console.error("Unpause error:", err);
      showToast("❌ Transaction failed", "error");
    }
  };
}

// 🔢 **Load Platform Statistics**
async function loadStats() {
  try {
    const institutionsRaw = await contract.getInstitutions(); 
    console.log("Fetched Institutions:", institutionsRaw); // Debugging log

    // Rebuild institutions array
    const institutions = institutionsRaw.wallets.map((wallet, index) => ({
      name: institutionsRaw.names[index],
      description: institutionsRaw.descriptions[index],
      wallet: wallet
    }));

    console.log("Reconstructed Institutions:", institutions);

    let totalCertificates = 0;
    let revokedCertificates = 0;

    // Fetch all certificates issued by each institution
    for (let i = 0; i < institutions.length; i++) {
      const instCerts = await contract.getInstitutionCertificates(institutions[i].wallet);
      totalCertificates += instCerts.length;

      for (let j = 0; j < instCerts.length; j++) {
        const cert = await contract.verifyCertificate(instCerts[j]);
        if (cert.isRevoked) revokedCertificates++;
      }
    }

    // Update statistics on the UI
    document.getElementById("totalInstitutions").innerText = institutions.length;
    document.getElementById("totalCertificates").innerText = totalCertificates;
    document.getElementById("revokedCertificates").innerText = revokedCertificates;

    console.log("📊 Stats Updated: ", { totalInstitutions: institutions.length, totalCertificates, revokedCertificates });
  } catch (err) {
    console.error("Error loading statistics:", err);
  }
}






// ✅ **TAB SWITCHING FUNCTIONALITY**
document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", function () {
    document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));

    this.classList.add("active");
    document.getElementById(this.dataset.tab).classList.add("active");
  });
});
