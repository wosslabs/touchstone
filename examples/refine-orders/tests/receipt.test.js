import assert from "node:assert/strict";
import { test } from "node:test";
import { renderReceipt } from "../src/domain/receipt.js";

test("a receipt lists the lines and the total", () => {
  const text = renderReceipt({ lines: [{ name: "Pen", price: 2, qty: 3 }], total: 6 });
  assert.match(text, /Pen x3/);
  assert.match(text, /Total {2}\$6\.00/);
});
