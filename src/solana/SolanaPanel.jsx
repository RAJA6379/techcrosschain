
import { useEffect, useState } from "react";
import {
  getSolanaTokenBalances,
  SOLANA_TOKENS,
} from "./token";

export default function SolanaPanel({
  connection,
  balance,
  busy,
  error,
  onConnect,
  onRefresh,
  onDisconnect,
  onShowAccount,
}) {
  const connected = Boolean(connection);

  const [tokenBalances, setTokenBalances] = useState([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  const walletAddress = connection?.address;

  useEffect(() => {
    let cancelled = false;

    if (!walletAddress) {
      setTokenBalances([]);
      setTokenError("");
      setTokensLoading(false);
      return;
    }

    async function loadTokens() {
      setTokensLoading(true);
      setTokenError("");

      try {
        const result = await getSolanaTokenBalances(
          walletAddress
        );

        if (!cancelled) {
          setTokenBalances(result);
        }
      } catch (err) {
        if (!cancelled) {
          setTokenError(
            err?.message || "Unable to load SPL token balances."
          );
        }
      } finally {
        if (!cancelled) {
          setTokensLoading(false);
        }
      }
    }

    loadTokens();

    return () => {
      cancelled = true;
    };
  }, [walletAddress, refreshCount]);

  async function handleRefresh() {
    setRefreshCount((count) => count + 1);
    await onRefresh?.();
  }

  function formatTokenBalance(value) {
    return Number(value).toLocaleString("en-US", {
      maximumFractionDigits: 6,
    });
  }

  return (
    <section
      className="swap-card"
      style={{
        width: "100%",
        maxWidth: 520,
        margin: "28px auto",
        padding: 24,
      }}
    >
      <div className="card-top">
        <div>
          <h1>Swap</h1>
          <p>
            {connected
              ? "Connected Solana wallet and token balances."
              : "Connect a Solana wallet to continue."}
          </p>
        </div>
      </div>

      {!connected ? (
        <div
          style={{
            display: "grid",
            gap: 14,
            marginTop: 24,
          }}
        >
          <button
            className="swap-button"
            disabled={busy}
            onClick={() => onConnect("Phantom")}
          >
            Connect Phantom
          </button>

          
        </div>
      ) : (
        <>
          {/* Wallet information */}
          <div className="field">
            <div className="field-label">
              <span>Network</span>
              <span>Solana Devnet</span>
            </div>

            <h2 style={{ marginTop: 12 }}>
              {connection.walletName}
            </h2>

            <p style={{ overflowWrap: "anywhere" }}>
              {connection.address}
            </p>
          </div>

          {/* SOL balance */}
          <div className="field">
            <div className="field-label">
              <span>Available balance</span>
              <span>Devnet</span>
            </div>

            <div className="amount-row">
              <strong style={{ fontSize: 28 }}>
                {balance === null
                  ? "—"
                  : Number(balance).toFixed(6)}
              </strong>

              <strong>SOL</strong>
            </div>
          </div>

          {/* SPL token balances */}
          <div className="field">
            <div className="field-label">
              <span>SPL Token Balances</span>
              <span>Solana Devnet</span>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                marginTop: 14,
              }}
            >
              {SOLANA_TOKENS.map((token) => {
                const tokenData = tokenBalances.find(
                  (item) => item.mint === token.mint
                );

                return (
                  <div
                    key={token.mint}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "14px",
                      border: "1px solid #293047",
                      borderRadius: 12,
                      background: "#151a2b",
                    }}
                  >
                    <div>
                      <strong>{token.symbol}</strong>
                      <p
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                          marginTop: 4,
                        }}
                      >
                        {token.name}
                      </p>
                    </div>

                    <strong>
                      {tokensLoading
                        ? "Loading..."
                        : tokenData
                          ? formatTokenBalance(
                              tokenData.balance
                            )
                          : "—"}
                    </strong>
                  </div>
                );
              })}
            </div>
          </div>

          {tokenError && (
            <div className="error" role="alert">
              {tokenError}
            </div>
          )}

          {/* Existing actions */}
          <button
            className="swap-button"
            disabled={busy}
            onClick={onShowAccount}
          >
            View Account Details
          </button>

          <button
            className="account-action"
            disabled={busy || tokensLoading}
            onClick={handleRefresh}
            style={{ marginTop: 12 }}
          >
            {tokensLoading
              ? "Refreshing..."
              : "Refresh Balance"}
          </button>

          <button
            className="account-action"
            disabled={busy}
            onClick={onDisconnect}
            style={{ marginTop: 12 }}
          >
            Disconnect Wallet
          </button>
        </>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <p className="notice">
        Solana Devnet wallet testing. SPL token balances
        are live; swaps are not enabled yet.
      </p>
    </section>
  );
}
