// The gate configuration: one human-owned file that names the commands which
// decide whether a change is good. The pull request Action and the agent's
// inner loop both read it, so they cannot disagree about what "passing" means,
// and an agent cannot redefine it.
//
// touchstone.json:
//   {
//     "gates": {
//       "acceptance": "npx cucumber-js --strict",
//       "unit": "npm test",
//       "red": { "command": "npx cucumber-js ... --name \"$TOUCHSTONE_SCENARIO\" ...", "setup": "npm ci --ignore-scripts" }
//     },
//     "quality": ["unit"],
//     "protect": ["quality/**"],
//     "mutation": { "mode": "warn", "maxMutants": 30 },
//     "phases": {
//       "clean": { "allow": ["src/**", "tests/**"], "gates": ["unit", "acceptance"] }
//     }
//   }
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILE = "touchstone.json";

// Never changed by an agent working inside a phase, whatever the config says.
export const ALWAYS_FORBIDDEN = [
  "stories/**",
  "**/*.feature",
  ".github/workflows/**",
  "touchstone.json",
  "CODEOWNERS",
  ".github/CODEOWNERS",
  ".claude/**",
  ".cursor/hooks/**",
];

const MODES = new Set(["off", "warn", "fail"]);

function escapeRegExp(text) {
  return text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

// Turns a glob into a regular expression. "**" crosses directories, "*" and "?"
// stay inside one path segment.
export function globToRegExp(glob) {
  let out = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        const slash = glob[index + 2] === "/";
        out += slash ? "(?:.*/)?" : ".*";
        index += slash ? 2 : 1;
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else {
      out += escapeRegExp(char);
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchesAny(path, globs) {
  return globs.some((glob) => globToRegExp(glob).test(path));
}

function gitShow(repo, revision, path) {
  try {
    return execFileSync("git", ["show", `${revision}:${path}`], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function gateCommand(value) {
  return typeof value === "string" ? { command: value } : value;
}

// Returns a list of problems with a parsed config. Empty means it is usable.
export function validate(config) {
  const problems = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["the config must be a JSON object"];
  }
  const gates = config.gates ?? {};
  if (typeof gates !== "object" || Array.isArray(gates)) {
    problems.push("gates must be an object of name to command");
  }
  for (const [name, value] of Object.entries(gates)) {
    const gate = gateCommand(value);
    if (!gate || typeof gate.command !== "string" || gate.command.trim() === "") {
      problems.push(`gate "${name}" needs a command`);
    }
    if (gate && gate.setup !== undefined && typeof gate.setup !== "string") {
      problems.push(`gate "${name}": setup must be a string`);
    }
  }
  const known = new Set(Object.keys(gates));
  for (const name of config.quality ?? []) {
    if (!known.has(name)) {
      problems.push(`quality names an unknown gate "${name}"`);
    }
  }
  if (config.protect !== undefined && !(Array.isArray(config.protect) && config.protect.every((item) => typeof item === "string" && item.trim() !== ""))) {
    problems.push("protect must be a list of path globs");
  }
  if (config.mutation !== undefined) {
    if (config.mutation.mode !== undefined && !MODES.has(config.mutation.mode)) {
      problems.push('mutation.mode must be "off", "warn" or "fail"');
    }
    if (config.mutation.maxMutants !== undefined && !(Number.isInteger(config.mutation.maxMutants) && config.mutation.maxMutants > 0)) {
      problems.push("mutation.maxMutants must be a positive whole number");
    }
  }
  for (const [name, phase] of Object.entries(config.phases ?? {})) {
    for (const gate of phase.gates ?? []) {
      if (!known.has(gate)) {
        problems.push(`phase "${name}" names an unknown gate "${gate}"`);
      }
    }
    for (const list of [phase.allow, phase.forbid]) {
      if (list !== undefined && !(Array.isArray(list) && list.every((item) => typeof item === "string"))) {
        problems.push(`phase "${name}": allow and forbid must be lists of globs`);
      }
    }
  }
  return problems;
}

// Reads the config from a git revision when one is given, so a pull request
// cannot loosen the gates it is judged by. Falls back to the working tree for
// the first pull request that adds the file. Returns { config, source } or null.
export function loadConfig(repo, base = "") {
  let text = null;
  let source = "";
  if (base) {
    text = gitShow(repo, base, CONFIG_FILE);
    source = `${CONFIG_FILE} at ${base}`;
  }
  if (text === null) {
    const path = join(repo, CONFIG_FILE);
    if (!existsSync(path)) {
      return null;
    }
    text = readFileSync(path, "utf8");
    source = `${CONFIG_FILE} in the working tree`;
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error.message}`);
  }
  const problems = validate(config);
  if (problems.length) {
    throw new Error(`${source} has problems:\n- ${problems.join("\n- ")}`);
  }
  return { config, source };
}

export function gate(config, name) {
  const value = config.gates?.[name];
  return value === undefined ? null : gateCommand(value);
}

// Paths that judge a change, such as the scripts a quality gate runs. A person owns
// them: the hook refuses agent edits, the phase fence forbids them, and the Action
// runs the base commit's version of them.
export function protectGlobs(config) {
  return config?.protect ?? [];
}

// Warnings, not errors. A gate that runs an npm script is only as strong as the
// package.json it reads, and a pull request can change that file.
export function lint(config) {
  const warnings = [];
  for (const [name, value] of Object.entries(config.gates ?? {})) {
    const command = gateCommand(value)?.command ?? "";
    if (/\b(?:npm|pnpm|yarn)\s+(?:run|run-script)\b/.test(command)) {
      warnings.push(`gate "${name}" runs a script from package.json (${command}). A pull request can change package.json. Call the tool directly, for example "node quality/${name}.js", and list that path under protect.`);
    }
  }
  return warnings;
}
