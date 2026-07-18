import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

/**
 * Actually posts GoalPulse's local SHA-256 outcome-audit proof hash to
 * Solana devnet, via a single Memo-program instruction carrying the hash as
 * its data. This is additive to (never a replacement for) the SHA-256
 * fingerprint itself: the fingerprint is always computed locally and shown
 * regardless of wallet configuration; this only adds a real, publicly
 * checkable devnet transaction proving the hash existed at a given time.
 *
 * This is a distinct feature from onchainValidation.ts's Solana MAINNET
 * Merkle-proof check (a read-only `.view()` simulation against TxLINE's own
 * program, gated by SOLANA_WALLET_SECRET_KEY). This module instead performs
 * a real devnet WRITE, gated by its own SOLANA_PRIVATE_KEY env var, kept
 * separate on purpose so a devnet demo key can never be confused with (or
 * substituted for) a mainnet-capable one.
 *
 * Devnet SOL has no monetary value and is free from the public faucet
 * (https://faucet.solana.com) - this never touches real funds.
 */

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";

export interface AnchorProofResult {
  available: boolean;
  reason?: string;
  signature?: string;
  explorerUrl?: string;
}

function loadDevnetWalletKeypair(): Keypair | null {
  const raw = process.env.SOLANA_PRIVATE_KEY;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    return null;
  }
}

function getConnection(): Connection {
  const rpcUrl = process.env.SOLANA_DEVNET_RPC_URL ?? DEFAULT_DEVNET_RPC_URL;
  return new Connection(rpcUrl, "confirmed");
}

/**
 * Submits and confirms a real Solana devnet transaction anchoring `hash`.
 * Returns `available: false` with an honest `reason` (never a fabricated
 * signature) whenever the wallet is unconfigured, unfunded, or the network
 * call itself fails.
 */
export async function anchorProofHashOnDevnet(
  hash: string
): Promise<AnchorProofResult> {
  const wallet = loadDevnetWalletKeypair();

  if (!wallet) {
    return {
      available: false,
      reason:
        "Solana devnet wallet not configured. Set SOLANA_PRIVATE_KEY to enable devnet anchoring.",
    };
  }

  if (!hash || typeof hash !== "string") {
    return {
      available: false,
      reason: "A proof hash is required to anchor.",
    };
  }

  const connection = getConnection();

  try {
    const balanceLamports = await connection.getBalance(wallet.publicKey);

    if (balanceLamports <= 0) {
      return {
        available: false,
        reason: `Devnet wallet ${wallet.publicKey.toBase58()} has no SOL. Fund it for free at https://faucet.solana.com, then retry.`,
      };
    }

    const memoData = Buffer.from(`goalpulse-proof:${hash}`, "utf-8");

    const instruction = new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: memoData,
    });

    const transaction = new Transaction().add(instruction);

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: "confirmed" }
    );

    return {
      available: true,
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    };
  } catch (error) {
    return {
      available: false,
      reason:
        error instanceof Error
          ? `Devnet anchoring failed: ${error.message}`
          : "Devnet anchoring failed for an unknown reason.",
    };
  }
}
