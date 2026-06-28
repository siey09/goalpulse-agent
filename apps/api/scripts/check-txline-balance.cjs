const fs = require("fs");
const path = require("path");
const { Connection, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const walletPath = path.join(__dirname, "..", ".secrets", "txline-wallet.json");

if (!fs.existsSync(walletPath)) {
  console.error("Wallet file not found. Run create-txline-wallet.cjs first.");
  process.exit(1);
}

const secret = JSON.parse(fs.readFileSync(walletPath, "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

async function main() {
  const lamports = await connection.getBalance(wallet.publicKey);
  const sol = lamports / LAMPORTS_PER_SOL;

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Balance:", sol, "SOL");

  if (sol <= 0) {
    console.log("");
    console.log("No SOL yet. Send a small amount of mainnet SOL to this wallet.");
  } else {
    console.log("");
    console.log("Wallet funded. Ready for TxLINE free-tier subscription step.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
