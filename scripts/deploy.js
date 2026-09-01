import { network } from "hardhat";

const { ethers } = await network.create();

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contract with account:", deployer.address);

  const CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");
  const contract = await CertificateRegistry.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("CertificateRegistry deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
