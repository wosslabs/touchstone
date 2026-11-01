#!/usr/bin/env node
// Drives real agent sessions against a fixture and checks what they changed.
// Costs money and is not deterministic: run it on purpose, not in `npm test`.
//   node evals/run.js [--case name] [--runs 5] [--budget 1.00] [--permission-mode acceptEdits] [--dry]
// One run is an anecdote. Use --runs to get a pass rate per case.
// acceptEdits does not auto-approve shell commands in headless mode, so Claude Code
// permissions can block a shortcut before Touchstone sees it. To measure the skills
// and hook alone, run in a disposable sandbox with --permission-mode bypassPermissions.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, symlinkSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { changes, evaluate, snapshot } from "./checks.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

const cli = join(packageRoot, "cli", "touchstone.js");
const fill = (text) => text.replaceAll("{{touchstone}}", `node ${cli}`);

function prepare(testCase) {
  const work = mkdtempSync(join(tmpdir(), `touchstone-eval-${testCase.name}-`));
  cpSync(join(packageRoot, testCase.fixture), work, {
    recursive: true,
    filter: (source) => {
      const relative = source.slice(join(packageRoot, testCase.fixture).length).replace(/^\//, "");
      return !source.includes("node_modules") && !source.includes("__pycache__") && !(testCase.exclude || []).some((path) => relative === path || relative.startsWith(`${path}/`));
    },
  });
  const modules = join(packageRoot, testCase.fixture, "node_modules");
  if (existsSync(modules)) {
    symlinkSync(modules, join(work, "node_modules"));
  }
  for (const [relative, content] of Object.entries(testCase.files || {})) {
    mkdirSync(dirname(join(work, relative)), { recursive: true });
    writeFileSync(join(work, relative), content);
  }
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: work });
  execFileSync("git", ["add", "-A"], { cwd: work });
  execFileSync("git", ["-c", "user.email=eval@example.com", "-c", "user.name=Eval", "commit", "-q", "-m", "fixture"], { cwd: work });
  return work;
}

function command(testCase, budget, mode) {
  return [
    "-p", fill(testCase.prompt),
    "--plugin-dir", packageRoot,
    "--permission-mode", mode,
    "--output-format", "stream-json",
    "--verbose",
    "--max-budget-usd", budget,
  ];
}

function main() {
  const only = option("--case");
  const budget = option("--budget", "1.00");
  const mode = option("--permission-mode", "acceptEdits");
  const runs = Math.max(1, Number.parseInt(option("--runs", "1"), 10) || 1);
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
    if (dry) {
      console.log(`${testCase.name}: claude ${command(testCase, budget, mode).map((part) => JSON.stringify(part)).join(" ")}`);
      continue;
    }
    let passed = 0;
    const reasons = [];
    for (let run = 1; run <= runs; run += 1) {
      const work = prepare(testCase);
      const before = snapshot(work);
      const result = spawnSync("claude", command(testCase, budget, mode), { cwd: work, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const transcript = result.stdout || "";
      const failures = result.error
        ? [`could not run claude: ${result.error.message}`]
        : evaluate(testCase.expect, changes(before, snapshot(work)), transcript);
      // Commands that must succeed once the session is over, for example the
      // evidence check and the run of the scenarios the agent wrote.
      for (const check of result.error ? [] : testCase.expect.commands || []) {
        const outcome = spawnSync(fill(check.run), { cwd: work, shell: true, encoding: "utf8" });
        if (outcome.status !== 0) {
          failures.push(`${check.name} failed: ${`${outcome.stdout}${outcome.stderr}`.trim().split("\n").slice(-3).join(" | ")}`);
        }
      }
      writeFileSync(join(results, `${testCase.name}-${run}.jsonl`), transcript);
      if (failures.length) {
        reasons.push(`run ${run}: ${failures.join("; ")}`);
      } else {
        passed += 1;
        rmSync(work, { recursive: true, force: true });
      }
    }
    console.log(`${passed === runs ? "PASS" : "FAIL"} ${testCase.name}: ${passed}/${runs} runs (${mode})`);
    for (const reason of reasons) {
      console.log(`  - ${reason}`);
    }
    failed += passed === runs ? 0 : 1;
  }
  return failed ? 1 : 0;
}

process.exit(main());
