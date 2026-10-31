# Rust todo

[cucumber-rs](https://github.com/cucumber-rs/cucumber) steps over HTTP (`ureq`) against a `tiny_http` server. The acceptance target is `features/acceptance.rs` (`harness = false`).

```
cargo test --lib                      # unit tests
cargo test --test acceptance          # scenarios
npx @wosslabs/touchstone check
```

cucumber-rs does not write Cucumber messages, so the red check accepts any failing run (`red-reason-unchecked`). `--name` takes a regex:

```yaml
- uses: dtolnay/rust-toolchain@stable
- uses: wosslabs/touchstone@v1
  with:
    base: ${{ github.event.pull_request.base.sha }}
    command: cargo test --test acceptance
    red-command: cargo test --test acceptance -- --name "$TOUCHSTONE_SCENARIO"
    red-reason-unchecked: "true"
```
