import { createServer } from "node:http";

const tasks = [];

export function addTitle(list, title) {
  list.push(title);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function page(list, titleValue = "") {
  const items = list.map((task) => `<li>${escapeHtml(task)}</li>`).join("");
  const safeTitle = escapeHtml(titleValue);
  return `<!DOCTYPE html>
<html>
<body>
<form method="post" action="/add">
<label>Title <input name="title" value="${safeTitle}"></label>
<button type="submit">Add</button>
</form>
<ul id="tasks">
${items}
</ul>
</body>
</html>
`;
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function createTodoServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET") {
      const body = page(tasks, url.searchParams.get("title") || "");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(body);
      return;
    }
    if (request.method === "POST" && url.pathname === "/add") {
      const raw = await readBody(request);
      const title = new URLSearchParams(raw).get("title") || "";
      addTitle(tasks, title);
      response.writeHead(303, { Location: `/?title=${encodeURIComponent(title)}` });
      response.end();
      return;
    }
    response.writeHead(404);
    response.end();
  });
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  createTodoServer().listen(8765, "127.0.0.1");
}
