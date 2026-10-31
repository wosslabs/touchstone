#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const HEADER = /^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/;

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
  let title = null;
  let lines = [];
  const flush = () => {
    if (title !== null) {
      blocks.set(title, lines.join("\n"));
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const header = HEADER.exec(line);
    if (header) {
      flush();
      title = header[1];
      lines = [];
      continue;
    }
    if (/^(?:Feature|Rule|Background):/.test(line)) {
      flush();
      title = null;
      continue;
    }
    if (title !== null && line && !line.startsWith("#")) {
      lines.push(line.replace(/\s+/g, " "));
    }
  }
  flush();
  return blocks;
}

function featureFiles(directory, prefix = "features") {
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory() && entry.name !== "node_modules") {
      found.push(...featureFiles(join(directory, entry.name), path));
    } else if (entry.name.endsWith(".feature")) {
      found.push(path);
    }
  }
  return found.sort();
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

function run(command, cwd, env) {
  return spawnSync(command, { cwd, shell: true, stdio: "inherit", env: { ...process.env, ...env } });
}

function main() {
  const repo = resolve(option("--repo") || ".");
  const command = option("--command");
  const setup = option("--setup");
  const base = option("--base");
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
    rmSync(join(work, "features"), { recursive: true, force: true });
    rmSync(join(work, "stories"), { recursive: true, force: true });
    execFileSync("sh", ["-c", 'git -C "$1" archive HEAD features stories 2>/dev/null | tar -x -C "$2"', "sh", repo, work]);
    if (setup && run(setup, work, {}).status !== 0) {
      console.error("red check: setup failed in the base checkout");
      return 1;
    }
    for (const title of changed) {
      console.log(`red check: "${title}" must fail against the base production code`);
      const result = run(command, work, { TOUCHSTONE_SCENARIO: titlePattern(title), TOUCHSTONE_SCENARIO_TITLE: title });
      if (result.status === 0) {
        failures.push(title);
      }
    }
  } finally {
    git(repo, ["worktree", "remove", "--force", work]);
    rmSync(work, { recursive: true, force: true });
  }
  if (failures.length) {
    console.log("red check failed: these scenarios pass without any production change (empty steps, already built, or no scenario matched):");
    for (const title of failures) {
      console.log(`- ${title}`);
    }
    return 1;
  }
  console.log(`red check passed (${changed.length} scenarios failed first)`);
  return 0;
}

process.exit(main());
