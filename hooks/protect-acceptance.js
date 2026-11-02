#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const DENY_REASON = "Touchstone keeps stories, .github/workflows, .claude, .cursor/hooks, CODEOWNERS, touchstone.json, the paths listed under protect in touchstone.json, ci/check-acceptance-guard.js, ci/check-trace.js, and ci/check-red-green.js for a person to edit.";
const READ_TOOLS = new Set(["read", "grep", "glob", "webfetch", "websearch", "readlints", "semanticsearch"]);
const PATH_KEYS = new Set(["path", "file_path", "filepath", "target_file", "target_notebook", "notebook_path"]);
const SHELL_TOOLS = new Set(["bash", "shell"]);
const WRITE_HINTS = /(?:^|[;&|]\s*)(?:rm|mv|cp|tee|touch|mkdir|truncate|dd|unlink)\b|\bfind\b[^\n]*\s-(?:delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\b|\bsed\b[^\n]*\s-[^\n]*i|\bperl\b[^\n]*\s-[^\n]*i|\bgit\s+(?:checkout|restore|clean|apply|am)\b/i;
const READ_OR_TEST = /(?:^|[;&|]\s*)(?:cat|ls|rg|grep|head|tail|wc|bat|less|stat|file|find|git\s+(?:diff|show|log|status|blame)|pytest|mvn|mvnw|gradle|gradlew|npm\s+test|npm\s+run\s+acceptance|pnpm\s+test|yarn\s+test|npx\s+cucumber-js|node\s+ci\/check-(?:acceptance-guard|trace)\.js|go\s+test|cargo\s+test|bun\s+test)\b/i;
const PROTECTED_DIRS = ["stories", ".github/workflows", ".claude", ".cursor/hooks"];
const PROTECTED_FILES = ["ci/check-acceptance-guard.js", "ci/check-trace.js", "ci/check-red-green.js", "ci/red-reason.js", "ci/gherkin.js", "ci/config.js", "ci/gates.js", "ci/mutate-gherkin.js", "touchstone.json", "CODEOWNERS"];

// Paths a person has listed under "protect" in the project's touchstone.json, for
// example the scripts a quality gate runs. The file is read on every call, so
// editing the list takes effect at once. It is itself protected from the agent.
function projectProtect(payload) {
  const root = resolve(typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd());
  try {
    const config = JSON.parse(readFileSync(join(root, "touchstone.json"), "utf8"));
    const globs = Array.isArray(config.protect) ? config.protect.filter((item) => typeof item === "string" && item.trim() !== "") : [];
    return { root, globs };
  } catch {
    return { root, globs: [] };
  }
}

function globRegExp(glob) {
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
      out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

function inProjectProtect(path, project) {
  if (project.globs.length === 0) {
    return false;
  }
  let normalized = path.replaceAll("\\", "/");
  if (isAbsolute(path)) {
    normalized = relative(project.root, path).replaceAll("\\", "/");
  }
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  return !normalized.startsWith("..") && project.globs.some((glob) => globRegExp(glob).test(normalized));
}

// The fixed part of each glob before its first wildcard ("quality/" for
// "quality/**"), used to spot a protected path inside a shell command.
function projectNeedles(project) {
  return project.globs.map((glob) => glob.split(/[*?]/)[0]).filter((text) => text !== "");
}

function isProtected(path) {
  let normalized = path.replaceAll("\\", "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  for (const marker of PROTECTED_FILES) {
    if (normalized === marker || normalized.endsWith(`/${marker}`)) {
      return true;
    }
  }
  for (const marker of PROTECTED_DIRS) {
    if (normalized === marker || normalized.startsWith(`${marker}/`) || normalized.includes(`/${marker}/`) || normalized.endsWith(`/${marker}`)) {
      return true;
    }
  }
  return false;
}

function* iterPaths(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      yield* iterPaths(item);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (PATH_KEYS.has(key.toLowerCase()) && typeof item === "string") {
        yield item;
      } else {
        yield* iterPaths(item);
      }
    }
  }
}

function toolName(payload) {
  for (const key of ["tool_name", "toolName", "name"]) {
    if (typeof payload[key] === "string") {
      return payload[key];
    }
  }
  const toolInput = payload.tool_input;
  if (toolInput && typeof toolInput === "object") {
    for (const key of ["tool_name", "toolName"]) {
      if (typeof toolInput[key] === "string") {
        return toolInput[key];
      }
    }
  }
  return "";
}

function commandText(payload) {
  if (typeof payload.command === "string") {
    return payload.command;
  }
  if (payload.tool_input && typeof payload.tool_input.command === "string") {
    return payload.tool_input.command;
  }
  return "";
}

function mentionsProtected(text, extra = []) {
  const normalized = text.replaceAll("\\", "/");
  return [...PROTECTED_DIRS, ...PROTECTED_FILES, ...extra].some((needle) => normalized.includes(needle));
}

function hasFileRedirect(command) {
  const cleaned = command.replace(/\d*>&[12]/g, "").replace(/>&[12]/g, "");
  return cleaned.includes(">");
}

function shellWritesProtected(command, extra = []) {
  // Running a protected script (node quality/check.js) is not writing to it.
  const runs = extra.length ? new RegExp(`^\\s*(?:node|python3?|bash|sh)\\s+(?!-)\\S*(?:${extra.map((needle) => needle.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("|")})\\S*(?:\\s+[^<>|&;]*)?\\s*$`) : null;
  if (!mentionsProtected(command, extra)) {
    return false;
  }
  for (const part of command.split(/\s*(?:&&|\|\||;|\n)\s*/)) {
    if (!part || !mentionsProtected(part, extra)) {
      continue;
    }
    if (runs && runs.test(part) && !hasFileRedirect(part)) {
      continue;
    }
    if (hasFileRedirect(part) || WRITE_HINTS.test(part)) {
      return true;
    }
    if (READ_OR_TEST.test(part)) {
      continue;
    }
    return true;
  }
  return false;
}

function wantsDeny(payload) {
  const name = toolName(payload).toLowerCase();
  const command = commandText(payload);
  const project = projectProtect(payload);
  if (SHELL_TOOLS.has(name) || (command && !name)) {
    if (shellWritesProtected(command, projectNeedles(project))) {
      return DENY_REASON;
    }
    if (SHELL_TOOLS.has(name)) {
      return null;
    }
  }
  if (READ_TOOLS.has(name)) {
    return null;
  }
  for (const path of iterPaths(payload)) {
    if (isProtected(path) || inProjectProtect(path, project)) {
      return DENY_REASON;
    }
  }
  return null;
}

function emit(payload, reason) {
  const event = payload.hook_event_name || payload.hookEventName;
  const decision = { permission: reason ? "deny" : "allow" };
  if (reason) {
    decision.user_message = reason;
    decision.agent_message = reason;
  }
  if (event) {
    const specific = {
      hookEventName: event,
      permissionDecision: reason ? "deny" : "allow",
    };
    if (reason) {
      specific.permissionDecisionReason = reason;
    }
    decision.hookSpecificOutput = specific;
  }
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}

function main() {
  const raw = readFileSync(0, "utf8");
  if (!raw.trim()) {
    emit({}, null);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    emit({}, null);
    return;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    emit({}, null);
    return;
  }
  try {
    emit(payload, wantsDeny(payload));
  } catch {
    emit(payload, null);
  }
}

main();
