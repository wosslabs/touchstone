#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { scenariosIn } from "./gherkin.js";
import { classifyCase, parseCases } from "./red-reason.js";

const DEFAULT_OVERLAY = ["features", "stories", "src/acceptanceTest"];

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return "";
  }
  return process.argv[index + 1];
}

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function scenarioBlocks(text) {
  const blocks = new Map();
  for (const [title, steps] of scenariosIn(text)) {
    blocks.set(title, steps.join("\n"));
  }
  return blocks;
}

function blocksAt(cwd, rev) {
  const blocks = new Map();
  for (const path of git(cwd, ["ls-tree", "-r", "--name-only", rev, "--", "features"]).split("\n")) {
    if (path.endsWith(".feature")) {
      for (const [title, body] of scenarioBlocks(git(cwd, ["show", `${rev}:${path}`]))) {
        blocks.set(title, body);
      }
    }
  }
  return blocks;
}

export function changedScenarios(cwd, base) {
  const before = blocksAt(cwd, base);
  const changed = [];
  for (const [title, body] of blocksAt(cwd, "HEAD")) {
    if (before.get(title) !== body) {
      changed.push(title);
    }
  }
  return changed;
}

export function titlePattern(title) {
  const escaped = title.replace(/<[^>]*>|[.*+?^${}()|[\]\\]/g, (match) => (match.startsWith("<") ? ".*" : `\\${match}`));
  return `^${escaped}$`;
}

function overlayHead(repo, work, overlay) {
  const present = overlay.filter((path) => git(repo, ["ls-tree", "--name-only", "HEAD", "--", path]).trim() !== "");
  for (const path of overlay) {
    rmSync(join(work, path), { recursive: true, force: true });
  }
  if (present.length === 0) {
    return;
  }
  const archive = spawnSync("git", ["archive", "HEAD", ...present], { cwd: repo, maxBuffer: 256 * 1024 * 1024 });
  if (archive.status !== 0) {
    throw new Error(`git archive failed: ${archive.stderr}`);
  }
  const extract = spawnSync("tar", ["-x", "-C", work], { input: archive.stdout });
  if (extract.status !== 0) {
    throw new Error(`could not extract the pull request scenarios: ${extract.stderr}`);
  }
}

// Why the run of one scenario (all its example rows) is not a valid red, or "".
function reasonFor(title, text) {
  const pattern = new RegExp(titlePattern(title));
  let cases;
  try {
    cases = parseCases(text);
  } catch (error) {
    return `the test report could not be read: ${error.message}`;
  }
  const matching = cases.filter((testCase) => pattern.test(testCase.name));
  if (matching.length === 0) {
    return "no scenario with this title ran, so nothing failed for the right reason";
  }
  for (const testCase of matching) {
    const reason = classifyCase(testCase);
    if (reason) {
      return reason;
    }
  }
  return "";
}

// One pattern that selects every scenario in the group.
function groupPattern(titles) {
  return titles.length === 1 ? titlePattern(titles[0]) : titles.map((title) => `(?:${titlePattern(title)})`).join("|");
}

function run(command, cwd, env) {
  return spawnSync(command, { cwd, shell: true, stdio: "inherit", env: { ...process.env, ...env } });
}

function main() {
  const repo = resolve(option("--repo") || ".");
  const command = option("--command");
  const setup = option("--setup");
  const base = option("--base");
  const anyFailure = process.argv.includes("--any-failure");
  const batch = process.argv.includes("--batch");
  const extra = option("--overlay").split(",").map((path) => path.trim()).filter(Boolean);
  const overlay = [...new Set([...DEFAULT_OVERLAY, ...extra])];
  if (!command) {
    console.log("red check: no red command configured, skipping");
    return 0;
  }
  if (!base || !git(repo, ["rev-parse", "--verify", base])) {
    console.error(`red check: base revision not found: ${base}`);
    return 1;
  }
  const changed = changedScenarios(repo, base);
  if (changed.length === 0) {
    console.log("red check: no new or changed scenarios");
    return 0;
  }
  // --batch runs every changed scenario in one pass per phase (one Spring boot,
  // one browser launch). The runner must accept a regular expression with
  // alternation in $TOUCHSTONE_SCENARIO. It needs per-scenario results to
  // attribute failures, so it is ignored with --any-failure.
  const groups = batch && !anyFailure ? [changed] : changed.map((title) => [title]);
  const work = mkdtempSync(join(tmpdir(), "touchstone-red-"));
  const failures = [];
  try {
    execFileSync("git", ["worktree", "add", "--detach", work, base], { cwd: repo, stdio: "ignore" });
    overlayHead(repo, work, overlay);
    if (setup && run(setup, work, {}).status !== 0) {
      console.error("red check: setup failed in the base checkout");
      return 1;
    }
    for (const group of groups) {
      console.log(`red check: ${group.map((title) => `"${title}"`).join(", ")} must fail against the base production code`);
      const messages = join(work, ".touchstone-messages");
      rmSync(messages, { force: true });
      const result = run(command, work, {
        TOUCHSTONE_SCENARIO: groupPattern(group),
        TOUCHSTONE_SCENARIO_TITLE: group.join(" | "),
        TOUCHSTONE_MESSAGES: messages,
      });
      if (result.status === 0) {
        failures.push(...group.map((title) => `${title}: passed against the base production code`));
      } else if (!anyFailure) {
        if (!existsSync(messages)) {
          failures.push(...group.map((title) => `${title}: the command wrote no Cucumber messages or JSON report to $TOUCHSTONE_MESSAGES, so the reason for the failure is unknown`));
          continue;
        }
        const text = readFileSync(messages, "utf8");
        for (const title of group) {
          const reason = reasonFor(title, text);
          if (reason) {
            failures.push(`${title}: ${reason}`);
          }
        }
      }
    }
  } finally {
    git(repo, ["worktree", "remove", "--force", work]);
    rmSync(work, { recursive: true, force: true });
  }
  if (!anyFailure && failures.length === 0) {
    const head = mkdtempSync(join(tmpdir(), "touchstone-green-"));
    try {
      for (const group of groups) {
        console.log(`red check: ${group.map((title) => `"${title}"`).join(", ")} must pass against the pull request code`);
        const result = run(command, repo, {
          TOUCHSTONE_SCENARIO: groupPattern(group),
          TOUCHSTONE_SCENARIO_TITLE: group.join(" | "),
          TOUCHSTONE_MESSAGES: join(head, "messages"),
        });
        if (result.status !== 0) {
          failures.push(...group.map((title) => `${title}: fails against the pull request code too, so it never went green`));
        }
      }
    } finally {
      rmSync(head, { recursive: true, force: true });
    }
  }
  if (failures.length) {
    console.log("red check failed: each new or changed scenario must fail because the behavior is missing, then pass with the pull request code:");
    for (const title of failures) {
      console.log(`- ${title}`);
    }
    return 1;
  }
  console.log(`red check passed (${changed.length} scenarios failed first${anyFailure ? ", reason not checked" : ""})`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
