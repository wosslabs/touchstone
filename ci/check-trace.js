#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SCENARIO = /^Scenario(?: Outline)?:\s*(.+)$/;
const STEP = /^(Given|When|Then|And|But)\s+(.+)$/;
const EXAMPLES = /^(?:Examples|Scenarios):/;
const SCRIPT_SUFFIXES = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".java", ".kt"];
const DEFINITION = /(?:Given|When|Then|defineStep|given|when|then)\s*\(\s*(['"`])([\s\S]*?)\1|@(?:given|when|then|step)\(\s*(['"])([\s\S]*?)\3/g;
const STEP_SUFFIXES = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".java", ".kt"];
const STEP_ROOTS = ["features", "src/test"];
const CUCUMBER_TYPES = {
  string: '(?:"[^"]*"|\'[^\']*\')',
  int: "-?\\d+",
  float: "-?\\d+\\.\\d+",
  double: "-?\\d+\\.\\d+",
  bigdecimal: "-?\\d+(?:\\.\\d+)?",
  word: "\\S+",
};

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return "";
  }
  return process.argv[index + 1];
}

function posix(root, path) {
  return relative(root, path).split("\\").join("/");
}

function normalizeRow(line) {
  return `| ${line.split("|").slice(1, -1).map((cell) => cell.trim()).join(" | ")} |`;
}

function scenariosIn(text) {
  const found = [];
  let title = null;
  let steps = [];
  let inDocString = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith('"""')) {
      inDocString = !inDocString;
      if (title !== null) {
        steps.push('"""');
      }
      continue;
    }
    if (inDocString) {
      if (title !== null) {
        steps.push(`  ${line}`);
      }
      continue;
    }
    if (!line || line.startsWith("#") || line.startsWith("```")) {
      continue;
    }
    const scenario = SCENARIO.exec(line);
    if (scenario) {
      if (title !== null) {
        found.push([title, steps]);
      }
      title = scenario[1].trim();
      steps = [];
      continue;
    }
    if (title === null) {
      continue;
    }
    const step = STEP.exec(line);
    if (step) {
      steps.push(`${step[1]} ${step[2].trim()}`);
    } else if (line.startsWith("|") && line.endsWith("|")) {
      steps.push(normalizeRow(line));
    } else if (EXAMPLES.test(line)) {
      steps.push(line);
    }
  }
  if (title !== null) {
    found.push([title, steps]);
  }
  return found;
}

function collect(root, directory, suffix) {
  const rows = [];
  let names = [];
  try {
    names = readdirSync(directory);
  } catch {
    return rows;
  }
  for (const name of names.sort()) {
    if (!name.endsWith(suffix)) {
      continue;
    }
    const path = join(directory, name);
    if (!statSync(path).isFile()) {
      continue;
    }
    for (const [title, steps] of scenariosIn(readFileSync(path, "utf8"))) {
      rows.push([title, posix(root, path), steps]);
    }
  }
  return rows;
}

function index(rows) {
  const byTitle = new Map();
  const duplicates = [];
  for (const [title, path, steps] of rows) {
    if (byTitle.has(title)) {
      duplicates.push(`scenario "${title}" appears in ${byTitle.get(title)[0]} and ${path}`);
      continue;
    }
    byTitle.set(title, [path, steps]);
  }
  return [byTitle, duplicates];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expressionToRegex(expression) {
  if (expression.startsWith("^")) {
    return new RegExp(expression);
  }
  const parts = [];
  let cursor = 0;
  while (cursor < expression.length) {
    if (expression[cursor] !== "{") {
      const nextBrace = expression.indexOf("{", cursor);
      if (nextBrace === -1) {
        parts.push(escapeRegExp(expression.slice(cursor)));
        break;
      }
      parts.push(escapeRegExp(expression.slice(cursor, nextBrace)));
      cursor = nextBrace;
      continue;
    }
    const end = expression.indexOf("}", cursor);
    if (end === -1) {
      parts.push(escapeRegExp(expression.slice(cursor)));
      break;
    }
    const name = expression.slice(cursor + 1, end);
    parts.push(CUCUMBER_TYPES[name] || ".+");
    cursor = end + 1;
  }
  return new RegExp(`^${parts.join("")}$`);
}

function walk(directory, found = []) {
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules") {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path, found);
      continue;
    }
    if (STEP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      found.push(path);
    }
  }
  return found;
}

