#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ALLOW_DROP = "Touchstone-Allow-Drop:";
const SKIP = new RegExp(
  [
    "@Disabled\\b",
    "@Ignore\\b",
    "\\btest\\.skip\\b",
    "\\bit\\.skip\\b",
    "\\bdescribe\\.skip\\b",
    "\\bxit\\s*\\(",
    "\\bxdescribe\\s*\\(",
    "\\b(?:test|it|describe)\\.only\\b",
    "\\bf(?:it|describe)\\s*\\(",
    "\\b(?:test|it)\\.todo\\b",
    "pytest\\.mark\\.skip",
    "@skip\\b",
    "@wip\\b",
    "@fixme\\b",
    "\\btest\\.fixme\\b",
    "unittest\\.skip",
    "assumeTrue\\s*\\(\\s*false\\s*\\)",
    "\\bt\\.Skip\\s*\\(",
    "testFailureIgnore",
    "<skipTests>\\s*true",
    "<skip>\\s*true",
    "maven\\.test\\.skip",
    "ignoreFailures\\s*[=:]?\\s*true",
    "continue-on-error:\\s*true",
  ].join("|"),
);
const IGNORED_PREFIXES = [
  "ci/check-acceptance-guard.js",
  "ci/check-trace.js",
  "ci/check-red-green.js",
  "hooks/protect-acceptance.js",
  "tests/",
  "templates/",
  "skills/",
];

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return "";
  }
  return process.argv[index + 1];
}

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" });
  } catch {
    return "";
  }
}

function resolveBase(cwd, requested) {
  if (requested) {
    if (git(cwd, ["rev-parse", "--verify", requested])) {
      return requested;
    }
    const error = new Error(requested);
    error.missingBase = true;
    throw error;
  }
  for (const candidate of ["origin/main", "origin/master", "HEAD~1"]) {
    if (git(cwd, ["rev-parse", "--verify", candidate])) {
      return candidate;
    }
  }
  return "";
}

function exampleText(cwd, rev) {
  const listing = git(cwd, ["ls-tree", "-r", "--name-only", rev, "--", "stories"]);
  const chunks = [];
  for (const path of listing.split("\n")) {
    if (!path) {
      continue;
    }
    chunks.push(git(cwd, ["show", `${rev}:${path}`]));
  }
  return chunks.join("\n");
}

function behaviorLines(text) {
  const lines = [];
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith(ALLOW_DROP)) {
      continue;
    }
    lines.push(stripped);
  }
  return lines;
}

function droppedLines(before, after) {
  const remaining = new Map();
  for (const line of after) {
    remaining.set(line, (remaining.get(line) || 0) + 1);
  }
  const dropped = [];
  for (const line of before) {
    const count = remaining.get(line) || 0;
    if (count > 0) {
      remaining.set(line, count - 1);
    } else {
      dropped.push(line);
    }
  }
  return dropped;
}

function markerCount(text) {
  return (text.match(new RegExp(`^\\s*${ALLOW_DROP}`, "gm")) || []).length;
}

// Touchstone's own tests and templates mention skip markers on purpose. They are
// exempt only inside Touchstone's repository, never in an application's.
function ignoredPrefixes(cwd) {
  return existsSync(join(cwd, "ci", "check-acceptance-guard.js")) ? IGNORED_PREFIXES : [];
}

function addedSkipLines(cwd, base) {
  let diff = git(cwd, ["diff", "--unified=0", `${base}...HEAD`]);
  if (!diff) {
    diff = git(cwd, ["diff", "--unified=0", base, "HEAD"]);
  }
  const hits = [];
  const ignored = ignoredPrefixes(cwd);
  let current = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      current = line.slice(6);
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) {
      continue;
    }
    if (ignored.some((prefix) => current.startsWith(prefix))) {
      continue;
    }
    const added = line.slice(1);
    if (SKIP.test(added)) {
      hits.push(`${current}: ${added.trim()}`);
    }
  }
  return hits;
}

function main() {
  const cwd = resolve(option("--repo") || ".");
  let base = "";
  try {
    base = resolveBase(cwd, option("--base"));
  } catch (error) {
    if (error.missingBase) {
      console.error(`acceptance guard: base revision not found: ${error.message}`);
      return 1;
    }
    throw error;
  }
  if (!base) {
    console.log("acceptance guard: no base revision to compare, skipping");
    return 0;
  }
  const beforeText = exampleText(cwd, base);
  const afterText = exampleText(cwd, "HEAD");
  const beforeLines = behaviorLines(beforeText);
  const afterLines = behaviorLines(afterText);
  const before = beforeLines.length;
  const after = afterLines.length;
  if (before === 0 && after === 0) {
    console.log("acceptance guard: no behavior sentences yet");
    return 0;
  }
  const failures = [];
  const dropped = droppedLines(beforeLines, afterLines);
  const allowed = Math.max(0, markerCount(afterText) - markerCount(beforeText));
  if (dropped.length > allowed) {
    failures.push(
      `behavior sentences dropped or reworded in stories (${dropped.length} removed, ${allowed} allowed):\n${dropped.join("\n")}`,
    );
  }
  const skips = addedSkipLines(cwd, base);
  if (skips.length) {
    failures.push(`new skipped or disabled test:\n${skips.join("\n")}`);
  }
  if (failures.length) {
    console.log("acceptance guard failed:");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    return 1;
  }
  console.log(`acceptance guard passed (${after} behavior sentences)`);
  return 0;
}

process.exit(main());
