
import {
  Contract,
  formatUnits,
  parseUnits,
} from "ethers";

import { CONTRACTS, NETWORK } from "./config";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];

const SWAP_ABI = [
  "function tokenA() view returns (address)",
  "function tokenB() view returns (address)",
  "function reserveA() view returns (uint256)",
  "function reserveB() view returns (uint256)",
  "function getAmountOut(uint256,bool) view returns (uint256)",
  "function swap(uint256,bool,uint256)",
];

async function verifyPool(provider) {
  const network = await provider.getNetwork();

  if (network.chainId !== BigInt(NETWORK.chainId)) {
    throw new Error(
      "Please switch MetaMask to Ethereum Sepolia."
    );
  }

  for (const [name, address] of Object.entries(CONTRACTS)) {
    const code = await provider.getCode(address);

    if (code === "0x") {
      throw new Error(
        `${name} contract not found on Sepolia: ${address}`
      );
    }
  }

  const pool = new Contract(
    CONTRACTS.swap,
    SWAP_ABI,
    provider
  );

  const [tokenA, tokenB] = await Promise.all([
    pool.tokenA(),
    pool.tokenB(),
  ]);

  if (
    tokenA.toLowerCase() !==
      CONTRACTS.tokenA.toLowerCase() ||
    tokenB.toLowerCase() !==
      CONTRACTS.tokenB.toLowerCase()
  ) {
    throw new Error(
      "SwapPool token addresses do not match config.js."
    );
  }

  return pool;
}

// Get real token balances.
export async function getTokenBalances(account) {
  await verifyPool(account.provider);

  const tokenA = new Contract(
    CONTRACTS.tokenA,
    ERC20_ABI,
    account.provider
  );

  const tokenB = new Contract(
    CONTRACTS.tokenB,
    ERC20_ABI,
    account.provider
  );

  const [decA, decB, balanceA, balanceB] =
    await Promise.all([
      tokenA.decimals(),
      tokenB.decimals(),
      tokenA.balanceOf(account.address),
      tokenB.balanceOf(account.address),
    ]);

  return {
    MSTA: formatUnits(balanceA, decA),
    MSTB: formatUnits(balanceB, decB),
  };
}

// Get a real SwapPool quotation.
export async function getSwapQuote(
  account,
  amount,
  aToB = true,
  slippage = "0.5"
) {
  const pool = await verifyPool(account.provider);

  const inputToken = new Contract(
    aToB ? CONTRACTS.tokenA : CONTRACTS.tokenB,
    ERC20_ABI,
    account.provider
  );

  const outputToken = new Contract(
    aToB ? CONTRACTS.tokenB : CONTRACTS.tokenA,
    ERC20_ABI,
    account.provider
  );

  const [
    inputDecimals,
    outputDecimals,
    reserveA,
    reserveB,
  ] = await Promise.all([
    inputToken.decimals(),
    outputToken.decimals(),
    pool.reserveA(),
    pool.reserveB(),
  ]);

  if (reserveA <= 0n || reserveB <= 0n) {
    throw new Error(
      "SwapPool has no liquidity. Add tokens in Remix."
    );
  }

  const amountIn = parseUnits(
    String(amount),
    inputDecimals
  );

  if (amountIn <= 0n) {
    throw new Error("Enter a valid token amount.");
  }

  const amountOut = await pool.getAmountOut(
    amountIn,
    aToB
  );

  if (amountOut <= 0n) {
    throw new Error("Swap amount is too small.");
  }

  const slippageNumber = Number(slippage);

  if (
    !Number.isFinite(slippageNumber) ||
    slippageNumber < 0 ||
    slippageNumber >= 100
  ) {
    throw new Error("Invalid slippage tolerance.");
  }

  const bps = BigInt(
    Math.round(slippageNumber * 100)
  );

  const minAmountOut =
    (amountOut * (10000n - bps)) / 10000n;

  return {
    amountIn,
    amountOut,
    minAmountOut,
    formattedOut: formatUnits(
      amountOut,
      outputDecimals
    ),
    formattedMin: formatUnits(
      minAmountOut,
      outputDecimals
    ),
  };
}

// Execute MetaMask approval and swap.
export async function executeSwap(
  account,
  amount,
  aToB = true,
  slippage = "0.5",
  onStatus = () => {}
) {
  if (!account?.provider || !account?.address) {
    throw new Error("Connect MetaMask first.");
  }

  const pool = await verifyPool(account.provider);

  const signer = await account.provider.getSigner();
  const walletAddress = await signer.getAddress();

  if (
    walletAddress.toLowerCase() !==
    account.address.toLowerCase()
  ) {
    throw new Error(
      "MetaMask account changed. Please reconnect."
    );
  }

  onStatus("Checking tokens and liquidity...");

  const initialQuote = await getSwapQuote(
    account,
    amount,
    aToB,
    slippage
  );

  const inputToken = new Contract(
    aToB ? CONTRACTS.tokenA : CONTRACTS.tokenB,
    ERC20_ABI,
    signer
  );

  const balance = await inputToken.balanceOf(
    walletAddress
  );

  if (balance < initialQuote.amountIn) {
    throw new Error(
      "Insufficient token balance for this swap."
    );
  }

  const allowance = await inputToken.allowance(
    walletAddress,
    CONTRACTS.swap
  );

  // MetaMask permission prompt.
  if (allowance < initialQuote.amountIn) {
    onStatus("Approve token in MetaMask...");

    const approvalTx = await inputToken.approve(
      CONTRACTS.swap,
      initialQuote.amountIn
    );

    onStatus("Waiting for token approval...");

    const approvalReceipt = await approvalTx.wait();

    if (approvalReceipt?.status !== 1) {
      throw new Error("Token approval failed.");
    }
  }

  // Refresh quote before swap confirmation.
  const quote = await getSwapQuote(
    account,
    amount,
    aToB,
    slippage
  );

  onStatus("Confirm swap in MetaMask...");

  const swapContract = pool.connect(signer);
  console.log("SwapPool address:", await swapContract.getAddress());
console.log("Input token:", await inputToken.getAddress());
console.log("Wallet:", walletAddress);

  const tx = await swapContract.swap(
    quote.amountIn,
    aToB,
    quote.minAmountOut
  );

  onStatus("Waiting for swap confirmation...");

  const receipt = await tx.wait();

  if (receipt?.status !== 1) {
    throw new Error("Swap transaction failed.");
  }

  onStatus("Swap completed successfully!");

  return receipt;
}
