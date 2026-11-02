#!/usr/bin/env node
// Puts the base commit's version of every protected file back before the checks
// run, so a pull request cannot weaken the scripts that judge it. Which files are
// protected comes from `protect` in touchstone.json at the base commit.
//
//   node ci/restore-protected.js --base <sha> [--repo path] [--report file]
//
// A protected file that the pull request changed is restored to the base version.
// One it deleted is brought back. One it added is removed. Each is listed in the
// report, because a person has to review that change: it takes effect after merge.
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, matchesAny, protectGlobs } from "./config.js";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? "" : process.argv[index + 1];
}

function lines(repo, args) {
  try {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function sameAsBase(repo, base, file) {
  try {
    execFileSync("git", ["diff", "--quiet", base, "--", file], { cwd: repo, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function restoreProtected(repo, base) {
  const loaded = loadConfig(repo, base);
  const globs = protectGlobs(loaded?.config);
  if (globs.length === 0) {
    return { globs, changes: [] };
  }
  const inBase = new Set(lines(repo, ["ls-tree", "-r", "--name-only", base]).filter((file) => matchesAny(file, globs)));
  const inTree = new Set([...lines(repo, ["ls-files"]), ...lines(repo, ["ls-files", "--others", "--exclude-standard"])].filter((file) => matchesAny(file, globs)));
  const changes = [];
  for (const file of inBase) {
    if (!inTree.has(file)) {
      execFileSync("git", ["checkout", base, "--", file], { cwd: repo, stdio: "ignore" });
      changes.push(["deleted", file]);
    } else if (!sameAsBase(repo, base, file)) {
      execFileSync("git", ["checkout", base, "--", file], { cwd: repo, stdio: "ignore" });
      changes.push(["changed", file]);
    }
  }
  for (const file of inTree) {
    if (!inBase.has(file)) {
      rmSync(join(repo, file), { force: true });
      changes.push(["added", file]);
    }
  }
  return { globs, changes: changes.sort((a, b) => a[1].localeCompare(b[1])) };
}

function main() {
  const repo = resolve(option("--repo") || ".");
  const base = option("--base");
  const report = option("--report");
  if (!base) {
    console.error("restore-protected: give --base <sha>");
    return 1;
  }
  let result;
  try {
    result = restoreProtected(repo, base);
  } catch (error) {
    console.error(`restore-protected: ${error.message}`);
    return 1;
  }
  if (report) {
    writeFileSync(report, result.changes.map(([kind, file]) => `${file} (${kind} in this pull request; the base version is used)`).join("\n"));
  }
  if (result.globs.length === 0) {
    console.log("restore-protected: no protect list in touchstone.json at the base commit");
    return 0;
  }
  console.log(`restore-protected: ${result.globs.join(", ")}: ${result.changes.length} file${result.changes.length === 1 ? "" : "s"} put back to the base version`);
  for (const [kind, file] of result.changes) {
    console.log(`  ${kind}: ${file}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
