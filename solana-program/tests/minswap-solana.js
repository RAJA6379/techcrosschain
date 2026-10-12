
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
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require("@solana/spl-token");

describe("MinSwap Solana - Phase 3 Liquidity Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.minswapSolana;
  const connection = provider.connection;
  const wallet = provider.wallet;

  // Tests must use disposable Localnet tokens only.
  if (
    !/^https?:\/\/(127\.0\.0\.1|localhost):8899\/?$/.test(
      connection.rpcEndpoint
    )
  ) {
    throw new Error(
      "These liquidity tests must run on Solana Localnet (port 8899)."
    );
  }

  let tokenA;
  let tokenB;
  let poolPda;
  let vaultA;
  let vaultB;
  let providerTokenA;
  let providerTokenB;

  const INITIAL_A = 1_000_000n;
  const INITIAL_B = 2_000_000n;

  // 1. Initialize a new pool.
  it("Creates a pool and two token vaults", async () => {
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

    [tokenA, tokenB] =
      Buffer.compare(mint1.toBuffer(), mint2.toBuffer()) < 0
        ? [mint1, mint2]
        : [mint2, mint1];

    [poolPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        tokenA.toBuffer(),
        tokenB.toBuffer(),
      ],
      program.programId
    );

    [vaultA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault_a"),
        poolPda.toBuffer(),
      ],
      program.programId
    );

    [vaultB] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault_b"),
        poolPda.toBuffer(),
      ],
      program.programId
    );

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

    assert.strictEqual(pool.totalLiquidity.toString(), "0");
    assert.strictEqual(pool.feeBps, 30);

    const a = await getAccount(connection, vaultA);
    const b = await getAccount(connection, vaultB);

    assert.strictEqual(a.owner.toBase58(), poolPda.toBase58());
    assert.strictEqual(b.owner.toBase58(), poolPda.toBase58());
    assert.strictEqual(a.amount, 0n);
    assert.strictEqual(b.amount, 0n);

    console.log("Pool initialized:", poolPda.toBase58());
    console.log("Initialization transaction:", tx);
  });

  // 2. Create provider token accounts and fund them.
  it("Creates and funds provider token accounts", async () => {
    const accountA = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      tokenA,
      wallet.publicKey
    );

    const accountB = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      tokenB,
      wallet.publicKey
    );

    providerTokenA = accountA.address;
    providerTokenB = accountB.address;

    await mintTo(
      connection,
      wallet.payer,
      tokenA,
      providerTokenA,
      wallet.payer,
      10_000_000
    );

    await mintTo(
      connection,
      wallet.payer,
      tokenB,
      providerTokenB,
      wallet.payer,
      20_000_000
    );

    const a = await getAccount(connection, providerTokenA);
    const b = await getAccount(connection, providerTokenB);

    assert.strictEqual(a.amount, 10_000_000n);
    assert.strictEqual(b.amount, 20_000_000n);

    console.log("Provider Token A:", a.amount.toString());
    console.log("Provider Token B:", b.amount.toString());
  });

  // Helper for invoking the existing Rust instruction.
  const deposit = (amountA, amountB) =>
    program.methods
      .addLiquidity(
        new anchor.BN(amountA.toString()),
        new anchor.BN(amountB.toString())
      )
      .accountsStrict({
        provider: wallet.publicKey,
        pool: poolPda,
        tokenAMint: tokenA,
        tokenBMint: tokenB,
        providerTokenA,
        providerTokenB,
        tokenAVault: vaultA,
        tokenBVault: vaultB,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

  // 3. Invalid zero amount must be rejected.
  it("Rejects zero-amount liquidity", async () => {
    await assert.rejects(
      () => deposit(0n, INITIAL_B),
      /InvalidAmount|Both token amounts|custom program error/i
    );

    const a = await getAccount(connection, vaultA);
    const b = await getAccount(connection, vaultB);

    assert.strictEqual(a.amount, 0n);
    assert.strictEqual(b.amount, 0n);

    console.log("Zero-amount deposit correctly rejected");
  });

  // 4. Transfer initial liquidity into both vaults.
  it("Adds initial liquidity successfully", async () => {
    const beforeA = await getAccount(connection, providerTokenA);
    const beforeB = await getAccount(connection, providerTokenB);

    const tx = await deposit(INITIAL_A, INITIAL_B);

    const afterA = await getAccount(connection, providerTokenA);
    const afterB = await getAccount(connection, providerTokenB);

    const vaultAccountA = await getAccount(connection, vaultA);
    const vaultAccountB = await getAccount(connection, vaultB);

    assert.strictEqual(
      afterA.amount,
      beforeA.amount - INITIAL_A
    );

    assert.strictEqual(
      afterB.amount,
      beforeB.amount - INITIAL_B
    );

    assert.strictEqual(vaultAccountA.amount, INITIAL_A);
    assert.strictEqual(vaultAccountB.amount, INITIAL_B);

    console.log("Liquidity successfully deposited");
    console.log("Vault A:", vaultAccountA.amount.toString());
    console.log("Vault B:", vaultAccountB.amount.toString());
    console.log("Deposit transaction:", tx);
  });

  // 5. Repeated deposits are not supported in Phase 3A.
  it("Rejects a second initial deposit", async () => {
    const beforeA = await getAccount(connection, vaultA);
    const beforeB = await getAccount(connection, vaultB);

    await assert.rejects(
      () => deposit(INITIAL_A, INITIAL_B),
      /PoolAlreadyFunded|Initial liquidity has already|custom program error/i
    );

    const afterA = await getAccount(connection, vaultA);
    const afterB = await getAccount(connection, vaultB);

    assert.strictEqual(afterA.amount, beforeA.amount);
    assert.strictEqual(afterB.amount, beforeB.amount);

    console.log("Duplicate deposit correctly rejected");
  });
});
