// Bitcoin testnet wallet access. Currently supports the Unisat browser extension (window.unisat).
// Add other wallets by adding an entry to BTC_WALLETS with the same four functions.
import { BTC_NETWORK } from "./config";

async function unisatEnsureTestnet(w) {
  try {
    if (w.switchChain) { await w.switchChain(BTC_NETWORK.unisatChain); return; }
  } catch { /* fall through to legacy API */ }
  if (w.switchNetwork) await w.switchNetwork(BTC_NETWORK.unisatNetwork);
}

const unisat = {
  id: "unisat",
  name: "Unisat",
  installed: () => typeof window !== "undefined" && !!window.unisat,
  async connect() {
    const w = window.unisat;
    if (!w) throw new Error("Unisat wallet not found. Install the Unisat extension and unlock it.");
    const accounts = await w.requestAccounts();
    await unisatEnsureTestnet(w);
    const address = (await w.getAccounts())[0] || accounts[0];
    if (!address) throw new Error("Unisat returned no address.");
    return { walletId: "unisat", walletName: "Unisat", address };
  },
  async getBalanceSats() {
    const b = await window.unisat.getBalance();
    return Number(b?.total ?? b?.confirmed ?? 0);
  },
  async send(toAddress, sats) {
    return window.unisat.sendBitcoin(toAddress, Number(sats));
  },
};

export const BTC_WALLETS = [unisat];

export function getBtcWallet(id) {
  const w = BTC_WALLETS.find((x) => x.id === id);
  if (!w) throw new Error("Unsupported Bitcoin wallet.");
  return w;
}
