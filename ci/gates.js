#!/usr/bin/env node
// Runs the gates named in touchstone.json, and checks that a phase of the
// agent's inner loop stayed inside its fence.
//
//   node ci/gates.js list
//   node ci/gates.js run <gate> [--repo path]
//   node ci/gates.js phase <phase> [--base ref] [--repo path]
//
// `run` executes the gate's command from the protected config, so a skill can say
// "run the acceptance gate" without knowing the command. `phase` fails when the
// phase changed a file it may not touch, then runs the phase's gates in order.
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ALWAYS_FORBIDDEN, gate, loadConfig, matchesAny } from "./config.js";

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

// Files this phase changed: tracked changes against the base, plus new files.
export function changedFiles(repo, base) {
  const tracked = git(repo, ["diff", "--name-only", base]).split("\n");
  const added = git(repo, ["ls-files", "--others", "--exclude-standard"]).split("\n");
  return [...new Set([...tracked, ...added].filter(Boolean))].sort();
}

// Returns the files a phase may not have changed, each with the reason.
export function fenceViolations(files, phase = {}) {
  const forbidden = [...ALWAYS_FORBIDDEN, ...(phase.forbid ?? [])];
  const violations = [];
  for (const file of files) {
    if (matchesAny(file, forbidden)) {
      violations.push([file, "this file belongs to a person or to the pipeline"]);
    } else if (phase.allow && !matchesAny(file, phase.allow)) {
      violations.push([file, `outside what this phase may change (${phase.allow.join(", ")})`]);
    }
  }
  return violations;
}

function run(repo, command, label) {
  console.log(`gate: ${label}`);
  const result = spawnSync(command, { cwd: repo, shell: true, stdio: "inherit" });
  return result.status ?? 1;
}

function load(repo, base) {
  const loaded = loadConfig(repo, base);
  if (!loaded) {
    throw new Error("no touchstone.json in this repository");
  }
  return loaded.config;
}

function main() {
  const [action, name] = process.argv.slice(2);
  const repo = resolve(option("--repo") || ".");
  let config;
  try {
    if (action === "list") {
      config = load(repo, "");
      for (const [gateName, value] of Object.entries(config.gates ?? {})) {
        console.log(`${gateName}: ${typeof value === "string" ? value : value.command}`);
      }
      return 0;
    }
    if (action === "run") {
      config = load(repo, "");
      const found = name ? gate(config, name) : null;
      if (!found) {
        console.error(`gates: no gate named "${name ?? ""}"`);
        return 1;
      }
      return run(repo, found.command, name);
    }
    if (action === "phase") {
      const base = option("--base") || "HEAD";
      config = load(repo, "");
      const phase = name ? config.phases?.[name] : null;
      if (!phase) {
        console.error(`gates: no phase named "${name ?? ""}"`);
        return 1;
      }
      const violations = fenceViolations(changedFiles(repo, base), phase);
      if (violations.length) {
        console.log(`phase ${name} left its fence:`);
        for (const [file, reason] of violations) {
          console.log(`- ${file}: ${reason}`);
        }
        return 1;
      }
      for (const gateName of phase.gates ?? []) {
        const found = gate(config, gateName);
        const status = run(repo, found.command, gateName);
        if (status !== 0) {
          console.log(`phase ${name} failed at gate ${gateName}`);
          return 1;
        }
      }
      console.log(`phase ${name} passed`);
      return 0;
    }
  } catch (error) {
    console.error(`gates: ${error.message}`);
    return 1;
  }
  console.error("usage: gates list | gates run <gate> | gates phase <phase> [--base ref]");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
