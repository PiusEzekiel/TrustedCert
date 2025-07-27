

let CONTRACT_ADDRESS, PINATA_JWT;

async function loadConfig() {
  const res = await fetch("https://trustedcert-backend.onrender.com/config");
  const config = await res.json();
  CONTRACT_ADDRESS = config.contractAddress;
  PINATA_JWT = config.pinataJWT;
}



// Global setup
let provider, signer, contract;

window.onload = async () => {
  document.getElementById("loadingOverlayFirst").style.display = "flex"; // Show loading animation
  await loadConfig();
  document.getElementById("loadingOverlayFirst").style.display = "none"; // Hide loading animation

  loadPage("verify"); // Show verify page by default
  const connectBtn = document.getElementById("connectBtn");
  const walletDisplay = document.getElementById("walletAddress");


  connectBtn.onclick = async () => {


    if (!window.ethereum) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const dappUrl = encodeURIComponent(window.location.href);
        const metamaskAppDeepLink = `https://metamask.app.link/dapp/${dappUrl}`;
        window.location.href = metamaskAppDeepLink;
      } else {
        showToast("⚠️ Please install MetaMask!", "warning");
      }
      return;
    }
//    

    try {
      

    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    const address = await signer.getAddress();
    // ✅ Truncate and update button text
    const truncated = `${address.substring(0, 6)}...${address.slice(-4)}`;
    connectBtn.innerText = `🟢 ${truncated}`;

    // Fetch contract ABI and instantiate it
    const abiRes = await fetch("./abi/CertificateRegistry.json");
    const abiJson = await abiRes.json();
    contract = new ethers.Contract(CONTRACT_ADDRESS, abiJson.abi, signer);

    showToast("✅ Wallet connected!", "success");



    // ✅ Determine User Role
    await determineUserRole(address);


  } catch (error) {
    console.error("Wallet Connection Error:", error);
    showToast("❌ Failed to connect wallet", "error");
  
  }
  };
};


// ✅ Determine Role & Load Page
async function determineUserRole(address) {
  try {


    const appDiv = document.getElementById("app");

    appDiv.innerHTML = ""; // Clear the app div while loading
    document.getElementById("loadingOverlayRole").style.display = "flex"; // Show loading animation

    if (!contract) throw new Error("Smart contract not initialized");

    const adminRole = await contract.DEFAULT_ADMIN_ROLE();
    const institutionRole = await contract.INSTITUTION_ROLE();

    const isAdmin = await contract.hasRole(adminRole, address);
    const isInstitution = await contract.hasRole(institutionRole, address);

    // ✅ Wait at least 3 seconds before proceeding
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ✅ Hide loading animation
    document.getElementById("loadingOverlayRole").style.display = "none"; // Hide


    if (isAdmin) {
      loadPage("admin");
      showToast("✅ Admin role detected. Loading Admin page.", "success");
    } else if (isInstitution) {
      loadPage("institution");
      showToast("✅ Institution role detected. Loading Institution page.", "success");
    } else {
      showToast("No role assigned. Loading Verify page.", "warning");
      loadPage("verify");
    }
  } catch (error) {
    console.error("Role Determination Error:", error);
    showToast("No role. Reverting to Verify page.", "error");

    // Hide overlay and fallback to verify page
    document.getElementById("loadingOverlayRole").style.display = "none";
    loadPage("verify");
  }
}


// ✅ Load the respective page
async function loadPage(role) {
  try {
    const res = await fetch(`pages/${role}.html`);
    const html = await res.text();
    document.getElementById("app").innerHTML = html;

    console.log(`✅ Loaded ${role}.html into #app`);

    // Dynamically load the role's script
    const script = document.createElement("script");
    script.src = `js/${role}.js`;
    script.type = "module";


    script.onload = () => console.log(`✅ ${role}.js loaded`);
    script.onerror = () => console.error(`❌ Failed to load js/${role}.js`);
    
    document.body.appendChild(script);

  } catch (error) {
    console.error(`Error loading ${role} page:`, error);
    showToast("❌ Failed to load page", "error");
  }
}

// ✅ Modal for End-User License Agreement & Privacy Policy
document.getElementById("openPolicyModal").addEventListener("click", function(e) {
  e.preventDefault();
  document.getElementById("policyModal").style.display = "block";
});

document.getElementById("closeModal").addEventListener("click", function() {
  document.getElementById("policyModal").style.display = "none";
});

document.getElementById("acceptPolicyBtn").addEventListener("click", function() {
  showToast("✅ Policy Accepted. Thank you!", "success");
  document.getElementById("policyModal").style.display = "none";
});

window.addEventListener("click", function(event) {
  const modal = document.getElementById("policyModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

window.addEventListener("click", function(event) {
  const modals = [
    document.getElementById("confirmRevokeCertModal"),
    document.getElementById("confirmCertModal"),
    document.getElementById("confirmRevokeInstitutionModal"),
    document.getElementById("revokeConfirmModal"),
    document.getElementById("revokeInstitutionModal"),
    document.getElementById("confirmModal"),
    


  ];

  modals.forEach(modal => {
    if (modal && event.target === modal) {
      modal.style.display = "none";
    }
  });
});


// ✅ Toast Notification Function
window.showToast = function(message, type) {
    let bgColor = {
      success: "green",
      error: "red",
      warning: "orange"
    }[type] || "gray";
  
    Toastify({
      text: message,
      duration: 3000,
      gravity: "top",
      position: "right",
      backgroundColor: bgColor,
    }).showToast();
  };



  // ✅ Function to Copy Certificate ID and Show Toast Notification
// ✅ Make copyToClipboard globally accessible
window.copyToClipboard = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("✅ Certificate ID copied!", "success");
  }).catch(err => {
    console.error("Copy failed:", err);
    showToast("❌ Failed to copy!", "error");
  });
};


// **Debounce Function for Better Search Performance**
window.debounce = function(func, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}


// 🔍 **Search Function**
window.filterList = function (listId, searchText) {

    let items = document.querySelectorAll(`#${listId} li`);
    searchText = searchText.toLowerCase();
    let matchesFound = false; // ✅ Ensure `matchesFound` is properly initialized
  
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(searchText)) {
        item.style.display = "block";
        matchesFound = true; // ✅ At least one match was found
      } else {
        item.style.display = "none";
      }
    });
  
    // ✅ Show toast if no results found
    if (!matchesFound) {
      showToast("❌ No certificates found matching the search!", "warning");
    }
  }
  