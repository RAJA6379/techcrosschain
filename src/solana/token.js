
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";

import { solanaConnection } from "./config";

export const SOLANA_TOKENS = [
  {
    symbol: "MSTA",
    name: "MinSwap Token A",
    mint: "6yo8bHAeuFSj12kmxFhZSdmj5RjBRk5iqaBQr5XcWDXm",
    decimals: 6,
  },
  {
    symbol: "MSTB",
    name: "MinSwap Token B",
    mint: "EQ5zHatuNJU8oRmU3KQHZSLKQ3wyJpHRFentnW9ktiQR",
    decimals: 6,
  },
];

export async function getSolanaTokenBalances(
  walletAddress
) {
  const owner = new PublicKey(walletAddress);

  return Promise.all(
    SOLANA_TOKENS.map(async (token) => {
      try {
        const mint = new PublicKey(token.mint);

        const tokenAccount =
          await getAssociatedTokenAddress(
            mint,
            owner
          );

        const account = await getAccount(
          solanaConnection,
          tokenAccount
        );

        const balance =
          Number(account.amount) /
          10 ** token.decimals;

        return {
          ...token,
          balance,
        };
      } catch (error) {
        if (
          error.name === "TokenAccountNotFoundError"
        ) {
          return {
            ...token,
            balance: 0,
          };
        }

        throw error;
      }
    })
  );
}
