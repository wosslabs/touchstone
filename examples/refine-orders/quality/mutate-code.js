// Mutation testing of src/domain/pricing.js. Swaps one operator or constant at a
// time and runs the unit tests. A mutant the tests do not catch is a survivor.
// Prints the survivors and exits 1 if there are more than the allowed number.
//   node quality/mutate-code.js [--root dir] [--allow 0]
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const root = resolve(arg("--root", "."));
const allow = Number(arg("--allow", "0"));
const target = join("src", "domain", "pricing.js");
if (!existsSync(join(root, target))) {
  console.log(`mutation (code): ${target} is missing`);
  process.exit(1);
}
const original = readFileSync(join(root, target), "utf8");

const SWAPS = [
  [">=", ">"],
  [">=", "<"],
  [" * ", " / "],
  [" - ", " + "],
  [" += ", " -= "],
  ["0.1", "0.2"],
  ["0.1", "0"],
  ["return 0;", "return 1;"],
  ["* 100) / 100", "* 10) / 10"],
  ["let total = 0", "let total = 1"],
];

const mutants = [];
for (const [from, to] of SWAPS) {
  let index = original.indexOf(from);
  while (index !== -1) {
    mutants.push({ from, to, index });
    index = original.indexOf(from, index + 1);
  }
}

const work = mkdtempSync(join(tmpdir(), "touchstone-mutate-code-"));
cpSync(join(root, "src"), join(work, "src"), { recursive: true });
cpSync(join(root, "tests"), join(work, "tests"), { recursive: true });
writeFileSync(join(work, "package.json"), '{"type":"module"}\n');
const tests = readdirSync(join(work, "tests")).filter((name) => name.endsWith(".test.js")).map((name) => join("tests", name));
const survivors = [];
try {
  for (const mutant of mutants) {
    const changed = original.slice(0, mutant.index) + mutant.to + original.slice(mutant.index + mutant.from.length);
    writeFileSync(join(work, target), changed);
    const result = spawnSync("node", ["--test", ...tests], { cwd: work, encoding: "utf8" });
    if (result.status === 0) {
      const line = original.slice(0, mutant.index).split("\n").length;
      survivors.push(`line ${line}: "${mutant.from.trim()}" -> "${mutant.to.trim()}"`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`mutation (code): ${mutants.length} mutants, ${survivors.length} survived`);
for (const survivor of survivors) {
  console.log(`  survived: ${survivor}`);
}
process.exit(survivors.length <= allow ? 0 : 1);
