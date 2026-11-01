import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { discover } from "../ci/discover.js";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "ci", "discover.js");

function codebase(files) {
  const root = mkdtempSync(join(tmpdir(), "touchstone-discover-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function labels(root, kind) {
  return discover(root).entries.filter((entry) => entry.kind === kind).map((entry) => `${entry.method ?? ""} ${entry.name}`.trim());
}

test("finds Spring routes with their methods", () => {
  const root = codebase({
    "src/main/java/OrderController.java": [
      '@RequestMapping("/orders")',
      "class OrderController {",
      '  @GetMapping("/{id}") Order one() {}',
      '  @PostMapping(value = "/refund") void refund() {}',
      "  @DeleteMapping void clear() {}",
      "}",
    ].join("\n"),
  });
  try {
    assert.deepEqual(labels(root, "http-route"), ["/orders", "GET /{id}", "POST /refund", "DELETE"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finds routes in Express, Flask, FastAPI, Go, ASP.NET, Rails and Laravel", () => {
  const root = codebase({
    "app.js": "app.get('/users', h)\nrouter.post(`/users/:id`, h)\n",
    "app.py": "@app.route('/health', methods=['GET', 'POST'])\n@router.delete('/items/{id}')\n",
    "main.go": 'r.GET("/ping", h)\nmux.HandleFunc("POST /orders", h)\n',
    "Api.cs": '[HttpPut("{id}")]\n',
    "config/routes.rb": "  get '/about', to: 'pages#about'\n  resources :invoices\n",
    "routes/web.php": "Route::post('/login', fn() => 1);\n",
  });
  try {
    assert.deepEqual(labels(root, "http-route").sort(), [
      "DELETE /items/{id}", "GET /about", "GET /ping", "GET /users", "GET,POST /health", "POST /login", "POST /orders", "POST /users/:id", "PUT {id}", "REST /invoices",
    ].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finds scheduled jobs, message consumers and command line commands", () => {
  const root = codebase({
    "Jobs.java": '@Scheduled(cron = "0 0 2 * * *")\nvoid nightly() {}\n@KafkaListener(topics = "orders")\nvoid on() {}\n',
    "cli.py": "sub.add_parser('export')\n",
    "cli.js": "program.command('migrate <dir>')\n",
  });
  try {
    assert.deepEqual(labels(root, "scheduled-job"), ['cron = "0 0 2 * * *"']);
    assert.deepEqual(labels(root, "message-consumer"), ['topics = "orders"']);
    assert.deepEqual(labels(root, "cli-command").sort(), ["export", "migrate <dir>"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finds tables, procedures, screens and COBOL programs", () => {
  const root = codebase({
    "db/schema.sql": "CREATE TABLE IF NOT EXISTS invoices (id int);\nCREATE OR REPLACE PROCEDURE close_month AS BEGIN END;\n",
    "App.jsx": '<Route path="/checkout" element={<Checkout/>} />\n',
    "PAYROLL.cbl": "       IDENTIFICATION DIVISION.\n       PROGRAM-ID. PAYROLL01.\n",
  });
  try {
    assert.deepEqual(labels(root, "db-table"), ["invoices"]);
    assert.deepEqual(labels(root, "db-procedure"), ["PROCEDURE close_month"]);
    assert.deepEqual(labels(root, "screen"), ["/checkout"]);
    assert.deepEqual(labels(root, "program"), ["PAYROLL01"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skips dependency and build folders and reports size by language", () => {
  const root = codebase({
    "node_modules/lib/index.js": "app.get('/never', h)\n",
    "target/Gen.java": '@GetMapping("/never")\n',
    "src/App.java": '@GetMapping("/real")\n',
  });
  try {
    const inventory = discover(root);
    assert.deepEqual(inventory.entries.map((entry) => entry.name), ["/real"]);
    assert.equal(inventory.files.byLanguage.Java.files, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writes the inventory files", () => {
  const root = codebase({ "src/App.java": '@GetMapping("/real")\n' });
  try {
    const result = spawnSync("node", [script, "--repo", root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /1 http-route/);
    const markdown = spawnSync("cat", [join(root, "drafts", "discovery", "inventory.md")], { encoding: "utf8" }).stdout;
    assert.match(markdown, /GET \/real/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("says so when no known framework matches", () => {
  const root = codebase({ "src/main.c": "int main() { return 0; }\n" });
  try {
    const result = spawnSync("node", [script, "--repo", root], { encoding: "utf8" });
    assert.match(result.stdout, /no entry points/);
    const markdown = spawnSync("cat", [join(root, "drafts", "discovery", "inventory.md")], { encoding: "utf8" }).stdout;
    assert.match(markdown, /No entry points found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
