#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

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
    "pytest\\.mark\\.skip",
    "@skip\\b",
    "@wip\\b",
    "@fixme\\b",
    "\\btest\\.fixme\\b",
    "unittest\\.skip",
    "assumeTrue\\s*\\(\\s*false\\s*\\)",
    "\\bt\\.Skip\\s*\\(",
  ].join("|"),
);
const IGNORED_PREFIXES = [
  "ci/check-acceptance-guard.js",
  "ci/check-trace.js",
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

function markerCount(text) {
  return (text.match(new RegExp(`^\\s*${ALLOW_DROP}`, "gm")) || []).length;
}

function addedSkipLines(cwd, base) {
  let diff = git(cwd, ["diff", "--unified=0", `${base}...HEAD`]);
  if (!diff) {
    diff = git(cwd, ["diff", "--unified=0", base, "HEAD"]);
  }
  const hits = [];
  let current = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      current = line.slice(6);
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) {
      continue;
    }
    if (IGNORED_PREFIXES.some((prefix) => current.startsWith(prefix))) {
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
  const before = behaviorLines(beforeText).length;
  const after = behaviorLines(afterText).length;
  if (before === 0 && after === 0) {
    console.log("acceptance guard: no behavior sentences yet");
    return 0;
  }
  const failures = [];
  if (after < before && markerCount(afterText) <= markerCount(beforeText)) {
    failures.push(`behavior sentences dropped from ${before} to ${after} in stories`);
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
