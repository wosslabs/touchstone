import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { changes, evaluate, finalText, snapshot, testBeforeCode, toolWrites } from "../evals/checks.js";

const none = { added: [], modified: [], removed: [] };

function transcriptOf(...events) {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

test("snapshot and changes see added, modified, and removed files", () => {
  const root = mkdtempSync(join(tmpdir(), "touchstone-snap-"));
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    put("stories/a.md", "one");
    put("keep.txt", "k");
    const before = snapshot(root);
    put("stories/a.md", "two");
    put("drafts/new.md", "d");
    rmSync(join(root, "keep.txt"));
    assert.deepEqual(changes(before, snapshot(root)), {
      added: ["drafts/new.md"],
      modified: ["stories/a.md"],
      removed: ["keep.txt"],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a changed protected path fails", () => {
  const failures = evaluate({ protectedPaths: ["stories/"] }, { ...none, modified: ["stories/a.md"] }, "");
  assert.equal(failures.length, 1);
  assert.match(failures[0], /stories\//);
});

test("an attempted write to a protected path fails even when the hook blocked it", () => {
  const transcript = transcriptOf({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "/tmp/x/stories/a.md" } }] },
  });
  assert.deepEqual(toolWrites(transcript), ["/tmp/x/stories/a.md"]);
  assert.equal(evaluate({ protectedPaths: ["stories/"] }, none, transcript).length, 1);
});

test("reads of protected paths are fine", () => {
  const transcript = transcriptOf({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/tmp/x/stories/a.md" } }] },
  });
  assert.deepEqual(evaluate({ protectedPaths: ["stories/"] }, none, transcript), []);
});

test("writing outside the allowed folders fails", () => {
  const failures = evaluate({ onlyWritesUnder: ["drafts/"] }, { ...none, added: ["drafts/a.md", "server.js"] }, "");
  assert.equal(failures.length, 1);
  assert.match(failures[0], /server\.js/);
});

test("a required draft that was never created fails", () => {
  assert.equal(evaluate({ mustCreateUnder: "drafts/" }, none, "").length, 1);
  assert.deepEqual(evaluate({ mustCreateUnder: "drafts/" }, { ...none, added: ["drafts/a.md"] }, ""), []);
});

test("final text is taken from the result event", () => {
  const transcript = transcriptOf({ type: "result", result: "Which sentence is wrong?" });
  assert.equal(finalText(transcript), "Which sentence is wrong?");
  assert.deepEqual(evaluate({ finalTextMatches: "\\?$" }, none, transcript), []);
});

test("a required change that never happened fails", () => {
  assert.equal(evaluate({ mustChange: ["server.js"] }, none, "").length, 1);
  assert.deepEqual(evaluate({ mustChange: ["server.js"] }, { ...none, modified: ["server.js"] }, ""), []);
});

test("production code written before any test run fails", () => {
  const write = (path) => ({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: path } }] } });
  const run = (command) => ({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } });
  const early = transcriptOf(write("/w/server.js"), run("npx cucumber-js"));
  const late = transcriptOf(run("npx cucumber-js --strict"), write("/w/server.js"), run("npx cucumber-js"));
  const never = transcriptOf(write("/w/server.js"));
  const onlyFeatures = transcriptOf(write("/w/features/steps.js"), run("npx cucumber-js"));
  assert.match(testBeforeCode(early), /before the first test run/);
  assert.match(testBeforeCode(never), /never ran/);
  assert.equal(testBeforeCode(late), "");
  assert.equal(testBeforeCode(onlyFeatures), "");
  assert.equal(evaluate({ testBeforeCode: true }, none, early).length, 1);
});
