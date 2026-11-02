import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { applyMutant, bumpNumber, mutateValue, sample, tokensIn } from "../ci/mutate-gherkin.js";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "mutate-gherkin.js");

const feature = `Feature: Pay

  Scenario Outline: Orders over 100 get 10% off
    When "alice" orders one item at <price>
    Then the discount is <discount>

    Examples:
      | price  | discount |
      | 101.00 | 10.10    |
`;

// A fake runner. It passes only when the price and the discount are the right
// numbers, and it ignores the customer's name, so "alice" is a survivor.
const runner = `
const fs = require("node:fs");
const text = fs.readFileSync("features/pay.feature", "utf8");
const row = /\\|\\s*([\\d.]+)\\s*\\|\\s*([\\d.]+)\\s*\\|\\s*$/m.exec(text);
const ok = row && row[1] === "101.00" && row[2] === "10.10";
if (process.env.REPORT && row && row[1] === "101.01") {
  fs.writeFileSync(process.env.TOUCHSTONE_MESSAGES, JSON.stringify([{ elements: [{ type: "scenario", name: process.env.TOUCHSTONE_SCENARIO_TITLE, steps: [{ keyword: "When ", result: { status: "undefined" } }] }] }]));
  process.exit(1);
}
process.exit(ok ? 0 : 1);
`;

function git(repo, args) {
  execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=T", ...args], { cwd: repo, stdio: "pipe" });
}

function write(repo, path, text) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function workspace(files = {}) {
  const repo = mkdtempSync(join(tmpdir(), "touchstone-mutate-"));
  git(repo, ["init", "-q", "-b", "main"]);
  write(repo, "runner.js", runner);
  write(repo, "features/pay.feature", feature);
  for (const [path, text] of Object.entries(files)) {
    write(repo, path, text);
  }
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "base"]);
  return repo;
}

function mutate(repo, ...args) {
  return spawnSync("node", [script, "--repo", repo, "--command", "node runner.js", ...args], { encoding: "utf8", env: { ...process.env, REPORT: "" } });
}

test("a number goes up by one unit of its last digit", () => {
  assert.equal(bumpNumber("100.00"), "100.01");
  assert.equal(bumpNumber("20"), "21");
  assert.equal(bumpNumber("-1"), "0");
  assert.equal(bumpNumber("9.99"), "10.00");
  assert.equal(bumpNumber("-0.05"), "-0.04");
  assert.equal(bumpNumber("0.10"), "0.11");
});

test("values change by their kind", () => {
  assert.equal(mutateValue("42"), "43");
  assert.equal(mutateValue("bob"), "bobx");
  assert.equal(mutateValue("true"), "false");
  assert.equal(mutateValue("False"), "True");
  assert.equal(mutateValue("  "), null);
});

test("tokens come from quoted strings and bare numbers, not placeholders or numbers inside quotes", () => {
  const values = tokensIn('"alice" orders 3 at 12.50 for <price> and "a 5" with abc12 and 7th').map((token) => token.value);
  assert.deepEqual(values, ["alice", "3", "12.50", "a 5"]);
});

test("a mutant is applied at the right place and refuses a stale position", () => {
  const text = "a 10 b\nc 10 d";
  assert.equal(applyMutant(text, { line: 2, column: 2, original: "10", changed: "11" }), "a 10 b\nc 11 d");
  assert.throws(() => applyMutant(text, { line: 1, column: 0, original: "10", changed: "11" }), /no longer has/);
});

test("a long list of mutants is sampled evenly", () => {
  const all = Array.from({ length: 100 }, (_, index) => index);
  const picked = sample(all, 5);
  assert.deepEqual(picked, [0, 20, 40, 60, 80]);
  assert.equal(sample(all, 500).length, 100);
});

