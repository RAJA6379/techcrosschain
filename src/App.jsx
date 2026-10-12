import { useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract, formatEther, formatUnits } from "ethers";
import { connectWallet, discoverWallets, shortAddress } from "./web3/wallet";
import { NETWORK } from "./web3/config";
import { EVM_NETWORKS, getNetworkInfo, switchEvmNetwork } from "./web3/networks";
// import SolanaPanel from "./solana/SolanaPanel";
import SwapCard from "./swap/SwapCard";
import { getSolanaTokenBalances } from "./solana/token";

import {
  connectSolanaWallet,
  getSolanaBalance,
  disconnectSolanaWallet,
} from "./solana/wallet";
import {
  executeSwap,
  getSwapQuote,
  getTokenBalances,
} from "./web3/swap";


const tokens = {
  MSTA: { symbol: "MSTA", icon: "A" },
  MSTB: { symbol: "MSTB", icon: "B" },
};


const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

function TokenSelect({ value, onChange, exclude }) {
  return (
    <select className="token-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.keys(tokens).filter((k) => k !== exclude).map((k) => (
        <option key={k} value={k}>{tokens[k].icon} {k}</option>
      ))}
    </select>
  );
}

function WalletLogo({ icon, name, size = 24 }) {
  const [failed, setFailed] = useState(false);
  if (icon && !failed) {
    return (
      <img src={icon} alt={name || "Wallet"} className="connected-wallet-logo"
        style={{ width: size, height: size }} onError={() => setFailed(true)} />
    );
  }
  return <span className="wallet-logo-fallback" style={{ width: size, height: size }}>{(name || "W")[0]}</span>;
}

// Real chain logo, falls back to the glyph if the image cannot load.
function NetIcon({ net }) {
  const [failed, setFailed] = useState(false);
  const showLogo = net.logo && !failed;
  return (
    <span className={`network-icon ${showLogo ? "has-logo" : ""}`} style={{ background: net.color }}>
      {showLogo
        ? <img className="net-img" src={net.logo} alt={net.name} onError={() => setFailed(true)} />
        : net.icon}
    </span>
  );
}

