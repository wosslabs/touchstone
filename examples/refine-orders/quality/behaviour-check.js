// Behaviour that must survive a refactoring, including what the acceptance
// scenarios do not cover: the response carries a formatted total, and creating
// an order writes an audit line. Exits 1 if either is gone.
//   node quality/behaviour-check.js [--root dir]
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootIndex = process.argv.indexOf("--root");
const root = resolve(rootIndex === -1 ? "." : process.argv[rootIndex + 1]);
const cwd = mkdtempSync(join(tmpdir(), "touchstone-behaviour-"));
const problems = [];
try {
  process.chdir(cwd);
  const { createApp } = await import(pathToFileURL(join(root, "src", "server.js")).href);
  const server = createApp();
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer: "bob", lines: [{ name: "Widget", price: 1234.5, qty: 1 }, { name: "Pen", price: 2, qty: 10 }] }),
  });
  const body = await response.json();
  if (response.status !== 201) {
    problems.push(`creating an order answered ${response.status}`);
  }
  if (body.display !== "$1,252.50") {
    problems.push(`the formatted total was ${JSON.stringify(body.display)}, expected "$1,252.50"`);
  }
  if (!String(body.receipt).includes("Pen x10  $20.00")) {
    problems.push("the receipt lost a line");
  }
  let audit = "";
  try {
    audit = readFileSync(join(cwd, "audit.log"), "utf8");
  } catch {
    audit = "";
  }
  if (!/created \d+/.test(audit)) {
    problems.push("creating an order no longer writes an audit line");
  }
  await new Promise((resolveClose) => server.close(resolveClose));
} catch (error) {
  problems.push(`could not run the service: ${error.message}`);
} finally {
  process.chdir(tmpdir());
  rmSync(cwd, { recursive: true, force: true });
}
console.log(`behaviour: ${problems.length} problems`);
for (const problem of problems) {
  console.log(`  ${problem}`);
}
process.exit(problems.length === 0 ? 0 : 1);
