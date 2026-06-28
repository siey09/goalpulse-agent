const fs = require("fs");
const path = require("path");
const {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

const RPC_URL = "https://api.mainnet-beta.solana.com";

const SUBSCRIPTION_TOKEN_MINT = new PublicKey(
  "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"
);

const walletPath = path.join(__dirname, "..", ".secrets", "txline-wallet.json");

async function main() {
  if (!fs.existsSync(walletPath)) {
    throw new Error("Wallet file not found.");
  }

  const secret = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(RPC_URL, "confirmed");

  const balance = await connection.getBalance(payer.publicKey);

  console.log("Wallet:", payer.publicKey.toBase58());
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");

  const expectedAta = getAssociatedTokenAddressSync(
    SUBSCRIPTION_TOKEN_MINT,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log("Expected user token account:", expectedAta.toBase58());
  console.log("");
  console.log("Creating or checking Token-2022 associated token account...");

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    SUBSCRIPTION_TOKEN_MINT,
    payer.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log("");
  console.log("User token account ready:");
  console.log(tokenAccount.address.toBase58());

  if (tokenAccount.address.toBase58() !== expectedAta.toBase58()) {
    console.log("");
    console.log("Warning: created token account differs from expected ATA.");
  }

  console.log("");
  console.log("Now you can retry subscribe-txline-free-tier.cjs");
}

main().catch((error) => {
  console.error("");
  console.error("Failed to create user token account.");
  console.error(error?.response?.data ?? error);
  process.exit(1);
});
