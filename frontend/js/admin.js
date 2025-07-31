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
    loadAllCertificates();
    enableAdminFunctions();
    loadStats();

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
    const institutions = institutionsRaw.wallets.map((wallet, index) => ({
      name: institutionsRaw.names[index],
      description: institutionsRaw.descriptions[index],
      wallet: wallet.toLowerCase(),
    }));
const uniqueInstitutions = institutions.filter(
  (inst, index, self) =>
    index === self.findIndex(i => i.wallet.toLowerCase() === inst.wallet.toLowerCase())
);
    const certificateList = document.getElementById("certificateList");
    certificateList.innerHTML = ""; // Clear previous content

    // Create a parent container for certificate cards
    const certContainer = document.createElement("ul");
    certContainer.className = "document-list";

    for (let i = 0; i < uniqueInstitutions.length; i++) {
      const walletAddress = uniqueInstitutions[i].wallet;

      // Validate wallet address
      if (!ethers.utils.isAddress(walletAddress)) {
        console.warn(`Skipping invalid address: ${walletAddress}`);
        continue;
      }

      const instCerts = await contract.getInstitutionCertificates(walletAddress);

      const reversedCertIds = [...instCerts].reverse(); // Create a reversed copy
      for (let j = 0; j < reversedCertIds.length; j++) {
        const cert = await contract.verifyCertificate(reversedCertIds[j]);


        const issueDate = new Date(Number(cert.issuedAt) * 1000).toLocaleDateString();


        // Find the issuing institution name
        const issuingInstitution = uniqueInstitutions.find(inst => inst.wallet === cert.issuedBy.toLowerCase());
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

// Function to enable Institution role
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
    const existing = await contract.getInstitutions();
    if (existing.wallets && existing.wallets.map(w => w.toLowerCase()).includes(address.toLowerCase())) {
      showToast("⚠️ This wallet is already registered as an institution.", "warning");
      return;
    }

    // Show confirmation modal
    document.getElementById("confirmName").innerText = name;
    document.getElementById("confirmDesc").innerText = description;
    document.getElementById("confirmAddress").innerText = address;
    document.getElementById("confirmModal").style.display = "block";

    // Confirm
    document.getElementById("confirmYesBtn").onclick = async () => {
      document.getElementById("confirmModal").style.display = "none";
      try {
        document.getElementById("loadingOverlayApprove").style.display = "flex";
        const tx = await contract.addInstitution(address, name, description);
        await tx.wait();
        document.getElementById("institutionName").value = ""; // Clear input
document.getElementById("institutionDesc").value = ""; // Clear input
document.getElementById("institutionAddress").value = "";

        document.getElementById("loadingOverlayApprove").style.display = "none";
        showToast("✅ Institution registered successfully!", "success");
        loadInstitutions();
        loadStats();
      } catch (err) {
        console.error("Error assigning role:", err);
        showToast("❌ Transaction failed", "error");
      }
    };

    // Cancel
    document.getElementById("confirmNoBtn").onclick = () => {
      document.getElementById("confirmModal").style.display = "none";
    };
  };



  // Revoke institution role
  document.getElementById("revokeRoleBtn").onclick = async () => {
    const address = document.getElementById("revokeAddress").value.trim();

    if (!ethers.utils.isAddress(address)) {
      showToast("❌ Invalid wallet address", "error");
      return;
    }

    try {
      // Fetch existing institutions
      const data = await contract.getInstitutions();
      const institutions = data.wallets.map((wallet, index) => ({
        name: data.names[index],
        description: data.descriptions[index],
        wallet: wallet.toLowerCase(),
      }));

      const match = institutions.find(inst => inst.wallet === address.toLowerCase());

      if (!match) {
        showToast("⚠️ This address is not registered as an institution.", "warning");
        return;
      }

      // Populate modal and show
      document.getElementById("revokeConfirmName").innerText = match.name;
      document.getElementById("revokeConfirmAddress").innerText = match.wallet;
      document.getElementById("revokeConfirmModal").style.display = "block";

      // Confirm
      document.getElementById("confirmRevokeBtn").onclick = async () => {
        document.getElementById("revokeConfirmModal").style.display = "none";

        try {
          document.getElementById("loadingOverlayRevoke").style.display = "flex";
          const tx = await contract.removeInstitution(address);
          await tx.wait();
          document.getElementById("revokeAddress").value = ""; // Clear input
          document.getElementById("loadingOverlayRevoke").style.display = "none";
          showToast("✅ Institution revoked!", "success");
          loadInstitutions();
          loadStats();
        } catch (err) {
          console.error("Error revoking role:", err);

          if (err.code === 4001) {
            showToast("⚠️ Transaction rejected by user", "warning");
          } else {
            showToast("❌ Revocation failed", "error");
          }
        }
      };

      // Cancel
      document.getElementById("cancelRevokeBtn").onclick = () => {
        document.getElementById("revokeConfirmModal").style.display = "none";
      };

    } catch (err) {
      console.error("Error checking institutions:", err);
      showToast("❌ Unable to verify institution.", "error");
    }
  };


  // Load institutions on button click
  document.getElementById("viewInstitutionsBtn").onclick = async () => {
    loadInstitutions();
  };

  async function loadInstitutions() {
    const institutionsRaw = await contract.getInstitutions();

    const institutions = institutionsRaw.wallets.map((wallet, index) => ({
      name: institutionsRaw.names[index],
      description: institutionsRaw.descriptions[index],
      wallet: wallet,
    }));

    // 🚫 Remove duplicate wallets
const uniqueInstitutions = institutions.filter(
  (inst, index, self) =>
    index === self.findIndex(i => i.wallet.toLowerCase() === inst.wallet.toLowerCase())
);

    const list = document.getElementById("institutionList");

    list.innerHTML = uniqueInstitutions.map(inst => `
    <li class="institution-card">
      <h4>${inst.name}</h4>
      <p><em>${inst.description}</em></p>
      <p>${inst.wallet}</p>
    </li>
  `).join("");

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

    // 🚫 Remove duplicate wallets
const uniqueInstitutions = institutions.filter(
  (inst, index, self) =>
    index === self.findIndex(i => i.wallet.toLowerCase() === inst.wallet.toLowerCase())
);

    console.log("Reconstructed Institutions:", uniqueInstitutions);

    let totalCertificates = 0;
    let revokedCertificates = 0;

    // Fetch all certificates issued by each institution
    for (let i = 0; i < uniqueInstitutions.length; i++) {
      const instCerts = await contract.getInstitutionCertificates(uniqueInstitutions[i].wallet);
      totalCertificates += instCerts.length;

      for (let j = 0; j < instCerts.length; j++) {
        const cert = await contract.verifyCertificate(instCerts[j]);
        if (cert.isRevoked) revokedCertificates++;
      }
    }

    // Update statistics on the UI
    document.getElementById("totalInstitutions").innerText = uniqueInstitutions.length;
    document.getElementById("totalCertificates").innerText = totalCertificates;
    document.getElementById("revokedCertificates").innerText = revokedCertificates;

    console.log("📊 Stats Updated: ", { totalInstitutions: uniqueInstitutions.length, totalCertificates, revokedCertificates });
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
