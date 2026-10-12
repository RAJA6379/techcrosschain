// Adapts a Wallet Standard Solana account (Phantom / MetaMask Solana, as connected in src/solana/wallet.js)
// into the AnchorProvider that the Garden SDK expects for Solana swaps.
import { Transaction, VersionedTransaction } from "@solana/web3.js";

export async function makeAnchorProvider(connection, rpcConnection) {
  const { AnchorProvider } = await import("@coral-xyz/anchor");
  const sign = connection?.wallet?.features?.["solana:signTransaction"];
  if (!sign) throw new Error(`${connection?.walletName || "This wallet"} does not support signing Solana transactions.`);

  const signOne = async (tx) => {
    const versioned = "version" in tx;
    const bytes = versioned ? tx.serialize() : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const [{ signedTransaction }] = await sign.signTransaction({
      account: connection.account,
      transaction: bytes,
      chain: "solana:devnet",
    });
    return versioned ? VersionedTransaction.deserialize(signedTransaction) : Transaction.from(signedTransaction);
  };

  const wallet = {
    publicKey: connection.publicKey,
    signTransaction: signOne,
    signAllTransactions: async (txs) => Promise.all(txs.map(signOne)),
  };
  return new AnchorProvider(rpcConnection, wallet, { commitment: "confirmed" });
}
