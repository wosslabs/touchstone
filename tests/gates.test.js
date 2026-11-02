import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { globToRegExp, loadConfig, matchesAny, validate } from "../ci/config.js";
import { fenceViolations } from "../ci/gates.js";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "gates.js");

const config = {
  gates: { unit: "echo unit-ran", acceptance: "echo acceptance-ran", broken: "exit 3" },
  quality: ["unit"],
  phases: {
    clean: { allow: ["src/**", "tests/**"], gates: ["unit", "acceptance"] },
    failing: { allow: ["src/**"], gates: ["unit", "broken", "acceptance"] },
  },
};

function git(repo, args) {
  execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=T", ...args], { cwd: repo, stdio: "pipe" });
}

function write(repo, path, text) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function repoWith(files) {
  const repo = mkdtempSync(join(tmpdir(), "touchstone-gates-"));
  git(repo, ["init", "-q", "-b", "main"]);
  write(repo, "touchstone.json", JSON.stringify(config));
  write(repo, "src/app.js", "one\n");
  for (const [path, text] of Object.entries(files)) {
    write(repo, path, text);
  }
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "base"]);
  return repo;
}

function run(repo, ...args) {
  return spawnSync("node", [script, ...args, "--repo", repo], { encoding: "utf8" });
}

test("globs: ** crosses directories, * stays in one segment", () => {
  assert.ok(globToRegExp("src/**").test("src/a/b/c.js"));
  assert.ok(globToRegExp("**/*.feature").test("features/x.feature"));
  assert.ok(globToRegExp("**/*.feature").test("x.feature"));
  assert.ok(globToRegExp("src/*.js").test("src/a.js"));
  assert.ok(!globToRegExp("src/*.js").test("src/a/b.js"));
  assert.ok(!globToRegExp("src/**").test("srcs/a.js"));
  assert.ok(!globToRegExp("a.js").test("ab.js"), "a dot in a glob is a dot");
  assert.ok(matchesAny("CODEOWNERS", ["CODEOWNERS"]));
});

test("validation names every problem", () => {
  const problems = validate({
    gates: { a: "", b: { command: "ok", setup: 3 } },
    quality: ["nope"],
    mutation: { mode: "sometimes", maxMutants: 0 },
    phases: { p: { gates: ["missing"], allow: "src" } },
  });
  assert.equal(problems.length, 7, problems.join("\n"));
  assert.deepEqual(validate(config), []);
});

test("the fence stops edits to what belongs to a person or the pipeline", () => {
  const phase = config.phases.clean;
  const files = ["src/a.js", "stories/pay.md", "features/pay.feature", "touchstone.json", ".github/workflows/x.yml", "CODEOWNERS", ".claude/settings.json", "docs/readme.md"];
  const violations = fenceViolations(files, phase).map(([file]) => file);
  assert.deepEqual(violations, ["stories/pay.md", "features/pay.feature", "touchstone.json", ".github/workflows/x.yml", "CODEOWNERS", ".claude/settings.json", "docs/readme.md"]);
});

test("a phase with no allow list may change anything except the protected files", () => {
  assert.deepEqual(fenceViolations(["src/a.js", "docs/x.md"], {}), []);
  assert.equal(fenceViolations(["stories/a.md"], {}).length, 1);
});

test("a phase can forbid more than the default", () => {
  assert.equal(fenceViolations(["src/generated/x.js"], { forbid: ["src/generated/**"] }).length, 1);
});

