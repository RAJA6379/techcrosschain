import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { CHAINS, TOKENS, getToken, tokensOn } from "./tokens";
import { ROUTE, getRoute } from "./router";
import { getSwapQuote, executeSwap } from "../web3/swap";
import { SEPOLIA_CHAIN_ID } from "../web3/config";
import { BTC_WALLETS, getBtcWallet } from "../btc/wallet";
import { btcExplorerTx } from "../btc/config";
import { executeGardenSwap, getGardenQuote, isGardenConfigured } from "../crosschain/garden";
import OrderStatus, { loadOrders, rememberOrder } from "../crosschain/OrderStatus";

function validAddress(chain, addr) {
  const a = (addr || "").trim();
  if (!a) return false;
  if (chain === "sepolia") return /^0x[0-9a-fA-F]{40}$/.test(a);
  if (chain === "bitcoin") return /^(tb1|[mn2])[a-zA-Z0-9]{25,62}$/.test(a);
  if (chain === "solana") { try { new PublicKey(a); return true; } catch { return false; } }
  return false;
}

function TokenButton({ token, onClick }) {
  const chain = CHAINS[token.chain];
  return (
    <button className="token-btn" onClick={onClick} type="button">
      <span className="token-dot" style={{ background: chain.color }}>{chain.glyph}</span>
      <span className="token-text"><strong>{token.symbol}</strong><small>{chain.name}</small></span>
      <span aria-hidden>▾</span>
    </button>
  );
}

