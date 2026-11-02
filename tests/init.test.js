import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "cli", "touchstone.js");

function runInit(args) {
  return spawnSync("node", [cli, "init", ...args], { encoding: "utf8" });
}

test("creates the acceptance layout", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-init-"));
  try {
    const result = runInit(["--dir", root]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.throws(() => readFileSync(join(root, "ci", "check-trace.js")));
    const config = JSON.parse(readFileSync(join(root, "touchstone.json"), "utf8"));
    assert.equal(config.mutation.mode, "warn");
    assert.deepEqual(Object.keys(config.gates).sort(), ["acceptance", "red", "unit"]);
    assert.match(readFileSync(join(root, ".github", "workflows", "acceptance-guard.yml"), "utf8"), /wosslabs\/touchstone@v0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("imports existing features as drafts", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-init-"));
  try {
    const features = join(root, "existing");
    mkdirSync(features);
    writeFileSync(join(features, "pay.feature"), "Feature: Pay\n\n  Scenario: Declined card\n    Given the bank declines the card\n");
    const app = join(root, "app");
    const result = runInit(["--dir", app, "--features", features]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(join(app, "features", "pay.feature"), "utf8"), /Declined card/);
    assert.match(readFileSync(join(app, "drafts", "imported", "pay.feature"), "utf8"), /Declined card/);
    assert.throws(() => readFileSync(join(app, "stories", "pay.feature")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not overwrite an approved workflow", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-init-"));
  try {
    const workflow = join(root, ".github", "workflows", "acceptance-guard.yml");
    mkdirSync(dirname(workflow), { recursive: true });
    writeFileSync(workflow, "name: kept\n");
    const result = runInit(["--dir", root]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(workflow, "utf8"), "name: kept\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("check runs the trace from the package", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-init-"));
  try {
    const result = spawnSync("node", [cli, "check", "--repo", root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no approved scenarios/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
