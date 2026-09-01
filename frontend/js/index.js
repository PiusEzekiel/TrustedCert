

const API_BASE_URL = "https://trustedcert-backend.onrender.com";
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const APP_VERSION = "20260901-no-app-hash";

let CONTRACT_ADDRESS;
let activeRoleScript;
let pageLoadNonce = 0;

async function loadConfig() {
  const res = await fetch(`${API_BASE_URL}/config`);
  const config = await res.json();
  CONTRACT_ADDRESS = config.contractAddress;
}



// Global setup
let provider, signer, contract;

function setNetworkBadge(status, text) {
  const networkBadge = document.getElementById("networkBadge");
  if (!networkBadge) return;

  networkBadge.dataset.status = status;
  networkBadge.textContent = text;
}

function setSwitchNetworkVisible(isVisible) {
  const switchNetworkBtn = document.getElementById("switchNetworkBtn");
  if (switchNetworkBtn) {
    switchNetworkBtn.hidden = !isVisible;
  }
}

async function switchToSepolia() {
  if (!window.ethereum) return false;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }]
    });
    setNetworkBadge("ready", "Sepolia");
    setSwitchNetworkVisible(false);
    return true;
  } catch (error) {
    console.error("Network switch error:", error);
    setNetworkBadge("warning", "Wrong network");
    setSwitchNetworkVisible(true);
    showToast("Please switch to Sepolia to use wallet dashboards.", "warning");
    return false;
  }
}

async function ensureSepoliaNetwork() {
  if (!provider) return false;

  const network = await provider.getNetwork();
  if (network.chainId === SEPOLIA_CHAIN_ID) {
    setNetworkBadge("ready", "Sepolia");
    setSwitchNetworkVisible(false);
    return true;
  }

  setNetworkBadge("warning", "Wrong network");
  setSwitchNetworkVisible(true);
  return switchToSepolia();
}

function normalizeMainUrl() {
  const isMainRoute = window.location.pathname === "/" || window.location.pathname.endsWith("/index.html");
  if (!isMainRoute) return;

  const cleanUrl = `/${window.location.search}`;
  if (window.location.pathname !== "/" || window.location.hash === "#app") {
    window.history.replaceState(null, "", cleanUrl);
  }
}

function attachCleanScrollLinks() {
  document.querySelectorAll("[data-scroll-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.getElementById(link.dataset.scrollTarget);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `/${window.location.search}`);
    });
  });
}

