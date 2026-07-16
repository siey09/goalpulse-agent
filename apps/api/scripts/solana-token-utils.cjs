const {
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");

const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

function getAssociatedTokenAddressSync(
  mint,
  owner,
  allowOwnerOffCurve = false,
  programId = TOKEN_2022_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
) {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) {
    throw new Error("Token owner is off curve");
  }

  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId
  )[0];
}

function createAssociatedTokenAccountIdempotentInstruction(
  payer,
  associatedToken,
  owner,
  mint,
  programId = TOKEN_2022_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
) {
  return new TransactionInstruction({
    programId: associatedTokenProgramId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function validateAssociatedTokenAccount(accountInfo, mint, owner, programId) {
  if (!accountInfo.owner.equals(programId)) {
    throw new Error("Associated token account has an invalid program owner");
  }
  if (accountInfo.data.length < 165) {
    throw new Error("Associated token account data is too short");
  }

  const accountMint = new PublicKey(accountInfo.data.subarray(0, 32));
  const accountOwner = new PublicKey(accountInfo.data.subarray(32, 64));

  if (!accountMint.equals(mint)) {
    throw new Error("Associated token account has an invalid mint");
  }
  if (!accountOwner.equals(owner)) {
    throw new Error("Associated token account has an invalid token owner");
  }
}

async function getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  mint,
  owner,
  allowOwnerOffCurve = false,
  commitment = "confirmed",
  confirmOptions,
  programId = TOKEN_2022_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
  sendTransaction = sendAndConfirmTransaction
) {
  const address = getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    programId,
    associatedTokenProgramId
  );
  const existingAccount = await connection.getAccountInfo(address, commitment);

  if (existingAccount) {
    validateAssociatedTokenAccount(existingAccount, mint, owner, programId);
    return { address };
  }

  const instruction = createAssociatedTokenAccountIdempotentInstruction(
    payer.publicKey,
    address,
    owner,
    mint,
    programId,
    associatedTokenProgramId
  );

  try {
    await sendTransaction(
      connection,
      new Transaction().add(instruction),
      [payer],
      confirmOptions
    );
  } catch (error) {
    const racedAccount = await connection.getAccountInfo(address, commitment);
    if (!racedAccount) {
      throw error;
    }
    validateAssociatedTokenAccount(racedAccount, mint, owner, programId);
    return { address };
  }

  const createdAccount = await connection.getAccountInfo(address, commitment);
  if (!createdAccount) {
    throw new Error("Associated token account was not found after creation");
  }
  validateAssociatedTokenAccount(createdAccount, mint, owner, programId);

  return { address };
}

module.exports = {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
};
