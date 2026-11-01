// Homegrown router and scheduler, the way a lot of older Node services have them.
const http = require("node:http");

const routes = [];
const jobs = [];

const app = {
  get: (path, handler) => routes.push(["GET", path, handler]),
  post: (path, handler) => routes.push(["POST", path, handler]),
  listen(port, done) {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const url = new URL(req.url, "http://x");
        for (const [method, path, handler] of routes) {
          const names = [];
          const pattern = new RegExp("^" + path.replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "$");
          const m = pattern.exec(url.pathname);
          if (method === req.method && m) {
            const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
            let json = {};
            try { json = body ? JSON.parse(body) : {}; } catch (e) { res.writeHead(400); return res.end("bad json"); }
            return handler({ params, body: json }, (status, payload) => {
              res.writeHead(status, { "Content-Type": "application/json" });
              res.end(JSON.stringify(payload));
            });
          }
        }
        res.writeHead(404);
        res.end();
      });
    });
    server.listen(port, "127.0.0.1", () => done(server.address().port));
    return server;
  },
};

const cron = { schedule: (expr, fn) => jobs.push([expr, fn]) };

module.exports = { app, cron, jobs };
