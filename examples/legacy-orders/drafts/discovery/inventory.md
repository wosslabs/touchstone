# Inventory of entry points

Found by reading the code, with no model involved. Each row is a place where the outside world meets the system, so each one needs a sentence that says what a person gets from it, or a note that it is dead.

## Size

| Language | Files | Lines |
| --- | --- | --- |
| JavaScript | 5 | 264 |

## Build and runtime files

- `package.json` (npm (Node))

## Modules by size

| Path | Files | Lines |
| --- | --- | --- |
| `features` | 1 | 117 |
| `src/orders.js` | 1 | 93 |
| `src/router.js` | 1 | 42 |
| `.` | 1 | 7 |
| `src/server.js` | 1 | 5 |

## HTTP routes (7)

| Entry | Where | Framework |
| --- | --- | --- |
| `GET /orders` | `src/orders.js:10` | Express/Koa/Fastify |
| `GET /orders/:id` | `src/orders.js:14` | Express/Koa/Fastify |
| `POST /orders` | `src/orders.js:20` | Express/Koa/Fastify |
| `POST /orders/:id/pay` | `src/orders.js:50` | Express/Koa/Fastify |
| `POST /orders/:id/ship` | `src/orders.js:58` | Express/Koa/Fastify |
| `POST /orders/:id/refund` | `src/orders.js:66` | Express/Koa/Fastify |
| `GET /legacy/export` | `src/orders.js:78` | Express/Koa/Fastify |

## Scheduled jobs (1)

| Entry | Where | Framework |
| --- | --- | --- |
| `0 2 * * *` | `src/orders.js:88` | node-cron |

