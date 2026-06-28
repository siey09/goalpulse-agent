const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const axios = require("axios");
const nacl = require("tweetnacl");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

const SERVICE_LEVEL_ID = 12; // World Cup & Int Friendlies Real-time Free
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES = [];

const TXLINE_BASE_URL = "https://txline.txodds.com";
const RPC_URL = "https://api.mainnet-beta.solana.com";

const PROGRAM_ID = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const SUBSCRIPTION_TOKEN_MINT = new PublicKey(
  "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"
);

const walletPath = path.join(__dirname, "..", ".secrets", "txline-wallet.json");
const idlPath = path.join(__dirname, "..", "src", "idl", "txline-mainnet.json");
const tokenPath = path.join(__dirname, "..", ".secrets", "txline-api-token.txt");
const envPath = path.join(__dirname, "..", ".env.local");

function saveEnvValue(filePath, key, value) {
  let current = "";

  if (fs.existsSync(filePath)) {
    current = fs.readFileSync(filePath, "utf8");
  }

  const lines = current
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith(`${key}=`));

  lines.push(`${key}=${value}`);

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  if (!fs.existsSync(walletPath)) {
    throw new Error("Wallet file not found. Run create-txline-wallet.cjs first.");
  }

  if (!fs.existsSync(idlPath)) {
    throw new Error("Local TxLINE IDL not found at src/idl/txline-mainnet.json.");
  }

  const secret = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

  const connection = new Connection(RPC_URL, "confirmed");
  const balance = await connection.getBalance(payer.publicKey);

  console.log("Wallet:", payer.publicKey.toBase58());
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");
  console.log("Program:", PROGRAM_ID.toBase58());
  console.log("IDL:", idl.metadata?.name || idl.name || "txline");
  console.log("Service level:", SERVICE_LEVEL_ID, "World Cup & Int Friendlies Real-time Free");
  console.log("");

  if (balance <= 0) {
    throw new Error("Wallet has no SOL for mainnet transaction fee.");
  }

  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  anchor.setProvider(provider);

  let program;

  try {
    program = new anchor.Program(idl, provider);
  } catch {
    program = new anchor.Program(idl, PROGRAM_ID, provider);
  }

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    PROGRAM_ID
  );

  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    SUBSCRIPTION_TOKEN_MINT,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    PROGRAM_ID
  );

  const userTokenAccount = getAssociatedTokenAddressSync(
    SUBSCRIPTION_TOKEN_MINT,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("Pricing matrix:", pricingMatrixPda.toBase58());
  console.log("Token treasury PDA:", tokenTreasuryPda.toBase58());
  console.log("Token treasury vault:", tokenTreasuryVault.toBase58());
  console.log("User token account:", userTokenAccount.toBase58());
  console.log("");
  console.log("Subscribing on-chain...");

  const txSig = await program.methods
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accounts({
      user: payer.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: SUBSCRIPTION_TOKEN_MINT,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("");
  console.log("Subscription transaction:");
  console.log(txSig);
  console.log("");

  console.log("Activating TxLINE API token...");

  const authResponse = await axios.post(`${TXLINE_BASE_URL}/auth/guest/start`);
  const jwt = authResponse.data.token;

  if (!jwt) {
    throw new Error("Guest auth did not return a JWT token.");
  }

  const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);

  const signatureBytes = nacl.sign.detached(message, payer.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  const activationResponse = await axios.post(
    `${TXLINE_BASE_URL}/api/token/activate`,
    {
      txSig,
      walletSignature,
      leagues: SELECTED_LEAGUES,
    },
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    }
  );

  const apiToken = activationResponse.data.token || activationResponse.data;

  if (!apiToken || typeof apiToken !== "string") {
    console.log("Activation response:", activationResponse.data);
    throw new Error("Activation did not return a string API token.");
  }

  fs.writeFileSync(tokenPath, `${apiToken}\n`, "utf8");

  saveEnvValue(envPath, "USE_SIMULATED_FEED", "false");
  saveEnvValue(envPath, "TXLINE_BASE_URL", TXLINE_BASE_URL);
  saveEnvValue(envPath, "TXLINE_API_TOKEN", apiToken);
  saveEnvValue(envPath, "TXLINE_SERVICE_LEVEL_ID", String(SERVICE_LEVEL_ID));

  console.log("");
  console.log("TxLINE API token activated.");
  console.log("Token saved to:", tokenPath);
  console.log("Env saved to:", envPath);
  console.log("");
  console.log("Do NOT commit or share .secrets or .env.local.");
  console.log("Token preview:", `${String(apiToken).slice(0, 10)}...`);
}

main().catch((error) => {
  console.error("");
  console.error("TxLINE subscription failed.");
  console.error(error?.response?.data ?? error);
  process.exit(1);
});
