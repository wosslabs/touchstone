#!/usr/bin/env node
// Reads touchstone.json from the pull request's base commit and writes what the
// Action needs as step outputs. A pull request cannot loosen the gates it is
// judged by, because the file is read from the base, not from the pull request.
//
//   node ci/action-config.js [--base sha] [--repo path]
// Writes name=value lines to $GITHUB_OUTPUT (or to the screen when unset).
import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gate, loadConfig } from "./config.js";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? "" : process.argv[index + 1];
}

export function outputsFor(config) {
  const red = gate(config, "red");
  const acceptance = gate(config, "acceptance");
  return {
    command: acceptance?.command ?? "",
    red_command: red?.command ?? "",
    setup: red?.setup ?? acceptance?.setup ?? "",
    mutate_mode: config.mutation?.mode ?? "",
    mutate_max: String(config.mutation?.maxMutants ?? ""),
    quality: (config.quality ?? []).join("\n"),
    protect: (config.protect ?? []).join("\n"),
  };
}

function write(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  for (const [name, value] of Object.entries(outputs)) {
    if (!file) {
      console.log(`${name}=${value.replaceAll("\n", " | ")}`);
      continue;
    }
    const delimiter = `touchstone_${randomBytes(8).toString("hex")}`;
    appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  }
}

function main() {
  const repo = resolve(option("--repo") || ".");
  let loaded;
  try {
    loaded = loadConfig(repo, option("--base"));
  } catch (error) {
    console.error(`touchstone.json: ${error.message}`);
    return 1;
  }
  if (!loaded) {
    console.log("touchstone.json: none, using the workflow inputs");
    write(outputsFor({}));
    return 0;
  }
  console.log(`touchstone.json: read from ${loaded.source}`);
  write(outputsFor(loaded.config));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
