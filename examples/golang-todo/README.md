# Go todo

[godog](https://github.com/cucumber/godog) steps over HTTP (`httptest`). Steps are in `features/acceptance_test.go` next to the `.feature` file.

```
go test ./tasks/...        # unit tests
go test ./features/...     # scenarios
npx @wosslabs/touchstone check
```

godog has no Cucumber-messages output, so the red check accepts any failing run (`red-reason-unchecked`). godog runs each scenario as a subtest named with underscores, which is how the red command selects one:

```yaml
- uses: actions/setup-go@v5
  with:
    go-version: "1.23"
- uses: wosslabs/touchstone@v0
  with:
    base: ${{ github.event.pull_request.base.sha }}
    command: go test ./features/...
    red-command: go test ./features/ -run "TestFeatures/^$(printf '%s' "$TOUCHSTONE_SCENARIO_TITLE" | tr ' ' _)\$"
    red-reason-unchecked: "true"
```
