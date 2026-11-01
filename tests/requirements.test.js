import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "requirements-doc.js");

const featureText = `Feature: Refunds
  A customer can ask for money back on a paid order.

  Background:
    Given a paid order

  Rule: Shipped orders
    @evidence:src/Orders.java:40-52
    Scenario: A shipped order cannot be refunded
      When the customer asks for a refund
      Then the request is refused

  @evidence:src/Orders.java:60
  Scenario: A damaged item is refunded in full
    When the customer asks for a refund because the item is damaged
    Then the whole price is returned

  @unclear
  Scenario: Refund after a month
    When the customer asks for a refund after 31 days
    Then the refund is accepted

  @suspected-bug @evidence:src/Orders.java:70
  Scenario Outline: Quantity zero counts as one
    When the customer orders <qty> items
    Then <charged> items are charged
    Examples:
      | qty | charged |
      | 0   | 1       |
`;

function render(text) {
  const root = mkdtempSync(join(tmpdir(), "touchstone-requirements-"));
  try {
    mkdirSync(join(root, "drafts", "legacy"), { recursive: true });
    writeFileSync(join(root, "drafts", "legacy", "refunds.feature"), text);
    const result = spawnSync("node", [script, "--repo", root], { encoding: "utf8" });
    return { result, text: result.status === 0 ? readFileSync(join(root, "drafts", "legacy", "REQUIREMENTS.md"), "utf8") : "" };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("writes a plain requirements document with status and evidence", () => {
  const { result, text } = render(featureText);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(text, /^# Requirements found in the existing system/);
  assert.match(text, /## Refunds/);
  assert.match(text, /A customer can ask for money back on a paid order\./);
  assert.match(text, /Always true in this area:\n\n- Given a paid order/);
  assert.match(text, /### Rule: Shipped orders/);
  assert.match(text, /\*\*A shipped order cannot be refunded\*\*\n\n_Observed: the code does this\._/);
  assert.match(text, /- Then the request is refused/);
  assert.match(text, /Where in the code: `src\/Orders\.java:40-52`/);
  assert.match(text, /_Unclear: a person must say what the business wants\._/);
  assert.match(text, /_Looks like a bug: the code does this, but the business may not want it\._/);
  assert.match(text, /\| 0 \| 1 \|/);
});

test("counts scenarios by kind", () => {
  const { text } = render(featureText);
  assert.match(text, /\| Observed \| 2 \|/);
  assert.match(text, /\| Unclear, needs a person \| 1 \|/);
  assert.match(text, /\| Looks like a bug \| 1 \|/);
  assert.match(text, /\| Dead code \| 0 \|/);
});

test("says so when a file cannot be read", () => {
  const { text } = render("not gherkin at all\nScenario: x\n");
  assert.match(text, /could not be read/);
});