test("phase passes when it stays inside the fence and its gates pass", () => {
  const repo = repoWith({});
  try {
    write(repo, "src/app.js", "two\n");
    write(repo, "tests/app.test.js", "t\n");
    const result = run(repo, "phase", "clean");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /unit-ran/);
    assert.match(result.stdout, /acceptance-ran/);
    assert.match(result.stdout, /phase clean passed/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("phase fails before running any gate when a protected file changed", () => {
  const repo = repoWith({ "stories/pay.md": "Scenario: A\nGiven a\n", "features/pay.feature": "Feature: x\n" });
  try {
    write(repo, "features/pay.feature", "Feature: weakened\n");
    write(repo, "src/app.js", "two\n");
    const result = run(repo, "phase", "clean");
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /features\/pay\.feature/);
    assert.doesNotMatch(result.stdout, /unit-ran/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("phase fails when the agent edits the gate config itself", () => {
  const repo = repoWith({});
  try {
    write(repo, "touchstone.json", JSON.stringify({ gates: { unit: "true", acceptance: "true" }, phases: { clean: { gates: [] } } }));
    const result = run(repo, "phase", "clean");
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /touchstone\.json/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("phase fails when a new file lands outside the allow list, and when a protected file is deleted", () => {
  const repo = repoWith({ "stories/pay.md": "x\n" });
  try {
    write(repo, "scripts/deploy.sh", "x\n");
    rmSync(join(repo, "stories", "pay.md"));
    const result = run(repo, "phase", "clean");
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /scripts\/deploy\.sh/);
    assert.match(result.stdout, /stories\/pay\.md/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("phase stops at the first failing gate", () => {
  const repo = repoWith({});
  try {
    const result = run(repo, "phase", "failing");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /unit-ran/);
    assert.match(result.stdout, /failed at gate broken/);
    assert.doesNotMatch(result.stdout, /acceptance-ran/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("run executes a named gate and passes its exit code through", () => {
  const repo = repoWith({});
  try {
    assert.equal(run(repo, "run", "unit").status, 0);
    assert.equal(run(repo, "run", "broken").status, 3);
    assert.equal(run(repo, "run", "nope").status, 1);
    assert.match(run(repo, "list").stdout, /acceptance: echo acceptance-ran/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the config is read from the base commit, so a pull request cannot loosen its own gates", () => {
  const repo = repoWith({});
  try {
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    write(repo, "touchstone.json", JSON.stringify({ gates: { unit: "true" } }));
    git(repo, ["commit", "-qam", "loosen the gates"]);
    assert.equal(loadConfig(repo, base).config.gates.unit, "echo unit-ran");
    assert.equal(loadConfig(repo, "").config.gates.unit, "true");
    assert.equal(loadConfig(repo, "0000000000000000000000000000000000000000").config.gates.unit, "true", "falls back to the working tree");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a broken config is reported, not ignored", () => {
  const repo = repoWith({ "touchstone.json": "{ not json" });
  try {
    const result = run(repo, "list");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not valid JSON/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the fence also forbids the paths listed under protect", () => {
  const phase = { allow: ["src/**", "quality/**"] };
  assert.equal(fenceViolations(["quality/arch.js"], phase).length, 0, "allowed when nothing is protected");
  const violations = fenceViolations(["quality/arch.js", "src/a.js"], phase, ["quality/**"]);
  assert.deepEqual(violations.map(([file]) => file), ["quality/arch.js"]);
});

test("gates list warns about a gate that runs an npm script", async () => {
  const { lint } = await import("../ci/config.js");
  const warnings = lint({ gates: { arch: "npm run arch", unit: "npm test", direct: "node quality/dup.js", pnpm: "pnpm run mutate" } });
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /gate "arch" runs a script from package\.json/);
  assert.match(warnings[1], /gate "pnpm"/);
});

test("codeowners prints a line for every protected path", () => {
  const repo = repoWith({});
  try {
    write(repo, "touchstone.json", JSON.stringify({ gates: { unit: "echo" }, protect: ["quality/**", "scripts/gate.sh"] }));
    const lines = run(repo, "codeowners", "--team", "@acme/leads").stdout.trim().split("\n");
    assert.ok(lines.includes("/quality/ @acme/leads"));
    assert.ok(lines.includes("/scripts/gate.sh @acme/leads"));
    assert.ok(lines.includes("/touchstone.json @acme/leads"));
    assert.ok(lines.includes("/stories/ @acme/leads"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the protect list is validated", () => {
  assert.deepEqual(validate({ gates: {}, protect: ["quality/**"] }), []);
  assert.equal(validate({ gates: {}, protect: "quality" }).length, 1);
  assert.equal(validate({ gates: {}, protect: [""] }).length, 1);
});
