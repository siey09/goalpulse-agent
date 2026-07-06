import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { config } from "../config";
import { getGuestJwt } from "./txlineClient";
import idl from "../idl/txoracle.json";

/**
 * Real on-chain Merkle proof validation against TxLINE's Txoracle program on
 * Solana mainnet. This is additive to the SHA-256 proof hash already produced
 * by the Outcome Audit layer: it never replaces or blocks that existing,
 * working feature. If a Solana wallet is not configured (no
 * SOLANA_WALLET_SECRET_KEY env var), this module reports itself as
 * `available: false` and every caller falls back gracefully.
 *
 * Cost note: `.view()` calls are read-only transaction simulations. They do
 * not submit a transaction and do not spend SOL on network fees.
 */

const PROGRAM_ID = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";

export interface OnChainValidationResult {
  available: boolean;
  reason?: string;
  isValid?: boolean;
  provenStat?: { key: number; value: number; period: number };
  dailyScoresPda?: string;
}

function loadWalletKeypair(): Keypair | null {
  const raw = process.env.SOLANA_WALLET_SECRET_KEY;

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

function toBytes32(value: string | number[]): number[] {
  if (Array.isArray(value)) {
    return value;
  }

  const bytes = value.startsWith("0x")
    ? Buffer.from(value.slice(2), "hex")
    : Buffer.from(value, "base64");

  return Array.from(bytes);
}

function toProofNodes(
  nodes: Array<{ hash: string | number[]; isRightSibling: boolean }>
) {
  return nodes.map((node) => ({
    hash: toBytes32(node.hash),
    isRightSibling: node.isRightSibling,
  }));
}

function getProgram(): anchor.Program | null {
  const wallet = loadWalletKeypair();

  if (!wallet) {
    return null;
  }

  const rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
  const connection = new Connection(rpcUrl, "confirmed");
  const anchorWallet = new anchor.Wallet(wallet);
  const provider = new anchor.AnchorProvider(connection, anchorWallet, {
    commitment: "confirmed",
  });

  return new anchor.Program(idl as anchor.Idl, provider);
}

/**
 * Validates a single stat for a fixture/seq against the on-chain Merkle root,
 * using TxLINE's own /api/scores/stat-validation endpoint for the proof data.
 *
 * `statKey` is caller-supplied: this module does not assume or hardcode what
 * a given numeric statKey semantically means (e.g. "home goals"), since that
 * mapping is not publicly documented by TxLINE. The `provenStat` field in the
 * result surfaces the actual key/value TxLINE returns, so the caller can
 * confirm what was proven.
 *
 * The on-chain predicate itself is always "the exact value TxLINE reports
 * for this stat (`validation.statToProve.value`) is what's anchored
 * on-chain" (comparison: equalTo, threshold: that same real value) rather
 * than an arbitrary caller-supplied threshold. An arbitrary fixed predicate
 * (e.g. always "greaterThan 0") can produce a mechanically-correct but
 * misleading `isValid: false` for a perfectly valid, untampered proof, just
 * because of what the real underlying value happens to be. Proving equality
 * against the real value is always a meaningful, genuine on-chain check
 * ("this recorded value is really what's anchored"), for any fixture/seq.
 */
export async function validateStatOnChain(
  fixtureId: number,
  seq: number,
  statKey: number
): Promise<OnChainValidationResult> {
  const program = getProgram();

  if (!program) {
    return {
      available: false,
      reason:
        "Solana wallet not configured. Set SOLANA_WALLET_SECRET_KEY to enable on-chain validation.",
    };
  }

  try {
    const jwt = await getGuestJwt();

    const url = new URL(`${config.txlineApiBaseUrl}/api/scores/stat-validation`);
    url.searchParams.set("fixtureId", String(fixtureId));
    url.searchParams.set("seq", String(seq));
    url.searchParams.set("statKey", String(statKey));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": config.txlineApiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        available: false,
        reason: `TxLINE stat-validation request failed: ${response.status} ${response.statusText}`,
      };
    }

    const validation = await response.json();

    if (!validation.statToProve) {
      return {
        available: false,
        reason:
          "TxLINE did not return a provable stat for this fixtureId/seq/statKey combination.",
      };
    }

    const fixtureSummary = {
      fixtureId: new BN(validation.summary.fixtureId),
      updateStats: {
        updateCount: validation.summary.updateStats.updateCount,
        minTimestamp: new BN(validation.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(validation.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: toBytes32(validation.summary.eventStatsSubTreeRoot),
    };

    const fixtureProof = toProofNodes(validation.subTreeProof);
    const mainTreeProof = toProofNodes(validation.mainTreeProof);

    const statA = {
      statToProve: validation.statToProve,
      eventStatRoot: toBytes32(validation.eventStatRoot),
      statProof: toProofNodes(validation.statProof),
    };

    const predicate = {
      threshold: validation.statToProve.value,
      comparison: { equalTo: {} },
    };

    const targetTs = validation.summary.updateStats.minTimestamp;
    const epochDay = Math.floor(targetTs / (24 * 60 * 60 * 1000));

    const [dailyScoresPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("daily_scores_roots"),
        new BN(epochDay).toArrayLike(Buffer, "le", 2),
      ],
      PROGRAM_ID
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    });

    const isValid: boolean = await program.methods
      .validateStat(
        new BN(targetTs),
        fixtureSummary,
        fixtureProof,
        mainTreeProof,
        predicate,
        statA,
        null,
        null
      )
      .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
      .preInstructions([computeBudgetIx])
      .view();

    return {
      available: true,
      isValid,
      provenStat: validation.statToProve,
      dailyScoresPda: dailyScoresPda.toBase58(),
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
