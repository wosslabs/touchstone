import assert from "node:assert/strict";
import { test } from "node:test";
import { addTitle } from "../server.js";

test("the first title appears on the list", () => {
  const tasks = [];
  addTitle(tasks, "Buy milk");
  assert.deepEqual(tasks, ["Buy milk"]);
});

test("a second title keeps the first", () => {
  const tasks = [];
  addTitle(tasks, "Buy milk");
  addTitle(tasks, "Walk the dog");
  assert.deepEqual(tasks, ["Buy milk", "Walk the dog"]);
});
