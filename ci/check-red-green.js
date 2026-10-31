#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { scenariosIn } from "./gherkin.js";

const OVERLAY = ["features", "stories", "src/test"];

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

function changedScenarios(cwd, base) {
  const before = blocksAt(cwd, base);
  const changed = [];
  for (const [title, body] of blocksAt(cwd, "HEAD")) {
    if (before.get(title) !== body) {
      changed.push(title);
    }
  }
  return changed;
}

function titlePattern(title) {
  const escaped = title.replace(/<[^>]*>|[.*+?^${}()|[\]\\]/g, (match) => (match.startsWith("<") ? ".*" : `\\${match}`));
  return `^${escaped}$`;
}

function overlayHead(repo, work) {
  const present = OVERLAY.filter((path) => git(repo, ["ls-tree", "--name-only", "HEAD", "--", path]).trim() !== "");
  for (const path of OVERLAY) {
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

// Errors that mean the test code or its environment is broken, not that the
// behavior is missing.
const PROGRAMMING_ERROR = new RegExp(
  [
    "ReferenceError",
    "TypeError",
    "SyntaxError",
    "NoSuchMethod(?:Error|Exception)",
    "NoSuchField(?:Error|Exception)",
    "ClassNotFoundException",
    "NoClassDefFoundError",
    "LinkageError",
    "cannot find symbol",
    "compilation (?:error|failure)",
    "ModuleNotFoundError",
    "ImportError",
    "AttributeError",
    "NameError",
    "ECONNREFUSED",
    "Connection refused",
    "ConnectException",
    "is not a function",
    "Cannot read propert",
    "undefined reference",
    "panicked at .*(?:index out of bounds|unwrap\\(\\) on a `None`)",
  ].join("|"),
  "i",
);

function errorText(result) {
  return [result.exception?.type, result.exception?.message, result.message].filter(Boolean).join(" ");
}

// Reads Cucumber message output. Returns why the run is not a valid red, or "".
// Valid: a When or Then step fails with an assertion-style error (a missing
// element, a 404, a wrong value), and nothing is undefined, pending, ambiguous,
// or broken by a programming error.
export function classifyRed(text) {
  const stepTypes = new Map();
  const testSteps = new Map();
  const results = [];
  for (const line of text.split("\n")) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    for (const step of message.pickle?.steps || []) {
      stepTypes.set(step.id, step.type);
    }
    for (const step of message.testCase?.testSteps || []) {
      testSteps.set(step.id, step.pickleStepId || "");
    }
    if (message.testStepFinished) {
      results.push([message.testStepFinished.testStepId, message.testStepFinished.testStepResult || {}]);
    }
  }
  if (results.length === 0) {
    return "no scenario ran, so nothing failed for the right reason";
  }
  const broken = results.filter(([, result]) => ["UNDEFINED", "PENDING", "AMBIGUOUS"].includes(result.status));
  if (broken.length) {
    return `a step is ${broken[0][1].status.toLowerCase()}: that is a programming error, not missing behavior`;
  }
  const failed = results.filter(([, result]) => result.status === "FAILED");
  if (failed.length === 0) {
    return "no step failed";
  }
  for (const [id, result] of failed) {
    const type = stepTypes.get(testSteps.get(id));
    if (type !== "Action" && type !== "Outcome") {
      return "a Given or hook step failed: the system could not reach the starting state, which is a setup error, not missing behavior";
    }
    const text = errorText(result);
    if (PROGRAMMING_ERROR.test(text)) {
      return `a step failed with a programming or environment error, not missing behavior: ${text.split("\n")[0].slice(0, 160)}`;
    }
  }
  return "";
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
  const work = mkdtempSync(join(tmpdir(), "touchstone-red-"));
  const failures = [];
  try {
    execFileSync("git", ["worktree", "add", "--detach", work, base], { cwd: repo, stdio: "ignore" });
    overlayHead(repo, work);
    if (setup && run(setup, work, {}).status !== 0) {
      console.error("red check: setup failed in the base checkout");
      return 1;
    }
    for (const title of changed) {
      console.log(`red check: "${title}" must fail against the base production code`);
      const messages = join(work, ".touchstone-messages.ndjson");
      rmSync(messages, { force: true });
      const result = run(command, work, {
        TOUCHSTONE_SCENARIO: titlePattern(title),
        TOUCHSTONE_SCENARIO_TITLE: title,
        TOUCHSTONE_MESSAGES: messages,
      });
      if (result.status === 0) {
        failures.push(`${title}: passed against the base production code`);
      } else if (!anyFailure) {
        const reason = existsSync(messages)
          ? classifyRed(readFileSync(messages, "utf8"))
          : "the command wrote no Cucumber messages to $TOUCHSTONE_MESSAGES, so the reason for the failure is unknown";
        if (reason) {
          failures.push(`${title}: ${reason}`);
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
      for (const title of changed) {
        console.log(`red check: "${title}" must pass against the pull request code`);
        const result = run(command, repo, {
          TOUCHSTONE_SCENARIO: titlePattern(title),
          TOUCHSTONE_SCENARIO_TITLE: title,
          TOUCHSTONE_MESSAGES: join(head, "messages.ndjson"),
        });
        if (result.status !== 0) {
          failures.push(`${title}: fails against the pull request code too, so it never went green`);
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
