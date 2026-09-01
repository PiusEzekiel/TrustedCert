import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { Contract, JsonRpcProvider, getAddress, id, isAddress, verifyMessage } from "ethers";
const app = express();

dotenv.config();

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://trustedcert.onrender.com",
];
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const uploadAttempts = new Map();
const usedUploadNonces = new Map();
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;
const MAX_UPLOADS_PER_WINDOW = Number(process.env.MAX_UPLOADS_PER_WINDOW || 20);
const SIGNATURE_TTL_MS = 5 * 60 * 1000;
const INSTITUTION_ROLE = id("INSTITUTION_ROLE");
const registryAbi = [
  "function hasRole(bytes32 role, address account) view returns (bool)",
];
const registryProvider = process.env.SEPOLIA_RPC_URL
  ? new JsonRpcProvider(process.env.SEPOLIA_RPC_URL)
  : null;
const registryContract = registryProvider && process.env.CONTRACT_ADDRESS
  ? new Contract(process.env.CONTRACT_ADDRESS, registryAbi, registryProvider)
  : null;

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed"));
  },
}));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
  fileFilter(req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error("Only PDF, PNG, JPG, and WebP certificate files are allowed."));
      return;
    }

    callback(null, true);
  },
});

function cleanupUploadAttempts(now) {
  for (const [key, bucket] of uploadAttempts.entries()) {
    if (now - bucket.startedAt > UPLOAD_WINDOW_MS) {
      uploadAttempts.delete(key);
    }
  }

  for (const [key, expiresAt] of usedUploadNonces.entries()) {
    if (now > expiresAt) {
      usedUploadNonces.delete(key);
    }
  }
}

function rateLimitUpload(req, res, next) {
  const now = Date.now();
  cleanupUploadAttempts(now);
  const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const bucket = uploadAttempts.get(key) || { count: 0, startedAt: now };

  if (now - bucket.startedAt > UPLOAD_WINDOW_MS) {
    bucket.count = 0;
    bucket.startedAt = now;
  }

  bucket.count += 1;
  uploadAttempts.set(key, bucket);

  if (bucket.count > MAX_UPLOADS_PER_WINDOW) {
    return res.status(429).json({ error: "Too many uploads. Please wait and try again." });
  }

  return next();
}

function buildUploadMessage({ address, timestamp, nonce, fileName, fileSize }) {
  return [
    "TrustedCert certificate upload",
    `Wallet: ${getAddress(address)}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
    `File: ${fileName}`,
    `Size: ${fileSize}`,
  ].join("\n");
}

async function requireAuthorizedUpload(req, res, next) {
  const { address, timestamp, nonce, signature } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "No certificate file was uploaded." });
  }

  if (!isAddress(address) || !timestamp || !nonce || !signature) {
    return res.status(401).json({ error: "Upload authorization is required." });
  }

  const issuedAt = Number(timestamp);
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > SIGNATURE_TTL_MS) {
    return res.status(401).json({ error: "Upload authorization has expired." });
  }

  try {
    const nonceKey = `${getAddress(address)}:${nonce}`;
    if (usedUploadNonces.has(nonceKey)) {
      return res.status(409).json({ error: "Upload authorization has already been used." });
    }

    const message = buildUploadMessage({
      address,
      timestamp,
      nonce,
      fileName: req.file.originalname || "certificate",
      fileSize: req.file.size,
    });
    const recoveredAddress = verifyMessage(message, signature);

    if (getAddress(recoveredAddress) !== getAddress(address)) {
      return res.status(401).json({ error: "Upload signature does not match the wallet." });
    }

    if (registryContract) {
      const hasInstitutionRole = await registryContract.hasRole(INSTITUTION_ROLE, getAddress(address));
      if (!hasInstitutionRole) {
        return res.status(403).json({ error: "Only registered institution wallets can upload certificates." });
      }
    }

    req.uploadWallet = getAddress(address);
    usedUploadNonces.set(nonceKey, now + SIGNATURE_TTL_MS);
    return next();
  } catch (error) {
    console.error("Upload authorization failed:", error);
    return res.status(401).json({ error: "Upload authorization failed." });
  }
}

function sanitizeFileName(fileName) {
  return String(fileName || "certificate")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .slice(0, 120) || "certificate";
}

app.get("/config", (req, res) => {
  res.json({
    contractAddress: process.env.CONTRACT_ADDRESS
  });
});

app.post("/upload", rateLimitUpload, upload.single("file"), requireAuthorizedUpload, async (req, res) => {
  if (!process.env.PINATA_JWT) {
    return res.status(500).json({ error: "IPFS upload is not configured." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No certificate file was uploaded." });
  }

  try {
    const formData = new FormData();
    const certificateBlob = new Blob([req.file.buffer], {
      type: req.file.mimetype || "application/octet-stream",
    });

    formData.append("file", certificateBlob, sanitizeFileName(req.file.originalname));

    const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: process.env.PINATA_JWT,
      },
      body: formData,
    });

    const result = await pinataResponse.json();

    if (!pinataResponse.ok) {
      return res.status(pinataResponse.status).json({
        error: result?.error || "Failed to upload certificate to IPFS.",
      });
    }

    return res.json({ IpfsHash: result.IpfsHash });
  } catch (error) {
    console.error("IPFS upload failed:", error);
    return res.status(500).json({ error: "Failed to upload certificate to IPFS." });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "Origin not allowed") {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  if (error.message?.includes("certificate files are allowed")) {
    return res.status(415).json({ error: error.message });
  }

  console.error("Unhandled server error:", error);
  return res.status(500).json({ error: "Unexpected server error." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
