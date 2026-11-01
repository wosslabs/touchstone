#!/usr/bin/env node
// Turns the checked draft features about an existing system into a plain
// document for people who need to understand it: what the system does, in the
// words of the business, with how sure we are about each statement.
//
//   node ci/requirements-doc.js [--repo path] [--drafts drafts/legacy] [--out REQUIREMENTS.md]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { featureOutline } from "./gherkin.js";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? "" : process.argv[index + 1];
}

function featureFiles(directory, found = []) {
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      featureFiles(path, found);
    } else if (entry.name.endsWith(".feature")) {
      found.push(path);
    }
  }
  return found;
}

const STATUS = [
  ["@dead", "Dead code: nothing reaches it"],
  ["@suspected-bug", "Looks like a bug: the code does this, but the business may not want it"],
  ["@unclear", "Unclear: a person must say what the business wants"],
];

export function statusOf(tags) {
  for (const [tag, text] of STATUS) {
    if (tags.includes(tag)) {
      return { label: text, tag };
    }
  }
  return { label: "Observed: the code does this", tag: "@observed" };
}

function evidenceOf(tags) {
  return tags.filter((tag) => tag.startsWith("@evidence:")).map((tag) => tag.slice("@evidence:".length));
}

export function render(files) {
  const out = ["# Requirements found in the existing system", ""];
  out.push("These statements were written down by reading the code and checked by running them against the system as it is today. They describe what the system does now. They are not a statement of what the business wants until a person has approved them.", "");
  const totals = { observed: 0, unclear: 0, bug: 0, dead: 0 };
  const sections = [];
  for (const { name, text } of files) {
    let outline;
    try {
      outline = featureOutline(text);
    } catch (error) {
      sections.push(`## ${name}\n\nThis file could not be read: ${String(error.message).split("\n")[0]}\n`);
      continue;
    }
    if (!outline) {
      continue;
    }
    const lines = [`## ${outline.name}`, ""];
    if (outline.description) {
      lines.push(outline.description, "");
    }
    if (outline.background.length) {
      lines.push("Always true in this area:", "", ...outline.background.map((step) => `- ${step}`), "");
    }
    let rule = null;
    for (const scenario of outline.scenarios) {
      if (scenario.rule !== rule && scenario.rule) {
        lines.push(`### Rule: ${scenario.rule}`, "");
      }
      rule = scenario.rule;
      const status = statusOf(scenario.tags);
      totals[{ "@observed": "observed", "@unclear": "unclear", "@suspected-bug": "bug", "@dead": "dead" }[status.tag]] += 1;
      lines.push(`**${scenario.title}**`, "", `_${status.label}._`, "");
      lines.push(...scenario.steps.map((step) => (step.startsWith("|") ? `    ${step}` : `- ${step}`)));
      if (scenario.examples.length) {
        lines.push("", "Examples:", "", ...scenario.examples.map((line) => `    ${line}`));
      }
      const evidence = evidenceOf(scenario.tags);
      if (evidence.length) {
        lines.push("", `Where in the code: ${evidence.map((reference) => `\`${reference}\``).join(", ")}`);
      }
      lines.push("");
    }
    sections.push(lines.join("\n"));
  }
  out.push("## Summary", "", "| Kind | Count |", "| --- | --- |");
  out.push(`| Observed | ${totals.observed} |`, `| Unclear, needs a person | ${totals.unclear} |`, `| Looks like a bug | ${totals.bug} |`, `| Dead code | ${totals.dead} |`, "");
  return `${out.join("\n")}\n${sections.join("\n")}`;
}

function main() {
  const root = resolve(option("--repo") || ".");
  const drafts = resolve(root, option("--drafts") || "drafts/legacy");
  const outPath = resolve(root, option("--out") || join(relative(root, drafts) || ".", "REQUIREMENTS.md"));
  const files = featureFiles(drafts).map((path) => ({ name: relative(root, path).split(sep).join("/"), text: readFileSync(path, "utf8") }));
  if (files.length === 0) {
    console.log(`requirements: no feature files under ${relative(root, drafts) || "."}`);
    return 0;
  }
  writeFileSync(outPath, render(files));
  console.log(`requirements: wrote ${relative(root, outPath)} from ${files.length} feature files`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
