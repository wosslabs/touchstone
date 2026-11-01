#!/usr/bin/env node
// Checks the sentences written down about an existing system.
//
// A sentence about legacy code is a claim. Every claim needs proof, or an honest
// label saying there is none. This check reads the draft features and:
//   - requires each scenario to point at the code that proves it, with
//     @evidence:<path>:<line> or @evidence:<path>:<start>-<end>
//   - requires every pointer to name a file inside the code base and a line
//     that exists
//   - lets a scenario say it is @unclear, @suspected-bug or @dead instead, and
//     lists those for a person to settle
//   - reports which entry points found by discover.js no scenario covers
//
//   node ci/check-evidence.js [--repo path] [--drafts drafts/legacy]
//        [--inventory drafts/discovery/inventory.json] [--require-coverage] [--write]
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { scenarioTagsIn } from "./gherkin.js";

const EVIDENCE = /^@evidence:(.+?):(\d+)(?:-(\d+))?$/;
const UNPROVEN_TAGS = ["@unclear", "@suspected-bug", "@dead"];
// A route annotation sits above its handler. A pointer at the handler body
// covers the route when it lands within this many lines.
const NEARBY_LINES = 60;

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? "" : process.argv[index + 1];
}

function featureFiles(directory, found = []) {
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      featureFiles(path, found);
    } else if (entry.name.endsWith(".feature")) {
      found.push(path);
    }
  }
  return found;
}

// Checks one pointer against the code base. Returns [reference, problem].
export function resolveEvidence(root, tag, lineCounts = new Map()) {
  const match = EVIDENCE.exec(tag);
  if (!match) {
    return [null, `${tag} is not @evidence:<path>:<line> or @evidence:<path>:<start>-<end>`];
  }
  const [, file, startText, endText] = match;
  const start = Number(startText);
  const end = endText ? Number(endText) : start;
  const absolute = resolve(root, file);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    return [null, `${tag} points outside the code base`];
  }
  if (!existsSync(absolute)) {
    return [null, `${tag}: no such file`];
  }
  const real = realpathSync(absolute);
  const realRoot = realpathSync(root);
  if (real !== realRoot && !real.startsWith(realRoot + sep)) {
    return [null, `${tag} points outside the code base (through a link)`];
  }
  if (!lineCounts.has(absolute)) {
    lineCounts.set(absolute, readFileSync(absolute, "utf8").split("\n").length);
  }
  const lines = lineCounts.get(absolute);
  if (start < 1 || end < start || end > lines) {
    return [null, `${tag}: the file has ${lines} lines`];
  }
  return [{ file: relative(root, absolute).split(sep).join("/"), start, end }, ""];
}

export function covers(reference, entry) {
  if (reference.file !== entry.file) {
    return false;
  }
  if (entry.line >= reference.start && entry.line <= reference.end) {
    return true;
  }
  return reference.start > entry.line && reference.start - entry.line <= NEARBY_LINES;
}

export function checkEvidence({ root, draftsDir, inventory }) {
  const problems = [];
  const unproven = [];
  const references = [];
  const seen = new Map();
  const lineCounts = new Map();
  let scenarios = 0;
  for (const path of featureFiles(draftsDir)) {
    const name = relative(root, path).split(sep).join("/");
    let found;
    try {
      found = scenarioTagsIn(readFileSync(path, "utf8"));
    } catch (error) {
      problems.push(`${name} is not valid Gherkin: ${String(error.message).split("\n")[0]}`);
      continue;
    }
    for (const scenario of found) {
      scenarios += 1;
      const where = `${name}:${scenario.line} "${scenario.title}"`;
      if (seen.has(scenario.title)) {
        problems.push(`${where}: title already used at ${seen.get(scenario.title)}`);
      } else {
        seen.set(scenario.title, `${name}:${scenario.line}`);
      }
      const evidence = scenario.tags.filter((tag) => tag.startsWith("@evidence"));
      const status = scenario.tags.filter((tag) => UNPROVEN_TAGS.includes(tag));
      if (status.length) {
        unproven.push(`${where}: ${status.join(" ")}`);
      }
      if (evidence.length === 0 && status.length === 0) {
        problems.push(`${where}: no @evidence and no @unclear, @suspected-bug or @dead tag, so it is a guess`);
      }
      for (const tag of evidence) {
        const [reference, problem] = resolveEvidence(root, tag, lineCounts);
        if (problem) {
          problems.push(`${where}: ${problem}`);
        } else {
          references.push(reference);
        }
      }
    }
  }
  const entries = inventory?.entries ?? [];
  const uncovered = entries.filter((entry) => !references.some((reference) => covers(reference, entry)));
  return { scenarios, problems, unproven, uncovered, entryCount: entries.length };
}

function entryLabel(entry) {
  return `${entry.method ? `${entry.method} ` : ""}${entry.name || "(root)"}`.trim();
}

export function report(result) {
  const out = ["# Evidence report", ""];
  out.push(`${result.scenarios} scenarios. ${result.problems.length} problems. ${result.unproven.length} left for a person to settle.`, "");
  if (result.entryCount) {
    const covered = result.entryCount - result.uncovered.length;
    out.push(`Entry points covered: ${covered} of ${result.entryCount}.`, "");
  }
  if (result.problems.length) {
    out.push("## Problems", "", ...result.problems.map((line) => `- ${line}`), "");
  }
  if (result.unproven.length) {
    out.push("## Needs a person", "", ...result.unproven.map((line) => `- ${line}`), "");
  }
  if (result.uncovered.length) {
    out.push("## Entry points with no scenario", "", "| Entry | Where | Kind |", "| --- | --- | --- |");
    for (const entry of result.uncovered) {
      out.push(`| \`${entryLabel(entry)}\` | \`${entry.file}:${entry.line}\` | ${entry.kind} |`);
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

function main() {
  const root = resolve(option("--repo") || ".");
  const draftsDir = resolve(root, option("--drafts") || "drafts/legacy");
  const inventoryPath = resolve(root, option("--inventory") || "drafts/discovery/inventory.json");
  const inventory = existsSync(inventoryPath) ? JSON.parse(readFileSync(inventoryPath, "utf8")) : null;
  if (featureFiles(draftsDir).length === 0) {
    console.log(`evidence: no feature files under ${relative(root, draftsDir) || "."}`);
    return 0;
  }
  const result = checkEvidence({ root, draftsDir, inventory });
  const text = report(result);
  process.stdout.write(text);
  if (process.argv.includes("--write")) {
    writeFileSync(join(draftsDir, "COVERAGE.md"), text);
  }
  const missingCoverage = process.argv.includes("--require-coverage") && result.uncovered.length > 0;
  return result.problems.length || missingCoverage ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
