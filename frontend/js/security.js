const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";
const SAFE_CID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._~/-]{1,180}$/;
const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeDisplay(value, fallback = "N/A") {
  const text = String(value ?? "").trim();
  return escapeHtml(text || fallback);
}

export function isValidBytes32(value) {
  return BYTES32_PATTERN.test(String(value || "").trim());
}

export function normalizeCid(cid) {
  const normalizedCid = String(cid || "")
    .trim()
    .replace(/^ipfs:\/\//i, "")
    .replace(/^\/?ipfs\//i, "");

  if (
    !normalizedCid ||
    normalizedCid.includes("..") ||
    normalizedCid.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalizedCid) ||
    !SAFE_CID_PATTERN.test(normalizedCid)
  ) {
    return "";
  }

  return normalizedCid;
}

export function getSafeIpfsUrl(cid) {
  const normalizedCid = normalizeCid(cid);
  if (!normalizedCid) return "";

  return `${IPFS_GATEWAY}${normalizedCid.split("/").map(encodeURIComponent).join("/")}`;
}

export function isLikelyPdfCid(cid) {
  return normalizeCid(cid).toLowerCase().endsWith(".pdf");
}
