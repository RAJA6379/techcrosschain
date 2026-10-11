const L = (n) => `/assets/networks/${n}.png`; // bundled in public/assets/networks
const eth = L("ethereum");

// btc = wrapped Bitcoin token on that chain (MetaMask cannot hold native BTC)
export const EVM_NETWORKS = [
  { name: "Sepolia", chainId: 11155111, icon: "◆", color: "#546cff", currency: "ETH", logo: eth, testnet: true,
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"], explorer: "https://sepolia.etherscan.io", btc: null },
  { name: "Ethereum", chainId: 1, icon: "◆", color: "#62688f", currency: "ETH", logo: eth,
    rpcUrls: ["https://ethereum-rpc.publicnode.com"], explorer: "https://etherscan.io",
    btc: { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 } },
  { name: "Base", chainId: 8453, icon: "●", color: "#2266f5", currency: "ETH", logo: L("base"),
    rpcUrls: ["https://mainnet.base.org"], explorer: "https://basescan.org",
    btc: { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 } },
  { name: "Polygon", chainId: 137, icon: "⬡", color: "#8247e5", currency: "POL", logo: L("polygon"),
    rpcUrls: ["https://polygon-bor-rpc.publicnode.com"], explorer: "https://polygonscan.com",
    btc: { symbol: "WBTC", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 } },
  { name: "Arbitrum One", chainId: 42161, icon: "◈", color: "#266dc2", currency: "ETH", logo: L("arbitrum"),
    rpcUrls: ["https://arb1.arbitrum.io/rpc"], explorer: "https://arbiscan.io",
    btc: { symbol: "WBTC", address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8 } },
  { name: "BNB Smart Chain", chainId: 56, icon: "✦", color: "#c89200", currency: "BNB", logo: L("bnb"),
    rpcUrls: ["https://bsc-dataseed.bnbchain.org"], explorer: "https://bscscan.com",
    btc: { symbol: "BTCB", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 } },
];

export function getNetworkInfo(chainId) {
  return (
    EVM_NETWORKS.find((n) => n.chainId === Number(chainId)) || {
      name: chainId == null ? "Network" : "Unknown network",
      icon: "◎", color: "#434a62", currency: "", btc: null,
    }
  );
}

export async function switchEvmNetwork(provider, network) {
  const chainId = `0x${network.chainId.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = Number(error?.code ?? error?.data?.originalError?.code);
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId, chainName: network.name,
        nativeCurrency: { name: network.currency, symbol: network.currency, decimals: 18 },
        rpcUrls: network.rpcUrls, blockExplorerUrls: [network.explorer],
      }],
    });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  }
}