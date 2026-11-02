import { createServer } from "node:http";
import { createOrder } from "./domain/orders.js";
import { renderReceipt } from "./domain/receipt.js";

const orders = new Map();

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function createApp() {
  return createServer(async (request, response) => {
    const reply = (status, payload) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
    };
    if (request.method === "POST" && request.url === "/orders") {
      try {
        const body = JSON.parse(await readBody(request));
        const order = createOrder(body.customer, body.lines);
        orders.set(order.id, order);
        let totalText = String(Math.abs(order.total).toFixed(2));
        const [totalWhole, totalCents] = totalText.split(".");
        let totalGrouped = "";
        for (let i = 0; i < totalWhole.length; i += 1) {
          if (i > 0 && (totalWhole.length - i) % 3 === 0) {
            totalGrouped += ",";
          }
          totalGrouped += totalWhole[i];
        }
        totalText = `${order.total < 0 ? "-" : ""}$${totalGrouped}.${totalCents}`;
        return reply(201, { id: order.id, total: order.total, display: totalText, receipt: renderReceipt(order) });
      } catch (error) {
        return reply(400, { error: error.message });
      }
    }
    const match = /^\/orders\/(\d+)$/.exec(request.url ?? "");
    if (request.method === "GET" && match) {
      const order = orders.get(Number(match[1]));
      return order ? reply(200, { id: order.id, total: order.total }) : reply(404, { error: "no such order" });
    }
    return reply(404, { error: "not found" });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createApp().listen(Number(process.env.PORT ?? 8080));
}
