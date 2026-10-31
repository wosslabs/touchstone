#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return "";
  }
  return process.argv[index + 1];
}

function copyIfMissing(from, to) {
  if (existsSync(to)) {
    console.log(`kept ${to}`);
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  console.log(`wrote ${to}`);
}

function writeIfMissing(path, text) {
  if (existsSync(path)) {
    console.log(`kept ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(`wrote ${path}`);
}

function ensureAcceptanceScript(directory) {
  const path = join(directory, "package.json");
  if (!existsSync(path)) {
    writeFileSync(
      path,
      JSON.stringify(
        {
          private: true,
          type: "module",
          scripts: { acceptance: "cucumber-js" },
          devDependencies: {
            "@cucumber/cucumber": "^11.3.0",
            playwright: "^1.56.0",
          },
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`wrote ${path}`);
    return;
  }
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.scripts = json.scripts || {};
  if (!json.scripts.acceptance) {
    json.scripts.acceptance = "cucumber-js";
    writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
    console.log(`added the acceptance script to ${path}`);
    return;
  }
  console.log(`kept ${path}`);
}

function importFeatures(directory, source) {
  const files = readdirSync(source).filter((name) => name.endsWith(".feature"));
  if (files.length === 0) {
    console.log(`no feature files in ${source}`);
    return;
  }
  for (const name of files) {
    const from = join(source, name);
    copyIfMissing(from, join(directory, "features", name));
    const draft = join(directory, "drafts", "imported", name);
    copyIfMissing(from, draft);
    console.log(`approve ${draft} by saving it under stories/`);
  }
}

function init(directory) {
  mkdirSync(join(directory, "stories"), { recursive: true });
  mkdirSync(join(directory, "drafts"), { recursive: true });
  mkdirSync(join(directory, "features"), { recursive: true });
  copyIfMissing(
    join(packageRoot, "templates", "acceptance-guard.yml"),
    join(directory, ".github", "workflows", "acceptance-guard.yml"),
  );
  copyIfMissing(
    join(packageRoot, "templates", "CODEOWNERS"),
    join(directory, "CODEOWNERS"),
  );
  writeIfMissing(
    join(directory, "cucumber.js"),
    'export default {\n  paths: ["features/*.feature"],\n  import: ["features/**/*.js"]\n};\n',
  );
  writeIfMissing(
    join(directory, "features", "steps.js"),
    'import { Given, Then, When } from "@cucumber/cucumber";\nimport { chromium } from "playwright";\n\n// Playwright opens the screen. An HTTP step calls the running service.\n// A mobile step calls Maestro. The words stay in the feature file.\nvoid chromium;\nvoid Given;\nvoid When;\nvoid Then;\n',
  );
  ensureAcceptanceScript(directory);
  const features = argument("--features");
  if (features) {
    importFeatures(directory, resolve(features));
  }
  console.log("Next: save the approved story in stories/, then run npx @wosslabs/touchstone check");
}

const CHECKS = {
  check: "check-trace.js",
  guard: "check-acceptance-guard.js",
  red: "check-red-green.js",
};

const command = process.argv[2];
if (CHECKS[command]) {
  const forwarded = process.argv.slice(3);
  const result = spawnSync("node", [join(packageRoot, "ci", CHECKS[command]), ...forwarded], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}
if (command !== "init") {
  console.error("usage: touchstone init [--dir path] [--features path]\n       touchstone check [--repo path]\n       touchstone guard [--base sha] [--repo path]\n       touchstone red --base sha --command cmd [--setup cmd] [--repo path]");
  process.exit(1);
}
init(resolve(argument("--dir") || "."));