function isEmptyBody(text, from) {
  const open = text.indexOf("{", from);
  if (open === -1) {
    return false;
  }
  let depth = 0;
  for (let cursor = open; cursor < text.length; cursor += 1) {
    if (text[cursor] === "{") {
      depth += 1;
    } else if (text[cursor] === "}") {
      depth -= 1;
      if (depth === 0) {
        const body = text.slice(open + 1, cursor).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
        return body.trim() === "";
      }
    }
  }
  return false;
}

function definitionsIn(root) {
  const found = [];
  const paths = STEP_ROOTS.flatMap((name) => walk(join(root, name)).sort());
  for (const path of paths) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(DEFINITION)) {
      const empty = SCRIPT_SUFFIXES.some((suffix) => path.endsWith(suffix)) && isEmptyBody(text, match.index + match[0].length);
      found.push([posix(root, path), expressionToRegex(match[2] || match[4]), empty]);
    }
  }
  return found;
}

function bind(steps, definitions) {
  const lines = [];
  const missing = [];
  const empty = [];
  for (const step of steps) {
    const body = STEP.exec(step);
    if (!body) {
      continue;
    }
    const match = definitions.find(([, pattern]) => pattern.test(body[2]));
    if (!match) {
      missing.push(step);
      continue;
    }
    if (match[2]) {
      empty.push(`${step}\n    definition: ${match[0]}`);
    }
    lines.push(`  ${step}\n    definition: ${match[0]}`);
  }
  return [lines, missing, empty];
}

function compare(examples, features, definitions) {
  const failures = [];
  const traces = [];
  const titles = [...new Set([...examples.keys(), ...features.keys()])].sort();
  for (const title of titles) {
    const example = examples.get(title);
    const feature = features.get(title);
    if (!example && feature) {
      failures.push(`scenario "${title}" is in ${feature[0]} and has no approved story`);
      continue;
    }
    if (!feature && example) {
      failures.push(`scenario "${title}" is in ${example[0]} and has no Cucumber scenario`);
      continue;
    }
    if (!example || !feature) {
      continue;
    }
    if (example[1].join("\n") !== feature[1].join("\n")) {
      failures.push(
        `scenario "${title}" steps differ\n  story: ${example[1].join(" | ")}\n  feature: ${feature[1].join(" | ")}`,
      );
      continue;
    }
    let block = `${title}\n  story: ${example[0]}\n  feature: ${feature[0]}\n  steps: ${example[1].filter((step) => STEP.test(step)).length}`;
    if (definitions.length) {
      const [lines, missing, empty] = bind(example[1], definitions);
      if (empty.length) {
        failures.push(`scenario "${title}" has steps whose definition does nothing\n${empty.map((step) => `  ${step}`).join("\n")}`);
        continue;
      }
      if (missing.length) {
        failures.push(`scenario "${title}" has steps with no definition\n${missing.map((step) => `  ${step}`).join("\n")}`);
        continue;
      }
      block = `${block}\n${lines.join("\n")}`;
    }
    traces.push(block);
  }
  return [traces, failures];
}

function main() {
  const root = resolve(option("--repo") || ".");
  const storiesDir = join(root, "stories");
  const exampleRows = collect(root, storiesDir, ".md").concat(collect(root, storiesDir, ".feature"));
  const featureRows = collect(root, join(root, "features"), ".feature");
  const [examples, exampleDupes] = index(exampleRows);
  const [features, featureDupes] = index(featureRows);
  const definitions = definitionsIn(root);
  const [traces, compared] = compare(examples, features, definitions);
  const failures = exampleDupes.concat(featureDupes, compared);
  if (features.size > 0 && definitions.length === 0) {
    failures.push(
      `no step definitions found under ${STEP_ROOTS.join(" or ")} (.js, .ts, .py, .java, .kt), so no sentence can be traced to code`,
    );
  }
  if (examples.size === 0 && features.size === 0 && failures.length === 0) {
    console.log("trace: no approved scenarios");
    return 0;
  }
  if (failures.length) {
    console.log("trace failed:");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    return 1;
  }
  console.log("trace");
  console.log(traces.join("\n"));
  return 0;
}

process.exit(main());
