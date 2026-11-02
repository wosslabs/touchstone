import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

test("plugin manifests carry the package version", () => {
  const version = json("package.json").version;
  assert.equal(json(".claude-plugin/plugin.json").version, version);
  assert.equal(json(".cursor-plugin/plugin.json").version, version);
  assert.equal(json(".claude-plugin/marketplace.json").plugins[0].version, version);
});

test("the starter touchstone.json is valid", async () => {
  const { validate } = await import("../ci/config.js");
  assert.deepEqual(validate(json("templates/touchstone.json")), []);
});

test("the JVM example's touchstone.json is valid and its gates call tools, not npm scripts", async () => {
  const { lint, validate } = await import("../ci/config.js");
  const config = json("examples/jvm-todo/touchstone.json");
  assert.deepEqual(validate(config), []);
  assert.deepEqual(lint(config), []);
});
