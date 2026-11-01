#!/usr/bin/env node
// Finds the entry points of an existing code base: the places where the outside
// world meets the system. HTTP routes, scheduled jobs, message consumers,
// command line commands, screens, database tables and procedures, and COBOL
// programs. No model is involved. The result is the checklist a person or an
// agent works through when writing down what the system does.
//
//   node ci/discover.js [--repo path] [--out drafts/discovery] [--json]
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_DIRS = new Set([
  ".git", "node_modules", "target", "build", "dist", "out", ".venv", "venv", "vendor",
  "__pycache__", ".gradle", ".idea", ".next", "coverage", ".mvn", "bin", "obj",
]);
const MAX_FILE_BYTES = 1024 * 1024;

const LANGUAGES = {
  ".java": "Java", ".kt": "Kotlin", ".scala": "Scala", ".groovy": "Groovy",
  ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".jsx": "JavaScript",
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".py": "Python", ".rb": "Ruby", ".php": "PHP", ".go": "Go", ".rs": "Rust",
  ".cs": "C#", ".vb": "Visual Basic", ".cpp": "C++", ".cc": "C++", ".c": "C", ".h": "C",
  ".cbl": "COBOL", ".cob": "COBOL", ".cpy": "COBOL", ".pl": "Perl", ".sh": "Shell",
  ".sql": "SQL", ".mojo": "Mojo", ".swift": "Swift", ".m": "Objective-C",
  ".html": "HTML", ".vue": "Vue", ".svelte": "Svelte",
};

const METHODS = "get|post|put|delete|patch|head|options";

