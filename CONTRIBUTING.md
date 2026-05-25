# Contributing to Lupinum Context

Thanks for taking the time. This is a focused VS Code extension — one job, done well — so contributions land best when they align with that focus. Read this once, then dive in.

## Before you start

- **Bug or small fix:** just open a PR.
- **New feature or anything that changes the UX:** open an issue first so we can talk shape. We've turned down good ideas because they widened the product surface area. See [README › Why a fork, not a contribution?](README.md#why-a-fork-not-a-contribution) for what we deliberately don't do.
- **Architecture:** read [AGENTS.md](AGENTS.md) before touching `src/`. Import boundaries are enforced by `scripts/check-boundaries.mjs`.

## Local setup

This repo uses **vite-plus** (`vp`) for install, checks, tests, and builds. `vp` uses the pinned package manager from [package.json](package.json).

```bash
git clone https://github.com/lupinum-dev/context.git
cd context
vp install
```

Node 20+ is required (see [.nvmrc](.nvmrc) and the `engines` block in [package.json](package.json)).

## Running the extension

```bash
vp run watch             # incremental rebuild of extension + webview
```

Then press **F5** in VS Code to launch the Extension Development Host. Reload that window (`Cmd/Ctrl+R`) after edits — the watcher rebuilds in the background.

To install the production VSIX into your real VS Code:

```bash
vp run deploy:local
```

## Quality gates

For a quick type-only sanity check, run:

```bash
vp run typecheck
```

Before opening a PR, run the full local gate:

```bash
vp run validate
```

Before release or performance-sensitive changes, also run the benchmark smoke gate:

```bash
vp run bench:smoke
```

Run the extension-host smoke test before release or when changing VS Code command wiring:

```bash
vp run smoke:vscode
```

Use `vp run bench:large` manually when you want fresh large-fixture numbers; it reports results without enforcing thresholds.

The pre-commit hook (`.vite-hooks/pre-commit`) runs `vp staged` automatically — it formats and lints only what you staged. Don't bypass it.

## Code style

- Format & lint are handled by `vite-plus` (oxc under the hood). The config lives in [vite.config.mts](vite.config.mts). Don't introduce a parallel ESLint/Prettier setup.
- Single quotes, no semicolons (configured in the `fmt` block).
- Prefer **delete, simplify, replace** before adding code. Same rule [AGENTS.md](AGENTS.md) gives the agents.

## Commit & PR conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Release notes are generated from commit history with changelogen.
- Prefer the smallest accurate type: `feat: add git commit selection`, `fix: correct token estimate rounding`, `docs: update release flow`.
- One concern per PR. If you find yourself writing "and also", split it.
- Do not maintain an `Unreleased` changelog section by hand. During release, changelogen updates [CHANGELOG.md](CHANGELOG.md) from the commits.
- Link the issue in the PR body. If there isn't one, write a paragraph explaining the motivation.

## Security issues

Do **not** open a public issue for a security report. See [SECURITY.md](SECURITY.md) for the private disclosure channel.

## License

By contributing, you agree your contributions are licensed under [AGPL-3.0](LICENSE).
