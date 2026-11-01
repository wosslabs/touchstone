# TypeScript todo

Cucumber-js with TypeScript steps over HTTP. Node 22.18+ runs `.ts` files directly, so there is no build step.

```
npm ci --ignore-scripts
npm run typecheck && npm test        # unit tests in tests/
npm run acceptance                   # scenarios in features/
npx @wosslabs/touchstone check       # trace: sentence -> scenario -> step
```

Full red check (reads Cucumber messages, so the failure reason is classified):

```yaml
- uses: wosslabs/touchstone@v0
  with:
    base: ${{ github.event.pull_request.base.sha }}
    setup: npm ci --ignore-scripts
    command: npx cucumber-js --strict
    red-command: npx cucumber-js --strict --name "$TOUCHSTONE_SCENARIO" --format message:"$TOUCHSTONE_MESSAGES"
```