// Each detector reads one line. `capture` turns a regex match into
// { name, method? }. Kinds group the output.
const DETECTORS = [
  // HTTP routes
  { kind: "http-route", framework: "Spring", exts: [".java", ".kt"], pattern: /@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\(\s*(?:(?:value|path)\s*=\s*)?\{?\s*"([^"]*)")?/, capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] ?? "" }) },
  { kind: "http-route", framework: "Spring", exts: [".java", ".kt"], pattern: /@RequestMapping\s*\(\s*(?:(?:value|path)\s*=\s*)?\{?\s*"([^"]*)"/, capture: (m) => ({ name: m[1] }) },
  { kind: "http-route", framework: "JAX-RS", exts: [".java", ".kt"], pattern: /@Path\s*\(\s*"([^"]*)"/, capture: (m) => ({ name: m[1] }) },
  { kind: "http-route", framework: "Express/Koa/Fastify", exts: [".js", ".mjs", ".cjs", ".ts"], pattern: new RegExp(`\\b(?:app|router|server|api|fastify)\\.(${METHODS})\\(\\s*['"\`]([^'"\`]+)`, "i"), capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] }) },
  { kind: "http-route", framework: "NestJS", exts: [".ts"], pattern: /@(Get|Post|Put|Delete|Patch)\(\s*(?:['"]([^'"]*)['"])?/, capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] ?? "" }) },
  { kind: "http-route", framework: "Flask", exts: [".py"], pattern: /@\w+\.route\(\s*['"]([^'"]+)['"](?:.*methods\s*=\s*\[([^\]]*)\])?/, capture: (m) => ({ name: m[1], method: m[2] ? m[2].replace(/['"\s]/g, "").toUpperCase() : "GET" }) },
  { kind: "http-route", framework: "FastAPI", exts: [".py"], pattern: new RegExp(`@\\w+\\.(${METHODS})\\(\\s*['"]([^'"]+)`, "i"), capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] }) },
  { kind: "http-route", framework: "Django", exts: [".py"], pattern: /\b(?:re_)?path\(\s*r?['"]([^'"]*)['"]\s*,/, capture: (m) => ({ name: `/${m[1]}` }) },
  { kind: "http-route", framework: "Go net/http, gin, echo", exts: [".go"], pattern: /\.(GET|POST|PUT|DELETE|PATCH)\(\s*"([^"]+)"/, capture: (m) => ({ method: m[1], name: m[2] }) },
  { kind: "http-route", framework: "Go net/http", exts: [".go"], pattern: /\bHandle(?:Func)?\(\s*"(?:(GET|POST|PUT|DELETE|PATCH)\s+)?([^"]+)"/, capture: (m) => ({ method: m[1] ?? "ANY", name: m[2] }) },
  { kind: "http-route", framework: "ASP.NET", exts: [".cs"], pattern: /\[Http(Get|Post|Put|Delete|Patch)(?:\(\s*"([^"]*)")?/, capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] ?? "" }) },
  { kind: "http-route", framework: "Rails", exts: [".rb"], pattern: /^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/, capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] }) },
  { kind: "http-route", framework: "Rails", exts: [".rb"], pattern: /^\s*resources?\s+:(\w+)/, capture: (m) => ({ method: "REST", name: `/${m[1]}` }) },
  { kind: "http-route", framework: "Laravel", exts: [".php"], pattern: new RegExp(`Route::(${METHODS})\\(\\s*['"]([^'"]+)`, "i"), capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] }) },
  { kind: "http-route", framework: "Rust (actix, rocket)", exts: [".rs"], pattern: /#\[(get|post|put|delete|patch)\(\s*"([^"]+)"/, capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] }) },
  { kind: "http-route", framework: "Rust tiny_http", exts: [".rs"], pattern: /\(\s*Method::(Get|Post|Put|Delete|Patch)\s*,\s*"([^"]+)"/, capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] }) },
  { kind: "http-route", framework: "Python http.server", exts: [".py"], pattern: /\bdef\s+do_(GET|POST|PUT|DELETE|PATCH)\s*\(/, capture: (m) => ({ method: m[1], name: "(handler)" }) },
  { kind: "http-route", framework: "Node http", exts: [".js", ".mjs", ".cjs", ".ts"], pattern: /\b(?:request|req)\.method\s*===?\s*['"](GET|POST|PUT|DELETE|PATCH)['"]/, capture: (m) => ({ method: m[1], name: "(handler)" }) },
  { kind: "http-route", framework: "Servlet", exts: [".java"], pattern: /@WebServlet\s*\(\s*(?:urlPatterns\s*=\s*|value\s*=\s*)?\{?\s*"([^"]+)"/, capture: (m) => ({ name: m[1] }) },

  // Scheduled jobs
  { kind: "scheduled-job", framework: "Spring", exts: [".java", ".kt"], pattern: /@Scheduled\s*\(([^)]*)\)/, capture: (m) => ({ name: m[1].trim() }) },
  { kind: "scheduled-job", framework: "NestJS", exts: [".ts"], pattern: /@Cron\(\s*([^)]*)\)/, capture: (m) => ({ name: m[1].trim() }) },
  { kind: "scheduled-job", framework: "node-cron", exts: [".js", ".mjs", ".cjs", ".ts"], pattern: /\bcron\.schedule\(\s*['"]([^'"]+)/, capture: (m) => ({ name: m[1] }) },
  { kind: "scheduled-job", framework: "Celery", exts: [".py"], pattern: /@\w+\.(?:task|periodic_task)\b/, capture: () => ({ name: "task" }) },
  { kind: "scheduled-job", framework: "Quartz", exts: [".java", ".kt"], pattern: /CronScheduleBuilder\.cronSchedule\(\s*"([^"]+)"/, capture: (m) => ({ name: m[1] }) },
  { kind: "scheduled-job", framework: "crontab", exts: [".cron", ".crontab"], pattern: /^\s*([\d*/,-]+\s+[\d*/,-]+\s+[\d*/,?LW-]+\s+[\d*/,A-Za-z-]+\s+[\d*/,?A-Za-z-]+)\s+\S+/, capture: (m) => ({ name: m[1] }) },

  // Message consumers
  { kind: "message-consumer", framework: "Spring Kafka", exts: [".java", ".kt"], pattern: /@KafkaListener\s*\(([^)]*)\)/, capture: (m) => ({ name: m[1].trim() }) },
  { kind: "message-consumer", framework: "Spring AMQP", exts: [".java", ".kt"], pattern: /@RabbitListener\s*\(([^)]*)\)/, capture: (m) => ({ name: m[1].trim() }) },
  { kind: "message-consumer", framework: "Spring JMS", exts: [".java", ".kt"], pattern: /@JmsListener\s*\(([^)]*)\)/, capture: (m) => ({ name: m[1].trim() }) },
  { kind: "message-consumer", framework: "AWS SQS", exts: [".java", ".kt"], pattern: /@SqsListener\s*\(([^)]*)\)/, capture: (m) => ({ name: m[1].trim() }) },
  { kind: "message-consumer", framework: "NestJS", exts: [".ts"], pattern: /@(?:EventPattern|MessagePattern)\(\s*([^)]*)\)/, capture: (m) => ({ name: m[1].trim() }) },
  { kind: "message-consumer", framework: "RabbitMQ (pika)", exts: [".py"], pattern: /\.basic_consume\(/, capture: () => ({ name: "queue" }) },
  { kind: "message-consumer", framework: "Kafka client", exts: [".js", ".ts", ".py", ".go"], pattern: /\.subscribe\(\s*(?:\{\s*topics?:\s*)?\[?\s*['"]([^'"]+)/, capture: (m) => ({ name: m[1] }) },

  // Command line commands
  { kind: "cli-command", framework: "argparse", exts: [".py"], pattern: /\.add_parser\(\s*['"]([^'"]+)/, capture: (m) => ({ name: m[1] }) },
  { kind: "cli-command", framework: "command dispatch", exts: [".mojo", ".py", ".go", ".js", ".ts", ".sh"], pattern: /\b(?:command|cmd|action|subcommand)\s*===?\s*["']([\w-]+)["']/, capture: (m) => ({ name: m[1] }) },
  { kind: "cli-command", framework: "click", exts: [".py"], pattern: /@\w+\.command\(\s*(?:name\s*=\s*)?['"]?([\w-]*)/, capture: (m) => ({ name: m[1] || "command" }) },
  { kind: "cli-command", framework: "commander", exts: [".js", ".mjs", ".cjs", ".ts"], pattern: /\.command\(\s*['"]([^'"]+)/, capture: (m) => ({ name: m[1] }) },
  { kind: "cli-command", framework: "cobra", exts: [".go"], pattern: /\bUse:\s*"([^"]+)"/, capture: (m) => ({ name: m[1] }) },
  { kind: "cli-command", framework: "Spring Shell / picocli", exts: [".java", ".kt"], pattern: /@(?:ShellMethod|Command)\s*\(([^)]*)\)/, capture: (m) => ({ name: m[1].trim() }) },

  // Screens
  { kind: "screen", framework: "React Router", exts: [".js", ".jsx", ".ts", ".tsx"], pattern: /<Route\b[^>]*\bpath=["'{]+([^"'}]+)/, capture: (m) => ({ name: m[1] }) },
  { kind: "screen", framework: "Vue / Angular routes", exts: [".js", ".ts", ".vue"], pattern: /^\s*\{?\s*path:\s*['"]([^'"]*)['"]\s*,/, capture: (m) => ({ name: `/${m[1].replace(/^\//, "")}` }) },
  { kind: "screen", framework: "Android", exts: [".java", ".kt"], pattern: /class\s+(\w+)\s*(?:\([^)]*\))?\s*(?::|extends)\s*(?:AppCompat)?Activity\b/, capture: (m) => ({ name: m[1] }) },
  { kind: "screen", framework: "HTML form", exts: [".html", ".vue", ".svelte"], pattern: /<form\b[^>]*\baction=["']([^"']*)["']/i, capture: (m) => ({ name: m[1] }) },

  // Database tables, procedures, views, triggers
  { kind: "db-table", framework: "SQL", exts: [".sql"], pattern: /\bCREATE\s+(?:GLOBAL\s+TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\[]?([\w.]+)/i, capture: (m) => ({ name: m[1] }) },
  { kind: "db-procedure", framework: "SQL", exts: [".sql"], pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION|TRIGGER|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\[]?([\w.]+)/i, capture: (m) => ({ method: m[1].toUpperCase(), name: m[2] }) },
  { kind: "db-table", framework: "JPA", exts: [".java", ".kt"], pattern: /@Table\s*\(\s*name\s*=\s*"([^"]+)"/, capture: (m) => ({ name: m[1] }) },
  { kind: "db-table", framework: "Django", exts: [".py"], pattern: /^class\s+(\w+)\(\s*(?:models\.)?Model\s*\)/, capture: (m) => ({ name: m[1] }) },
  { kind: "db-table", framework: "Sequelize / Mongoose", exts: [".js", ".ts"], pattern: /\b(?:sequelize\.define|mongoose\.model)\(\s*['"]([^'"]+)/, capture: (m) => ({ name: m[1] }) },

  // Mainframe
  { kind: "program", framework: "COBOL", exts: [".cbl", ".cob"], pattern: /\bPROGRAM-ID\.\s+([\w-]+)/i, capture: (m) => ({ name: m[1] }) },
  { kind: "program", framework: "JCL", exts: [".jcl"], pattern: /^\/\/([\w#@$]+)\s+JOB\b/, capture: (m) => ({ name: m[1] }) },
];

const KIND_TITLES = {
  "http-route": "HTTP routes",
  "scheduled-job": "Scheduled jobs",
  "message-consumer": "Message consumers",
  "cli-command": "Command line commands",
  screen: "Screens",
  "db-table": "Database tables",
  "db-procedure": "Stored procedures, functions, views and triggers",
  program: "Mainframe programs and jobs",
};

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? "" : process.argv[index + 1];
}

function* walk(directory) {
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

const BUILD_FILES = {
  "pom.xml": "Maven (Java)", "build.gradle": "Gradle", "build.gradle.kts": "Gradle (Kotlin DSL)",
  "package.json": "npm (Node)", "requirements.txt": "pip (Python)", "pyproject.toml": "Python project",
  "go.mod": "Go modules", "Cargo.toml": "Cargo (Rust)", "Gemfile": "Bundler (Ruby)",
  "composer.json": "Composer (PHP)", "Makefile": "Make", "Dockerfile": "Docker",
};

// Walks the code base once. Returns the inventory.
export function discover(root) {
  const files = { total: 0, byLanguage: {} };
  const entries = [];
  const buildFiles = [];
  const modules = new Map();
  for (const path of walk(root)) {
    const relativePath = relative(root, path).split("\\").join("/");
    const name = relativePath.split("/").pop();
    if (BUILD_FILES[name]) {
      buildFiles.push({ file: relativePath, tool: BUILD_FILES[name] });
    }
    const extension = extname(name).toLowerCase();
    const language = LANGUAGES[extension];
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      continue;
    }
    let text = "";
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) {
      continue;
    }
    const lines = text.split("\n");
    if (language) {
      files.total += 1;
      const stat = (files.byLanguage[language] ||= { files: 0, lines: 0 });
      stat.files += 1;
      stat.lines += lines.length;
      const top = relativePath.includes("/") ? relativePath.split("/").slice(0, relativePath.startsWith("src/") ? 3 : 1).join("/") : ".";
      const module = modules.get(top) || { path: top, files: 0, lines: 0 };
      module.files += 1;
      module.lines += lines.length;
      modules.set(top, module);
    }
    const applicable = DETECTORS.filter((detector) => detector.exts.includes(extension));
    if (applicable.length === 0) {
      continue;
    }
    lines.forEach((line, index) => {
      for (const detector of applicable) {
        const match = detector.pattern.exec(line);
        if (match) {
          entries.push({ kind: detector.kind, framework: detector.framework, ...detector.capture(match), file: relativePath, line: index + 1 });
        }
      }
    });
  }
  return {
    root: ".",
    files,
    buildFiles,
    modules: [...modules.values()].sort((a, b) => b.lines - a.lines),
    entries,
  };
}

function entryLabel(entry) {
  const method = entry.method ? `${entry.method} ` : "";
  return `${method}${entry.name || "(root)"}`.trim();
}

export function toMarkdown(inventory) {
  const out = [];
  out.push("# Inventory of entry points", "");
  out.push("Found by reading the code, with no model involved. Each row is a place where the outside world meets the system, so each one needs a sentence that says what a person gets from it, or a note that it is dead.", "");
  out.push("## Size", "");
  out.push("| Language | Files | Lines |", "| --- | --- | --- |");
  for (const [language, stat] of Object.entries(inventory.files.byLanguage).sort((a, b) => b[1].lines - a[1].lines)) {
    out.push(`| ${language} | ${stat.files} | ${stat.lines} |`);
  }
  out.push("");
  if (inventory.buildFiles.length) {
    out.push("## Build and runtime files", "");
    for (const build of inventory.buildFiles) {
      out.push(`- \`${build.file}\` (${build.tool})`);
    }
    out.push("");
  }
  out.push("## Modules by size", "", "| Path | Files | Lines |", "| --- | --- | --- |");
  for (const module of inventory.modules.slice(0, 25)) {
    out.push(`| \`${module.path}\` | ${module.files} | ${module.lines} |`);
  }
  out.push("");
  const byKind = new Map();
  for (const entry of inventory.entries) {
    byKind.set(entry.kind, [...(byKind.get(entry.kind) || []), entry]);
  }
  for (const [kind, title] of Object.entries(KIND_TITLES)) {
    const found = byKind.get(kind);
    if (!found) {
      continue;
    }
    out.push(`## ${title} (${found.length})`, "", "| Entry | Where | Framework |", "| --- | --- | --- |");
    for (const entry of found) {
      out.push(`| \`${entryLabel(entry)}\` | \`${entry.file}:${entry.line}\` | ${entry.framework} |`);
    }
    out.push("");
  }
  if (inventory.entries.length === 0) {
    out.push("## No entry points found", "", "No known framework patterns matched. The system may use a framework this tool does not know, or a language it does not read. Start from the build files and the largest modules above, and find the entry points by hand.", "");
  }
  return `${out.join("\n")}\n`;
}

function main() {
  const root = resolve(option("--repo") || ".");
  const inventory = discover(root);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
    return 0;
  }
  const outDir = resolve(root, option("--out") || "drafts/discovery");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
  writeFileSync(join(outDir, "inventory.md"), toMarkdown(inventory));
  const counts = {};
  for (const entry of inventory.entries) {
    counts[entry.kind] = (counts[entry.kind] || 0) + 1;
  }
  const summary = Object.entries(counts).map(([kind, count]) => `${count} ${kind}`).join(", ") || "no entry points";
  console.log(`discover: ${inventory.files.total} source files, ${summary}`);
  console.log(`wrote ${relative(process.cwd(), join(outDir, "inventory.md")) || "inventory.md"} and inventory.json`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