function TokenPicker({ onPick, onClose }) {
  const [chainKey, setChainKey] = useState("bitcoin");
  return (
    <div className="wallet-overlay" onClick={onClose}>
      <div className="wallet-dialog" role="dialog" aria-modal="true" aria-label="Select token" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-dialog-header"><h2>Select a token</h2><button aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="chain-tabs">
          {Object.values(CHAINS).map((c) => (
            <button key={c.key} className={c.key === chainKey ? "active" : ""} onClick={() => setChainKey(c.key)}>{c.name}</button>
          ))}
        </div>
        {tokensOn(chainKey).map((t) => (
          <button key={t.id} className="wallet-option" onClick={() => onPick(t.id)}>
            <span className="token-dot" style={{ background: CHAINS[t.chain].color }}>{CHAINS[t.chain].glyph}</span>
            <span><strong>{t.symbol}</strong> <small>{t.name}</small></span>
            <span>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SwapCard({ evmAccount, solanaAccount, onConnectEvm, onConnectSolana, solanaBusy }) {
  const [fromId, setFromId] = useState("bitcoin:BTC");
  const [toId, setToId] = useState("sepolia:WBTC");
  const [amount, setAmount] = useState("");
  const [picker, setPicker] = useState(null); // "from" | "to" | null
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [btcAccount, setBtcAccount] = useState(null);
  const [btcBalance, setBtcBalance] = useState(null);
  const [recipient, setRecipient] = useState("");
  const [solChoice, setSolChoice] = useState(false);
  const [orders, setOrders] = useState(loadOrders);
  const [lastBtcTx, setLastBtcTx] = useState("");

  const route = useMemo(() => getRoute(fromId, toId), [fromId, toId]);
  const from = getToken(fromId);
  const to = getToken(toId);

  const sourceConnected =
    from.chain === "sepolia" ? !!evmAccount : from.chain === "solana" ? !!solanaAccount : !!btcAccount;
  const connectedDest =
    to.chain === "sepolia" ? evmAccount?.address : to.chain === "solana" ? solanaAccount?.address : btcAccount?.address;
  const sourceAddress =
    from.chain === "sepolia" ? evmAccount?.address : from.chain === "solana" ? solanaAccount?.address : btcAccount?.address;
  const destAddress = (recipient.trim() || connectedDest || "").trim();
  const wrongEvmNetwork = from.chain === "sepolia" && evmAccount && Number(evmAccount.chainId) !== SEPOLIA_CHAIN_ID;

  // Reset the manual recipient and quote when the pair changes.
  useEffect(() => { setRecipient(""); setQuote(null); setQuoteError(""); setError(""); }, [fromId, toId]);

  // Debounced real quote.
  useEffect(() => {
    setQuote(null); setQuoteError("");
    if (route.kind === ROUTE.NONE || !amount || Number(amount) <= 0) return;
    if (route.kind === ROUTE.LOCAL && (!evmAccount || wrongEvmNetwork)) return;
    let stale = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        if (route.kind === ROUTE.LOCAL) {
          const q = await getSwapQuote(evmAccount, amount, fromId === "sepolia:MSTA");
          if (!stale) setQuote({ receiveDisplay: q.formattedOut, minDisplay: q.formattedMin });
        } else {
          const q = await getGardenQuote(from, to, amount);
          if (!stale) setQuote(q);
        }
      } catch (e) {
        if (!stale) setQuoteError(e?.shortMessage || e?.message || "Could not get a quote.");
      } finally {
        if (!stale) setQuoting(false);
      }
    }, 600);
    return () => { stale = true; clearTimeout(t); setQuoting(false); };
  }, [route.kind, fromId, toId, amount, evmAccount?.address, evmAccount?.chainId]);

  // BTC balance.
  useEffect(() => {
    if (!btcAccount) { setBtcBalance(null); return; }
    let stale = false;
    getBtcWallet(btcAccount.walletId).getBalanceSats()
      .then((s) => { if (!stale) setBtcBalance(s / 1e8); })
      .catch(() => { if (!stale) setBtcBalance(null); });
    return () => { stale = true; };
  }, [btcAccount, lastBtcTx]);

  function flip() { setFromId(toId); setToId(fromId); setAmount(""); }
  function pick(side, id) {
    setPicker(null);
    if (side === "from") { if (id === toId) setToId(fromId); setFromId(id); }
    else { if (id === fromId) setFromId(toId); setToId(id); }
  }

  async function connectBtc() {
    setError("");
    try {
      const w = BTC_WALLETS[0];
      if (!w.installed()) throw new Error("Unisat wallet not found. Install the Unisat browser extension, switch it to Testnet, and reload.");
      setBtcAccount(await w.connect());
    } catch (e) { setError(e?.message || "Bitcoin wallet connection failed."); }
  }

  const needsKey = route.kind === ROUTE.GARDEN && !isGardenConfigured();

  let action = { label: "Swap", disabled: false, run: handleSwap };
  if (route.kind === ROUTE.NONE) action = { label: "Route unavailable", disabled: true };
  else if (needsKey) action = { label: "Garden API key required", disabled: true };
  else if (!amount || Number(amount) <= 0) action = { label: "Enter an amount", disabled: true };
  else if (!sourceConnected) {
    action = from.chain === "sepolia" ? { label: "Connect Ethereum wallet", run: onConnectEvm }
      : from.chain === "solana" ? { label: "Connect Solana wallet", run: () => setSolChoice(true) }
      : { label: "Connect Bitcoin wallet (Unisat)", run: connectBtc };
  } else if (wrongEvmNetwork) action = { label: "Switch wallet to Sepolia", disabled: true };
  else if (quoting || (!quote && !quoteError)) action = { label: "Getting quote...", disabled: true };
  else if (quoteError) action = { label: "No quote available", disabled: true };
  else if (route.kind === ROUTE.GARDEN && !validAddress(to.chain, destAddress)) action = { label: "Enter a valid recipient address", disabled: true };

  async function handleSwap() {
    setError(""); setBusy(true); setStatus("");
    try {
      if (route.kind === ROUTE.LOCAL) {
        await executeSwap(evmAccount, amount, fromId === "sepolia:MSTA", "0.5", setStatus);
      } else {
        const btcWallet = btcAccount ? { address: btcAccount.address, send: (a, s) => getBtcWallet(btcAccount.walletId).send(a, s) } : null;
        const res = await executeGardenSwap({
          fromToken: from, toToken: to, quote,
          sourceAddress, destinationAddress: destAddress,
          ctx: { evmAccount, solanaAccount, btcWallet },
          onStatus: setStatus,
        });
        rememberOrder({ orderId: res.orderId, txid: res.txid, label: `${amount} ${from.symbol} → ${to.symbol}` });
        setOrders(loadOrders());
        if (res.txid) setLastBtcTx(res.txid);
        setStatus("Order created. Track it below.");
      }
      setAmount("");
    } catch (e) {
      setError(e?.shortMessage || e?.message || "Swap failed.");
      setStatus("");
    } finally { setBusy(false); }
  }

  return (
    <section className="swap-card" style={{ width: "100%", maxWidth: 480, margin: "28px auto" }}>
      <div className="card-top"><div><h1>Swap</h1><p>Swap across Sepolia, Solana Devnet and Bitcoin testnet.</p></div></div>

      <div className="field">
        <div className="field-label"><span>You pay</span>
          {from.chain === "bitcoin" && btcBalance !== null && <span>Balance: {btcBalance} BTC</span>}</div>
        <div className="amount-row">
          <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount to pay" />
          <TokenButton token={from} onClick={() => setPicker("from")} />
        </div>
      </div>

      <div className="flip-wrap"><button className="flip" onClick={flip} aria-label="Flip tokens" type="button">↓↑</button></div>

      <div className="field">
        <div className="field-label"><span>You receive</span>
          {quote?.etaSeconds ? <span>~{Math.max(1, Math.round(quote.etaSeconds / 60))} min</span> : null}</div>
        <div className="amount-row">
          <input readOnly placeholder="0" value={quote?.receiveDisplay || ""} aria-label="Amount to receive" />
          <TokenButton token={to} onClick={() => setPicker("to")} />
        </div>
      </div>

      {route.kind === ROUTE.GARDEN && (
        <div className="field">
          <div className="field-label"><span>Recipient ({CHAINS[to.chain].name})</span></div>
          <input className="recipient" placeholder={connectedDest || "Paste destination address"} value={recipient} onChange={(e) => setRecipient(e.target.value)} aria-label="Recipient address" />
        </div>
      )}

      {quote && route.kind === ROUTE.GARDEN && <p className="notice">Fee: {(quote.feeBps / 100).toFixed(2)}% · Route: Garden (native Bitcoin, non-custodial HTLC)</p>}
      {quote && route.kind === ROUTE.LOCAL && <p className="notice">Minimum received (0.5% slippage): {quote.minDisplay} {to.symbol}</p>}
      {route.kind === ROUTE.NONE && <div className="error" role="alert">{route.reason}</div>}
      {needsKey && <div className="error" role="alert">Cross-chain swaps need a Garden API key. Copy .env.example to .env, set VITE_GARDEN_API_KEY, and restart the dev server.</div>}
      {quoteError && <div className="error" role="alert">{quoteError}</div>}

     {solChoice && !solanaAccount && (
  <div className="sol-choice">
    <button
      className="swap-button"
      disabled={solanaBusy}
      onClick={() => {
        setSolChoice(false);
        onConnectSolana("Phantom");
      }}
    >
      Connect Phantom
    </button>
  </div>
)}

      <button className="swap-button" disabled={action.disabled || busy} onClick={action.run}>{busy ? "Working..." : action.label}</button>
      {status && <p className="notice" role="status">{status}</p>}
      {error && <div className="error" role="alert">{error}</div>}
      {lastBtcTx && <p className="notice">BTC transfer sent: <a href={btcExplorerTx(lastBtcTx)} target="_blank" rel="noreferrer">view on mempool.space</a></p>}

      {picker && <TokenPicker onPick={(id) => pick(picker, id)} onClose={() => setPicker(null)} />}
      <OrderStatus orders={orders} />
    </section>
  );
}
