import { test, expect } from "vitest";
import { getRoute, ROUTE, toBaseUnits, fromBaseUnits } from "../src/swap/router";

test("routes", () => {
  expect(getRoute("sepolia:MSTA", "sepolia:MSTB").kind).toBe(ROUTE.LOCAL);
  expect(getRoute("bitcoin:BTC", "sepolia:WBTC").kind).toBe(ROUTE.GARDEN);
  expect(getRoute("sepolia:WBTC", "bitcoin:BTC").kind).toBe(ROUTE.GARDEN);
  expect(getRoute("bitcoin:BTC", "solana:SOL").kind).toBe(ROUTE.GARDEN);
  expect(getRoute("solana:SOL", "solana:USDC").kind).toBe(ROUTE.NONE);
  expect(getRoute("sepolia:WBTC", "sepolia:USDC").kind).toBe(ROUTE.NONE);
  expect(getRoute("sepolia:MSTA", "bitcoin:BTC").kind).toBe(ROUTE.NONE);
  expect(getRoute("bitcoin:BTC", "bitcoin:BTC").kind).toBe(ROUTE.NONE);
});
test("units", () => {
  expect(toBaseUnits("0.01", 8)).toBe(1000000n);
  expect(toBaseUnits("1.123456789", 8)).toBe(null);
  expect(toBaseUnits("abc", 8)).toBe(null);
  expect(toBaseUnits("", 8)).toBe(null);
  expect(fromBaseUnits("1000000", 8)).toBe("0.01");
  expect(fromBaseUnits("150000000", 8)).toBe("1.5");
  expect(fromBaseUnits("5", 0)).toBe("5");
});
