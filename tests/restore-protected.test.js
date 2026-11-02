import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "restore-protected.js");

function git(repo, args) {
  return execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=T", ...args], { cwd: repo, stdio: "pipe", encoding: "utf8" });
}

function write(repo, path, text) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function repoWith(protect) {
  const repo = mkdtempSync(join(tmpdir(), "touchstone-restore-"));
  git(repo, ["init", "-q", "-b", "main"]);
  write(repo, "touchstone.json", JSON.stringify({ gates: { arch: "node quality/arch.js" }, protect }));
  write(repo, "quality/arch.js", "process.exit(1); // the real check\n");
  write(repo, "quality/dup.js", "process.exit(1); // the real check\n");
  write(repo, "src/app.js", "one\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "base"]);
  return [repo, git(repo, ["rev-parse", "HEAD"]).trim()];
}

function run(repo, base) {
  const report = join(repo, "..", `${Date.now()}-report.txt`);
  const result = spawnSync("node", [script, "--repo", repo, "--base", base, "--report", report], { encoding: "utf8" });
  return { result, report: existsSync(report) ? readFileSync(report, "utf8") : "" };
}

test("a weakened, deleted and added protected file all go back to the base version", () => {
  const [repo, base] = repoWith(["quality/**"]);
  try {
    write(repo, "quality/arch.js", "process.exit(0); // weakened\n");
    rmSync(join(repo, "quality", "dup.js"));
    write(repo, "quality/new.js", "process.exit(0);\n");
    write(repo, "src/app.js", "two\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "pull request"]);
    const { result, report } = run(repo, base);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(join(repo, "quality", "arch.js"), "utf8"), /the real check/);
    assert.match(readFileSync(join(repo, "quality", "dup.js"), "utf8"), /the real check/);
    assert.equal(existsSync(join(repo, "quality", "new.js")), false);
    assert.equal(readFileSync(join(repo, "src", "app.js"), "utf8"), "two\n", "files that are not protected are left alone");
    assert.match(report, /quality\/arch\.js \(changed/);
    assert.match(report, /quality\/dup\.js \(deleted/);
    assert.match(report, /quality\/new\.js \(added/);
    assert.doesNotMatch(report, /src\/app\.js/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the protect list comes from the base commit, so a pull request cannot empty it", () => {
  const [repo, base] = repoWith(["quality/**"]);
  try {
    write(repo, "touchstone.json", JSON.stringify({ gates: { arch: "true" }, protect: [] }));
    write(repo, "quality/arch.js", "process.exit(0); // weakened\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "pull request"]);
    const { result } = run(repo, base);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(join(repo, "quality", "arch.js"), "utf8"), /the real check/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("an uncommitted edit in the working tree is also put back", () => {
  const [repo, base] = repoWith(["quality/**"]);
  try {
    write(repo, "quality/arch.js", "process.exit(0);\n");
    const { result } = run(repo, base);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(join(repo, "quality", "arch.js"), "utf8"), /the real check/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("nothing changes when the pull request leaves protected files alone", () => {
  const [repo, base] = repoWith(["quality/**"]);
  try {
    write(repo, "src/app.js", "two\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "pull request"]);
    const { result, report } = run(repo, base);
    assert.match(result.stdout, /0 files put back/);
    assert.equal(report, "");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("with no protect list it does nothing", () => {
  const [repo, base] = repoWith([]);
  try {
    write(repo, "quality/arch.js", "process.exit(0);\n");
    const { result } = run(repo, base);
    assert.match(result.stdout, /no protect list/);
    assert.equal(readFileSync(join(repo, "quality", "arch.js"), "utf8"), "process.exit(0);\n");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
