#!/usr/bin/env node
// Drives real agent sessions against a fixture and checks what they changed.
// Costs money and is not deterministic: run it on purpose, not in `npm test`.
//   node evals/run.js [--case name] [--budget 1.00] [--dry]
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { changes, evaluate, snapshot } from "./checks.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

function prepare(testCase) {
  const work = mkdtempSync(join(tmpdir(), `touchstone-eval-${testCase.name}-`));
  cpSync(join(packageRoot, testCase.fixture), work, {
    recursive: true,
    filter: (source) => !source.includes("node_modules") && !source.includes("__pycache__"),
  });
  for (const [relative, content] of Object.entries(testCase.files || {})) {
    mkdirSync(dirname(join(work, relative)), { recursive: true });
    writeFileSync(join(work, relative), content);
  }
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: work });
  execFileSync("git", ["add", "-A"], { cwd: work });
  execFileSync("git", ["-c", "user.email=eval@example.com", "-c", "user.name=Eval", "commit", "-q", "-m", "fixture"], { cwd: work });
  return work;
}

function command(testCase, budget) {
  return [
    "-p", testCase.prompt,
    "--plugin-dir", packageRoot,
    "--permission-mode", "acceptEdits",
    "--output-format", "stream-json",
    "--verbose",
    "--max-budget-usd", budget,
  ];
}

function main() {
  const only = option("--case");
  const budget = option("--budget", "1.00");
  const dry = process.argv.includes("--dry");
  const casesDir = join(packageRoot, "evals", "cases");
  const cases = readdirSync(casesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(casesDir, name), "utf8")))
    .filter((testCase) => !only || testCase.name === only);
  if (cases.length === 0) {
    console.error(`no eval case matches "${only}"`);
    return 1;
  }
  const results = join(packageRoot, "evals", "results");
  mkdirSync(results, { recursive: true });
  let failed = 0;
  for (const testCase of cases) {
    const work = prepare(testCase);
    if (dry) {
      console.log(`${testCase.name}: claude ${command(testCase, budget).map((part) => JSON.stringify(part)).join(" ")}`);
      rmSync(work, { recursive: true, force: true });
      continue;
    }
    const before = snapshot(work);
    const started = Date.now();
    const run = spawnSync("claude", command(testCase, budget), { cwd: work, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const transcript = run.stdout || "";
    const failures = run.error ? [`could not run claude: ${run.error.message}`] : evaluate(testCase.expect, changes(before, snapshot(work)), transcript);
    writeFileSync(join(results, `${testCase.name}.jsonl`), transcript);
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`${failures.length ? "FAIL" : "PASS"} ${testCase.name} (${seconds}s)`);
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    failed += failures.length ? 1 : 0;
    if (!failures.length && existsSync(work)) {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return failed ? 1 : 0;
}

process.exit(main());
