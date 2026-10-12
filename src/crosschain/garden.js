// Cross-chain swaps through Garden Finance (native BTC <-> EVM / Solana).
// The Garden SDK is loaded on demand so the rest of the app never depends on it.
// Requires VITE_GARDEN_API_KEY (see .env.example). The key is read from the environment, never hardcoded.
import { solanaConnection } from "../solana/config";
import { makeAnchorProvider } from "./anchorWallet";
import { fromBaseUnits, toBaseUnits } from "../swap/router";

const API_KEY = (import.meta.env.VITE_GARDEN_API_KEY || "").trim();
export const isGardenConfigured = () => API_KEY.length > 0;

let sdkPromise = null;
function loadSdk() {
  sdkPromise ||= Promise.all([
    import("@gardenfi/core"),
    import("@gardenfi/orderbook"),
    import("@gardenfi/utils"),
    import("viem"),
    import("viem/chains"),
  ]).then(([core, orderbook, utils, viem, chains]) => ({
    Garden: core.Garden,
    Assets: orderbook.Assets,
    ChainAsset: orderbook.ChainAsset,
    Network: utils.Network,
    createWalletClient: viem.createWalletClient,
    custom: viem.custom,
    sepolia: chains.sepolia,
  }));
  return sdkPromise;
}

const instances = new Map();

async function getGarden({ evmAccount, solanaAccount } = {}) {
  if (!isGardenConfigured()) {
    throw new Error("Cross-chain swaps need a Garden API key. Set VITE_GARDEN_API_KEY in .env and restart the dev server.");
  }
  const key = `${evmAccount?.address || ""}|${solanaAccount?.address || ""}`;
  if (instances.has(key)) return instances.get(key);

  const sdk = await loadSdk();
  const wallets = {};
  if (evmAccount?.injectedProvider && evmAccount?.address) {
    wallets.evm = sdk.createWalletClient({
      account: evmAccount.address,
      chain: sdk.sepolia,
      transport: sdk.custom(evmAccount.injectedProvider),
    });
  }
  if (solanaAccount) wallets.solana = await makeAnchorProvider(solanaAccount, solanaConnection);

  const garden = sdk.Garden.fromWallets({ environment: sdk.Network.TESTNET, apiKey: API_KEY, wallets });
  // Garden's background executor performs redeem/refund actions while this tab is open.
  try { garden.executor?.execute?.(); } catch (e) { console.warn("Garden executor not started:", e); }
  instances.set(key, garden);
  return garden;
}

async function toChainAsset(token) {
  const { Assets, ChainAsset } = await loadSdk();
  const [chain, symbol] = token.garden;
  const asset = Assets[chain]?.[symbol];
  if (!asset) throw new Error(`Garden does not list ${token.symbol} on ${chain}.`);
  return ChainAsset.from(asset);
}

export async function getGardenQuote(fromToken, toToken, amountStr) {
  const base = toBaseUnits(amountStr, fromToken.decimals);
  if (base === null || base <= 0n) throw new Error("Enter a valid amount.");
  if (base > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large.");

  const garden = await getGarden();
  const [from, to] = await Promise.all([toChainAsset(fromToken), toChainAsset(toToken)]);
  const res = await garden.quote.getQuote(from, to, Number(base), false);
  if (!res?.ok) throw new Error(res?.error || "Garden returned no quote for this route.");
  const best = res.val?.[0];
  if (!best) throw new Error("Garden has no liquidity for this route.");

  return {
    sendBase: base.toString(),
    receiveBase: best.destination.amount,
    receiveDisplay: fromBaseUnits(best.destination.amount, toToken.decimals),
    feeBps: best.fee,
    etaSeconds: best.estimated_time,
    solverId: best.solver_id,
  };
}

// sourceCtx: { evmAccount, solanaAccount, btcWallet: {address, send(to, sats)} }
export async function executeGardenSwap({ fromToken, toToken, quote, sourceAddress, destinationAddress, ctx, onStatus = () => {} }) {
  const garden = await getGarden(ctx);
  const [fromAsset, toAsset] = await Promise.all([toChainAsset(fromToken), toChainAsset(toToken)]);
  const params = {
    fromAsset, toAsset,
    sendAmount: quote.sendBase,
    receiveAmount: quote.receiveBase,
    solverId: quote.solverId,
    sourceAddress, destinationAddress,
  };

  if (fromToken.chain === "bitcoin") {
    // Bitcoin source: Garden creates the order and returns a deposit address; the user sends BTC to it.
    onStatus("Creating order...");
    const res = await garden.createOrder(params);
    if (!res?.ok) throw new Error(res?.error || "Could not create the order.");
    const { order_id, to, amount } = res.val;
    if (!ctx.btcWallet) throw new Error("Connect a Bitcoin wallet first.");
    onStatus("Confirm the Bitcoin transfer in your wallet...");
    const txid = await ctx.btcWallet.send(to, amount);
    return { orderId: order_id, txid };
  }

  // EVM / Solana source: the SDK creates the order and initiates it from the connected wallet.
  onStatus("Creating order...");
  const res = await garden.createSwap(params, (s) => onStatus(String(s)));
  if (!res?.ok) throw new Error(res?.error || "Swap failed.");
  const orderId = typeof res.val === "string" ? res.val : res.val?.order_id;
  return { orderId };
}

export async function getGardenOrder(orderId) {
  const garden = await getGarden();
  const res = await garden.getOrder(orderId);
  if (!res?.ok) throw new Error(res?.error || "Could not load the order.");
  return res.val; // { ...order, status }
}
