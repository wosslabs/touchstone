import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "protect-acceptance.js");

function decide(payload) {
  const result = spawnSync("node", [script], { input: JSON.stringify(payload), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("denies a write to an approved example", () => {
  const decision = decide({ tool_name: "Write", tool_input: { file_path: "stories/pay.md" } });
  assert.equal(decision.permission, "deny");
});

test("allows a read of an approved example", () => {
  const decision = decide({ tool_name: "Read", tool_input: { path: "stories/pay.md" } });
  assert.equal(decision.permission, "allow");
});

test("allows running the scenario", () => {
  const decision = decide({ command: "pytest stories/pay.md -q" });
  assert.equal(decision.permission, "allow");
});

test("denies a redirect into an approved example", () => {
  const decision = decide({ command: "echo hello > stories/pay.md" });
  assert.equal(decision.permission, "deny");
});

test("denies a write hidden after a test command", () => {
  const decision = decide({
    command: "pytest -q; node -e \"require('fs').writeFileSync('stories/pay.md','x')\"",
  });
  assert.equal(decision.permission, "deny");
});

test("denies a write to the trace script", () => {
  const decision = decide({ tool_name: "Edit", tool_input: { path: "ci/check-trace.js" } });
  assert.equal(decision.permission, "deny");
});

test("allows running the trace check", () => {
  const decision = decide({ command: "node ci/check-trace.js" });
  assert.equal(decision.permission, "allow");
});

test("denies a write to the guard script", () => {
  const decision = decide({ tool_name: "Edit", tool_input: { path: "ci/check-acceptance-guard.js" } });
  assert.equal(decision.permission, "deny");
});

test("allows a draft", () => {
  const decision = decide({ tool_name: "Write", tool_input: { path: "drafts/pay.md" } });
  assert.equal(decision.permission, "allow");
});

test("a Claude payload includes both decision shapes", () => {
  const decision = decide({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "rm -rf stories" },
  });
  assert.equal(decision.permission, "deny");
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
});

test("an unknown payload is allowed", () => {
  const decision = decide({ unrelated: true });
  assert.equal(decision.permission, "allow");
});

test("denies a write to CODEOWNERS and the hook config", () => {
  for (const file_path of ["CODEOWNERS", ".github/CODEOWNERS", ".claude/settings.json", ".cursor/hooks/protect-acceptance.js"]) {
    const decision = decide({ tool_name: "Write", tool_input: { file_path } });
    assert.equal(decision.permission, "deny", file_path);
  }
});

test("denies find -delete and find -exec on stories", () => {
  for (const command of ["find stories -delete", "find stories -name '*.md' -exec rm {} +"]) {
    assert.equal(decide({ command }).permission, "deny", command);
  }
  assert.equal(decide({ command: "find stories -name '*.md'" }).permission, "allow");
});

// The paths a person lists under "protect" in touchstone.json are protected too.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

function decideIn(project, payload) {
  const result = spawnSync("node", [script], { input: JSON.stringify({ ...payload, cwd: project }), encoding: "utf8", cwd: project });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).permission;
}

function withProject(protect, run) {
  const project = mkdtempSync(join(tmpdir(), "touchstone-hook-"));
  try {
    writeFileSync(join(project, "touchstone.json"), JSON.stringify({ gates: {}, protect }));
    run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

test("denies a write to a path under protect, absolute or relative", () => {
  withProject(["quality/**", "scripts/ci/*.sh"], (project) => {
    for (const file_path of [join(project, "quality", "arch-check.js"), "quality/dup-check.js", "./quality/sub/x.js", join(project, "scripts", "ci", "gate.sh")]) {
      assert.equal(decideIn(project, { tool_name: "Write", tool_input: { file_path } }), "deny", file_path);
    }
  });
});

test("allows a write elsewhere, and writes outside the project", () => {
  withProject(["quality/**"], (project) => {
    for (const file_path of [join(project, "src", "app.js"), "tests/app.test.js", "../outside/quality/x.js", "scripts/ci/deep/gate.sh"]) {
      assert.equal(decideIn(project, { tool_name: "Write", tool_input: { file_path } }), "allow", file_path);
    }
  });
});

test("denies a shell write to a protected path but allows running it and reading it", () => {
  withProject(["quality/**"], (project) => {
    for (const command of ["echo 'process.exit(0)' > quality/arch-check.js", "sed -i '' 's/1/0/' quality/dup-check.js", "rm quality/dup-check.js", "python3 -c \"open('quality/x.js','w').write('')\"", "node quality/dup-check.js > quality/out.txt"]) {
      assert.equal(decideIn(project, { tool_name: "Bash", tool_input: { command } }), "deny", command);
    }
    for (const command of ["node quality/dup-check.js", "node quality/mutate-code.js --allow 0", "cat quality/arch-check.js", "npm run dup", "ls quality"]) {
      assert.equal(decideIn(project, { tool_name: "Bash", tool_input: { command } }), "allow", command);
    }
  });
});

test("without a protect list nothing extra is protected", () => {
  withProject([], (project) => {
    assert.equal(decideIn(project, { tool_name: "Write", tool_input: { file_path: "quality/x.js" } }), "allow");
  });
});

test("a broken touchstone.json does not break the hook or disable the built-in protection", () => {
  const project = mkdtempSync(join(tmpdir(), "touchstone-hook-"));
  try {
    writeFileSync(join(project, "touchstone.json"), "{ not json");
    assert.equal(decideIn(project, { tool_name: "Write", tool_input: { file_path: "stories/pay.md" } }), "deny");
    assert.equal(decideIn(project, { tool_name: "Write", tool_input: { file_path: "src/a.js" } }), "allow");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
