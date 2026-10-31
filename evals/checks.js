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
