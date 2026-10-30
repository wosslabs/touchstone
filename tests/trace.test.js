import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "check-trace.js");
const example = `# Add a task

Scenario: Add the first task
Given the list has no tasks
When the person types "Buy milk" and presses Add
Then the words "Buy milk" appear on the list
`;
const feature = `Feature: Add a task

  Scenario: Add the first task
    Given the list has no tasks
    When the person types "Buy milk" and presses Add
    Then the words "Buy milk" appear on the list
`;

function write(root, relative, text) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function runTrace(root) {
  return spawnSync("node", [script, "--repo", root], { encoding: "utf8" });
}

test("links the example to the feature", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-trace-"));
  try {
    write(root, "stories/add-a-task.md", example);
    write(root, "features/add-a-task.feature", feature);
    const result = runTrace(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /stories\/add-a-task.md/);
    assert.match(result.stdout, /features\/add-a-task.feature/);
    assert.match(result.stdout, /Add the first task/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when the scenario was not made executable", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-trace-"));
  try {
    write(root, "stories/add-a-task.md", example);
    const result = runTrace(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /no Cucumber scenario/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when the feature has no approved example", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-trace-"));
  try {
    write(root, "features/add-a-task.feature", feature);
    const result = runTrace(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /no approved story/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when the words differ", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-trace-"));
  try {
    write(root, "stories/add-a-task.md", example);
    write(root, "features/add-a-task.feature", feature.replace("Buy milk", "Buy bread"));
    const result = runTrace(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /steps differ/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("links each step to its definition", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-trace-"));
  try {
    write(root, "stories/add-a-task.md", example);
    write(root, "features/add-a-task.feature", feature);
    write(root, "features/steps.js", [
      'Given("the list has no tasks", async function () {})',
      'When("the person types {string} and presses Add", async function () {})',
      'Then("the words {string} appear on the list", async function () {})',
      "",
    ].join("\n"));
    const result = runTrace(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /definition: features\/steps.js/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when a step has no definition", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-trace-"));
  try {
    write(root, "stories/add-a-task.md", example);
    write(root, "features/add-a-task.feature", feature);
    write(root, "features/steps.js", 'Given("something else", async function () {})\n');
    const result = runTrace(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /no definition/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts a feature file as the approved sentence", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-trace-"));
  try {
    write(root, "stories/add-a-task.feature", feature);
    write(root, "features/add-a-task.feature", feature);
    const result = runTrace(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /stories\/add-a-task.feature/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("passes when there are no sentences yet", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-trace-"));
  try {
    const result = runTrace(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no approved scenarios/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
