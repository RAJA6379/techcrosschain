# MinSwap Web3 — Swap-only Starter

This project keeps a Minswap-inspired dark swap experience while separating the blockchain layer for an EVM/MetaMask implementation.

## Included
- React + Vite frontend
- Minswap-style swap UI
- MetaMask connection using ethers.js v6
- Wallet address + native balance display
- Sepolia network configuration placeholder
- Solidity ERC-20 test tokens
- Minimal constant-product swap pool with 0.30% fee
- Clear separation between UI, Web3 helpers and contracts

## Run in Windows PowerShell / CMD
```powershell
cd C:\path\to\MinSwap-Web3
npm install
npm run dev
```
Open the localhost URL printed by Vite.

## MetaMask
Install MetaMask, switch to Sepolia, then click **Connect Wallet**. The app currently reads the wallet address and native ETH balance.

## Smart contracts
The Solidity files use OpenZeppelin. For deployment, create a Hardhat/Foundry deployment project or import the contracts into Remix. After deployment, put the contract addresses in `src/web3/config.js` and ABI in `src/contracts/Swap.json`.

## Next implementation step
Deploy TokenA + TokenB, mint/test liquidity, approve the pool, then replace the demo Swap button with an ethers.js `approve()` + `swap()` transaction flow.

> This is a learning/demo DEX starter. Do not use it with real funds without a professional smart-contract security audit.

## Cross-chain swaps (BTC)

Open the **Cross-chain** tab. Routes:

| Route | How it runs |
|---|---|
| MSTA ↔ MSTB (Sepolia) | Your own SwapPool contract (`src/web3/swap.js`) |
| BTC (testnet) ↔ WBTC / USDC (Sepolia) | Garden Finance, native BTC (`src/crosschain/garden.js`) |
| BTC (testnet) ↔ SOL / USDC / cbBTC (Solana) | Garden Finance (`src/crosschain/garden.js`, `anchorWallet.js`) |
| Same-chain Solana Devnet swaps | Not enabled (no real Devnet liquidity; nothing is simulated) |

Setup: copy `.env.example` to `.env` and set `VITE_GARDEN_API_KEY` (Garden issues keys on request). Bitcoin wallet: Unisat, set to Testnet.
Tests: `npm test`.
