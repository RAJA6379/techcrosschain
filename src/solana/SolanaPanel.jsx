
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
              ? "Connected Solana wallet and account balance."
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

          <button
            className="swap-button"
            disabled={busy}
            onClick={() => onConnect("MetaMask")}
          >
            Connect MetaMask (Solana)
          </button>
        </div>
      ) : (
        <>
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

          <button
            className="swap-button"
            disabled={busy}
            onClick={onShowAccount}
          >
            View Account Details
          </button>

          <button
            className="account-action"
            disabled={busy}
            onClick={onRefresh}
            style={{ marginTop: 12 }}
          >
            Refresh Balance
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
        Solana Devnet wallet testing.
        SPL swaps are not enabled yet.
      </p>
    </section>
  );
}
