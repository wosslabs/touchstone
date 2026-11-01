# Evidence report

29 scenarios. 0 problems. 2 left for a person to settle.

Entry points covered: 4 of 8.

## Needs a person

- drafts/legacy/orders.feature:52 "An item ordered with a quantity of zero counts as one": @suspected-bug
- drafts/legacy/orders.feature:63 "An item with no price is accepted and the order total is not a number": @suspected-bug

## Entry points with no scenario

| Entry | Where | Kind |
| --- | --- | --- |
| `GET /orders` | `src/orders.js:10` | http-route |
| `GET /orders/:id` | `src/orders.js:14` | http-route |
| `GET /legacy/export` | `src/orders.js:78` | http-route |
| `0 2 * * *` | `src/orders.js:88` | scheduled-job |

