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
  return spawnSync("node", [script, "--repo", repo, "--base", "HEAD~1", "--command", command], { cwd: repo, encoding: "utf8" });
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
