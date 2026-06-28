const fs = require("fs");
const path = require("path");
const { Keypair } = require("@solana/web3.js");

const secretsDir = path.join(__dirname, "..", ".secrets");
const walletPath = path.join(secretsDir, "txline-wallet.json");

fs.mkdirSync(secretsDir, { recursive: true });

if (fs.existsSync(walletPath)) {
  const existingSecret = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const existingWallet = Keypair.fromSecretKey(Uint8Array.from(existingSecret));

  console.log("TxLINE wallet already exists.");
  console.log("Public address:", existingWallet.publicKey.toBase58());
  console.log("Wallet file:", walletPath);
  console.log("");
  console.log("Do NOT share txline-wallet.json.");
  process.exit(0);
}

const wallet = Keypair.generate();

fs.writeFileSync(
  walletPath,
  JSON.stringify(Array.from(wallet.secretKey), null, 2),
  "utf8"
);

console.log("TxLINE wallet created.");
console.log("Public address:", wallet.publicKey.toBase58());
console.log("Wallet file:", walletPath);
console.log("");
console.log("Do NOT share txline-wallet.json.");
