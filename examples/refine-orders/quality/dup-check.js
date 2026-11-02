// Duplicate-code check. Finds blocks of lines that appear more than once in src/.
// A "block" is 6 consecutive non-empty lines, compared after trimming and
// collapsing spaces and ignoring comments. Prints the count and exits 1 if any.
//   node quality/dup-check.js [--root dir]
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WINDOW = 6;
const rootIndex = process.argv.indexOf("--root");
const root = resolve(rootIndex === -1 ? "." : process.argv[rootIndex + 1]);

function files(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files(path, found);
    } else if (entry.name.endsWith(".js")) {
      found.push(path);
    }
  }
  return found;
}

const seen = new Map();
for (const path of files(join(root, "src"))) {
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim().replace(/\s+/g, " "))
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => text !== "");
  for (let start = 0; start + WINDOW <= lines.length; start += 1) {
    const block = lines.slice(start, start + WINDOW);
    if (block.every(({ text }) => /^[})\]{;,]*$/.test(text))) {
      continue;
    }
    const key = block.map(({ text }) => text).join("\n");
    const where = `${relative(root, path)}:${block[0].line}`;
    seen.set(key, [...(seen.get(key) ?? []), where]);
  }
}

const duplicated = [...seen.values()].filter((places) => places.length > 1);
// Windows overlap, so a long repeated block shows up as several windows. Count a
// run of overlapping windows once by counting distinct first locations per file pair.
const groups = new Set(duplicated.map((places) => places.map((place) => place.split(":")[0]).sort().join("|")));
console.log(`duplication: ${duplicated.length} repeated blocks across ${groups.size} file combinations`);
for (const places of duplicated.slice(0, 5)) {
  console.log(`  repeated at ${places.join(", ")}`);
}
process.exit(duplicated.length === 0 ? 0 : 1);
