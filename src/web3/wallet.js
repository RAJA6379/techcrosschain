
import { BrowserProvider, formatEther } from "ethers";

// Discover wallets using EIP-6963.
export async function discoverWallets() {
  const found = new Map();

  const listener = (event) => {
    const { info, provider } = event.detail || {};

    if (info?.uuid && provider?.request) {
      found.set(info.uuid, {
        id: info.uuid,
        name: info.name,
        icon: info.icon,
        provider,
      });
    }
  };

  window.addEventListener(
    "eip6963:announceProvider",
    listener
  );

  window.dispatchEvent(
    new Event("eip6963:requestProvider")
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 350)
  );

  window.removeEventListener(
    "eip6963:announceProvider",
    listener
  );

  const wallets = [...found.values()];

  // Support older extensions as a fallback.
  const injected = window.ethereum;

  const legacy = Array.isArray(injected?.providers)
    ? injected.providers
    : injected
      ? [injected]
      : [];

  // Only use legacy fallback if EIP-6963 found none.
  for (const provider of (wallets.length ? [] : legacy)) {
    if (
      !provider?.request ||
      wallets.some(
        (wallet) => wallet.provider === provider
      )
    ) {
      continue;
    }

    const name = provider.isTrust
      ? "Trust Wallet"
      : provider.isMetaMask && !provider.isTrust
        ? "MetaMask (legacy)"
        : "Injected wallet";

    wallets.push({
      id: `legacy-${wallets.length}`,
      name,
      icon: null,
      provider,
    });
  }

  return wallets;
}

// Connect to the exact wallet selected by the user.
export async function connectWallet(wallet) {
  if (!wallet?.provider?.request) {
    throw new Error("Select an available wallet.");
  }

  try {
    const accounts = await wallet.provider.request({
      method: "eth_requestAccounts",
    });

    if (!accounts?.[0]) {
      throw new Error(
        "No wallet account was selected."
      );
    }

    const provider = new BrowserProvider(
      wallet.provider
    );

    const network = await provider.getNetwork();

    const balance = await provider.getBalance(
      accounts[0]
    );

    return {
      provider,
      injectedProvider: wallet.provider,
      walletName: wallet.name,
      address: accounts[0],
      chainId: Number(network.chainId),
      balance: formatEther(balance),
    };
  } catch (error) {
    if (
      error?.code === 4001 ||
      error?.info?.error?.code === 4001
    ) {
      throw new Error(
        "Wallet connection was rejected."
      );
    }

    throw new Error(
      error?.shortMessage ||
      error?.info?.error?.message ||
      error?.message ||
      "Unable to connect wallet. Unlock or restart the wallet extension and try again."
    );
  }
}

// Short display address.
export function shortAddress(address) {
  return address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";
}