test("reports a value nothing checks as a survivor and exits 0 in warn mode", () => {
  const repo = workspace();
  try {
    const result = mutate(repo, "--all");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /3 mutants: 2 killed, 1 survived/);
    assert.match(result.stdout, /"alice" -> "alicex"/);
    assert.match(result.stdout, /features\/pay\.feature:4:/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("fail mode exits 1 on a survivor", () => {
  const repo = workspace();
  try {
    assert.equal(mutate(repo, "--all", "--mode", "fail").status, 1);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a person can accept a survivor in stories/", () => {
  const repo = workspace({ "stories/pay.md": "# Pay\n\n# touchstone-equivalent: Orders over 100 get 10% off | alice | the name is only shown on the receipt\n" });
  try {
    const result = mutate(repo, "--all", "--mode", "fail");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /1 accepted as equivalent/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the feature file is exactly as it was afterwards, with no backup left behind", () => {
  const repo = workspace();
  try {
    mutate(repo, "--all");
    assert.equal(readFileSync(join(repo, "features", "pay.feature"), "utf8"), feature);
    assert.deepEqual(readdirSync(join(repo, "features")), ["pay.feature"]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a file left mutated by an interrupted run is restored first", () => {
  const repo = workspace();
  try {
    writeFileSync(join(repo, "features", "pay.feature"), feature.replace("101.00", "999.00"));
    writeFileSync(join(repo, "features", "pay.feature.touchstone-orig"), feature);
    const result = mutate(repo, "--all");
    assert.match(result.stdout, /restored .*pay\.feature from an interrupted run/);
    assert.match(result.stdout, /3 mutants/);
    assert.equal(existsSync(join(repo, "features", "pay.feature.touchstone-orig")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a scenario that fails or flakes without a mutation is not mutated", () => {
  const repo = workspace({ "features/pay.feature": feature.replace("10.10", "99.99") });
  try {
    const result = mutate(repo, "--all", "--mode", "fail");
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /not mutated, the unmutated scenario fails/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("with --base only changed scenarios are mutated", () => {
  const repo = workspace();
  try {
    assert.match(mutate(repo, "--base", "HEAD").stdout, /no new or changed scenarios/);
    write(repo, "features/pay.feature", feature.replace("10% off", "ten percent off"));
    git(repo, ["commit", "-qam", "rename the scenario"]);
    const result = mutate(repo, "--base", "HEAD~1");
    assert.match(result.stdout, /1 scenarios, 3 mutants/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("when step definitions changed, every scenario is mutated even if no scenario did", () => {
  const second = feature.replace("Orders over 100 get 10% off", "Another rule");
  const repo = workspace({ "features/other.feature": second.replace("Feature: Pay", "Feature: Other") });
  try {
    write(repo, "features/steps.js", "// changed driver\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-qm", "change a driver"]);
    const result = mutate(repo, "--base", "HEAD~1");
    assert.match(result.stdout, /step definitions changed \(features\/steps\.js\), so every scenario is mutated/);
    assert.match(result.stdout, /2 scenarios/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a mutant that only breaks the run is invalid, not killed", () => {
  const repo = workspace();
  try {
    const result = spawnSync("node", [script, "--repo", repo, "--command", "node runner.js", "--all"], { encoding: "utf8", env: { ...process.env, REPORT: "1" } });
    assert.match(result.stdout, /1 invalid/);
    assert.doesNotMatch(result.stdout, /3 killed/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("--max-mutants limits the work per scenario and says so", () => {
  const repo = workspace();
  try {
    const result = mutate(repo, "--all", "--max-mutants", "2");
    assert.match(result.stdout, /2 mutants/);
    assert.match(result.stdout, /tried 2 of 3 mutants/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("mode off and a missing command do nothing", () => {
  const repo = workspace();
  try {
    assert.match(mutate(repo, "--all", "--mode", "off").stdout, /mode is off/);
    const noCommand = spawnSync("node", [script, "--repo", repo, "--all"], { encoding: "utf8" });
    assert.match(noCommand.stdout, /no command configured/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the mode and cap come from the protected config at the base commit", () => {
  const repo = workspace({ "touchstone.json": JSON.stringify({ gates: { unit: "true" }, mutation: { mode: "fail", maxMutants: 2 } }) });
  try {
    write(repo, "touchstone.json", JSON.stringify({ gates: { unit: "true" }, mutation: { mode: "off" } }));
    git(repo, ["commit", "-qam", "turn mutation off"]);
    write(repo, "features/pay.feature", feature.replace("10% off", "ten percent off"));
    git(repo, ["commit", "-qam", "rename the scenario"]);
    const result = mutate(repo, "--base", "HEAD~2");
    assert.equal(result.status, 1, "the base commit says fail, the pull request cannot turn it off");
    assert.match(result.stdout, /tried 2 of 3/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