// SVG chevron (the old "⌄" text glyph is missing from the font and rendered as "v").
function Chevron({ open }) {
  return (
    <svg className={`chev ${open ? "open" : ""}`} width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Collect wallet icons announced by every installed extension (EIP-6963).
function useAnnouncedWallets() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const onAnnounce = (e) => {
      const d = e.detail;
      if (!d?.info) return;
      setList((prev) => (prev.some((w) => w.info.uuid === d.info.uuid) ? prev : [...prev, d]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);
  return list;
}

// Networks this wallet has actually been seen on (remembered per wallet).
const chainsKey = (walletName) => `minswap-wallet-chains:${walletName}`;
function loadChains(walletName) {
  try { return JSON.parse(localStorage.getItem(chainsKey(walletName)) || "[]"); } catch { return []; }
}
function saveChains(walletName, ids) {
  try { localStorage.setItem(chainsKey(walletName), JSON.stringify(ids)); } catch { /* ignore */ }
}

const labelKey = (address) => `minswap-account-label:${address.toLowerCase()}`;
function getLabel(address, index) {
  try { return localStorage.getItem(labelKey(address)) || `Account ${index + 1}`; }
  catch { return `Account ${index + 1}`; }
}

export default function App() {


  // SOLANA WALLET STATES
  const [solanaAccount, setSolanaAccount] = useState(null);
  const [solanaBalance, setSolanaBalance] = useState(null);
  const [solanaBusy, setSolanaBusy] = useState(false);
  const [solanaError, setSolanaError] = useState("");
  const [solanaTokenBalances, setSolanaTokenBalances] = useState([]);


  const [chainView, setChainView] = useState("evm");
  const [account, setAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);   // every address the wallet shared
  const [balances, setBalances] = useState({});   // native balance per address
  const [btc, setBtc] = useState(null);           // wrapped-BTC balance of active account
  const [error, setError] = useState("");
  const [from, setFrom] = useState("MSTA");
  const [to, setTo] = useState("MSTB");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");

  const [connecting, setConnecting] = useState(false);
  const [swapStatus, setSwapStatus] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [tokenBalances, setTokenBalances] = useState({});

  const [walletOptions, setWalletOptions] = useState([]);
  const [walletModal, setWalletModal] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  const [walletIcon, setWalletIcon] = useState(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [editingLabel, setEditingLabel] = useState(false);
  const [, setLabelTick] = useState(0);
  const [copyMessage, setCopyMessage] = useState("");

  const [walletChains, setWalletChains] = useState([]); // chain ids seen on this wallet
  const [showMore, setShowMore] = useState(false);
  const announced = useAnnouncedWallets();
  const selectedWalletRef = useRef(null);
  const selectedWalletName = useRef("");
  const network = getNetworkInfo(account?.chainId);
  const detected = EVM_NETWORKS.filter((n) => walletChains.includes(n.chainId));
  const others = EVM_NETWORKS.filter((n) => !walletChains.includes(n.chainId));
  const accountLabel = account ? getLabel(account.address, 0) : "";

  function saveAccountLabel() {
    if (!account) return;
    const label = draftLabel.trim() || "Account 1";
    try { localStorage.setItem(labelKey(account.address), label); }
    catch { setError("Could not save account name in this browser."); }
    setLabelTick((t) => t + 1);
    setEditingLabel(false);
  }

  // Re-read chain, ALL accounts, balances and wrapped BTC from the wallet.
  async function refreshAccount(injected) {
    if (!injected?.request) return;
    const [chainHex, addresses] = await Promise.all([
      injected.request({ method: "eth_chainId" }),
      injected.request({ method: "eth_accounts" }),
    ]);
    if (selectedWalletRef.current !== injected) return;
    if (!addresses?.length) { handleDisconnect(); return; }

    const bp = new BrowserProvider(injected);
    const chainId = Number(chainHex);
    const net = getNetworkInfo(chainId);

    const bal = {};
    await Promise.all(addresses.map(async (a) => {
      try { bal[a] = formatEther(await bp.getBalance(a)); } catch { bal[a] = "0"; }
    }));

    let btcBal = null;
    if (net.btc) {
      try {
        const c = new Contract(net.btc.address, ERC20_ABI, bp);
        btcBal = formatUnits(await c.balanceOf(addresses[0]), net.btc.decimals);
      } catch { btcBal = "0"; }
    }
    if (selectedWalletRef.current !== injected) return;

    setWalletChains((prev) => {
      if (prev.includes(chainId)) return prev;
      const next = [...prev, chainId];
      saveChains(selectedWalletName.current, next);
      return next;
    });
    setAccounts(addresses);
    setBalances(bal);
    setBtc(btcBal);
    setAccount((prev) => prev && {
      ...prev, provider: bp, injectedProvider: injected,
      address: addresses[0], chainId, balance: bal[addresses[0]],
    });
  }

  // Wallet events + light polling so new funds/tokens appear without reload.
  useEffect(() => {
    if (!account) return;
    const injected = selectedWalletRef.current;
    if (!injected?.on) return;

    const run = (msg) => refreshAccount(injected).catch((e) => setError(e?.message || msg));
    const onChain = () => { setNetworkOpen(false); run("Network update failed."); };
    const onAccounts = (addrs) => { if (!addrs?.length) handleDisconnect(); else run("Account update failed."); };

    injected.on("chainChanged", onChain);
    injected.on("accountsChanged", onAccounts);
    const timer = setInterval(() => run("Refresh failed."), 12000);

    return () => {
      clearInterval(timer);
      injected.removeListener?.("chainChanged", onChain);
      injected.removeListener?.("accountsChanged", onAccounts);
    };
  }, [account?.injectedProvider, account?.walletName]);

  // Close menus with Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setNetworkOpen(false); setWalletMenuOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleConnect() {
    setError(""); setConnecting(true);
    try {
      const wallets = await discoverWallets();
      setWalletOptions(wallets);
      setWalletModal(true);
      if (!wallets.length) setError("No compatible wallet found. Enable MetaMask, Trust Wallet, or Phantom.");
    } catch (err) {
      setError(err?.message || "Wallet detection failed.");
    } finally { setConnecting(false); }
  }

  async function handleSelectWallet(wallet) {
    setConnecting(true); setError("");
    try {
      const connected = await connectWallet(wallet);
      selectedWalletRef.current = wallet.provider;
      const hit = announced.find((a) => a.provider === wallet.provider || a.info.name === wallet.name);
      setWalletIcon(wallet.icon || hit?.info?.icon || null);
      selectedWalletName.current = connected.walletName || wallet.name;
      setWalletChains(loadChains(selectedWalletName.current));
      setShowMore(false);
      setAccount(connected);
      setWalletModal(false); setNetworkOpen(false); setWalletMenuOpen(false);
      await refreshAccount(wallet.provider);
    } catch (err) {
      setError(err?.message || "Failed to connect wallet.");
    } finally { setConnecting(false); }
  }

  function handleDisconnect() {
    selectedWalletRef.current = null;
    setAccount(null); setWalletChains([]); setAccounts([]); setBalances({}); setBtc(null);
    setWalletIcon(null); setDraftLabel("");
    setWalletMenuOpen(false); setNetworkOpen(false);
    setEditingLabel(false); setCopyMessage(""); setError("");
  }

  async function chooseNetwork(selected) {
    if (!account) { setError("Connect your wallet first."); return; }
    setNetworkOpen(false); setConnecting(true); setError("");
    try {
      const injected = selectedWalletRef.current;
      if (!injected) throw new Error("Wallet provider unavailable.");
      await switchEvmNetwork(injected, selected);
      await refreshAccount(injected);
    } catch (err) {
      setError(err?.message || "Could not switch network.");
    } finally { setConnecting(false); }
  }

  // Opens the wallet's own account picker so the user can allow more accounts / change the active one.
  async function manageAccounts() {
    const injected = selectedWalletRef.current;
    if (!injected) return;
    try {
      await injected.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      await refreshAccount(injected);
    } catch (err) {
      if (err?.code !== 4001) setError(err?.message || "Could not open account picker.");
    }
  }

  async function copyAddress(address) {
    try {
      await navigator.clipboard.writeText(address);
      setCopyMessage("Address copied!");
    } catch { setCopyMessage("Unable to copy address."); }
    setTimeout(() => setCopyMessage(""), 1800);
  }

  /* ========================================
     LIVE SWAP QUOTATION
  ======================================== */

  useEffect(() => {
    let cancelled = false;

    setQuote(null);
    setQuoteError("");

    if (
      !account ||
      account.chainId !== NETWORK.chainId ||
      !amount.trim()
    ) {
      return;
    }

    if (
      !/^\d+(\.\d*)?$/.test(amount.trim()) ||
      Number(amount) <= 0
    ) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await getSwapQuote(
          account,
          amount,
          from === "MSTA",
          slippage
        );

        if (!cancelled) {
          setQuote(result);
        }
      } catch (err) {
        if (!cancelled) {
          setQuoteError(
            err?.shortMessage ||
            err?.message ||
            "Unable to fetch swap quotation."
          );
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    account?.address,
    account?.chainId,
    account?.provider,
    amount,
    from,
    to,
    slippage,
  ]);


  /* ========================================
     LOAD MSTA AND MSTB TOKEN BALANCES
  ======================================== */

  useEffect(() => {
    let cancelled = false;

    if (
      !account ||
      account.chainId !== NETWORK.chainId
    ) {
      setTokenBalances({});
      return;
    }

    async function loadBalances() {
      try {
        const balances = await getTokenBalances(account);

        if (!cancelled) {
          setTokenBalances(balances);
        }
      } catch (err) {
        if (!cancelled) {
          setTokenBalances({});
          console.error("Balance loading error:", err);
        }
      }
    }

    loadBalances();

    const interval = setInterval(loadBalances, 12000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    account?.address,
    account?.chainId,
    account?.provider,
  ]);


  /* =========================================
     SOLANA WALLET FUNCTIONS
  ========================================= */

 
async function connectSolana(walletName) {
  setSolanaBusy(true);
  setSolanaError("");

  try {
    // Connect the selected wallet first.
    const connected = await connectSolanaWallet(walletName);

    // Save the connection immediately so the UI can show it.
    setSolanaAccount(connected);
    setSolanaBalance(null);
    setWalletMenuOpen(false);

    // Fetch the Devnet balance separately.
    try {
      const balance = await getSolanaBalance(connected.address);
      setSolanaBalance(balance);
    } catch (balanceError) {
      console.error("SOL balance loading failed:", balanceError);
      setSolanaError(
        "Wallet connected, but SOL balance could not be loaded. Check the Solana network and RPC."
      );
    }
  } catch (err) {
    console.error("Solana wallet connection failed:", err);
    setSolanaError(
      err?.message || "Solana wallet connection failed."
    );
  } finally {
    setSolanaBusy(false);
  }
}

  async function refreshSolana() {
    if (!solanaAccount) return;

    setSolanaBusy(true);

    try {
      const balance = await getSolanaBalance(
        solanaAccount.address
      );

      setSolanaBalance(balance);
      setSolanaError("");
    } catch (err) {
      setSolanaError(
        err?.message || "Failed to refresh SOL balance."
      );
    } finally {
      setSolanaBusy(false);
    }
  }



 
async function disconnectSolana() {
  setSolanaBusy(true);
  setSolanaError("");

  try {
    if (solanaAccount) await disconnectSolanaWallet(solanaAccount);
  } finally {
    setSolanaAccount(null);
    setSolanaBalance(null);
    setWalletMenuOpen(false);
    setNetworkOpen(false);
    setChainView("solana");
    setSolanaBusy(false);
  }
}

  async function handleSwap() {
    if (!account) { await handleConnect(); return; }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError("Enter a valid swap amount."); return;
    }
    setError(""); setConnecting(true);
    try {
      if (account.chainId !== NETWORK.chainId) throw new Error("Your SwapPool is configured on Sepolia only. Switch to Sepolia.");
      if (from === "ETH" || to === "ETH") throw new Error("Native ETH swaps are not supported by this ERC-20 SwapPool.");
      const receipt = await executeSwap(account, amount, true);
      console.log("Swap transaction:", receipt);
      setAmount("");
    } catch (err) {
      setError(err?.shortMessage || err?.message || "Swap failed.");
    } finally { setConnecting(false); }
  }
useEffect(() => {
  if (!solanaAccount?.address) {
    setSolanaTokenBalances([]);
    return;
  }

  let active = true;

  const loadBalances = async () => {
    try {
      const result = await getSolanaTokenBalances(
        solanaAccount.address
      );

      if (active) setSolanaTokenBalances(result);
    } catch (err) {
      console.error("Solana balance error:", err);
    }
  };

  loadBalances();

  const timer = setInterval(loadBalances, 12000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}, [solanaAccount?.address]);

const solanaBalanceFor = (symbol) => {
  if (!solanaAccount) return "—";

  const token = SOLANA_TOKENS.find(
    (item) => item.symbol === symbol
  );

  const result = solanaTokenBalances.find(
    (item) => item.mint === token?.mint
  );

  if (!result) return "—";

  return Number(result.balance).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
};
  function swapTokens() { setFrom(to); setTo(from); }

  return (
    <div className="app">
      {/* ================= NAVBAR ================= */}
      <header className="header">
        <div className="brand">
          <img src="/assets/minswap-logo.svg" alt="MinSwap" />
          <span>MinSwap</span>
        </div>

        <nav>
          <button className={chainView !== "crosschain" ? "nav-active" : ""} onClick={() => { if (chainView === "crosschain") setChainView("evm"); }}>Swap</button>
          <button className={chainView === "crosschain" ? "nav-active" : ""} onClick={() => setChainView("crosschain")}>Cross-chain</button>
          <button>Liquidity</button>
          <button>Earn</button>
        </nav>
rkjfherufgyu
        <div className="header-actions">
          {/* NETWORK BUTTON */}
          <div className="network-menu-wrap">
            <button
              className="network-trigger"
              disabled={connecting}
              aria-expanded={networkOpen}
              onClick={() => { setWalletMenuOpen(false); setNetworkOpen((p) => !p); }}
            >

              <NetIcon
                net={
                  chainView === "solana"
                    ? {
                      name: "Solana Devnet",
                      color: "#7752C7",
                      icon: "◎",
                    }
                    : network
                }
              />


              <span className="network-trigger-text">
                {chainView === "solana"
                  ? "Solana Devnet"
                  : account
                    ? network.name
                    : "Network"}
              </span>
              <Chevron open={networkOpen} />
            </button>

            {networkOpen && (
              <>
                <button className="menu-dismiss" aria-label="Close network menu" onClick={() => setNetworkOpen(false)} />
                <div className="network-dropdown">
                  <div className="dropdown-heading">Select network</div>
                  <p>Choose a blockchain network for your wallet.</p>


                  {/* SOLANA DEVNET NETWORK OPTION */}

                  <button
                    className="network-row"
                    onClick={() => {
                      setChainView("solana");
                      setNetworkOpen(false);
                      setWalletMenuOpen(false);
                      setError("");
                    }}
                  >
                    <span
                      className="network-icon"
                      style={{
                        background: "#7752C7",
                      }}
                    >
                      ◎
                    </span>

                    <span className="network-description">
                      <strong>
                        Solana Devnet
                        <span className="testnet-tag">
                          TESTNET
                        </span>
                      </strong>

                      <small>
                        {solanaAccount
                          ? `${solanaAccount.walletName} • ${solanaAccount.address.slice(0, 6)
                          }...${solanaAccount.address.slice(-4)
                          }`
                          : "Connect a Solana wallet"}
                      </small>
                    </span>

                    {chainView === "solana" && (
                      <span className="active-check">✓</span>
                    )}
                  </button>


                  {account && (
                    <div className="wallet-chip">
                      <WalletLogo icon={walletIcon} name={account.walletName} size={22} />
                      <span>Networks in <strong>{account.walletName}</strong></span>
                    </div>
                  )}

                  {detected.map((item) => (
                    <button key={item.chainId} className="network-row" disabled={connecting} onClick={() => {
                      setChainView("evm");
                      chooseNetwork(item);
                    }}>
                      <NetIcon net={item} />
                      <span className="network-description">
                        <strong>{item.name}{item.testnet && <span className="testnet-tag">TESTNET</span>}</strong>
                        <small title={account?.address}>{shortAddress(account.address)}</small>
                      </span>
                      {account?.chainId === item.chainId && <span className="active-check">✓</span>}
                    </button>
                  ))}
                  {account && !detected.some((n) => n.chainId === account.chainId) && (
                    <div className="network-menu-note">Current network (chain {account.chainId}) is not in MinSwap's list.</div>
                  )}
                  {!account && <div className="network-menu-note">Connect a wallet to see its networks.</div>}

                  {account && others.length > 0 && (
                    <>
                      <button className="mini-btn more-btn" onClick={() => setShowMore((v) => !v)}>
                        {showMore ? "Hide other networks" : "Request another network"}
                      </button>
                      {showMore && others.map((item) => (
                        <button key={item.chainId} className="network-row" disabled={connecting} onClick={() => {
                          setChainView("evm");
                          chooseNetwork(item);
                        }}>
                          <NetIcon net={item} />
                          <span className="network-description"><strong>{item.name}</strong><small>Ask {account.walletName} to switch</small></span>
                        </button>
                      ))}
                    </>
                  )}

                  <div className="network-menu-note">
                    Only networks your wallet has been on are listed. Switch network inside your wallet and it appears here automatically.
                  </div>
                </div>
              </>
            )}
          </div>

          {/* WALLET ACCOUNT BUTTON */}
          <div className="wallet-menu-wrap">
            <button
              className="connect"
              disabled={connecting}
              aria-expanded={account ? walletMenuOpen : undefined}
onClick={() => {
  setNetworkOpen(false);

  if (chainView === "solana") {
    if (!solanaAccount) {
      connectSolana("Phantom");
    } else {
      setWalletMenuOpen((prev) => !prev);
    }
    return;
  }

  if (account) {
    setWalletMenuOpen((prev) => !prev);
  } else {
    handleConnect();
  }
}}
            >

              {chainView === "solana" && solanaAccount ? (
                <span className="wallet-logo-fallback">
                  ◎
                </span>
              ) : account ? (
                <WalletLogo
                  icon={walletIcon}
                  name={account.walletName}
                />
              ) : null}


              <span className="connect-label">
                {connecting || solanaBusy
                  ? "Connecting..."
                  : chainView === "solana"
                    ? solanaAccount
                      ? solanaAccount.walletName
                      : "Connect Wallet"
                    : account
                      ? accountLabel
                      : "Connect Wallet"}
              </span>

              {(account || solanaAccount || chainView === "solana") && (
                <Chevron open={walletMenuOpen} />
              )}
            </button>
            {walletMenuOpen && (account || solanaAccount || chainView === "solana") && (
              <>
                <button className="menu-dismiss" aria-label="Close account menu" onClick={() => setWalletMenuOpen(false)} />
                <div className="wallet-profile-menu">

                  {/* ========================================
    SOLANA DEVNET ACCOUNT DETAILS
======================================== */}

                  {chainView === "solana" && (
                    <>
                      <span className="dropdown-heading">
                        Solana Account Details
                      </span>

                      {!solanaAccount ? (
                        <div className="account-address-box">
                          <p>Connect a Solana wallet</p>

                          <button
                            className="account-action"
                            disabled={solanaBusy}
                            onClick={() => connectSolana("Phantom")}
                          >
                            Connect Phantom
                          </button>

                          {/* <button
                            className="account-action"
                            disabled={solanaBusy}
                            onClick={() => connectSolana("MetaMask")}
                          >
                            Connect MetaMask Solana
                          </button> */}


                          
<button
  className="disconnect-option"
  disabled={solanaBusy}
  onClick={disconnectSolana}
>
  Disconnect from MinSwap
</button>



                        </div>
                      ) : (
                        <>
                          <div className="wallet-identity-row">
                            <span className="wallet-logo-fallback">
                              ◎
                            </span>

                            <div>
                              <strong>{solanaAccount.walletName}</strong>
                              <small>Solana Devnet</small>
                            </div>
                          </div>

                          <div className="account-address-box">
                            <span className="address-caption">
                              Wallet Address
                            </span>

                            <p style={{ overflowWrap: "anywhere" }}>
                              {solanaAccount.address}
                            </p>

                            <div className="asset-row">
                              <span>SOL Balance</span>

                              <strong>
                                {solanaBalance === null
                                  ? "Loading..."
                                  : `${Number(solanaBalance).toFixed(6)} SOL`}
                              </strong>
                            </div>
                          </div>

                          <button
                            className="account-action"
                            disabled={solanaBusy}
                            onClick={refreshSolana}
                          >
                            Refresh Balance
                          </button>
{/* 
                          <button
                            className="account-action"
                            disabled={solanaBusy}
                            onClick={() => connectSolana(
                              solanaAccount.walletName === "Phantom"
                                ? "MetaMask"
                                : "Phantom"
                            )}
                          >
                            Switch to {
                              solanaAccount.walletName === "Phantom"
                                ? "MetaMask Solana"
                                : "Phantom"
                            }
                          </button> */}


                          <button
                            className="disconnect-option"
                            disabled={solanaBusy}
                            onClick={async () => {
                              await disconnectSolana();
                              setWalletMenuOpen(false);
                            }}
                          >
                            Disconnect from MinSwap
                          </button>

                        </>
                      )}

                      {solanaError && (
                        <div className="error" role="alert">
                          {solanaError}
                        </div>
                      )}
                    </>
                  )}
                  {chainView !== "solana" && account && (
                    <>
                      {/* <span className="dropdown-heading">
                        Connected accounts ({accounts.length})
                      </span> */}
                      <span className="dropdown-heading">Connected accounts ({accounts.length})</span>

                      <div className="wallet-identity-row">
                        <WalletLogo icon={walletIcon} name={account.walletName} size={32} />
                        <div>
                          <strong>{account.walletName}</strong>
                          <small>{network.name}</small>
                        </div>
                      </div>

                      <div className="acct-list">
                        {accounts.map((addr, i) => (
                          <div key={addr} className={`acct-row ${i === 0 ? "active" : ""}`}>
                            <span className="identicon">◈</span>
                            <div className="acct-main">
                              <strong>{getLabel(addr, i)} {i === 0 && <span className="acct-badge">ACTIVE</span>}</strong>
                              <span title={addr}>{addr}</span>
                              <em>{Number(balances[addr] ?? 0).toFixed(5)} {network.currency}</em>
                            </div>
                            <button className="mini-btn" onClick={() => copyAddress(addr)}>Copy</button>
                          </div>
                        ))}
                      </div>

                      <button className="account-action" onClick={manageAccounts}>
                        Add / switch accounts in wallet
                      </button>

                      {/* RENAME ACTIVE ACCOUNT */}
                      <div className="account-label-row">
                        {editingLabel ? (
                          <input
                            className="account-label-input" value={draftLabel} maxLength={26} placeholder="Account name"
                            onChange={(e) => setDraftLabel(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveAccountLabel(); if (e.key === "Escape") setEditingLabel(false); }}
                          />
                        ) : (<strong>{accountLabel}</strong>)}
                        <button onClick={() => { if (editingLabel) saveAccountLabel(); else { setDraftLabel(accountLabel); setEditingLabel(true); } }}>
                          {editingLabel ? "Save" : "Rename active"}
                        </button>
                      </div>

                      {/* ASSETS OF ACTIVE ACCOUNT */}
                      <div className="account-address-box">
                        <span className="address-caption">Assets on {network.name}</span>
                        <div className="asset-row">
                          <span>{network.currency || "Native"}</span>
                          <span>{Number(account.balance || 0).toFixed(5)}</span>
                        </div>
                        {network.btc ? (
                          <div className="asset-row">
                            <span>{network.btc.symbol} (Bitcoin)</span>
                            <span>{Number(btc || 0).toFixed(6)}</span>
                          </div>
                        ) : (
                          <small>No wrapped BTC is tracked on this network.</small>
                        )}
                      </div>

                      {copyMessage && <small>{copyMessage}</small>}
                      <small className="account-help">Account names are saved locally in this browser. Balances refresh automatically.</small>

                      <button className="disconnect-option" onClick={handleDisconnect}>Disconnect from MinSwap</button>  </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ================= WALLET MODAL ================= */}
      {walletModal && (
        <div className="wallet-overlay" onClick={() => { if (!connecting) setWalletModal(false); }}>
          <div className="wallet-dialog" role="dialog" aria-modal="true" aria-label="Select wallet" onClick={(e) => e.stopPropagation()}>
            <div className="wallet-dialog-header">
              <h2>Connect a wallet</h2>
              <button aria-label="Close" disabled={connecting} onClick={() => setWalletModal(false)}>✕</button>
            </div>
            <p>Select the wallet extension you want to connect.</p>
            {walletOptions.map((wallet) => (
              <button key={wallet.id} className="wallet-option" disabled={connecting} onClick={() => handleSelectWallet(wallet)}>
                <WalletLogo icon={wallet.icon} name={wallet.name} size={32} />
                <span>{wallet.name}</span>
                <span>→</span>
              </button>
            ))}
            {!walletOptions.length && <p>No compatible browser wallets detected.</p>}
            {error && <div className="error" role="alert">{error}</div>}
          </div>
        </div>
      )}



      {/* ================= SWAP PAGE ================= */}

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 12,
          padding: "20px 16px 0",
        }}
      >
      </div>

      {/* {chainView === "solana" && <SolanaPanel connection={solanaAccount}
        balance={solanaBalance}
        busy={solanaBusy}
        error={solanaError}
        onConnect={connectSolana}
        onRefresh={refreshSolana}
        onDisconnect={disconnectSolana}
        onShowAccount={() => {
          setNetworkOpen(false);
          setWalletMenuOpen(true);
        }} />} */}

      {chainView === "crosschain" && (
        <SwapCard
          evmAccount={account}
          solanaAccount={solanaAccount}
          onConnectEvm={handleConnect}
          onConnectSolana={connectSolana}
          solanaBusy={solanaBusy}
        />
      )}

      {/* {chainView === "evm" && ( */}
      {(chainView === "evm" || chainView === "solana") && (

        <main className="main">
          <div className="page-tabs">
            <button className="active">Swap</button>
            <button>Limit</button>
          </div>

          <section className="swap-card">
            <div className="card-top">
              <div>
                <h1>Swap</h1>
                <p>Trade tokens instantly with our decentralized exchange.</p>
              </div>
              <button className="gear">⚙</button>
            </div>

            <div className="field">
              <div className="field-label">
                <span>You pay</span>
                <span>
  Balance: {chainView === "solana"
    ? solanaBalanceFor(from)
    : account
      ? String(tokenBalances[from] ?? "—")
      : "—"}
</span>
              </div>
              <div className="amount-row">
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" />
                <TokenSelect value={from} onChange={setFrom} exclude={to} />
              </div>
            </div>

            <button className="switch" onClick={swapTokens}>↕</button>

            <div className="field">
              <div className="field-label"><span>You receive</span><span>Balance: —</span></div>
              <div className="amount-row">
                <input readOnly placeholder="0.0" value={amount && Number.isFinite(Number(amount)) ? (Number(amount) * 1.98).toFixed(4) : ""} />
                <TokenSelect value={to} onChange={setTo} exclude={from} />
              </div>
            </div>

            <div className="details">
              <div><span>Rate (demo only)</span><span>1 {from} ≈ 1.98 {to}</span></div>
              <div><span>Minimum received</span><span>—</span></div>
              <div><span>Price impact</span><span>—</span></div>
              <div>
                <span>Slippage tolerance</span>
                <select value={slippage} onChange={(e) => setSlippage(e.target.value)}>
                  <option value="0.1">0.1%</option>
                  <option value="0.5">0.5%</option>
                  <option value="1.0">1.0%</option>
                </select>
              </div>
            </div>

            {error && <div className="error" role="alert">{error}</div>}

            <button className="swap-button" disabled={connecting} onClick={handleSwap}>
              {connecting ? "Processing..." : account ? "Swap" : "Connect Wallet"}
            </button>

            <div className="network">
              <span className="dot" />
              {account ? `${network.name} • ${shortAddress(account.address)}` : "Connect wallet to select a network"}
            </div>
          </section>

          <p className="notice">Demo quote only. Swaps require verified token contracts and supported liquidity.</p>
        </main>
      )}

      <footer>
        <span>MinSwap Web3</span>
        <span>Multi-wallet • EIP-6963 • ethers.js</span>
      </footer>
    </div>
  );
  useEffect(() => {
  let cancelled = false;

  if (!solanaAccount?.address || chainView !== "solana") {
    setSolanaTokenBalances([]);
    return;
  }

  async function refreshTokens() {
    try {
      const balances = await getSolanaTokenBalances(
        solanaAccount.address
      );

      if (!cancelled) {
        setSolanaTokenBalances(balances);
      }
    } catch (err) {
      console.error("Solana token balance error:", err);
    }
  }

  refreshTokens();

  const timer = setInterval(refreshTokens, 12000);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}, [solanaAccount?.address, chainView]);


}