#!/usr/bin/env node
// Gherkin value mutation.
//
// A scenario that states a value ("10% off over 101.00") should fail when that
// value is wrong. This check changes one value at a time in a scenario (a number
// goes up by one unit, a string gets a letter added, a boolean flips), runs the
// scenario, and expects it to fail. A mutant that still passes is a "survivor":
// nothing the scenario checks depends on that value. The step may ignore the
// value, or an assertion may never be able to fail.
//
// This tests the wiring between the words and the system. It is not mutation
// testing of the production code.
//
//   node ci/mutate-gherkin.js --command "<run one scenario>" [--base ref | --all]
//        [--features features] [--mode warn|fail] [--max-mutants 30]
//        [--overlay path,path] [--any-exit-code] [--repo path]
//
// The command runs one scenario named by $TOUCHSTONE_SCENARIO (an anchored
// regular expression). If it writes Cucumber messages or a JSON report to
// $TOUCHSTONE_MESSAGES, a mutant only counts as killed by an assertion-style
// failure, not by an undefined step or a broken test.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import { changedScenarios, titlePattern } from "./check-red-green.js";
import { loadConfig } from "./config.js";
import { mutantOutcome, parseCases } from "./red-reason.js";

const BACKUP_SUFFIX = ".touchstone-orig";
const DEFAULT_MAX_MUTANTS = 30;
const DEFAULT_OVERLAY = ["features", "src/acceptanceTest"];

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? "" : process.argv[index + 1];
}

