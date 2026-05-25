# Development Guide

## Product Focus

`Lupinum Context` does one thing: select codebase files and optional recent Git diffs, combine them with an optional reusable prefix, and create AI-ready context that can be copied or saved.

## Architecture

The dependency direction is:

```txt
vscode shell
-> app
-> core
```

- `src/core`: pure TypeScript domain logic. No `vscode`, no app imports, no adapter imports.
- `src/app`: application services and small ports. No `vscode` imports and no concrete `src/vscode` adapter imports.
- `src/vscode`: VS Code adapters, tree providers, webview shell, command registration, and bootstrap.
- `src/test`: node-based tests for core invariants, golden context output, storage behavior, and webview contracts.

`src/extension.ts` should stay tiny and only activate/deactivate the VS Code shell.

## Current Source Map

- `src/core/context`: context assembly, project tree rendering, and context-size estimation.
- `src/core/files`: file indexing, ignore rules, file-kind grouping, and selection intent.
- `src/core/git`: local Git commit selection and diff formatting.
- `src/app/PromptPrefixes.ts`: named prompt prefix storage, validation, and one-time old-prefix import.
- `src/core/tokens`: rough estimate profiles for Claude, OpenAI, and Gemini.
- `src/core/export`: prompt file naming and export target rules.
- `src/app`: context creation, prompt prefixes, and workspace settings.
- `src/vscode/shell`: VS Code bootstrap, commands, webview message handling, service wiring, logging, and watcher session.
- `src/vscode/views`: native file tree and selection filter tree providers.
- `src/vscode/webview`: webview HTML host, CSS, Vue UI, and typed messages.

## Implementation Rules

- Keep every important concept to one source of truth.
- Selection intent is canonical; selected files, folder checkbox state, filter groups, and token totals are derived.
- Context generation is pure; update golden fixtures for intentional output changes.
- Prompt prefixes are simple named snippets. Do not add version history or hidden soft-delete records without a proven product requirement.

## Verification

Before finishing meaningful changes, run:

```sh
vp install
vp run validate
```

Run `vp run deploy:local` before manual VS Code smoke.
