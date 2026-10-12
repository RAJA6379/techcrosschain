import { test, expect, vi } from "vitest";
test("garden adapter builds an SDK instance and fails gracefully offline", async () => {
  vi.stubEnv("VITE_GARDEN_API_KEY", "test-key");
  const { getGardenQuote, isGardenConfigured } = await import("../src/crosschain/garden.js");
  expect(isGardenConfigured()).toBe(true);
  const { getToken } = await import("../src/swap/tokens.js");
  let err;
  try { await getGardenQuote(getToken("bitcoin:BTC"), getToken("sepolia:WBTC"), "0.001"); } catch (e) { err = e; }
  console.log("QUOTE RESULT ERROR:", err?.constructor?.name, err?.message);
  expect(err).toBeTruthy();
  expect(String(err.message)).not.toMatch(/is not a function|undefined|Cannot read/);
}, 60000);
