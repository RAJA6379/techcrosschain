
const anchor = require("@coral-xyz/anchor");
const assert = require("assert");

const {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} = anchor.web3;

const {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
} = require("@solana/spl-token");

describe("MinSwap Solana - Pool Initialization", () => {
  // Use the Anchor provider from Anchor.toml
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.minswapSolana;
  const connection = provider.connection;
  const wallet = provider.wallet;

  it("Creates a pool and two token vaults", async () => {
    // STEP 1: Create two temporary Localnet SPL tokens.
    const mint1 = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    const mint2 = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // STEP 2: Sort the mint addresses.
    // Your Rust contract requires token A < token B.
    const [tokenA, tokenB] =
      Buffer.compare(mint1.toBuffer(), mint2.toBuffer()) < 0
        ? [mint1, mint2]
        : [mint2, mint1];

    // STEP 3: Derive the pool PDA.
    const [poolPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        tokenA.toBuffer(),
        tokenB.toBuffer(),
      ],
      program.programId
    );

    // STEP 4: Derive the token vault PDAs.
    const [vaultA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault_a"),
        poolPda.toBuffer(),
      ],
      program.programId
    );

    const [vaultB] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault_b"),
        poolPda.toBuffer(),
      ],
      program.programId
    );

    // STEP 5: Initialize the pool with every required account.
    const tx = await program.methods
      .initializePool()
      .accountsStrict({
        authority: wallet.publicKey,
        pool: poolPda,
        tokenAMint: tokenA,
        tokenBMint: tokenB,
        tokenAVault: vaultA,
        tokenBVault: vaultB,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // STEP 6: Read and verify the pool state.
    const pool = await program.account.pool.fetch(poolPda);

    assert.strictEqual(
      pool.tokenAMint.toBase58(),
      tokenA.toBase58()
    );

    assert.strictEqual(
      pool.tokenBMint.toBase58(),
      tokenB.toBase58()
    );

    assert.strictEqual(
      pool.tokenAVault.toBase58(),
      vaultA.toBase58()
    );

    assert.strictEqual(
      pool.tokenBVault.toBase58(),
      vaultB.toBase58()
    );

    assert.strictEqual(
      pool.authority.toBase58(),
      wallet.publicKey.toBase58()
    );

    assert.strictEqual(pool.totalLiquidity.toString(), "0");
    assert.strictEqual(pool.feeBps, 30);

    // STEP 7: Verify both SPL token vault accounts.
    const tokenAVault = await getAccount(connection, vaultA);
    const tokenBVault = await getAccount(connection, vaultB);

    assert.strictEqual(
      tokenAVault.owner.toBase58(),
      poolPda.toBase58()
    );

    assert.strictEqual(
      tokenBVault.owner.toBase58(),
      poolPda.toBase58()
    );

    assert.strictEqual(tokenAVault.amount, 0n);
    assert.strictEqual(tokenBVault.amount, 0n);

    console.log("Pool initialized successfully!");
    console.log("Pool address:", poolPda.toBase58());
    console.log("Token A vault:", vaultA.toBase58());
    console.log("Token B vault:", vaultB.toBase58());
    console.log("Transaction:", tx);
  });
});
