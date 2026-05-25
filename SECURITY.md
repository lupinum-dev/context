# Security Policy

## Supported versions

Only the latest minor release of `lupinum-context` receives fixes. Older versions are superseded by patch releases on the current line.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | yes       |

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security reports.

Email **dev@lupinum.com** with:

- A description of the issue and the impact you observed
- Steps to reproduce (a minimal `.vsix` build or a repo snapshot helps)
- The version of Lupinum Context and VS Code (or Cursor / VSCodium) you were running
- Whether you would like credit in the release notes

You will receive an acknowledgement within 7 days. Fixes ship as patch releases to both the VS Code Marketplace and Open VSX; see [docs/RELEASING.md](docs/RELEASING.md) for the release flow.

## Scope

Lupinum Context is a local VS Code extension for local filesystem workspaces. It reads selected files from your workspace, formats them, and writes the result to your clipboard or a local file. Remote or virtual VS Code workspaces show a warning and block context generation. It does **not** make network requests, send telemetry, or talk to any remote service by default.

In scope for security reports:

- Arbitrary file reads outside the workspace folder
- Path-traversal or ignore-rule bypasses that leak files the user did not select
- Code execution triggered by opening a crafted workspace or `.contextignore` / `.gitignore`
- VS Code API misuse that exposes secrets stored in workspace state

Out of scope:

- Vulnerabilities in upstream dependencies that the project does not exercise (please file with the upstream first)
- Social engineering of marketplace publishers
- Issues that only reproduce with a forked or modified build
