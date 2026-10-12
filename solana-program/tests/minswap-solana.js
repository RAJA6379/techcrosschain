
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
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require("@solana/spl-token");

describe("MinSwap Solana - Phase 3B LP Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.minswapSolana;
  const connection = provider.connection;
  const wallet = provider.wallet;

  if (
    !/^https?:\/\/(127\.0\.0\.1|localhost):8899\/?$/.test(
      connection.rpcEndpoint
    )
  ) {
    throw new Error("Use Localnet only for Phase 3B tests.");
  }

  let tokenA;
  let tokenB;
  let poolPda;
  let vaultA;
  let vaultB;
  let lpMint;
  let providerA;
  let providerB;
  let providerLp;

  const bn = (value) =>
    new anchor.BN(value.toString());

  const INITIAL_A = 2_000_000n;
  const INITIAL_B = 8_000_000n;

  const EXTRA_A = 1_000_000n;
  const EXTRA_B = 4_000_000n;

  const INITIAL_LP = 4_000_000n;
  const EXTRA_LP = 2_000_000n;

  const accounts = () => ({
    provider: wallet.publicKey,
    pool: poolPda,
    tokenAMint: tokenA,
    tokenBMint: tokenB,
    providerTokenA: providerA,
    providerTokenB: providerB,
    tokenAVault: vaultA,
    tokenBVault: vaultB,
    lpMint,
    providerLp,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const addLiquidity = (a, b, minLp = 0n) =>
    program.methods
      .addLiquidity(bn(a), bn(b), bn(minLp))
      .accountsStrict(accounts())
      .rpc();

  const removeLiquidity = (
    lpAmount,
    minA = 0n,
    minB = 0n
  ) =>
    program.methods
      .removeLiquidity(
        bn(lpAmount),
        bn(minA),
        bn(minB)
      )
      .accountsStrict(accounts())
      .rpc();

  it("Initializes the pool and LP mint", async () => {
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

    [lpMint] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("lp_mint"),
        poolPda.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .initializePool()
      .accountsStrict({
        authority: wallet.publicKey,
        pool: poolPda,
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

    const pool = await program.account.pool.fetch(poolPda);
    const mint = await getMint(connection, lpMint);

    assert.strictEqual(
      pool.lpMint.toBase58(),
      lpMint.toBase58()
    );

    assert.strictEqual(
      mint.mintAuthority.toBase58(),
      poolPda.toBase58()
    );

    assert.strictEqual(mint.supply, 0n);
    assert.strictEqual(pool.totalLiquidity.toString(), "0");

    console.log("Pool initialized:", poolPda.toBase58());
    console.log("LP mint:", lpMint.toBase58());
  });

  it("Creates and funds provider token accounts", async () => {
    const a = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      tokenA,
      wallet.publicKey
    );

    const b = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      tokenB,
      wallet.publicKey
    );

    const lp = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      lpMint,
      wallet.publicKey
    );

    providerA = a.address;
    providerB = b.address;
    providerLp = lp.address;

    await mintTo(
      connection,
      wallet.payer,
      tokenA,
      providerA,
      wallet.payer,
      20_000_000
    );

    await mintTo(
      connection,
      wallet.payer,
      tokenB,
      providerB,
      wallet.payer,
      80_000_000
    );

    assert.strictEqual(
      (await getAccount(connection, providerA)).amount,
      20_000_000n
    );

    assert.strictEqual(
      (await getAccount(connection, providerB)).amount,
      80_000_000n
    );

    console.log("Provider accounts funded");
  });

  it("Rejects a zero-amount deposit", async () => {
    await assert.rejects(() =>
      addLiquidity(0n, INITIAL_B)
    );

    assert.strictEqual(
      (await getAccount(connection, vaultA)).amount,
      0n
    );

    assert.strictEqual(
      (await getAccount(connection, vaultB)).amount,
      0n
    );
  });

  it("Deposits initial liquidity and mints LP tokens", async () => {
    await addLiquidity(
      INITIAL_A,
      INITIAL_B,
      INITIAL_LP
    );

    const a = await getAccount(connection, vaultA);
    const b = await getAccount(connection, vaultB);
    const lp = await getAccount(connection, providerLp);
    const mint = await getMint(connection, lpMint);
    const pool = await program.account.pool.fetch(poolPda);

    assert.strictEqual(a.amount, INITIAL_A);
    assert.strictEqual(b.amount, INITIAL_B);
    assert.strictEqual(lp.amount, INITIAL_LP);
    assert.strictEqual(mint.supply, INITIAL_LP);

    assert.strictEqual(
      pool.totalLiquidity.toString(),
      INITIAL_LP.toString()
    );

    console.log("Initial LP minted:", lp.amount.toString());
  });

  it("Rejects a deposit with an invalid token ratio", async () => {
    const beforeA = await getAccount(connection, vaultA);
    const beforeB = await getAccount(connection, vaultB);

    await assert.rejects(() =>
      addLiquidity(EXTRA_A, EXTRA_B + 1n)
    );

    assert.strictEqual(
      (await getAccount(connection, vaultA)).amount,
      beforeA.amount
    );

    assert.strictEqual(
      (await getAccount(connection, vaultB)).amount,
      beforeB.amount
    );
  });

  it("Rejects excessive minimum LP output", async () => {
    await assert.rejects(() =>
      addLiquidity(
        EXTRA_A,
        EXTRA_B,
        EXTRA_LP + 1n
      )
    );
  });

  it("Adds proportional liquidity and mints more LP", async () => {
    await addLiquidity(
      EXTRA_A,
      EXTRA_B,
      EXTRA_LP
    );

    const vaultAccountA = await getAccount(connection, vaultA);
    const vaultAccountB = await getAccount(connection, vaultB);
    const lp = await getAccount(connection, providerLp);
    const pool = await program.account.pool.fetch(poolPda);

    assert.strictEqual(
      vaultAccountA.amount,
      INITIAL_A + EXTRA_A
    );

    assert.strictEqual(
      vaultAccountB.amount,
      INITIAL_B + EXTRA_B
    );

    assert.strictEqual(
      lp.amount,
      INITIAL_LP + EXTRA_LP
    );

    assert.strictEqual(
      pool.totalLiquidity.toString(),
      (INITIAL_LP + EXTRA_LP).toString()
    );

    console.log("Total LP:", lp.amount.toString());
  });

  it("Rejects withdrawal above the available LP balance", async () => {
    await assert.rejects(() =>
      removeLiquidity(6_000_001n)
    );
  });

  it("Rejects a withdrawal exceeding minimum-output constraints", async () => {
    await assert.rejects(() =>
      removeLiquidity(3_000_000n, 1_500_001n, 6_000_000n)
    );
  });

  it("Rejects a counterfeit LP mint", async () => {
    const fakeMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    const fakeLpAccount =
      await getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        fakeMint,
        wallet.publicKey
      );

    await assert.rejects(() =>
      program.methods
        .removeLiquidity(
          bn(1_000_000n),
          bn(0n),
          bn(0n)
        )
        .accountsStrict({
          ...accounts(),
          lpMint: fakeMint,
          providerLp: fakeLpAccount.address,
        })
        .rpc()
    );
  });

  it("Burns LP tokens and withdraws proportional liquidity", async () => {
    const beforeA = await getAccount(connection, providerA);
    const beforeB = await getAccount(connection, providerB);

    await removeLiquidity(
      3_000_000n,
      1_500_000n,
      6_000_000n
    );

    const afterA = await getAccount(connection, providerA);
    const afterB = await getAccount(connection, providerB);

    const vaultAccountA = await getAccount(connection, vaultA);
    const vaultAccountB = await getAccount(connection, vaultB);
    const lp = await getAccount(connection, providerLp);
    const mint = await getMint(connection, lpMint);

    assert.strictEqual(
      afterA.amount - beforeA.amount,
      1_500_000n
    );

    assert.strictEqual(
      afterB.amount - beforeB.amount,
      6_000_000n
    );

    assert.strictEqual(vaultAccountA.amount, 1_500_000n);
    assert.strictEqual(vaultAccountB.amount, 6_000_000n);
    assert.strictEqual(lp.amount, 3_000_000n);
    assert.strictEqual(mint.supply, 3_000_000n);

    console.log("Partial withdrawal successful");
  });

  it("Withdraws remaining liquidity and burns all LP tokens", async () => {
    await removeLiquidity(
      3_000_000n,
      1_500_000n,
      6_000_000n
    );

    const vaultAccountA = await getAccount(connection, vaultA);
    const vaultAccountB = await getAccount(connection, vaultB);
    const lp = await getAccount(connection, providerLp);
    const mint = await getMint(connection, lpMint);
    const pool = await program.account.pool.fetch(poolPda);

    assert.strictEqual(vaultAccountA.amount, 0n);
    assert.strictEqual(vaultAccountB.amount, 0n);
    assert.strictEqual(lp.amount, 0n);
    assert.strictEqual(mint.supply, 0n);
    assert.strictEqual(pool.totalLiquidity.toString(), "0");

    assert.strictEqual(
      (await getAccount(connection, providerA)).amount,
      20_000_000n
    );

    assert.strictEqual(
      (await getAccount(connection, providerB)).amount,
      80_000_000n
    );

    console.log("Full withdrawal successful");
    console.log("All original tokens recovered");
  });
});
