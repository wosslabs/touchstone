// Renders docs/diagrams/outer-inner-loop.svg to docs/images/outer-inner-loop.png.
// Needs Playwright with Chromium, for example from examples/web-todo:
//   cd examples/web-todo && npm install && npx playwright install chromium
//   node ../../docs/diagrams/render.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Playwright is resolved from the folder you run this in, so it does not have to be a dependency of the package.
const { chromium } = createRequire(join(process.cwd(), "noop.js"))("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(here, "outer-inner-loop.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1060 }, deviceScaleFactor: 1.5 });
await page.setContent(`<!doctype html><html><body style="margin:0;background:#fbfaf7">${svg}</body></html>`);
await page.screenshot({ path: join(here, "..", "images", "outer-inner-loop.png"), clip: { x: 0, y: 0, width: 1800, height: 1060 } });
await browser.close();
console.log("wrote docs/images/outer-inner-loop.png");
