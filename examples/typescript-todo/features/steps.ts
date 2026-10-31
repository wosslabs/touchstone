import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { After, Before, Given, Then, When, World, setWorldConstructor } from "@cucumber/cucumber";
import { createTodoServer } from "../src/server.ts";

// Acceptance steps talk to the running service over HTTP only.
class TodoWorld extends World {
  server?: Server;
  base = "";
}

setWorldConstructor(TodoWorld);

Before(async function (this: TodoWorld) {
  this.server = createTodoServer();
  await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
  this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/tasks`;
});

After(async function (this: TodoWorld) {
  await new Promise((resolve) => this.server!.close(resolve));
});

async function add(world: TodoWorld, title: string): Promise<void> {
  const response = await fetch(world.base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  assert.equal(response.status, 201);
}

async function titles(world: TodoWorld): Promise<string[]> {
  const response = await fetch(world.base);
  assert.equal(response.status, 200);
  return (await response.json()) as string[];
}

Given("the list has no tasks", async function (this: TodoWorld) {
  assert.deepEqual(await titles(this), []);
});

Given("the list already has {string}", async function (this: TodoWorld, title: string) {
  await add(this, title);
  assert.ok((await titles(this)).includes(title));
});

When("the person adds {string}", async function (this: TodoWorld, title: string) {
  await add(this, title);
});

Then("the list shows {string}", async function (this: TodoWorld, title: string) {
  assert.ok((await titles(this)).includes(title), `Expected the list to show "${title}"`);
});
