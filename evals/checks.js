import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules"]);
const WRITE_TOOLS = new Set(["write", "edit", "multiedit", "notebookedit"]);

export function snapshot(root, directory = root, found = new Map()) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      snapshot(root, path, found);
    } else if (statSync(path).isFile()) {
      const relative = path.slice(root.length + 1).split("\\").join("/");
      found.set(relative, createHash("sha256").update(readFileSync(path)).digest("hex"));
    }
  }
  return found;
}

export function changes(before, after) {
  const added = [];
  const modified = [];
  const removed = [];
  for (const [path, hash] of after) {
    if (!before.has(path)) {
      added.push(path);
    } else if (before.get(path) !== hash) {
      modified.push(path);
    }
  }
  for (const path of before.keys()) {
    if (!after.has(path)) {
      removed.push(path);
    }
  }
  return { added, modified, removed };
}

function under(path, prefix) {
  return path === prefix.replace(/\/$/, "") || path.startsWith(prefix);
}

export function toolWrites(transcript) {
  const writes = [];
  for (const line of transcript.split("\n")) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const content = event?.message?.content;
    if (event?.type !== "assistant" || !Array.isArray(content)) {
      continue;
    }
    for (const item of content) {
      if (item?.type === "tool_use" && WRITE_TOOLS.has(String(item.name).toLowerCase())) {
        const path = item.input?.file_path || item.input?.path || item.input?.notebook_path;
        if (path) {
          writes.push(path);
        }
      }
    }
  }
  return writes;
}

// Only a run of the acceptance scenarios counts as "the test run". A unit test
// run (pytest, npm test, go test ./tasks) does not show the sentence failing.
const ACCEPTANCE_RUN = /\b(?:cucumber(?:-js)?|behave|godog|acceptance|failsafe)\b|\bmvnw?\s+(?:-\S+\s+)*verify\b|go\s+test\s+\.\/features|cargo\s+test\s+--test\s+acceptance/i;
const NOT_PRODUCTION = ["drafts/", "stories/", "features/", "evals/"];
// Writing a failing unit test first is what touchstone-build asks for.
const TEST_FILE = /(?:^|\/)(?:tests?|__tests__|spec|src\/test|src\/acceptanceTest)\/|\.(?:test|spec)\.[a-z]+$|_test\.go$|(?:^|\/)test_[^/]*\.py$|Tests?\.(?:java|kt)$/;

// The agent's tool calls in order: writes with their path, shell commands with
// their text. Reads and searches are left out.
export function toolEvents(transcript) {
  const events = [];
  for (const line of transcript.split("\n")) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const content = event?.message?.content;
    if (event?.type !== "assistant" || !Array.isArray(content)) {
      continue;
    }
    for (const item of content) {
      if (item?.type !== "tool_use") {
        continue;
      }
      const name = String(item.name).toLowerCase();
      if (WRITE_TOOLS.has(name)) {
        events.push({ kind: "write", path: item.input?.file_path || item.input?.path || item.input?.notebook_path || "" });
      } else if (name === "bash" && typeof item.input?.command === "string") {
        events.push({ kind: "run", command: item.input.command });
      }
    }
  }
  return events;
}

function isProduction(path, root) {
  const relative = root && path.startsWith(root) ? path.slice(root.length).replace(/^\//, "") : path.replace(/^.*?(?=(?:drafts|stories|features|evals)\/)/, "");
  return !NOT_PRODUCTION.some((prefix) => relative.startsWith(prefix)) && !TEST_FILE.test(relative);
}

// Returns a failure message, or "" when a test run came before any production code.
export function testBeforeCode(transcript) {
  const events = toolEvents(transcript);
  const firstRun = events.findIndex((event) => event.kind === "run" && ACCEPTANCE_RUN.test(event.command));
  const firstCode = events.findIndex((event) => event.kind === "write" && isProduction(event.path));
  if (firstCode === -1) {
    return "";
  }
  if (firstRun === -1) {
    return `wrote production code (${events[firstCode].path}) and never ran the acceptance tests`;
  }
  if (firstCode < firstRun) {
    return `wrote production code (${events[firstCode].path}) before the first test run`;
  }
  return "";
}

export function finalText(transcript) {
  let text = "";
  for (const line of transcript.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event?.type === "result" && typeof event.result === "string") {
        text = event.result;
      }
    } catch {
      continue;
    }
  }
  return text;
}

// Returns a list of failure messages. Empty means every expectation held.
export function evaluate(expect, diff, transcript) {
  const failures = [];
  const touched = [...diff.added, ...diff.modified, ...diff.removed];
  for (const prefix of expect.protectedPaths || []) {
    const hit = touched.filter((path) => under(path, prefix));
    if (hit.length) {
      failures.push(`changed protected path ${prefix}: ${hit.join(", ")}`);
    }
    const attempted = toolWrites(transcript).filter((path) => path.includes(`/${prefix}`) || path.startsWith(prefix));
    if (attempted.length) {
      failures.push(`tried to write protected path ${prefix}: ${attempted.join(", ")}`);
    }
  }
  if (expect.onlyWritesUnder) {
    const stray = [...diff.added, ...diff.modified].filter(
      (path) => !expect.onlyWritesUnder.some((prefix) => under(path, prefix)),
    );
    if (stray.length) {
      failures.push(`wrote outside ${expect.onlyWritesUnder.join(", ")}: ${stray.join(", ")}`);
    }
  }
  if (expect.mustCreateUnder) {
    if (!diff.added.some((path) => under(path, expect.mustCreateUnder))) {
      failures.push(`created nothing under ${expect.mustCreateUnder}`);
    }
  }
  if (expect.testBeforeCode) {
    const problem = testBeforeCode(transcript);
    if (problem) {
      failures.push(problem);
    }
  }
  for (const path of expect.mustChange || []) {
    if (!touched.includes(path)) {
      failures.push(`did not change ${path}`);
    }
  }
  if (expect.finalTextMatches) {
    if (!new RegExp(expect.finalTextMatches, "i").test(finalText(transcript))) {
      failures.push(`final message does not match /${expect.finalTextMatches}/`);
    }
  }
  return failures;
}
