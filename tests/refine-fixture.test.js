import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// examples/refine-orders is the fixture for the inner-loop evaluation. Its value
// depends on three defects being present and its behaviour being right. If a
// change quietly fixes a defect, the evaluation stops measuring anything.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "refine-orders");

function oracle(name) {
  return spawnSync("node", [join(root, "quality", name), "--root", root], { encoding: "utf8" });
}

test("the fixture still has duplicated code", () => {
  const result = oracle("dup-check.js");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /repeated blocks/);
});

test("the fixture still has a domain module doing I/O", () => {
  const result = oracle("arch-check.js");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /src\/domain\/orders\.js imports node:fs/);
});

test("the fixture still has weak tests that let mutants survive", () => {
  const result = oracle("mutate-code.js");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /survived/);
});

test("the fixture's behaviour is right, so a refactoring has something to preserve", () => {
  const result = oracle("behaviour-check.js");
  assert.equal(result.status, 0, result.stdout);
});

test("the fixture's starter config is a valid touchstone.json", async () => {
  const { readFileSync } = await import("node:fs");
  const { validate } = await import("../ci/config.js");
  assert.deepEqual(validate(JSON.parse(readFileSync(join(root, "touchstone.json"), "utf8"))), []);
});
