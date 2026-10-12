// @vitest-environment jsdom
import { test, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import SwapCard from "../src/swap/SwapCard.jsx";

afterEach(cleanup);
const props = { evmAccount: null, solanaAccount: null, onConnectEvm: () => {}, onConnectSolana: () => {}, solanaBusy: false };

test("default BTC -> WBTC without Garden key shows key notice", () => {
  render(<SwapCard {...props} />);
  expect(screen.getAllByText(/Garden API key/i).length).toBeGreaterThan(0);
  expect(screen.getByLabelText("Amount to pay")).toBeTruthy();
});
test("flip swaps the pair", () => {
  render(<SwapCard {...props} />);
  expect(screen.getAllByText("BTC").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByLabelText("Flip tokens"));
  const btns = document.querySelectorAll(".token-btn strong");
  expect(btns[0].textContent).toBe("WBTC");
  expect(btns[1].textContent).toBe("BTC");
});
test("token picker lists tokens and selects", () => {
  render(<SwapCard {...props} />);
  fireEvent.click(document.querySelectorAll(".token-btn")[1]);
  fireEvent.click(screen.getByText("Solana Devnet", { selector: ".chain-tabs button" }));
  fireEvent.click(screen.getByText("cbBTC"));
  expect(document.querySelectorAll(".token-btn strong")[1].textContent).toBe("cbBTC");
});
test("same-chain Solana is reported unsupported, not simulated", () => {
  render(<SwapCard {...props} />);
  fireEvent.click(document.querySelectorAll(".token-btn")[0]);
  fireEvent.click(screen.getByText("Solana Devnet", { selector: ".chain-tabs button" }));
  fireEvent.click(screen.getByText("SOL"));
  fireEvent.click(document.querySelectorAll(".token-btn")[1]);
  fireEvent.click(screen.getByText("Solana Devnet", { selector: ".chain-tabs button" }));
  fireEvent.click(screen.getByText("USDC"));
  expect(screen.getByText(/never simulates transactions/i)).toBeTruthy();
});
test("local MSTA -> MSTB asks to connect wallet", () => {
  render(<SwapCard {...props} />);
  fireEvent.click(document.querySelectorAll(".token-btn")[0]);
  fireEvent.click(screen.getByText("Ethereum Sepolia", { selector: ".chain-tabs button" }));
  fireEvent.click(screen.getByText("MSTA"));
  fireEvent.click(document.querySelectorAll(".token-btn")[1]);
  fireEvent.click(screen.getByText("Ethereum Sepolia", { selector: ".chain-tabs button" }));
  fireEvent.click(screen.getByText("MSTB"));
  fireEvent.change(screen.getByLabelText("Amount to pay"), { target: { value: "1" } });
  expect(screen.getByText("Connect Ethereum wallet")).toBeTruthy();
});
