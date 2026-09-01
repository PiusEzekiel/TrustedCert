# TrustedCert Security Notes

## Fixed without redeploying the contract

- Removed `PINATA_JWT` from the public `/config` response.
- Moved IPFS uploads behind the backend `/upload` endpoint.
- Required wallet-signed upload authorizations with timestamp and nonce replay protection.
- Added upload rate limiting, file size limits, and file type allowlisting.
- Added optional backend institution-role checks when `SEPOLIA_RPC_URL` and `CONTRACT_ADDRESS` are configured.
- Added backend security headers and CORS origin allowlisting.
- Added frontend escaping for certificate, institution, issuer, and CID data rendered from user input or on-chain records.
- Added certificate ID and IPFS CID validation before registry and gateway calls.
- Removed inline JavaScript event handlers from rendered UI.
- Added iframe sandboxing and stricter deployment security headers.
- Upgraded the Hardhat development toolchain and removed unused vulnerable dev-tool extras.

## Deferred until a contract redeploy is possible

- On-chain certificate metadata is public. If recipient names, titles, external IDs, or CIDs should be private, the contract should store hashes or encrypted references instead of plaintext values.
- Revocation is limited to the issuing institution wallet. If admins need emergency revocation authority, that requires a contract-level permission change.
- Institution records can still preserve historical duplicates from previous on-chain writes. The current UI deduplicates display, but permanent prevention requires contract changes.
