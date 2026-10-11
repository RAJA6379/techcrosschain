
import { getWallets } from "@wallet-standard/app";

import {
  createSolanaClient,
} from "@metamask/connect-solana";

import {
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";

import {
  solanaConnection,
  SOLANA_NETWORK,
} from "./config";

let metamaskClient = null;

// Register MetaMask as a Solana wallet.
async function initializeMetaMask() {
  if (metamaskClient) return metamaskClient;

  metamaskClient = await createSolanaClient({
    dapp: {
      name: "MinSwap Web3",
      url: window.location.origin,
    },
    api: {
      supportedNetworks: {
        devnet: SOLANA_NETWORK.rpcUrl,
      },
    },
  });

  return metamaskClient;
}

export async function initializeSolanaWallets() {
  // Enables MetaMask Solana Wallet Standard.
  await initializeMetaMask();

  // Triggers discovery of browser wallets,
  // including Phantom when installed.
  return getWallets().get();
}

function getSelectedWallet(walletName) {
  if (walletName === "MetaMask") {
    const wallet = metamaskClient?.getWallet();

    if (!wallet) {
      throw new Error("MetaMask Solana is not initialized.");
    }

    return wallet;
  }

  if (walletName === "Phantom") {
    const registered = getWallets().get();

    const phantom = registered.find(
      (wallet) =>
        wallet.name.toLowerCase().includes("phantom") &&
        wallet.chains.some((chain) =>
          chain.startsWith("solana:")
        )
    );

    if (!phantom) {
      throw new Error(
        "Phantom Solana wallet not found. Install and unlock Phantom."
      );
    }

    return phantom;
  }

  throw new Error("Unsupported Solana wallet.");
}

export async function connectSolanaWallet(walletName) {
  await initializeSolanaWallets();

  const wallet = getSelectedWallet(walletName);

  const connectFeature =
    wallet.features["standard:connect"];

  if (!connectFeature) {
    throw new Error(
      `${walletName} does not support wallet connection.`
    );
  }

  const result = await connectFeature.connect();

  const account = result.accounts?.find(
    (item) =>
      item.chains?.some((chain) =>
        chain.startsWith("solana:")
      )
  );

  if (!account) {
    throw new Error("No Solana account was returned.");
  }

  const publicKey = new PublicKey(account.address);

  return {
    wallet,
    account,
    walletName,
    address: publicKey.toBase58(),
    publicKey,
  };
}

export async function getSolanaBalance(address) {
  const publicKey = new PublicKey(address);

  const lamports =
    await solanaConnection.getBalance(publicKey);

  return lamports / LAMPORTS_PER_SOL;
}


export async function disconnectSolanaWallet(connection) {
  if (!connection) return;

  try {
    if (connection.walletName === "MetaMask") {
      const client = await initializeMetaMask();   // was getMetaClient()
      await client.disconnect();
      return;
    }

    // Phantom (Wallet Standard)
    const feature = connection.wallet?.features?.["standard:disconnect"];
    if (feature) await feature.disconnect();

    // Fallback: Phantom's own provider, in case the standard feature didn't revoke the session
    await window.phantom?.solana?.disconnect?.();
  } catch (err) {
    console.warn("Wallet disconnect failed:", err);
  }
}
