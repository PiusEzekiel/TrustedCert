# <img src="/frontend/images/trusted_cert_logo.png" width="40" height="50" alt="Image Description"> TrustedCert – Decentralized Certificate Verification Platform

## Overview
**TrustedCert** is a decentralized application (DApp) built to revolutionize the way academic and professional certificates are issued, stored, and verified. Powered by **Ethereum** smart contracts and **IPFS** for decentralized storage, TrustedCert empowers institutions to register certificates on-chain and allows employers or stakeholders to verify their authenticity instantly.

---

## 🎯 Features

- 🏛️ **Institution Dashboard** – Register certificates, manage records, and revoke credentials
- 👨‍💼 **Admin Dashboard** – Onboard or revoke institutions and monitor platform activity
- 🔍 **Verify Portal** – Public users can verify any certificate by its unique ID (hash)
- 🧠 **Role-based Access** – Smart contract enforces Admin, Institution, and Public roles
- 🔗 **IPFS File Storage** – Certificate files stored on Pinata/IPFS for immutability
- 🦊 **MetaMask Integration** – Connects seamlessly with MetaMask wallets
- 📄 **PDF/Image Certificate Previews** – Live previews of files before registration
- 📦 Fully modular: `frontend`, `backend`, and `contracts` folders for clean architecture

---

## ⚙️ Tech Stack

| Layer              | Technology                       |
|--------------------|-----------------------------------|
| **Blockchain**     | Ethereum (Sepolia testnet)       |
| **Smart Contract** | Solidity (Custom Certificate Registry) |
| **Web3 Library**   | Ethers.js                        |
| **Frontend**       | HTML, CSS, JS                    |
| **Storage**        | Pinata + IPFS                    |
| **Backend API**    | Express.js (Node.js)             |
| **Wallet Support** | MetaMask                         |
| **Hosting**        | Render (Frontend & Backend split) |

---

## 🌍 Live Deployment

- **Smart Contract:** `0xAb9c4522C84593cCcd902e1402Ea7DB7Be1aDf91`  
- **Frontend:** [https://trustedcert.onrender.com](https://trustedcert.onrender.com)   

---

## 🛠️ Setup & Deployment

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/PiusEzekiel/TrustedCert.git
cd trustedcert
```

### 2️⃣ Install Backend Dependencies

```bash
cd backend
npm install
```

### 3️⃣ Backend Environment

Create a `.env` file inside `backend/`:

```env
CONTRACT_ADDRESS=your_deployed_contract_address
PINATA_JWT=your_pinata_jwt_token
```

### 4️⃣ Start the Backend Server

```bash
npm start
# or if using a script:
node server.js
```

### 5️⃣ Frontend Deployment (for local testing)

```bash
npx serve frontend
```

Make sure `index.html` loads and dynamically fetches pages via JavaScript.

---

## 🧪 Testing the Smart Contract

Compile and deploy using your preferred tool (e.g., Hardhat):

```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

---

## 📷 Screenshots
- Institution Dashboard
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 162054.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 162304.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 162514.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 162602.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>

- Admin Dashboard
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 164750.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 164810.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 164831.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 164848.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>

- Certificate Verification
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 161818.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 161859.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>

- Test Cases
<span style="margin-bottom: 50px;">&nbsp;</span>
<div style="display: inlign-flex; align-items: center">
    <img src="/frontend/images/Screenshot 2025-04-01 165803.png" width="850" height="500" alt="Image Description">
</div>
<span style="margin-bottom: 50px;">&nbsp;</span>

---

## 🛡️ Security Considerations

- ⛓️ Immutable storage using IPFS + signed JWT for access
- ⚠️ Certificate Revocation via `revokeCertificate()`
- 🧾 Config values served securely via backend (not exposed on frontend)

## 🔐 Smart Contract Security

- Follows OpenZeppelin security best practices.
- Uses role-based access control for institutions and admins.
- Avoids reentrancy and uses `require` guards on critical functions.

---

## 🙋 Why a Smart Contract?

Smart contracts ensure **tamper-proof**, **verifiable**, and **transparent** operations between institutions and verifiers. They reduce fraud, eliminate manual checks, and provide users with real-time trust in issued credentials.

---

## 🔐 Consensus Mechanism

Ethereum's **Proof-of-Stake (PoS)** consensus ensures that all certificate records and transactions on the blockchain are secure, immutable, and decentralized. TrustedCert relies on Ethereum's validators for state consistency.


---

## 📄 License

MIT License