function git(repo, args) {
  try {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

// --- Mutation rules -------------------------------------------------------

const NUMBER = /^-?\d+(?:\.\d+)?$/;

// Raises a number by one unit of its last digit: 100.00 becomes 100.01, 20
// becomes 21, -1 becomes 0. Uses whole-number arithmetic so there is no
// floating point error.
export function bumpNumber(text) {
  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = body.split(".");
  const scale = fraction.length;
  let value = BigInt(whole + fraction);
  value = negative ? -value : value;
  value += 1n;
  const sign = value < 0n ? "-" : "";
  let digits = (value < 0n ? -value : value).toString().padStart(scale + 1, "0");
  if (scale > 0) {
    digits = `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  }
  return `${sign}${digits}`;
}

// Every changed value worth trying for a cell or token. A string gets two: one
// letter added at the end (tests how it is used as a whole or as a suffix) and
// its first letter replaced (tests a prefix rule such as "gold-").
export function mutateValues(value) {
  const first = mutateValue(value);
  if (first === null) {
    return [];
  }
  const isPlainString = !NUMBER.test(value) && !/^(true|false)$/i.test(value);
  if (!isPlainString) {
    return [first];
  }
  const replacement = value[0] === "x" ? "y" : "x";
  return [first, replacement + value.slice(1)];
}

// The first changed value for a cell or token, or null when there is nothing
// sensible to change.
export function mutateValue(value) {
  if (NUMBER.test(value)) {
    return bumpNumber(value);
  }
  if (/^true$/i.test(value)) {
    return value === "true" ? "false" : value === "TRUE" ? "FALSE" : "False";
  }
  if (/^false$/i.test(value)) {
    return value === "false" ? "true" : value === "FALSE" ? "TRUE" : "True";
  }
  if (value.trim() === "") {
    return null;
  }
  return `${value}x`;
}

// Finds the values inside a step's text: quoted strings (the content between the
// quotes) and bare numbers. Placeholders like <price> are left alone.
export function tokensIn(text) {
  const masked = text.replace(/<[^>]*>/g, (match) => " ".repeat(match.length));
  const tokens = [];
  const taken = [];
  for (const match of masked.matchAll(/"([^"]*)"|'([^']*)'/g)) {
    const content = match[1] ?? match[2];
    if (content !== "") {
      tokens.push({ start: match.index + 1, value: content });
    }
    taken.push([match.index, match.index + match[0].length]);
  }
  for (const match of masked.matchAll(/(?<![\w.-])-?\d+(?:\.\d+)?(?![\w.])/g)) {
    if (!taken.some(([from, to]) => match.index >= from && match.index < to)) {
      tokens.push({ start: match.index, value: match[0] });
    }
  }
  return tokens.sort((a, b) => a.start - b.start);
}

// --- Finding mutants in a feature file ------------------------------------

function parse(text) {
  return new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher()).parse(text);
}

function scenarioNodes(children, found = []) {
  for (const child of children) {
    if (child.scenario) {
      found.push(child.scenario);
    } else if (child.rule) {
      scenarioNodes(child.rule.children, found);
    }
  }
  return found;
}

// Every place in one scenario where a value can be changed. A mutant records the
// line and column so it can be applied to the file text.
export function mutantsOf(scenario, lines) {
  const mutants = [];
  const add = (line, column, original, kind) => {
    for (const changed of mutateValues(original)) {
      mutants.push({ title: scenario.name.trim(), line, column, original, changed, kind });
    }
  };
  for (const step of scenario.steps) {
    const lineText = lines[step.location.line - 1];
    const textStart = lineText.indexOf(step.text, step.location.column - 1);
    if (textStart !== -1) {
      for (const token of tokensIn(step.text)) {
        add(step.location.line, textStart + token.start, token.value, "step");
      }
    }
    for (const row of step.dataTable?.rows ?? []) {
      for (const cell of row.cells) {
        add(cell.location.line, cell.location.column - 1, cell.value, "table");
      }
    }
  }
  for (const examples of scenario.examples) {
    for (const row of examples.tableBody) {
      for (const cell of row.cells) {
        add(cell.location.line, cell.location.column - 1, cell.value, "example");
      }
    }
  }
  return mutants;
}

export function applyMutant(text, mutant) {
  const lines = text.split("\n");
  const line = lines[mutant.line - 1];
  const found = line.slice(mutant.column, mutant.column + mutant.original.length);
  if (found !== mutant.original) {
    throw new Error(`line ${mutant.line} no longer has "${mutant.original}" at column ${mutant.column + 1}`);
  }
  lines[mutant.line - 1] = line.slice(0, mutant.column) + mutant.changed + line.slice(mutant.column + mutant.original.length);
  return lines.join("\n");
}

// Keeps at most `limit` mutants, spread across the scenario rather than only the
// first ones, so a long outline is sampled evenly.
export function sample(mutants, limit) {
  if (mutants.length <= limit) {
    return mutants;
  }
  const chosen = [];
  for (let index = 0; index < limit; index += 1) {
    chosen.push(mutants[Math.floor((index * mutants.length) / limit)]);
  }
  return chosen;
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
    if (entry.isDirectory() && entry.name !== "node_modules") {
      featureFiles(path, found);
    } else if (entry.name.endsWith(".feature")) {
      found.push(path);
    }
  }
  return found;
}

// Marks accepted by a person in stories/:  # touchstone-equivalent: <title> | <value> | <reason>
export function equivalentMarks(repo) {
  const marks = [];
  const walk = (directory) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        for (const line of readFileSync(path, "utf8").split("\n")) {
          const match = /^\s*#\s*touchstone-equivalent:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/i.exec(line);
          if (match) {
            marks.push({ title: match[1], value: match[2], reason: match[3] });
          }
        }
      }
    }
  };
  walk(join(repo, "stories"));
  return marks;
}

// --- Running ---------------------------------------------------------------

function restoreStale(files) {
  for (const file of files) {
    const backup = file + BACKUP_SUFFIX;
    if (existsSync(backup)) {
      writeFileSync(file, readFileSync(backup, "utf8"));
      rmSync(backup);
      console.log(`mutate: restored ${file} from an interrupted run`);
    }
  }
}

function runOnce(command, repo, title, messages, timeout) {
  rmSync(messages, { force: true });
  const result = spawnSync(command, {
    cwd: repo,
    shell: true,
    stdio: "ignore",
    timeout,
    env: { ...process.env, TOUCHSTONE_SCENARIO: titlePattern(title), TOUCHSTONE_SCENARIO_TITLE: title, TOUCHSTONE_MESSAGES: messages },
  });
  return { status: result.status ?? 1, timedOut: result.error?.code === "ETIMEDOUT" };
}

function judge(run, messages, exitCodeOnly, title) {
  if (run.timedOut) {
    return "invalid";
  }
  if (exitCodeOnly || !existsSync(messages)) {
    return run.status === 0 ? "survived" : "killed";
  }
  try {
    const pattern = new RegExp(titlePattern(title));
    const cases = parseCases(readFileSync(messages, "utf8")).filter((testCase) => pattern.test(testCase.name));
    return mutantOutcome(cases);
  } catch {
    return "invalid";
  }
}

function driverFilesChanged(repo, base, overlay) {
  if (!base) {
    return [];
  }
  const names = git(repo, ["diff", "--name-only", base, "HEAD", "--", ...overlay]).split("\n").filter(Boolean);
  return names.filter((name) => !name.endsWith(".feature"));
}

export function mutateAll({ repo, command, featuresDir, titles, maxMutants, exitCodeOnly, timeout, marks }) {
  const files = featureFiles(featuresDir);
  restoreStale(files);
  const messages = join(mkdtempSync(join(tmpdir(), "touchstone-mutate-")), "messages");
  const originals = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const restore = () => {
    for (const [file, text] of originals) {
      if (existsSync(file + BACKUP_SUFFIX)) {
        writeFileSync(file, text);
        rmSync(file + BACKUP_SUFFIX, { force: true });
      }
    }
  };
  const onSignal = () => {
    restore();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const report = { scenarios: [], skipped: [] };
  try {
    for (const file of files) {
      const text = originals.get(file);
      let document;
      try {
        document = parse(text);
      } catch {
        continue;
      }
      const lines = text.split("\n");
      for (const scenario of scenarioNodes(document?.feature?.children ?? [])) {
        const title = scenario.name.trim();
        if (titles && !titles.has(title)) {
          continue;
        }
        const all = mutantsOf(scenario, lines);
        const mutants = sample(all, maxMutants);
        const entry = { title, file: relative(repo, file).split(sep).join("/"), results: [], total: all.length, tried: mutants.length };
        report.scenarios.push(entry);
        if (mutants.length === 0) {
          continue;
        }
        const first = runOnce(command, repo, title, messages, timeout);
        const second = runOnce(command, repo, title, messages, timeout);
        if (first.status !== 0 || second.status !== 0) {
          entry.baseline = first.status !== 0 ? "fails" : "flaky";
          report.skipped.push(`${title}: not mutated, the unmutated scenario ${entry.baseline}`);
          continue;
        }
        for (const mutant of mutants) {
          writeFileSync(file + BACKUP_SUFFIX, text);
          let outcome;
          try {
            writeFileSync(file, applyMutant(text, mutant));
            outcome = judge(runOnce(command, repo, title, messages, timeout), messages, exitCodeOnly, title);
          } finally {
            writeFileSync(file, text);
            rmSync(file + BACKUP_SUFFIX, { force: true });
          }
          const accepted = outcome === "survived" ? marks.find((mark) => mark.title === title && mark.value === mutant.original) : undefined;
          entry.results.push({ ...mutant, outcome, accepted: accepted?.reason });
        }
      }
    }
  } finally {
    restore();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    rmSync(join(messages, ".."), { recursive: true, force: true });
  }
  return report;
}

export function summarize(report) {
  const counts = { killed: 0, survived: 0, invalid: 0, accepted: 0 };
  const survivors = [];
  for (const scenario of report.scenarios) {
    for (const result of scenario.results) {
      if (result.outcome === "survived" && result.accepted) {
        counts.accepted += 1;
      } else {
        counts[result.outcome] += 1;
      }
      if (result.outcome === "survived" && !result.accepted) {
        survivors.push({ scenario, result });
      }
    }
  }
  return { counts, survivors };
}

function printReport(report) {
  const { counts, survivors } = summarize(report);
  const mutants = report.scenarios.reduce((sum, scenario) => sum + scenario.results.length, 0);
  console.log(`mutate: ${report.scenarios.length} scenarios, ${mutants} mutants: ${counts.killed} killed, ${counts.survived} survived, ${counts.accepted} accepted as equivalent, ${counts.invalid} invalid`);
  for (const note of report.skipped) {
    console.log(`  ${note}`);
  }
  for (const scenario of report.scenarios) {
    if (scenario.total > scenario.tried) {
      console.log(`  ${scenario.title}: tried ${scenario.tried} of ${scenario.total} mutants`);
    }
  }
  const invalid = report.scenarios.flatMap((scenario) => scenario.results.filter((result) => result.outcome === "invalid").map((result) => ({ scenario, result })));
  if (invalid.length) {
    console.log("invalid (the run broke instead of the scenario failing, so these say nothing):");
    for (const { scenario, result } of invalid.slice(0, 10)) {
      console.log(`- ${scenario.title} (${scenario.file}:${result.line}:${result.column + 1}): "${result.original}" -> "${result.changed}"`);
    }
    if (invalid.length > 10) {
      console.log(`  and ${invalid.length - 10} more`);
    }
  }
  if (survivors.length) {
    console.log("survivors (a value nothing checks):");
    const groups = new Map();
    for (const { scenario, result } of survivors) {
      const key = `${result.original}\u0000${result.changed}`;
      groups.set(key, [...(groups.get(key) ?? []), { scenario, result }]);
    }
    for (const group of groups.values()) {
      const { scenario, result } = group[0];
      const where = `${scenario.title} (${scenario.file}:${result.line}:${result.column + 1})`;
      const scenarios = new Set(group.map((item) => item.scenario.title)).size;
      console.log(group.length === 1 ? `- ${where}: "${result.original}" -> "${result.changed}"` : `- "${result.original}" -> "${result.changed}" in ${scenarios} scenario${scenarios === 1 ? "" : "s"} (${group.length} places), first: ${where}`);
    }
    console.log("For each one: tighten the step so it depends on the value, or, if the value truly does not matter, a person records it in stories/ as");
    console.log("  # touchstone-equivalent: <scenario title> | <value> | <reason>");
  }
}

function main() {
  const repo = resolve(option("--repo") || ".");
  const base = option("--base");
  let loaded = null;
  try {
    loaded = loadConfig(repo, base);
  } catch (error) {
    console.error(`mutate: ${error.message}`);
    return 1;
  }
  const settings = loaded?.config.mutation ?? {};
  const mode = option("--mode") || settings.mode || "warn";
  if (mode === "off") {
    console.log("mutate: mode is off, skipping");
    return 0;
  }
  const command = option("--command") || "";
  if (!command) {
    console.log("mutate: no command configured, skipping");
    return 0;
  }
  const maxMutants = Number(option("--max-mutants")) || settings.maxMutants || DEFAULT_MAX_MUTANTS;
  const overlay = [...DEFAULT_OVERLAY, ...option("--overlay").split(",").map((path) => path.trim()).filter(Boolean)];
  const featuresDir = resolve(repo, option("--features") || "features");
  let titles = null;
  if (!process.argv.includes("--all")) {
    if (!base || !git(repo, ["rev-parse", "--verify", base])) {
      console.error(`mutate: give --base <commit> to mutate changed scenarios, or --all`);
      return 1;
    }
    const drivers = driverFilesChanged(repo, base, overlay);
    if (drivers.length) {
      console.log(`mutate: step definitions changed (${drivers.slice(0, 3).join(", ")}${drivers.length > 3 ? ", ..." : ""}), so every scenario is mutated`);
    } else {
      titles = new Set(changedScenarios(repo, base));
      if (titles.size === 0) {
        console.log("mutate: no new or changed scenarios");
        return 0;
      }
    }
  }
  const report = mutateAll({
    repo,
    command,
    featuresDir,
    titles,
    maxMutants,
    exitCodeOnly: process.argv.includes("--any-exit-code"),
    timeout: Number(option("--timeout-ms")) || 300000,
    marks: equivalentMarks(repo),
  });
  printReport(report);
  const { survivors } = summarize(report);
  if (survivors.length && mode === "fail") {
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
