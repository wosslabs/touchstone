# Security Policy

## Supported versions

Security fixes are accepted for the latest published `@wosslabs/touchstone` release on `main`.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Use GitHub's private vulnerability reporting: **Security → Report a vulnerability**
on this repository. If that is unavailable, contact the maintainers via the method
listed on the GitHub repository profile.

Include:

- Affected version / commit
- Reproduction steps or proof of concept
- Impact (for example: CI verdict bypass, hook bypass, path traversal in `init`,
  supply-chain risk in the Action)

We aim to acknowledge reports within 7 days.

## In scope

- The GitHub Action accepting evidence it should reject (trace, red-before-green,
  value mutation, gates).
- The hook failing to block writes to protected paths it claims to protect.
- The CLI writing outside the intended project directory in a dangerous way.
- Dependency or workflow changes that weaken the outer-loop checks without notice.

## Out of scope

- An agent ignoring skill text (skills are advisory; the Action and branch
  protection are the trust boundary).
- Vulnerabilities in third-party dependencies with no demonstrated impact on
  Touchstone.
