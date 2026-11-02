import { appendFileSync } from "node:fs";
import { orderTotal } from "./pricing.js";

let nextId = 1;

export function createOrder(customer, lines) {
  if (!customer) {
    throw new Error("customer required");
  }
  if (!lines || lines.length === 0) {
    throw new Error("no lines");
  }
  const order = { id: nextId++, customer, lines, total: orderTotal(lines) };
  appendFileSync("audit.log", `created ${order.id}\n`);
  return order;
}
