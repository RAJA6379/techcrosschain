
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

// ============================================
// MIN SWAP - PHASE 4 LOCALNET TESTS
// ============================================

describe("MinSwap Solana - Phase 4 Swap Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.minswapSolana;
  const connection = provider.connection;
  const wallet = provider.wallet;

  // Never run these tests on Devnet or Mainnet.
  if (
    !/^https?:\/\/(127\.0\.0\.1|localhost):8899\/?$/.test(
      connection.rpcEndpoint
    )
  ) {
    throw new Error(
      "Phase 4 tests must run on Solana Localnet only."
    );
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

  // Initial test funding.
  const FUND_A = 20_000_000n;
  const FUND_B = 80_000_000n;

  // Initial liquidity.
  const INITIAL_A = 2_000_000n;
  const INITIAL_B = 8_000_000n;
  const INITIAL_LP = 4_000_000n;

  // Second liquidity deposit.
  const EXTRA_A = 1_000_000n;
  const EXTRA_B = 4_000_000n;
  const EXTRA_LP = 2_000_000n;

  const TOTAL_LP = INITIAL_LP + EXTRA_LP;

  const FEE_BPS = 30n;
  const BPS_DENOMINATOR = 10_000n;

  const bn = (value) =>
    new anchor.BN(value.toString());

  // ============================================
  // ACCOUNT HELPERS
  // ============================================

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

  const swapAccounts = () => ({
    provider: wallet.publicKey,
    pool: poolPda,
    tokenAMint: tokenA,
    tokenBMint: tokenB,
    providerTokenA: providerA,
    providerTokenB: providerB,
    tokenAVault: vaultA,
    tokenBVault: vaultB,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const addLiquidity = (
    amountA,
    amountB,
    minLp = 0n
  ) =>
    program.methods
      .addLiquidity(
        bn(amountA),
        bn(amountB),
        bn(minLp)
      )
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

  const swapExactInput = (
    amountIn,
    minAmountOut,
    aToB
  ) =>
    program.methods
      .swapExactInput(
        bn(amountIn),
        bn(minAmountOut),
        aToB
      )
      .accountsStrict(swapAccounts())
      .rpc();

  // Exact integer calculation matching lib.rs.
  const calculateSwapOutput = (
    amountIn,
    reserveIn,
    reserveOut
  ) => {
    const effectiveIn =
      amountIn * (BPS_DENOMINATOR - FEE_BPS);

    const numerator = effectiveIn * reserveOut;

    const denominator =
      reserveIn * BPS_DENOMINATOR + effectiveIn;

    return numerator / denominator;
  };

  // ============================================
  // POOL BALANCE HELPERS
  // ============================================

  const getBalances = async () => {
    const [
      userA,
      userB,
      poolA,
      poolB,
      lp,
    ] = await Promise.all([
      getAccount(connection, providerA),
      getAccount(connection, providerB),
      getAccount(connection, vaultA),
      getAccount(connection, vaultB),
      getAccount(connection, providerLp),
    ]);

    return {
      userA: userA.amount,
      userB: userB.amount,
      poolA: poolA.amount,
      poolB: poolB.amount,
      lp: lp.amount,
    };
  };

  const assertConservation = (balances) => {
    assert.strictEqual(
      balances.userA + balances.poolA,
      FUND_A,
      "Token A conservation failed"
    );

    assert.strictEqual(
      balances.userB + balances.poolB,
      FUND_B,
      "Token B conservation failed"
    );
  };

  // ============================================
  // TEST 1 - INITIALIZE POOL
  // ============================================

  it("1. Initializes pool and LP mint", async () => {
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
      Buffer.compare(
        mint1.toBuffer(),
        mint2.toBuffer()
      ) < 0
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

    const pool = await program.account.pool.fetch(
      poolPda
    );

    const mint = await getMint(
      connection,
      lpMint
    );

    assert.strictEqual(
      pool.lpMint.toBase58(),
      lpMint.toBase58()
    );

    assert.strictEqual(
      mint.mintAuthority.toBase58(),
      poolPda.toBase58()
    );

    assert.strictEqual(mint.supply, 0n);

    assert.strictEqual(
      pool.totalLiquidity.toString(),
      "0"
    );

    assert.strictEqual(pool.feeBps, 30);

    console.log(
      "Pool initialized:",
      poolPda.toBase58()
    );
  });

  // ============================================
  // TEST 2 - CREATE USER TOKEN ACCOUNTS
  // ============================================

  it("2. Creates and funds token accounts", async () => {
    const a =
      await getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        tokenA,
        wallet.publicKey
      );

    const b =
      await getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        tokenB,
        wallet.publicKey
      );

    const lp =
      await getOrCreateAssociatedTokenAccount(
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
      FUND_A
    );

    await mintTo(
      connection,
      wallet.payer,
      tokenB,
      providerB,
      wallet.payer,
      FUND_B
    );

    const balances = await getBalances();

    assert.strictEqual(balances.userA, FUND_A);
    assert.strictEqual(balances.userB, FUND_B);
    assert.strictEqual(balances.lp, 0n);

    console.log("Test tokens funded");
  });

  // ============================================
  // TEST 3 - INVALID DEPOSIT
  // ============================================

  it("3. Rejects zero liquidity", async () => {
    await assert.rejects(() =>
      addLiquidity(0n, INITIAL_B)
    );

    const balances = await getBalances();

    assert.strictEqual(balances.poolA, 0n);
    assert.strictEqual(balances.poolB, 0n);
  });

  // ============================================
  // TEST 4 - INITIAL LIQUIDITY
  // ============================================

  it("4. Deposits initial liquidity and mints LP", async () => {
    await addLiquidity(
      INITIAL_A,
      INITIAL_B,
      INITIAL_LP
    );

    const balances = await getBalances();

    const mint = await getMint(
      connection,
      lpMint
    );

    const pool = await program.account.pool.fetch(
      poolPda
    );

    assert.strictEqual(
      balances.poolA,
      INITIAL_A
    );

    assert.strictEqual(
      balances.poolB,
      INITIAL_B
    );

    assert.strictEqual(
      balances.lp,
      INITIAL_LP
    );

    assert.strictEqual(
      mint.supply,
      INITIAL_LP
    );

    assert.strictEqual(
      pool.totalLiquidity.toString(),
      INITIAL_LP.toString()
    );

    assertConservation(balances);

    console.log("Initial LP minted:", INITIAL_LP.toString());
  });

  // ============================================
  // TEST 5 - INVALID RATIO
  // ============================================

  it("5. Rejects invalid liquidity ratio", async () => {
    const before = await getBalances();

    await assert.rejects(() =>
      addLiquidity(
        EXTRA_A,
        EXTRA_B + 1n
      )
    );

    const after = await getBalances();

    assert.deepStrictEqual(after, before);
  });

  // ============================================
  // TEST 6 - LP SLIPPAGE
  // ============================================

  it("6. Rejects excessive minimum LP output", async () => {
    await assert.rejects(() =>
      addLiquidity(
        EXTRA_A,
        EXTRA_B,
        EXTRA_LP + 1n
      )
    );
  });

  // ============================================
  // TEST 7 - SECOND LIQUIDITY DEPOSIT
  // ============================================

  it("7. Adds proportional liquidity", async () => {
    await addLiquidity(
      EXTRA_A,
      EXTRA_B,
      EXTRA_LP
    );

    const balances = await getBalances();

    const pool = await program.account.pool.fetch(
      poolPda
    );

    assert.strictEqual(
      balances.poolA,
      INITIAL_A + EXTRA_A
    );

    assert.strictEqual(
      balances.poolB,
      INITIAL_B + EXTRA_B
    );

    assert.strictEqual(
      balances.lp,
      TOTAL_LP
    );

    assert.strictEqual(
      pool.totalLiquidity.toString(),
      TOTAL_LP.toString()
    );

    assertConservation(balances);

    console.log("Liquidity added successfully");
  });

  // ============================================
  // TEST 8 - ZERO SWAP
  // ============================================

  it("8. Rejects zero swap input", async () => {
    const before = await getBalances();

    await assert.rejects(() =>
      swapExactInput(
        0n,
        1n,
        true
      )
    );

    const after = await getBalances();

    assert.deepStrictEqual(after, before);
  });

  // ============================================
  // TEST 9 - SWAP SLIPPAGE
  // ============================================

  it("9. Rejects swaps with excessive minimum output", async () => {
    const before = await getBalances();

    const expectedOut = calculateSwapOutput(
      100_000n,
      before.poolA,
      before.poolB
    );

    await assert.rejects(() =>
      swapExactInput(
        100_000n,
        expectedOut + 1n,
        true
      )
    );

    const after = await getBalances();

    assert.deepStrictEqual(after, before);
  });

  // ============================================
  // TEST 10 - TOKEN A TO TOKEN B
  // ============================================

  it("10. Swaps Token A to Token B", async () => {
    const before = await getBalances();

    const amountIn = 100_000n;

    const expectedOut = calculateSwapOutput(
      amountIn,
      before.poolA,
      before.poolB
    );

    assert(expectedOut > 0n);

    await swapExactInput(
      amountIn,
      expectedOut,
      true
    );

    const after = await getBalances();

    // User's input decreased.
    assert.strictEqual(
      before.userA - after.userA,
      amountIn
    );

    // User received exactly the quoted output.
    assert.strictEqual(
      after.userB - before.userB,
      expectedOut
    );

    // Pool received input and sent output.
    assert.strictEqual(
      after.poolA - before.poolA,
      amountIn
    );

    assert.strictEqual(
      before.poolB - after.poolB,
      expectedOut
    );

    assert.strictEqual(
      after.lp,
      before.lp
    );

    assertConservation(after);

    // Constant-product reserve product must not fall.
    assert(
      after.poolA * after.poolB >=
        before.poolA * before.poolB,
      "Constant product decreased"
    );

    console.log(
      "A -> B output:",
      expectedOut.toString()
    );
  });

  // ============================================
  // TEST 11 - TOKEN B TO TOKEN A
  // ============================================

  it("11. Swaps Token B to Token A", async () => {
    const before = await getBalances();

    const amountIn = 200_000n;

    const expectedOut = calculateSwapOutput(
      amountIn,
      before.poolB,
      before.poolA
    );

    assert(expectedOut > 0n);

    await swapExactInput(
      amountIn,
      expectedOut,
      false
    );

    const after = await getBalances();

    assert.strictEqual(
      before.userB - after.userB,
      amountIn
    );

    assert.strictEqual(
      after.userA - before.userA,
      expectedOut
    );

    assert.strictEqual(
      after.poolB - before.poolB,
      amountIn
    );

    assert.strictEqual(
      before.poolA - after.poolA,
      expectedOut
    );

    assert.strictEqual(
      after.lp,
      before.lp
    );

    assertConservation(after);

    assert(
      after.poolA * after.poolB >=
        before.poolA * before.poolB,
      "Constant product decreased"
    );

    console.log(
      "B -> A output:",
      expectedOut.toString()
    );
  });

  // ============================================
  // TEST 12 - INSUFFICIENT USER FUNDS
  // ============================================

  it("12. Rejects swaps exceeding wallet balance", async () => {
    const before = await getBalances();

    await assert.rejects(() =>
      swapExactInput(
        before.userA + 1n,
        1n,
        true
      )
    );

    const after = await getBalances();

    assert.deepStrictEqual(after, before);
  });

  // ============================================
  // TEST 13 - BAD USER TOKEN ACCOUNT
  // ============================================

  it("13. Rejects invalid swap token accounts", async () => {
    const before = await getBalances();

    await assert.rejects(() =>
      program.methods
        .swapExactInput(
          bn(100_000n),
          bn(1n),
          true
        )
        .accountsStrict({
          ...swapAccounts(),
          providerTokenA: providerB,
        })
        .rpc()
    );

    const after = await getBalances();

    assert.deepStrictEqual(after, before);
  });

  // ============================================
  // TEST 14 - EXCESSIVE LP WITHDRAWAL
  // ============================================

  it("14. Rejects withdrawal above LP supply", async () => {
    const before = await getBalances();

    await assert.rejects(() =>
      removeLiquidity(TOTAL_LP + 1n)
    );

    const after = await getBalances();

    assert.deepStrictEqual(after, before);
  });

  // ============================================
  // TEST 15 - WITHDRAWAL SLIPPAGE
  // ============================================

  it("15. Rejects withdrawal slippage", async () => {
    const before = await getBalances();

    const halfLp = TOTAL_LP / 2n;

    const expectedA =
      (before.poolA * halfLp) / TOTAL_LP;

    const expectedB =
      (before.poolB * halfLp) / TOTAL_LP;

    await assert.rejects(() =>
      removeLiquidity(
        halfLp,
        expectedA + 1n,
        expectedB
      )
    );

    const after = await getBalances();

    assert.deepStrictEqual(after, before);
  });

  // ============================================
  // TEST 16 - COUNTERFEIT LP MINT
  // ============================================

  it("16. Rejects a counterfeit LP mint", async () => {
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

    const before = await getBalances();

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

    const after = await getBalances();

    assert.deepStrictEqual(after, before);
  });

  // ============================================
  // TEST 17 - PARTIAL LIQUIDITY WITHDRAWAL
  // ============================================

  it("17. Withdraws liquidity after swaps", async () => {
    const before = await getBalances();

    const lpToBurn = TOTAL_LP / 2n;

    // Trading changed the reserve ratio.
    // Calculate withdrawal against current balances.
    const expectedA =
      (before.poolA * lpToBurn) / TOTAL_LP;

    const expectedB =
      (before.poolB * lpToBurn) / TOTAL_LP;

    await removeLiquidity(
      lpToBurn,
      expectedA,
      expectedB
    );

    const after = await getBalances();

    assert.strictEqual(
      after.userA - before.userA,
      expectedA
    );

    assert.strictEqual(
      after.userB - before.userB,
      expectedB
    );

    assert.strictEqual(
      before.poolA - after.poolA,
      expectedA
    );

    assert.strictEqual(
      before.poolB - after.poolB,
      expectedB
    );

    assert.strictEqual(
      after.lp,
      TOTAL_LP - lpToBurn
    );

    const mint = await getMint(
      connection,
      lpMint
    );

    assert.strictEqual(
      mint.supply,
      TOTAL_LP - lpToBurn
    );

    assertConservation(after);

    console.log(
      "Partial liquidity withdrawal passed"
    );
  });

  // ============================================
  // TEST 18 - FINAL LIQUIDITY WITHDRAWAL
  // ============================================

  it("18. Withdraws remaining liquidity", async () => {
    const before = await getBalances();

    const remainingLp = before.lp;

    const pool = await program.account.pool.fetch(
      poolPda
    );

    assert.strictEqual(
      pool.totalLiquidity.toString(),
      remainingLp.toString()
    );

    await removeLiquidity(
      remainingLp,
      before.poolA,
      before.poolB
    );

    const after = await getBalances();

    const mint = await getMint(
      connection,
      lpMint
    );

    const finalPool = await program.account.pool.fetch(
      poolPda
    );

    assert.strictEqual(after.poolA, 0n);
    assert.strictEqual(after.poolB, 0n);
    assert.strictEqual(after.lp, 0n);

    assert.strictEqual(mint.supply, 0n);

    assert.strictEqual(
      finalPool.totalLiquidity.toString(),
      "0"
    );

    // All test tokens must be accounted for.
    assert.strictEqual(
      after.userA,
      FUND_A
    );

    assert.strictEqual(
      after.userB,
      FUND_B
    );

    assertConservation(after);

    console.log("All liquidity withdrawn");
    console.log("All test tokens accounted for");
    console.log("Phase 4 completed on Localnet");
  });
});
