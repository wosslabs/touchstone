import assert from "node:assert/strict";
import { test } from "node:test";
import { lineTotal, orderTotal } from "../src/domain/pricing.js";

test("a line is price times quantity", () => {
  assert.equal(lineTotal(2, 3), 6);
});

test("an order of one small line costs the line", () => {
  assert.equal(orderTotal([{ price: 2, qty: 3 }]), 6);
});
