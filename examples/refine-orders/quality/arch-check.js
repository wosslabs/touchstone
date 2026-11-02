// Dependency rule: the domain (src/domain) must not depend on anything outside it
// or on Node's I/O modules. Prints each violation and exits 1 if any.
//   node quality/arch-check.js [--root dir]
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const rootIndex = process.argv.indexOf("--root");
const root = resolve(rootIndex === -1 ? "." : process.argv[rootIndex + 1]);
const domain = join(root, "src", "domain");

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

const violations = [];
for (const path of files(domain)) {
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(/(?:import\s[^;]*?from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)) {
    const target = match[1];
    if (target.startsWith("node:") || /^(fs|http|https|net|child_process|os|path)$/.test(target)) {
      violations.push(`${relative(root, path)} imports ${target}: the domain must not do I/O`);
    } else if (target.startsWith(".")) {
      const resolved = resolve(dirname(path), target);
      if (!resolved.startsWith(`${domain}/`)) {
        violations.push(`${relative(root, path)} imports ${target}: the domain must not depend on code outside it`);
      }
    }
  }
}
console.log(`architecture: ${violations.length} violations`);
for (const violation of violations) {
  console.log(`  ${violation}`);
}
process.exit(violations.length === 0 ? 0 : 1);
