import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

const require = createRequire(import.meta.url);
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} = require("../../scripts/solana-token-utils.cjs");

describe("Solana token utilities", () => {
  const mint = new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL");
  const owner = Keypair.fromSeed(Buffer.alloc(32, 1)).publicKey;

  it("derives the Token-2022 ATA used by the SPL reference implementation", () => {
    const address = getAssociatedTokenAddressSync(
      mint,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    expect(address.toBase58()).toBe("F3vpXDZEJPfK34ixPs3ngZeEieUyebgfX3DTqUxSmwcW");
  });

  it("builds an idempotent associated-token-account instruction", () => {
    const associatedToken = getAssociatedTokenAddressSync(
      mint,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const instruction = createAssociatedTokenAccountIdempotentInstruction(
      owner,
      associatedToken,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    expect(instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect([...instruction.data]).toEqual([1]);
    expect(instruction.keys.map(({ pubkey }: { pubkey: PublicKey }) => pubkey.toBase58())).toEqual([
      owner.toBase58(),
      associatedToken.toBase58(),
      owner.toBase58(),
      mint.toBase58(),
      SystemProgram.programId.toBase58(),
      TOKEN_2022_PROGRAM_ID.toBase58(),
    ]);
    expect(
      instruction.keys.map(
        ({ isSigner, isWritable }: { isSigner: boolean; isWritable: boolean }) => ({
          isSigner,
          isWritable,
        })
      )
    ).toEqual([
      { isSigner: true, isWritable: true },
      { isSigner: false, isWritable: true },
      { isSigner: false, isWritable: false },
      { isSigner: false, isWritable: false },
      { isSigner: false, isWritable: false },
      { isSigner: false, isWritable: false },
    ]);
  });

  it("requires an explicit opt-in for PDA owners", () => {
    const programId = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
    const [ownerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_treasury_v2")],
      programId
    );

    expect(() =>
      getAssociatedTokenAddressSync(
        mint,
        ownerPda,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ).toThrow(/off curve/i);
    expect(
      getAssociatedTokenAddressSync(
        mint,
        ownerPda,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ).toBase58()
    ).toBe("DnbxehrjqjVr3YwekMiCG8Uf4KVsrgwqRmHbdxLJ3Haa");
  });

  it("returns an existing valid ATA without submitting a transaction", async () => {
    const payer = Keypair.fromSeed(Buffer.alloc(32, 2));
    const accountData = Buffer.alloc(165);
    mint.toBuffer().copy(accountData, 0);
    owner.toBuffer().copy(accountData, 32);
    const connection = {
      getAccountInfo: async () => ({ data: accountData, owner: TOKEN_2022_PROGRAM_ID }),
    };
    let sendCount = 0;

    const account = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      owner,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      async () => {
        sendCount += 1;
      }
    );

    expect(account.address.toBase58()).toBe("F3vpXDZEJPfK34ixPs3ngZeEieUyebgfX3DTqUxSmwcW");
    expect(sendCount).toBe(0);
  });

  it("creates a missing ATA, forwards confirmation options, and validates the result", async () => {
    const payer = Keypair.fromSeed(Buffer.alloc(32, 2));
    const accountData = Buffer.alloc(165);
    mint.toBuffer().copy(accountData, 0);
    owner.toBuffer().copy(accountData, 32);
    let lookupCount = 0;
    const connection = {
      getAccountInfo: async () => {
        lookupCount += 1;
        return lookupCount === 1
          ? null
          : { data: accountData, owner: TOKEN_2022_PROGRAM_ID };
      },
    };
    const confirmOptions = {
      commitment: "confirmed",
      preflightCommitment: "processed",
      skipPreflight: true,
    };
    let receivedOptions: unknown;

    const account = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      owner,
      false,
      "confirmed",
      confirmOptions,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      async (_connection: unknown, _transaction: unknown, _signers: unknown, options: unknown) => {
        receivedOptions = options;
      }
    );

    expect(account.address.toBase58()).toBe("F3vpXDZEJPfK34ixPs3ngZeEieUyebgfX3DTqUxSmwcW");
    expect(lookupCount).toBe(2);
    expect(receivedOptions).toBe(confirmOptions);
  });

  it("rejects malformed Token-2022 accounts shorter than the base account layout", async () => {
    const payer = Keypair.fromSeed(Buffer.alloc(32, 2));
    const accountData = Buffer.alloc(64);
    mint.toBuffer().copy(accountData, 0);
    owner.toBuffer().copy(accountData, 32);
    const connection = {
      getAccountInfo: async () => ({ data: accountData, owner: TOKEN_2022_PROGRAM_ID }),
    };

    await expect(
      getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        owner,
        false,
        "confirmed",
        undefined,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
        async () => undefined
      )
    ).rejects.toThrow(/too short/i);
  });
});
