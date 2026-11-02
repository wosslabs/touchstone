import assert from "node:assert/strict";
import { After, Before, Then, When } from "@cucumber/cucumber";
import { createApp } from "../src/server.js";

// Steps talk to the running service over HTTP only.
Before(async function () {
  this.server = createApp();
  await new Promise((resolve) => this.server.listen(0, "127.0.0.1", resolve));
  this.base = `http://127.0.0.1:${this.server.address().port}`;
});

After(async function () {
  await new Promise((resolve) => this.server.close(resolve));
});

async function place(world, body) {
  const response = await fetch(`${world.base}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  world.status = response.status;
  world.body = await response.json();
}

When("a customer orders {int} items at {float}", async function (qty, price) {
  await place(this, { customer: "alice", lines: [{ name: "Widget", price, qty }] });
});

When("an order is placed with no customer", async function () {
  await place(this, { lines: [{ name: "Widget", price: 1, qty: 1 }] });
});

Then("the order total is {float}", function (total) {
  assert.equal(this.status, 201);
  assert.equal(this.body.total, total);
});

Then("it is refused with {string}", function (message) {
  assert.equal(this.status, 400);
  assert.equal(this.body.error, message);
});

Then("the receipt total reads {string}", function (text) {
  assert.equal(this.status, 201);
  assert.ok(this.body.receipt.split("\n").pop().endsWith(text), `receipt was ${this.body.receipt}`);
});
