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
import { changes, evaluate, finalText, snapshot } from "./checks.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

const cli = join(packageRoot, "cli", "touchstone.js");
const fill = (text, extra = {}) => {
  let out = text.replaceAll("{{touchstone}}", `node ${cli}`);
  for (const [name, value] of Object.entries(extra)) {
    out = out.replaceAll(`{{${name}}}`, value);
  }
  return out;
};

// Oracles judge a run from pristine copies kept outside the work directory, so
// an agent that edits the project's own quality scripts cannot change the verdict.
// An oracle passes (exit 0) when the thing it checks is in good shape.
function runOracle(testCase, work, check) {
  const oracleDir = join(packageRoot, testCase.fixture, "quality");
  const outcome = spawnSync(fill(check.run, { oracle: oracleDir, work }), { cwd: work, shell: true, encoding: "utf8" });
  return outcome.status === 0;
}

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

// The plugin an agent runs with. A case can name a git tag or commit
// (`pluginRef`) to run against an older plugin, for example one without a skill
// being tested, so that the baseline really lacks it.
const pluginDirs = new Map();
function pluginDirFor(testCase) {
  if (!testCase.pluginRef) {
    return packageRoot;
  }
  if (!pluginDirs.has(testCase.pluginRef)) {
    const dir = mkdtempSync(join(tmpdir(), `touchstone-plugin-${testCase.pluginRef.replace(/[^\w.-]/g, "_")}-`));
    const archive = spawnSync("git", ["archive", testCase.pluginRef], { cwd: packageRoot, maxBuffer: 256 * 1024 * 1024 });
    if (archive.status !== 0) {
      throw new Error(`cannot read plugin ${testCase.pluginRef}: ${archive.stderr}`);
    }
    const extract = spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout });
    if (extract.status !== 0) {
      throw new Error(`cannot unpack plugin ${testCase.pluginRef}`);
    }
    pluginDirs.set(testCase.pluginRef, dir);
  }
  return pluginDirs.get(testCase.pluginRef);
}

function command(testCase, budget, mode) {
  return [
    "-p", fill(testCase.prompt),
    "--plugin-dir", pluginDirFor(testCase),
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
    let limited = false;
    const reasons = [];
    const fixedRuns = new Map((testCase.oracles?.defects ?? []).map((defect) => [defect.name, 0]));
    const fixedPerRun = [];
    for (let run = 1; run <= runs; run += 1) {
      const work = prepare(testCase);
      const oracles = testCase.oracles;
      if (oracles) {
        const missing = oracles.defects.filter((defect) => runOracle(testCase, work, defect)).map((defect) => defect.name);
        const broken = oracles.preserved.filter((check) => !runOracle(testCase, work, check)).map((check) => check.name);
        if (missing.length || broken.length) {
          console.log(`INVALID ${testCase.name}: the fixture is wrong before the agent starts (defects already fixed: ${missing}; behaviour already broken: ${broken})`);
          return 1;
        }
      }
      const before = snapshot(work);
      const result = spawnSync("claude", command(testCase, budget, mode), { cwd: work, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const transcript = result.stdout || "";
      // A usage or rate limit means the agent never ran. That is not a result.
      if (/hit your .{0,40}limit|usage limit|rate.?limit|overloaded/i.test(finalText(transcript))) {
        console.log(`  run ${run}: NOT RUN, ${finalText(transcript).trim().slice(0, 120)}`);
        limited = true;
        rmSync(work, { recursive: true, force: true });
        break;
      }
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
      if (testCase.oracles && !result.error) {
        const fixed = testCase.oracles.defects.filter((defect) => runOracle(testCase, work, defect)).map((defect) => defect.name);
        const lost = testCase.oracles.preserved.filter((check) => !runOracle(testCase, work, check)).map((check) => check.name);
        for (const name of fixed) {
          fixedRuns.set(name, fixedRuns.get(name) + 1);
        }
        fixedPerRun.push(fixed.length);
        if (lost.length) {
          failures.push(`behaviour lost: ${lost.join(", ")}`);
        }
        if (testCase.expect.minFixed !== undefined && fixed.length < testCase.expect.minFixed) {
          failures.push(`fixed only ${fixed.length} of ${testCase.oracles.defects.length} defects (${fixed.join(", ") || "none"})`);
        }
        console.log(`  run ${run}: fixed ${fixed.length}/${testCase.oracles.defects.length} [${fixed.join(", ") || "none"}]${lost.length ? ` BEHAVIOUR LOST: ${lost}` : ""}`);
      }
      writeFileSync(join(results, `${testCase.name}-${run}.jsonl`), transcript);
      if (failures.length) {
        reasons.push(`run ${run}: ${failures.join("; ")}`);
      } else {
        passed += 1;
        rmSync(work, { recursive: true, force: true });
      }
    }
    if (limited) {
      console.log(`INCOMPLETE ${testCase.name}: stopped at a usage limit after ${fixedPerRun.length} real runs. Those runs count; the rest were not run.`);
      failed += 1;
      continue;
    }
    console.log(`${passed === runs ? "PASS" : "FAIL"} ${testCase.name}: ${passed}/${runs} runs (${mode})`);
    if (testCase.oracles) {
      const mean = fixedPerRun.length ? fixedPerRun.reduce((sum, count) => sum + count, 0) / fixedPerRun.length : 0;
      console.log(`  defects fixed on average: ${mean.toFixed(2)} of ${testCase.oracles.defects.length}`);
      for (const [name, count] of fixedRuns) {
        console.log(`    ${name}: fixed in ${count} of ${fixedPerRun.length} runs`);
      }
      writeFileSync(join(results, `${testCase.name}.summary.json`), `${JSON.stringify({ runs: fixedPerRun.length, fixedPerRun, fixedRuns: Object.fromEntries(fixedRuns) }, null, 2)}\n`);
    }
    for (const reason of reasons) {
      console.log(`  - ${reason}`);
    }
    failed += passed === runs ? 0 : 1;
  }
  for (const dir of pluginDirs.values()) {
    rmSync(dir, { recursive: true, force: true });
  }
  return failed ? 1 : 0;
}

process.exit(main());
