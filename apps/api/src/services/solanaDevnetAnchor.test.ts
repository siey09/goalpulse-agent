import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getBalanceMock = vi.fn();
const sendAndConfirmTransactionMock = vi.fn();

vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual<typeof import("@solana/web3.js")>(
    "@solana/web3.js"
  );

  return {
    ...actual,
    Connection: vi.fn().mockImplementation(function MockConnection() {
      return { getBalance: getBalanceMock };
    }),
    sendAndConfirmTransaction: sendAndConfirmTransactionMock,
  };
});

const ORIGINAL_ENV = { ...process.env };

// A genuine (but freshly-generated, never funded) Ed25519 keypair, so
// Keypair.fromSecretKey's built-in validation passes. This is not a real
// wallet used anywhere - it exists purely to satisfy key-format validation
// in these tests.
let FAKE_SECRET_KEY: string;

beforeAll(async () => {
  const { Keypair: RealKeypair } = await vi.importActual<typeof import("@solana/web3.js")>(
    "@solana/web3.js"
  );
  FAKE_SECRET_KEY = JSON.stringify(Array.from(RealKeypair.generate().secretKey));
});

describe("anchorProofHashOnDevnet", () => {
  beforeEach(() => {
    vi.resetModules();
    getBalanceMock.mockReset();
    sendAndConfirmTransactionMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reports unavailable with an honest reason when no wallet is configured", async () => {
    delete process.env.SOLANA_PRIVATE_KEY;
    const { anchorProofHashOnDevnet } = await import("./solanaDevnetAnchor");

    const result = await anchorProofHashOnDevnet("abc123");

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/SOLANA_PRIVATE_KEY/);
    expect(result.signature).toBeUndefined();
  });

  it("rejects a missing or empty hash before touching the network", async () => {
    process.env.SOLANA_PRIVATE_KEY = FAKE_SECRET_KEY;
    const { anchorProofHashOnDevnet } = await import("./solanaDevnetAnchor");

    const result = await anchorProofHashOnDevnet("");

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/proof hash is required/i);
    expect(getBalanceMock).not.toHaveBeenCalled();
  });

  it("reports unavailable with a faucet pointer when the devnet wallet is unfunded", async () => {
    process.env.SOLANA_PRIVATE_KEY = FAKE_SECRET_KEY;
    getBalanceMock.mockResolvedValue(0);
    const { anchorProofHashOnDevnet } = await import("./solanaDevnetAnchor");

    const result = await anchorProofHashOnDevnet("abc123");

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/faucet\.solana\.com/);
    expect(sendAndConfirmTransactionMock).not.toHaveBeenCalled();
  });

  it("anchors the hash and returns a real signature and devnet explorer link when funded", async () => {
    process.env.SOLANA_PRIVATE_KEY = FAKE_SECRET_KEY;
    getBalanceMock.mockResolvedValue(1_000_000);
    sendAndConfirmTransactionMock.mockResolvedValue("fakeSignature123");
    const { anchorProofHashOnDevnet } = await import("./solanaDevnetAnchor");

    const result = await anchorProofHashOnDevnet("abc123");

    expect(result.available).toBe(true);
    expect(result.signature).toBe("fakeSignature123");
    expect(result.explorerUrl).toBe(
      "https://explorer.solana.com/tx/fakeSignature123?cluster=devnet"
    );
  });

  it("reports the underlying error message when the devnet RPC call fails, never fabricating a signature", async () => {
    process.env.SOLANA_PRIVATE_KEY = FAKE_SECRET_KEY;
    getBalanceMock.mockResolvedValue(1_000_000);
    sendAndConfirmTransactionMock.mockRejectedValue(new Error("blockhash not found"));
    const { anchorProofHashOnDevnet } = await import("./solanaDevnetAnchor");

    const result = await anchorProofHashOnDevnet("abc123");

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/blockhash not found/);
    expect(result.signature).toBeUndefined();
  });
});
