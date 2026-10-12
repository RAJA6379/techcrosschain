
import fs from "node:fs";
import path from "node:path";

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const connection = new Connection(
  clusterApiUrl("devnet"),
  "confirmed"
);

const walletFile = path.resolve(
  ".devnet-token-wallet.json"
);

const outputFile = path.resolve(
  "devnet-tokens.json"
);

const tokens = [
  { name: "MinSwap Token A", symbol: "MSTA" },
  { name: "MinSwap Token B", symbol: "MSTB" },
];

const decimals = 6;
const supply = 1_000_000n * 10n ** 6n;

// Generate a separate Devnet development wallet.
function getDevelopmentWallet() {
  if (fs.existsSync(walletFile)) {
    const secret = JSON.parse(
      fs.readFileSync(walletFile, "utf8")
    );

    return Keypair.fromSecretKey(
      Uint8Array.from(secret)
    );
  }

  const wallet = Keypair.generate();

  fs.writeFileSync(
    walletFile,
    JSON.stringify(Array.from(wallet.secretKey)),
    { mode: 0o600 }
  );

  return wallet;
}

async function main() {
  const phantomAddress = process.argv[2];

  if (!phantomAddress) {
    throw new Error(
      "Provide your Phantom public wallet address."
    );
  }

  const recipient = new PublicKey(phantomAddress);
  const payer = getDevelopmentWallet();

  console.log("Network: Solana Devnet");
  console.log(
    "Development wallet:",
    payer.publicKey.toBase58()
  );

  if (fs.existsSync(outputFile)) {
    console.log(
      "Token output already exists. No new tokens created."
    );
    return;
  }

  const balance = await connection.getBalance(
    payer.publicKey
  );

  console.log(
    "Development wallet balance:",
    balance / LAMPORTS_PER_SOL,
    "SOL"
  );

  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    console.log(
      "\nFund the development wallet with " +
      "about 0.1 Devnet SOL, then run this " +
      "command again."
    );
    return;
  }

  const results = [];

  for (const token of tokens) {
    console.log(`Creating ${token.symbol}...`);

    const mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      decimals
    );

    const tokenAccount =
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        recipient
      );

    const signature = await mintTo(
      connection,
      payer,
      mint,
      tokenAccount.address,
      payer,
      supply
    );

    const result = {
      name: token.name,
      symbol: token.symbol,
      mint: mint.toBase58(),
      decimals,
      supply: "1000000",
      owner: recipient.toBase58(),
      tokenAccount: tokenAccount.address.toBase58(),
      transaction: signature,
    };

    results.push(result);

    console.log(`${token.symbol} created`);
    console.log("Mint:", result.mint);
    console.log("Transaction:", signature);
  }

  fs.writeFileSync(
    outputFile,
    JSON.stringify(results, null, 2)
  );

  console.log("\nToken creation completed!");
  console.log("Saved to devnet-tokens.json");
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exitCode = 1;
});
