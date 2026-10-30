import { spawn } from "node:child_process";
import { After, AfterAll, Before, BeforeAll, BeforeStep, Given, Then, When, setWorldConstructor, World } from "@cucumber/cucumber";
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8765";

class TodoWorld extends World {
  page = null;
}

setWorldConstructor(TodoWorld);

let server;
let browser;

async function waitForScreen() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(BASE);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("the screen did not start");
}

async function listTexts(page) {
  return page.locator("#tasks li").allTextContents();
}

async function expectOnList(page, title) {
  const items = await listTexts(page);
  if (!items.includes(title)) {
    const shown = items.length ? items.join(", ") : "the list was empty";
    throw new Error(`Expected the words "${title}" on the list\n${shown}`);
  }
}

BeforeAll(async function () {
  server = spawn("node", ["server.js"], { stdio: "ignore" });
  await waitForScreen();
  browser = await chromium.launch({ headless: true });
});

AfterAll(async function () {
  await browser?.close();
  server?.kill();
});

Before(async function () {
  this.page = await browser.newPage();
});

BeforeStep(function ({ pickleStep, gherkinDocument }) {
  const nodeId = pickleStep.astNodeIds[0];
  this.keyword = "";
  for (const child of gherkinDocument.feature.children) {
    for (const step of child.scenario?.steps ?? []) {
      if (step.id === nodeId) {
        this.keyword = step.keyword.trim();
      }
    }
  }
});

After(async function () {
  await this.page.close();
});

Given("the list has no tasks", async function () {
  await this.page.goto(BASE);
  const items = await listTexts(this.page);
  if (items.length !== 0) {
    throw new Error(`Expected no tasks\n${items.join(", ")}`);
  }
});

Given("the list shows {string}", async function (title) {
  if (this.keyword === "Given") {
    await this.page.goto(BASE);
    await this.page.locator('input[name="title"]').fill(title);
    await this.page.getByRole("button", { name: "Add" }).click();
  }
  await expectOnList(this.page, title);
});

When("the person types {string} and presses Add", async function (title) {
  await this.page.locator('input[name="title"]').fill(title);
  await this.page.getByRole("button", { name: "Add" }).click();
});

Then("the words {string} appear on the list", async function (title) {
  await expectOnList(this.page, title);
});
