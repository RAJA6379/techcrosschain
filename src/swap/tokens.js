
import { CONTRACTS } from "../web3/config";

// ========================================
// SUPPORTED BLOCKCHAINS
// ========================================

export const CHAINS = {
  sepolia: {
    key: "sepolia",
    name: "Ethereum Sepolia",
    type: "evm",
    chainId: 11155111,
    color: "#546cff",
    glyph: "◆",
  },

  solana: {
    key: "solana",
    name: "Solana Devnet",
    type: "solana",
    color: "#7752c7",
    glyph: "◎",
  },

  bitcoin: {
    key: "bitcoin",
    name: "Bitcoin Testnet",
    type: "bitcoin",
    color: "#f7931a",
    glyph: "₿",
  },
};

// ========================================
// SUPPORTED TOKENS
// ========================================

export const TOKENS = [
  // ----------------------------------------
  // ETHEREUM SEPOLIA
  // ----------------------------------------

  {
    id: "sepolia:WBTC",
    chain: "sepolia",
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    decimals: 8,
    garden: ["ethereum_sepolia", "WBTC"],
  },

  {
    id: "sepolia:USDC",
    chain: "sepolia",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    garden: ["ethereum_sepolia", "USDC"],
  },

  {
    id: "sepolia:MSTA",
    chain: "sepolia",
    symbol: "MSTA",
    name: "MinSwap Token A",
    decimals: 18,
    local: true,
    address: CONTRACTS.tokenA,
    garden: null,
  },

  {
    id: "sepolia:MSTB",
    chain: "sepolia",
    symbol: "MSTB",
    name: "MinSwap Token B",
    decimals: 18,
    local: true,
    address: CONTRACTS.tokenB,
    garden: null,
  },

  // ----------------------------------------
  // SOLANA DEVNET
  // ----------------------------------------

  {
    id: "solana:SOL",
    chain: "solana",
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    garden: ["solana_testnet", "SOL"],
  },

  {
    id: "solana:USDC",
    chain: "solana",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    garden: ["solana_testnet", "USDC"],
  },

  {
    id: "solana:cbBTC",
    chain: "solana",
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    garden: ["solana_testnet", "cbBTC"],
  },

  // ----------------------------------------
  // YOUR CREATED SOLANA DEVNET TOKENS
  // ----------------------------------------

  {
    id: "solana:MSTA",
    chain: "solana",
    symbol: "MSTA",
    name: "MinSwap Token A",
    decimals: 6,
    address:
      "6yo8bHAeuFSj12kmxFhZSdmj5RjBRk5iqaBQr5XcWDXm",
    garden: null,
    solanaPool: true,
  },

  {
    id: "solana:MSTB",
    chain: "solana",
    symbol: "MSTB",
    name: "MinSwap Token B",
    decimals: 6,
    address:
      "EQ5zHatuNJU8oRmU3KQHZSLKQ3wyJpHRFentnW9ktiQR",
    garden: null,
    solanaPool: true,
  },

  // ----------------------------------------
  // BITCOIN TESTNET
  // ----------------------------------------

  {
    id: "bitcoin:BTC",
    chain: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    decimals: 8,
    garden: ["bitcoin_testnet", "BTC"],
  },
];

// ========================================
// TOKEN HELPERS
// ========================================

export const getToken = (id) =>
  TOKENS.find((token) => token.id === id);

export const tokensOn = (chainKey) =>
  TOKENS.filter((token) => token.chain === chainKey);
