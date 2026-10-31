import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "check-red-green.js");
const feature = `Feature: Pay

  Scenario: Declined card
    Given the bank declines the card
    Then the customer is not charged
`;

function git(repo, args) {
  execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=T", ...args], { cwd: repo, stdio: "pipe" });
}

function commitFile(repo, relative, content, message) {
  const path = join(repo, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  git(repo, ["add", relative]);
  git(repo, ["commit", "-m", message]);
}

function repoWithBase() {
  const repo = mkdtempSync(join(tmpdir(), "touchstone-red-test-"));
  git(repo, ["init", "-b", "main"]);
  commitFile(repo, "README.md", "base\n", "base");
  return repo;
}

function runRed(repo, command) {
  return spawnSync("node", [script, "--repo", repo, "--base", "HEAD~1", "--command", command, "--any-failure"], { cwd: repo, encoding: "utf8" });
}

test("passes when the new scenario fails before the code exists", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "done.txt", "built\n", "build the behavior");
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    git(repo, ["reset", "--soft", "HEAD~2"]);
    git(repo, ["commit", "-m", "scenario and code together"]);
    const result = runRed(repo, "test -f done.txt");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /red check passed/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("fails when the new scenario already passes on the base code", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    const result = runRed(repo, "true");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Declined card/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("skips when no scenario changed", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "src/a.txt", "x\n", "code only");
    const result = runRed(repo, "false");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no new or changed scenarios/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("passes the scenario title to the command", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    const result = runRed(repo, 'test "$TOUCHSTONE_SCENARIO" != "^Declined card$"');
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("puts the pull request scenarios on the base checkout even without a stories folder", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    const result = runRed(repo, "test -f features/pay.feature");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /passed against the base production code/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

function messages(...statuses) {
  const lines = [
    { pickle: { id: "p", steps: [{ id: "g", type: "Context" }, { id: "t", type: "Outcome" }] } },
    { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "tg", pickleStepId: "g" }, { id: "tt", pickleStepId: "t" }] } },
    { testStepFinished: { testStepId: "tg", testStepResult: { status: statuses[0] } } },
    { testStepFinished: { testStepId: "tt", testStepResult: { status: statuses[1] } } },
  ];
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

function runClassified(repo, statuses) {
  const body = messages(...statuses).replaceAll("'", "'\\''");
  const command = `printf '%s\\n' '${body}' > "$TOUCHSTONE_MESSAGES"; false`;
  return spawnSync("node", [script, "--repo", repo, "--base", "HEAD~1", "--command", command], { cwd: repo, encoding: "utf8" });
}

test("accepts a failure at a Then step as red", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    const result = runClassified(repo, ["PASSED", "FAILED"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("rejects an undefined step as red", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    const result = runClassified(repo, ["PASSED", "UNDEFINED"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /undefined/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("rejects a failing Given as red", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    const result = runClassified(repo, ["FAILED", "SKIPPED"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Given, When, or hook/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("rejects a failing command that wrote no messages", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    const result = spawnSync("node", [script, "--repo", repo, "--base", "HEAD~1", "--command", "false"], { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /wrote no Cucumber messages/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
