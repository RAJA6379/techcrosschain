const anchor = require("@coral-xyz/anchor");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
} = anchor.web3;

const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

async function main() {
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  const walletPath = path.join(
    os.homedir(),
    ".config/solana/id.json"
  );

  const secretKey = JSON.parse(
    fs.readFileSync(walletPath, "utf8")
  );

  const wallet = new anchor.Wallet(
    Keypair.fromSecretKey(Uint8Array.from(secretKey))
  );

  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: "confirmed" }
  );

  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../target/idl/minswap_solana.json"),
      "utf8"
    )
  );

  const program = new anchor.Program(idl, provider);

  const expectedProgramId = new PublicKey(
    "C16AEqbg9oByBacWyG9uoVDFFSf8q3sY7WvXQscdk3jd"
  );

  if (!program.programId.equals(expectedProgramId)) {
    throw new Error("Program ID does not match the IDL.");
  }

  const mint1 = new PublicKey(
    "6yo8bHAeuFSj12kmxFhZSdmj5RjBRk5iqaBQr5XcWDXm"
  );

  const mint2 = new PublicKey(
    "EQ5zHatuNJU8oRmU3KQHZSLKQ3wyJpHRFentnW9ktiQR"
  );

  const [tokenA, tokenB] =
    Buffer.compare(mint1.toBuffer(), mint2.toBuffer()) < 0
      ? [mint1, mint2]
      : [mint2, mint1];

  const [pool] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      tokenA.toBuffer(),
      tokenB.toBuffer(),
    ],
    program.programId
  );

  const [vaultA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_a"), pool.toBuffer()],
    program.programId
  );

  const [vaultB] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_b"), pool.toBuffer()],
    program.programId
  );

  const [lpMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_mint"), pool.toBuffer()],
    program.programId
  );

  console.log("===== DEVNET POOL INITIALIZATION =====");
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Program:", program.programId.toBase58());
  console.log("Token A:", tokenA.toBase58());
  console.log("Token B:", tokenB.toBase58());
  console.log("Pool:", pool.toBase58());

  const existingPool = await connection.getAccountInfo(pool);

  if (existingPool) {
    if (!existingPool.owner.equals(program.programId)) {
      throw new Error("Pool address exists but has the wrong owner.");
    }

    console.log("Pool already exists. No transaction sent.");
    return;
  }

  const signature = await program.methods
    .initializePool()
    .accountsStrict({
      authority: wallet.publicKey,
      pool,
      tokenAMint: tokenA,
      tokenBMint: tokenB,
      tokenAVault: vaultA,
      tokenBVault: vaultB,
      lpMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log("Pool initialized successfully!");
  console.log("Transaction:", signature);
  console.log("Vault A:", vaultA.toBase58());
  console.log("Vault B:", vaultB.toBase58());
  console.log("LP Mint:", lpMint.toBase58());
  console.log("===== COMPLETE =====");
}

main().catch((error) => {
  console.error("Initialization failed:", error);
  process.exit(1);
});
