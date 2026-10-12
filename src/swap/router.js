// Decides how a (from, to) pair is executed. Nothing here simulates a swap:
// a route is either backed by a real contract/protocol call or reported as unsupported.
import { getToken } from "./tokens";

export const ROUTE = { LOCAL: "local-evm", GARDEN: "garden", NONE: "unsupported" };

export function getRoute(fromId, toId) {
  const from = getToken(fromId);
  const to = getToken(toId);
  if (!from || !to) return { kind: ROUTE.NONE, reason: "Select two tokens." };
  if (from.id === to.id) return { kind: ROUTE.NONE, reason: "Select two different tokens." };

  if (from.chain === to.chain) {
    if (from.local && to.local) return { kind: ROUTE.LOCAL, from, to };
    if (from.chain === "solana") {
      return { kind: ROUTE.NONE, reason: "Same-chain Solana Devnet swaps are not enabled: no swap aggregator has real Devnet liquidity, and this app never simulates transactions." };
    }
    return { kind: ROUTE.NONE, reason: "Only MSTA ↔ MSTB is available as a same-chain swap on Sepolia." };
  }

  if (from.garden && to.garden) return { kind: ROUTE.GARDEN, from, to };
  return { kind: ROUTE.NONE, reason: `No cross-chain route for ${from.symbol} → ${to.symbol}. Cross-chain swaps use tokens Garden supports (for example BTC, WBTC, SOL, cbBTC).` };
}

export function toBaseUnits(amountStr, decimals) {
  const s = String(amountStr).trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  const digits = (whole + frac.padEnd(decimals, "0")).replace(/^0+(?=\d)/, "");
  return BigInt(digits || "0");
}

export function fromBaseUnits(value, decimals) {
  const v = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
