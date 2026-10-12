import { useEffect, useState } from "react";
import { getGardenOrder } from "./garden";

const KEY = "minswap-garden-orders";
const DONE = ["Redeemed", "Refunded", "Expired"];

export function rememberOrder(entry) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    localStorage.setItem(KEY, JSON.stringify([entry, ...list].slice(0, 10)));
  } catch { /* storage unavailable: orders are simply not remembered */ }
}
export function loadOrders() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

function OrderRow({ entry }) {
  const [status, setStatus] = useState("Checking...");
  const [err, setErr] = useState("");

  useEffect(() => {
    let stop = false, timer;
    async function tick() {
      try {
        const o = await getGardenOrder(entry.orderId);
        if (stop) return;
        setStatus(o.status); setErr("");
        if (!DONE.includes(o.status)) timer = setTimeout(tick, 6000);
      } catch (e) {
        if (stop) return;
        setErr(e?.message || "Status check failed.");
        timer = setTimeout(tick, 12000);
      }
    }
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [entry.orderId]);

  return (
    <div className="order-row">
      <div><strong>{entry.label}</strong><small>{entry.orderId.slice(0, 10)}…</small></div>
      <span className={`order-status ${DONE.includes(status) ? "done" : ""}`}>{status}</span>
      {entry.txid && <small>BTC tx: {entry.txid.slice(0, 10)}…</small>}
      {err && <small className="order-err">{err}</small>}
    </div>
  );
}

export default function OrderStatus({ orders }) {
  if (!orders.length) return null;
  return (
    <div className="orders">
      <h3>Recent cross-chain orders</h3>
      {orders.map((o) => <OrderRow key={o.orderId} entry={o} />)}
      <small className="notice">Keep this tab open until an order shows Redeemed.</small>
    </div>
  );
}
