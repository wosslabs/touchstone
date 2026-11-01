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
