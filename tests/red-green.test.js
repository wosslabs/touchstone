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

function messages(...entries) {
  const [given, when, then] = entries.map((entry) => (Array.isArray(entry) ? entry : [entry, ""]));
  const finished = (id, [status, text]) => ({
    testStepFinished: { testStepId: id, testStepResult: { status, ...(text ? { message: text } : {}) } },
  });
  const lines = [
    { pickle: { id: "p", name: "Declined card", steps: [{ id: "g", type: "Context" }, { id: "w", type: "Action" }, { id: "t", type: "Outcome" }] } },
    {
      testCase: {
        id: "c",
        pickleId: "p",
        testSteps: [{ id: "tg", pickleStepId: "g" }, { id: "tw", pickleStepId: "w" }, { id: "tt", pickleStepId: "t" }],
      },
    },
    finished("tg", given),
    finished("tw", when),
    finished("tt", then),
  ];
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

// The pull request adds the scenario and done.txt (the production change).
// The command writes the given messages, then succeeds only where done.txt exists.
function runClassified(entries, extra = []) {
  const repo = repoWithBase();
  try {
    writeFileSync(join(repo, "done.txt"), "built\n");
    commitFile(repo, "features/pay.feature", feature, "scenario and production change");
    git(repo, ["add", "done.txt"]);
    git(repo, ["commit", "--amend", "--no-edit"]);
    const body = messages(...entries).replaceAll("'", "'\\''");
    const command = `printf '%s\\n' '${body}' > "$TOUCHSTONE_MESSAGES"; test -f done.txt`;
    return spawnSync("node", [script, "--repo", repo, "--base", "HEAD~1", "--command", command, ...extra], { cwd: repo, encoding: "utf8" });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

test("accepts an assertion failure at a Then step as red", () => {
  const result = runClassified(["PASSED", "PASSED", ["FAILED", "AssertionError: Expected the words B on the list"]]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /must pass against the pull request code/);
});

test("accepts a 404 or missing element at a When step as red", () => {
  for (const text of ["AssertionError: expected 404 to equal 201", "Error: locator.click: Timeout 5000ms exceeded waiting for getByRole('button', { name: 'Done' })"]) {
    const result = runClassified(["PASSED", ["FAILED", text], "SKIPPED"]);
    assert.equal(result.status, 0, text + result.stdout + result.stderr);
  }
});

test("rejects programming and environment errors as red", () => {
  for (const text of ["TypeError: x is not a function", "ReferenceError: page is not defined", "java.lang.NoSuchMethodError: Foo.bar", "Error: connect ECONNREFUSED 127.0.0.1:8765"]) {
    const result = runClassified(["PASSED", ["FAILED", text], "SKIPPED"]);
    assert.equal(result.status, 1, text + result.stdout);
    assert.match(result.stdout, /programming or environment error/);
  }
});

test("rejects an undefined step as red", () => {
  const result = runClassified(["PASSED", "PASSED", "UNDEFINED"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /undefined/);
});

test("rejects a failing Given as red", () => {
  const result = runClassified([["FAILED", "AssertionError: setup"], "SKIPPED", "SKIPPED"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Given or hook/);
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

test("rejects a scenario that fails against the pull request code too", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    const body = messages("PASSED", "PASSED", ["FAILED", "AssertionError: nope"]).replaceAll("'", "'\\''");
    const command = `printf '%s\\n' '${body}' > "$TOUCHSTONE_MESSAGES"; false`;
    const result = spawnSync("node", [script, "--repo", repo, "--base", "HEAD~1", "--command", command], { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /never went green/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("copies extra overlay paths", () => {
  const repo = repoWithBase();
  try {
    commitFile(repo, "acceptance/steps.txt", "steps\n", "add steps");
    commitFile(repo, "features/pay.feature", feature, "add the scenario");
    git(repo, ["reset", "--soft", "HEAD~2"]);
    git(repo, ["commit", "-m", "both"]);
    const result = spawnSync(
      "node",
      [script, "--repo", repo, "--base", "HEAD~1", "--command", "test -f acceptance/steps.txt", "--any-failure", "--overlay", "acceptance"],
      { cwd: repo, encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /passed against the base production code/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// Reports from runners that write Cucumber JSON (godog, behave, cucumber-rs).
function report(...scenarios) {
  return JSON.stringify([{ name: "Pay", elements: scenarios }]);
}

function scenarioOf(name, steps) {
  return {
    type: "scenario",
    name,
    steps: steps.map(([keyword, status, error]) => ({
      keyword: `${keyword} `,
      name: "x",
      result: { status, ...(error ? { error_message: error } : {}) },
    })),
  };
}

function runReport(json, extra = []) {
  const repo = repoWithBase();
  try {
    writeFileSync(join(repo, "done.txt"), "built\n");
    commitFile(repo, "features/pay.feature", feature, "scenario and production change");
    git(repo, ["add", "done.txt"]);
    git(repo, ["commit", "--amend", "--no-edit"]);
    const body = json.replaceAll("'", "'\\''");
    const command = `printf '%s' '${body}' > "$TOUCHSTONE_MESSAGES"; test -f done.txt`;
    return spawnSync("node", [script, "--repo", repo, "--base", "HEAD~1", "--command", command, ...extra], { cwd: repo, encoding: "utf8" });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

test("reads a Cucumber JSON report: an assertion failure at a Then is red", () => {
  const result = runReport(report(scenarioOf("Declined card", [["Given", "passed"], ["When", "passed"], ["Then", "failed", "expected 1 to equal 2"]])));
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("reads a Cucumber JSON report: a programming error is not red", () => {
  const result = runReport(report(scenarioOf("Declined card", [["Given", "passed"], ["When", "failed", "TypeError: x is not a function"], ["Then", "skipped"]])));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /programming or environment error/);
});

test("reads a Cucumber JSON report: a failing And after a Given is a setup error", () => {
  const result = runReport(report(scenarioOf("Declined card", [["Given", "passed"], ["And", "failed", "boom"], ["When", "skipped"], ["Then", "skipped"]])));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Given or hook/);
});

test("reads a behave JSON report with step_type and error lines", () => {
  const behave = JSON.stringify([
    {
      elements: [
        {
          type: "scenario",
          name: "Declined card",
          steps: [
            { keyword: "Given", step_type: "given", result: { status: "passed" } },
            { keyword: "When", step_type: "when", result: { status: "failed", error_message: ["Assertion Failed: expected 404 to equal 201", "Traceback"] } },
            { keyword: "Then", step_type: "then", result: { status: "skipped" } },
          ],
        },
      ],
    },
  ]);
  assert.equal(runReport(behave).status, 0);
});

test("an undefined step in a JSON report is not red", () => {
  const result = runReport(report(scenarioOf("Declined card", [["Given", "passed"], ["When", "undefined"], ["Then", "skipped"]])));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /undefined/);
});

test("a report with no matching scenario is not red", () => {
  const result = runReport(report(scenarioOf("Some other scenario", [["Given", "passed"], ["Then", "failed", "x"]])));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /no scenario with this title ran/);
});

test("batch mode runs every changed scenario once and attributes failures", () => {
  const twoScenarios = `Feature: Pay

  Scenario: Declined card
    Given the bank declines the card
    Then the customer is not charged

  Scenario: Expired card
    Given the card expired
    Then the customer is not charged
`;
  const run = (secondStatus) => {
    const repo = repoWithBase();
    try {
      writeFileSync(join(repo, "done.txt"), "built\n");
      commitFile(repo, "features/pay.feature", twoScenarios, "scenarios and production change");
      git(repo, ["add", "done.txt"]);
      git(repo, ["commit", "--amend", "--no-edit"]);
      const json = report(
        scenarioOf("Declined card", [["Given", "passed"], ["Then", "failed", "expected a"]]),
        scenarioOf("Expired card", [["Given", "passed"], ["Then", secondStatus, "expected b"]]),
      ).replaceAll("'", "'\\''");
      const counter = join(repo, "runs.txt");
      const command = `echo run >> "${counter}"; printf '%s' '${json}' > "$TOUCHSTONE_MESSAGES"; test -f done.txt`;
      const result = spawnSync("node", [script, "--repo", repo, "--base", "HEAD~1", "--command", command, "--batch"], { cwd: repo, encoding: "utf8" });
      const runs = spawnSync("wc", ["-l", counter], { encoding: "utf8" }).stdout.trim().split(/\s+/)[0];
      return { result, runs };
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  };
  const good = run("failed");
  assert.equal(good.result.status, 0, good.result.stdout);
  assert.equal(good.runs, "2", "one run at the base, one with the pull request code");
  const bad = run("passed");
  assert.equal(bad.result.status, 1, bad.result.stdout);
  assert.match(bad.result.stdout, /Expired card: no step failed/);
  assert.doesNotMatch(bad.result.stdout, /Declined card: /);
});
