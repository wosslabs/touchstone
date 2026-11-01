// Drives the real order service over HTTP. A fresh server process per scenario,
// so every scenario starts with no orders.
const { Before, After, Given, When, Then } = require("@cucumber/cucumber");
const { spawn } = require("node:child_process");
const assert = require("node:assert");
const path = require("node:path");

Before(async function () {
  this.proc = spawn("node", [path.join(__dirname, "../../src/server.js")], {
    env: { ...process.env, PORT: "0" },
  });
  this.port = await new Promise((resolve, reject) => {
    this.proc.stdout.on("data", (d) => {
      const m = /listening on (\d+)/.exec(String(d));
      if (m) resolve(Number(m[1]));
    });
    this.proc.on("error", reject);
    this.proc.on("exit", () => reject(new Error("server exited")));
  });
  this.call = async (method, url, body) => {
    const r = await fetch(`http://127.0.0.1:${this.port}${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    this.last = { status: r.status, body: text ? JSON.parse(text) : null };
    return this.last;
  };
  this.orderId = null;
});

After(function () {
  this.proc.removeAllListeners("exit");
  this.proc.kill();
});

const place = async (world, customer, items) => {
  const r = await world.call("POST", "/orders", { customer, items });
  if (r.status === 201) world.orderId = r.body.id;
  return r;
};

// Orders priced between 50.00 and 100.00 have no discount and free shipping,
// so the total equals the price.
const seed = async (world, total) => {
  const r = await place(world, "alice", [{ qty: 1, price: total }]);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.total, total);
};
const act = (world, action, id, body) =>
  world.call("POST", `/orders/${id || world.orderId}/${action}`, body || {});

Given("a new order totalling {float}", async function (t) { await seed(this, t); });
Given("a paid order totalling {float}", async function (t) { await seed(this, t); await act(this, "pay"); });
Given("a paid order that has shipped", async function () { await seed(this, 100); await act(this, "pay"); await act(this, "ship"); });
Given("a paid order that has been refunded", async function () { await seed(this, 100); await act(this, "pay"); await act(this, "refund", null, { reason: "damaged" }); });

When("{string} orders {int} of an item at {float} each", async function (c, q, p) { await place(this, c, [{ qty: q, price: p }]); });
When("{string} orders one item at {float}", async function (c, p) { await place(this, c, [{ qty: 1, price: p }]); });
When("{string} orders an item with no quantity at {float}", async function (c, p) { await place(this, c, [{ price: p }]); });
When("{string} orders an item with no price", async function (c) { await place(this, c, [{ qty: 1 }]); });
When("{string} orders one item at {float} and another item at {float}", async function (c, a, b) { await place(this, c, [{ qty: 1, price: a }, { qty: 1, price: b }]); });
When("an order is placed with no customer", async function () { await place(this, undefined, [{ qty: 1, price: 10 }]); });
When("an order is placed with an empty customer name", async function () { await place(this, "", [{ qty: 1, price: 10 }]); });
When("{string} places an order with no items", async function (c) { await place(this, c, []); });
When("{string} places an order with the item list missing", async function (c) { await place(this, c, undefined); });
When("{string} orders one item at a negative price", async function (c) { await place(this, c, [{ qty: 1, price: -1 }]); });
When("{string} places two orders", async function (c) {
  this.ids = [];
  for (let i = 0; i < 2; i++) { await place(this, c, [{ qty: 1, price: 10 }]); this.ids.push(this.last.body.id); }
});

When("the customer pays for the order", async function () { await act(this, "pay"); });
When("the shop ships the order", async function () { await act(this, "ship"); });
When("the customer asks for a refund", async function () { await act(this, "refund"); });
When("the customer asks for a refund because {string}", async function (reason) { await act(this, "refund", null, reason === "" ? {} : { reason }); });
When("someone tries to {word} an order that does not exist", async function (a) { await act(this, a, "A9999"); });

Then("the order is created", function () { assert.strictEqual(this.last.status, 201); });
Then("the order starts out as new", function () { assert.strictEqual(this.last.body.status, "new"); });
Then("the order is refused with the message {string}", function (m) {
  assert.ok(this.last.status >= 400 && this.last.status < 500, `status ${this.last.status}`);
  assert.strictEqual(this.last.body.error, m);
});
Then("the order is refused as too large with the message {string}", function (m) {
  assert.strictEqual(this.last.status, 422);
  assert.strictEqual(this.last.body.error, m);
});
Then("the request is refused with the message {string}", function (m) {
  assert.strictEqual(this.last.status, 409);
  assert.strictEqual(this.last.body.error, m);
});
Then("the request is answered as not found", function () {
  assert.strictEqual(this.last.status, 404);
  assert.strictEqual(this.last.body.error, "no such order");
});
Then("the order subtotal is {float}", function (v) { assert.strictEqual(this.last.body.subtotal, v); });
Then("the discount is {float}", function (v) { assert.strictEqual(this.last.body.discount, v); });
Then("shipping is {float}", function (v) { assert.strictEqual(this.last.body.shipping, v); });
Then("the order total is {float}", function (v) { assert.strictEqual(this.last.body.total, v); });
Then("the order total is not a number", function () { assert.strictEqual(this.last.body.total, null); });
Then("the two orders have the numbers {string} and {string}", function (a, b) { assert.deepStrictEqual(this.ids, [a, b]); });

Then("the order is paid", function () { assert.strictEqual(this.last.status, 200); assert.strictEqual(this.last.body.status, "paid"); });
Then("the order is shipped", function () { assert.strictEqual(this.last.status, 200); assert.strictEqual(this.last.body.status, "shipped"); });
Then("they get back {float}", function (v) {
  assert.strictEqual(this.last.status, 200);
  assert.strictEqual(this.last.body.status, "refunded");
  assert.strictEqual(this.last.body.refund, v);
});
Then("the order is still {word}", async function (s) {
  const r = await this.call("GET", `/orders/${this.orderId}`);
  assert.strictEqual(r.body.status, s);
});
Then("the order is marked refunded", function () { assert.strictEqual(this.last.body.status, "refunded"); });
