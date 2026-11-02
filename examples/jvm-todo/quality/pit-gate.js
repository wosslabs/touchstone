// Mutation testing of the code with PIT, judged here and not in pom.xml.
//
// A pull request can change pom.xml: lower the threshold, narrow the target
// classes. So the pass mark and the classes that must be mutated are arguments to
// this script, written in touchstone.json (read from the base commit), and this
// script is listed under "protect". PIT only produces the report. This reads it.
//
//   node quality/pit-gate.js --threshold 90 --require example.todo.TaskList [--min-mutations 3]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

const threshold = Number(arg("--threshold", "90"));
const required = arg("--require").split(",").map((name) => name.trim()).filter(Boolean);
const minimum = Number(arg("--min-mutations", "1"));
const reports = join("target", "pit-reports");

rmSync(reports, { recursive: true, force: true });
const run = spawnSync(
  "./mvnw",
  ["-B", "-q", "test-compile", "org.pitest:pitest-maven:mutationCoverage", "-DmutationThreshold=0", "-DtimestampedReports=false"],
  { stdio: "inherit" },
);
if (run.status !== 0) {
  console.log("pit-gate: PIT did not run to the end");
  process.exit(1);
}

function findReport(directory) {
  if (!existsSync(directory)) {
    return null;
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findReport(path);
      if (found) {
        return found;
      }
    } else if (entry.name === "mutations.xml") {
      return path;
    }
  }
  return null;
}

const report = findReport(reports);
if (!report) {
  console.log("pit-gate: PIT wrote no mutations.xml, so nothing was judged");
  process.exit(1);
}

// Detected means a test noticed: killed, timed out, or ran out of memory. A
// mutation that could not be loaded (NON_VIABLE) says nothing and is left out.
const DETECTED = new Set(["KILLED", "TIMED_OUT", "MEMORY_ERROR"]);
const mutations = [...readFileSync(report, "utf8").matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/g)].map((match) => ({
  status: /status='([A-Z_]+)'/.exec(match[1])?.[1] ?? /status="([A-Z_]+)"/.exec(match[1])?.[1] ?? "",
  className: /<mutatedClass>([^<]*)<\/mutatedClass>/.exec(match[2])?.[1] ?? "",
  method: /<mutatedMethod>([^<]*)<\/mutatedMethod>/.exec(match[2])?.[1] ?? "",
  line: /<lineNumber>(\d+)<\/lineNumber>/.exec(match[2])?.[1] ?? "?",
})).filter((mutation) => mutation.status !== "NON_VIABLE");

const problems = [];
for (const name of required) {
  if (!mutations.some((mutation) => mutation.className === name)) {
    problems.push(`${name} was not mutated: the target classes in pom.xml no longer include it`);
  }
}
if (mutations.length < minimum) {
  problems.push(`only ${mutations.length} mutations were generated, at least ${minimum} are expected: something is being excluded`);
}
const detected = mutations.filter((mutation) => DETECTED.has(mutation.status)).length;
const score = mutations.length === 0 ? 0 : Math.floor((detected * 100) / mutations.length);
if (score < threshold) {
  problems.push(`mutation score ${score}% is below ${threshold}%`);
}

console.log(`pit-gate: ${mutations.length} mutations, ${detected} detected, score ${score}% (pass mark ${threshold}%)`);
for (const mutation of mutations.filter((item) => !DETECTED.has(item.status))) {
  console.log(`  ${mutation.status}: ${mutation.className}.${mutation.method} line ${mutation.line}`);
}
for (const problem of problems) {
  console.log(`  ${problem}`);
}
process.exit(problems.length === 0 ? 0 : 1);
