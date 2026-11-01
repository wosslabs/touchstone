import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "check-evidence.js");
const code = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join("\n");

function workspace(files) {
  const root = mkdtempSync(join(tmpdir(), "touchstone-evidence-"));
  const all = { "src/Orders.java": code, ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function feature(...scenarios) {
  return `Feature: Orders\n\n${scenarios.join("\n")}`;
}

const scenario = (tags, title = "Refund an order") => `  ${tags}\n  Scenario: ${title}\n    Given an order\n    Then it is refunded\n`;

function run(root, extra = []) {
  return spawnSync("node", [script, "--repo", root, ...extra], { encoding: "utf8" });
}

function check(files, extra = []) {
  const root = workspace(files);
  try {
    return run(root, extra);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("passes when every scenario points at real code", () => {
  const result = check({ "drafts/legacy/orders.feature": feature(scenario("@evidence:src/Orders.java:12-20")) });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /1 scenarios. 0 problems/);
});

test("fails when a scenario has neither evidence nor an honest label", () => {
  const result = check({ "drafts/legacy/orders.feature": feature(scenario("@observed")) });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /so it is a guess/);
});

test("lets a scenario be labelled unclear and lists it for a person", () => {
  const result = check({ "drafts/legacy/orders.feature": feature(scenario("@unclear")) });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /Needs a person/);
  assert.match(result.stdout, /@unclear/);
});

test("fails on a file that does not exist or a line past the end", () => {
  const missing = check({ "drafts/legacy/orders.feature": feature(scenario("@evidence:src/Nope.java:3")) });
  assert.equal(missing.status, 1, missing.stdout);
  assert.match(missing.stdout, /no such file/);
  const past = check({ "drafts/legacy/orders.feature": feature(scenario("@evidence:src/Orders.java:200")) });
  assert.equal(past.status, 1, past.stdout);
  assert.match(past.stdout, /the file has 80 lines/);
});

test("fails on an evidence pointer that escapes the code base", () => {
  const result = check({ "drafts/legacy/orders.feature": feature(scenario("@evidence:../../etc/hosts:1")) });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /outside the code base/);
});

test("fails on an evidence pointer that escapes through a symlink", () => {
  const root = workspace({ "drafts/legacy/orders.feature": feature(scenario("@evidence:src/link:1")) });
  const outside = mkdtempSync(join(tmpdir(), "touchstone-outside-"));
  try {
    writeFileSync(join(outside, "secret.txt"), "secret\n");
    symlinkSync(join(outside, "secret.txt"), join(root, "src", "link"));
    const result = run(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /outside the code base/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a tag on the Feature line applies to every scenario", () => {
  const text = `@evidence:src/Orders.java:5\nFeature: Orders\n\n  Scenario: One\n    Given a\n\n  Scenario: Two\n    Given b\n`;
  const result = check({ "drafts/legacy/orders.feature": text });
  assert.equal(result.status, 0, result.stdout);
});

test("fails on a repeated scenario title and on invalid Gherkin", () => {
  const twice = check({ "drafts/legacy/orders.feature": feature(scenario("@evidence:src/Orders.java:1"), scenario("@evidence:src/Orders.java:2")) });
  assert.equal(twice.status, 1, twice.stdout);
  assert.match(twice.stdout, /title already used/);
  const broken = check({ "drafts/legacy/orders.feature": "this is not gherkin\nScenario: x\n" });
  assert.equal(broken.status, 1, broken.stdout);
  assert.match(broken.stdout, /not valid Gherkin/);
});

test("reports entry points that no scenario covers", () => {
  const inventory = JSON.stringify({
    entries: [
      { kind: "http-route", method: "POST", name: "/refund", file: "src/Orders.java", line: 15 },
      { kind: "http-route", method: "GET", name: "/orders", file: "src/Orders.java", line: 70 },
    ],
  });
  const files = {
    "drafts/discovery/inventory.json": inventory,
    "drafts/legacy/orders.feature": feature(scenario("@evidence:src/Orders.java:16-24")),
  };
  const result = check(files);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /Entry points covered: 1 of 2/);
  assert.match(result.stdout, /GET \/orders/);
  assert.doesNotMatch(result.stdout, /POST \/refund.*src\/Orders.java:15.*http-route/);
  const strict = check(files, ["--require-coverage"]);
  assert.equal(strict.status, 1, strict.stdout);
});

test("does nothing when there are no draft features", () => {
  const result = check({});
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /no feature files/);
});
