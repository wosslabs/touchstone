import { createServer, type Server } from "node:http";
import { TaskList } from "./tasks.ts";

async function readBody(request: AsyncIterable<Buffer>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createTodoServer(tasks = new TaskList()): Server {
  return createServer(async (request, response) => {
    if (request.url !== "/tasks") {
      response.writeHead(404).end();
      return;
    }
    if (request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(tasks.list()));
      return;
    }
    if (request.method === "POST") {
      try {
        const { title } = JSON.parse(await readBody(request)) as { title?: unknown };
        tasks.add(typeof title === "string" ? title : "");
        response.writeHead(201).end();
      } catch (error) {
        const status = error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
        response.writeHead(status).end(String(error instanceof Error ? error.message : error));
      }
      return;
    }
    response.writeHead(405).end();
  });
}

if (import.meta.main) {
  createTodoServer().listen(Number(process.env.PORT ?? 8080));
}
