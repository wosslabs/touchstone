import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { outputsFor } from "../ci/action-config.js";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "action-config.js");

const config = {
  gates: {
    acceptance: "npx cucumber-js --strict",
    red: { command: 'npx cucumber-js --name "$TOUCHSTONE_SCENARIO"', setup: "npm ci --ignore-scripts" },
    unit: "npm test",
    lint: "npm run lint",
  },
  quality: ["unit", "lint"],
  protect: ["quality/**", "scripts/ci/**"],
  mutation: { mode: "fail", maxMutants: 12 },
};

function git(repo, args) {
  execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=T", ...args], { cwd: repo, stdio: "pipe" });
}

test("the config becomes the Action's outputs", () => {
  assert.deepEqual(outputsFor(config), {
    command: "npx cucumber-js --strict",
    red_command: 'npx cucumber-js --name "$TOUCHSTONE_SCENARIO"',
    setup: "npm ci --ignore-scripts",
    mutate_mode: "fail",
    mutate_max: "12",
    quality: "unit\nlint",
    protect: "quality/**\nscripts/ci/**",
  });
  assert.equal(outputsFor({}).command, "");
});

test("outputs are written in the multi-line format GitHub expects, from the base commit", () => {
  const repo = mkdtempSync(join(tmpdir(), "touchstone-action-config-"));
  try {
    git(repo, ["init", "-q", "-b", "main"]);
    writeFileSync(join(repo, "touchstone.json"), JSON.stringify(config));
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-qm", "base"]);
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    writeFileSync(join(repo, "touchstone.json"), JSON.stringify({ gates: { acceptance: "true" }, mutation: { mode: "off" } }));
    git(repo, ["commit", "-qam", "loosen"]);
    const output = join(repo, "github-output.txt");
    const result = spawnSync("node", [script, "--repo", repo, "--base", base], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: output } });
    assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(output, "utf8");
    assert.match(text, /^command<<touchstone_[0-9a-f]{16}\nnpx cucumber-js --strict\ntouchstone_[0-9a-f]{16}\n/m);
    assert.match(text, /mutate_mode<<touchstone_[0-9a-f]{16}\nfail\n/);
    assert.match(text, /quality<<touchstone_[0-9a-f]{16}\nunit\nlint\n/);
    assert.doesNotMatch(text, /^command<<[^\n]*\ntrue\n/m, "the loosened config in the pull request is ignored");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a repository with no config gives empty outputs and success", () => {
  const repo = mkdtempSync(join(tmpdir(), "touchstone-action-config-"));
  try {
    git(repo, ["init", "-q", "-b", "main"]);
    const result = spawnSync("node", [script, "--repo", repo], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /none, using the workflow inputs/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a broken config fails loudly", () => {
  const repo = mkdtempSync(join(tmpdir(), "touchstone-action-config-"));
  try {
    git(repo, ["init", "-q", "-b", "main"]);
    writeFileSync(join(repo, "touchstone.json"), JSON.stringify({ quality: ["missing"] }));
    const result = spawnSync("node", [script, "--repo", repo], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown gate/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