window.onload = async () => {
  normalizeMainUrl();

  document.getElementById("loadingOverlayFirst").style.display = "flex"; // Show loading animation
  await loadConfig();
  document.getElementById("loadingOverlayFirst").style.display = "none"; // Hide loading animation

  loadPage("verify", { showLanding: true }); // Show verify page by default
  const connectBtn = document.getElementById("connectBtn");
  const grantConnectBtn = document.getElementById("grantConnectBtn");
  const switchNetworkBtn = document.getElementById("switchNetworkBtn");
  const siteHeader = document.querySelector(".site-header");
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const mobileHeaderPanel = document.getElementById("mobileHeaderPanel");
  const walletDisplay = document.getElementById("walletAddress");

  function setMobileMenuOpen(isOpen) {
    if (!siteHeader || !mobileMenuToggle || !mobileHeaderPanel) return;

    siteHeader.classList.toggle("is-menu-open", isOpen);
    mobileHeaderPanel.classList.toggle("is-open", isOpen);
    mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
    mobileMenuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  }

  mobileMenuToggle?.addEventListener("click", () => {
    setMobileMenuOpen(!siteHeader?.classList.contains("is-menu-open"));
  });

  mobileHeaderPanel?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMobileMenuOpen(false));
  });

  attachCleanScrollLinks();

  document.addEventListener("click", (event) => {
    if (!siteHeader?.classList.contains("is-menu-open")) return;
    if (siteHeader.contains(event.target)) return;
    setMobileMenuOpen(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMobileMenuOpen(false);
    }
  });

  grantConnectBtn?.addEventListener("click", () => {
    connectBtn?.click();
  });

  switchNetworkBtn?.addEventListener("click", async () => {
    const switched = await switchToSepolia();
    if (switched && window.ethereum) {
      provider = new ethers.providers.Web3Provider(window.ethereum);
      signer = provider.getSigner();
    }
  });

  window.ethereum?.on?.("chainChanged", async () => {
    if (!provider) return;
    provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();
    const isSepolia = network.chainId === SEPOLIA_CHAIN_ID;
    setNetworkBadge(isSepolia ? "ready" : "warning", isSepolia ? "Sepolia" : "Wrong network");
    setSwitchNetworkVisible(!isSepolia);
  });


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
    const isSepolia = await ensureSepoliaNetwork();
    if (!isSepolia) return;

    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    const address = await signer.getAddress();
    // ✅ Truncate and update button text
    const truncated = `${address.substring(0, 6)}...${address.slice(-4)}`;
    connectBtn.innerText = `🟢 ${truncated}`;

    // Fetch contract ABI and instantiate it
    const abiRes = await fetch("./abi/CertificateRegistry.json");
    const abiJson = await abiRes.json();
    contract = new ethers.Contract(CONTRACT_ADDRESS, abiJson.abi, signer);
    console.log("✅ Using contract address:", CONTRACT_ADDRESS);

    showToast("✅ Wallet connected!", "success");
    setMobileMenuOpen(false);



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
    console.log("Checking roles for:", address);



    const adminRole = await contract.DEFAULT_ADMIN_ROLE();
    const institutionRole = await contract.INSTITUTION_ROLE();

    const isAdmin = await contract.hasRole(adminRole, address);
    const isInstitution = await contract.hasRole(institutionRole, address);
    console.log("Manual Role Check:", { isAdmin, isInstitution });


    // ✅ Wait at least 3 seconds before proceeding
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ✅ Hide loading animation
    document.getElementById("loadingOverlayRole").style.display = "none"; // Hide


    if (isAdmin) {
      loadPage("admin", { showLanding: false });
      showToast("✅ Admin role detected. Loading Admin page.", "success");
    } else if (isInstitution) {
      loadPage("institution", { showLanding: false });
      showToast("✅ Institution role detected. Loading Institution page.", "success");
    } else {
      showToast("No role assigned. Loading Verify page.", "warning");
      loadPage("verify", { showLanding: false });
    }
  } catch (error) {
    console.error("Role Determination Error:", error);
    showToast("No role. Reverting to Verify page.", "error");

    // Hide overlay and fallback to verify page
    document.getElementById("loadingOverlayRole").style.display = "none";
    loadPage("verify", { showLanding: false });
  }
}


// ✅ Load the respective page
async function loadPage(role, options = {}) {
  const { showLanding = true } = options;

  try {
    pageLoadNonce += 1;
    const res = await fetch(`pages/${role}.html?v=${APP_VERSION}-${pageLoadNonce}`);
    const html = await res.text();
    document.getElementById("app").innerHTML = html;
    document.body.classList.toggle("dashboard-active", !showLanding);

    console.log(`✅ Loaded ${role}.html into #app`);

    // Dynamically load the role's script
    if (activeRoleScript) {
      activeRoleScript.remove();
      activeRoleScript = null;
    }

    const script = document.createElement("script");
    script.src = `js/${role}.js?v=${APP_VERSION}-${pageLoadNonce}`;
    script.type = "module";
    script.dataset.roleScript = role;


    script.onload = () => console.log(`✅ ${role}.js loaded`);
    script.onerror = () => console.error(`❌ Failed to load js/${role}.js`);
    
    document.body.appendChild(script);
    activeRoleScript = script;

  } catch (error) {
    console.error(`Error loading ${role} page:`, error);
    showToast("❌ Failed to load page", "error");
  }
}

// Modal for End-User License Agreement & Privacy Policy
const policyModal = document.getElementById("policyModal");
const openPolicyModal = document.getElementById("openPolicyModal");
const closePolicyModal = document.getElementById("closeModal");

function setPolicyModalOpen(isOpen) {
  if (!policyModal) return;

  policyModal.classList.toggle("is-open", isOpen);
  policyModal.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("modal-open", isOpen);
}

openPolicyModal?.addEventListener("click", function(e) {
  e.preventDefault();
  setPolicyModalOpen(true);
});

closePolicyModal?.addEventListener("click", function() {
  setPolicyModalOpen(false);
});

window.addEventListener("keydown", function(event) {
  if (event.key === "Escape") {
    setPolicyModalOpen(false);
  }
});

window.addEventListener("click", function(event) {
  if (event.target === policyModal) {
    setPolicyModalOpen(false);
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
      style: {
        background: bgColor,
      },
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
