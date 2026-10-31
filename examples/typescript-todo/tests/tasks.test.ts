import assert from "node:assert/strict";
import { test } from "node:test";
import { TaskList } from "../src/tasks.ts";

// Unit tests stay in tests/. Acceptance scenarios live in features/.
test("keeps tasks in the order they were added", () => {
  const list = new TaskList();
  list.add("Buy milk");
  list.add("Walk the dog");
  assert.deepEqual(list.list(), ["Buy milk", "Walk the dog"]);
});

test("rejects a blank title", () => {
  assert.throws(() => new TaskList().add("  "), RangeError);
});
