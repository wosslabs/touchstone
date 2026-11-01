import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "check-acceptance-guard.js");
const example = `Scenario: Declined card
Given the bank declines the card
When the customer confirms payment
Then the customer sees "payment failed"
And the customer is not charged
`;

function git(repo, args) {
  execFileSync("git", ["-c", "user.email=touchstone@example.com", "-c", "user.name=Touchstone Test", ...args], {
    cwd: repo,
    stdio: "pipe",
  });
}

function commitFile(repo, relative, content, message) {
  const path = join(repo, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  git(repo, ["add", relative]);
  git(repo, ["commit", "-m", message]);
}

function runGuard(repo, extra = []) {
  return spawnSync("node", [script, "--repo", repo, ...extra], { cwd: repo, encoding: "utf8" });
}

function repoWithExample() {
  const repo = mkdtempSync(join(tmpdir(), "touchstone-guard-"));
  git(repo, ["init", "-b", "main"]);
  commitFile(repo, "stories/pay.md", example, "approve the declined-card sentence");
  return repo;
}

test("passes when sentences stay", () => {
  const repo = repoWithExample();
  try {
    commitFile(repo, "src/Pay.java", "class Pay {}\n", "add code");
    const result = runGuard(repo, ["--base", "HEAD~1"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("fails when a sentence is removed", () => {
  const repo = repoWithExample();
  try {
    const shortened = example.split("\n").filter((line) => !line.startsWith("And ")).join("\n");
    commitFile(repo, "stories/pay.md", `${shortened}\n`, "drop the charge sentence");
    const result = runGuard(repo, ["--base", "HEAD~1"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /dropped/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a person can allow a drop", () => {
  const repo = repoWithExample();
  try {
    const shortened = example.split("\n").filter((line) => !line.startsWith("And ")).join("\n");
    commitFile(
      repo,
      "stories/pay.md",
      `${shortened}\nTouchstone-Allow-Drop: the charge sentence moved to another story\n`,
      "retire the charge sentence",
    );
    const result = runGuard(repo, ["--base", "HEAD~1"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("fails when a test is disabled", () => {
  const repo = repoWithExample();
  try {
    commitFile(repo, "src/PayTest.java", "@Disabled\nclass PayTest {}\n", "switch a test off");
    const result = runGuard(repo, ["--base", "HEAD~1"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /@Disabled/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a missing base fails", () => {
  const repo = repoWithExample();
  try {
    const result = runGuard(repo, ["--base", "does-not-exist"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /not found/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("fails when a sentence is reworded", () => {
  const repo = repoWithExample();
  try {
    commitFile(repo, "stories/pay.md", example.replace("is not charged", "sees a message"), "reword the charge sentence");
    const result = runGuard(repo, ["--base", "HEAD~1"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /the customer is not charged/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("fails when a test is focused", () => {
  const repo = repoWithExample();
  try {
    commitFile(repo, "src/pay.test.js", "test.only('pays', () => {})\n", "focus a test");
    const result = runGuard(repo, ["--base", "HEAD~1"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /test\.only/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("fails when a build file keeps going after test failures", () => {
  for (const [path, line] of [
    ["pom.xml", "<testFailureIgnore>true</testFailureIgnore>"],
    ["pom.xml", "<skipTests>true</skipTests>"],
    ["build.gradle", "test { ignoreFailures = true }"],
    [".github/workflows/ci.yml", "    continue-on-error: true"],
  ]) {
    const repo = repoWithExample();
    try {
      commitFile(repo, path, `${line}\n`, "weaken the build");
      const result = runGuard(repo, ["--base", "HEAD~1"]);
      assert.equal(result.status, 1, `${path}: ${result.stdout}${result.stderr}`);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

test("allows a property-driven skip switch", () => {
  const repo = repoWithExample();
  try {
    commitFile(repo, "pom.xml", "<skipTests>${skipUnitTests}</skipTests>\n", "add a switch");
    const result = runGuard(repo, ["--base", "HEAD~1"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("an application's tests folder is not exempt from the skip check", () => {
  const repo = repoWithExample();
  try {
    commitFile(repo, "tests/pay.test.js", "test.only('pays', () => {})\n", "focus a test");
    const result = runGuard(repo, ["--base", "HEAD~1"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
