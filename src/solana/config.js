
import {
  Connection,
  clusterApiUrl,
} from "@solana/web3.js";

export const SOLANA_NETWORK = {
  name: "Solana Devnet",
  cluster: "devnet",
  rpcUrl: clusterApiUrl("devnet"),
  chainId: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

export const solanaConnection = new Connection(
  SOLANA_NETWORK.rpcUrl,
  "confirmed"
);

export function getSolanaExplorerUrl(address) {
  return (
    `https://explorer.solana.com/address/${address}` +
    `?cluster=devnet`
  );
}
