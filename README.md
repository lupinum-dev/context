# Lupinum Context

Turn selected workspace files and Git diffs into clean, AI-ready context from inside VS Code.

Lupinum Context is a local-first VS Code extension for building precise prompts for ChatGPT, Claude, Gemini and other LLMs.
Pick the files you want, optionally include recent Git commit diffs, add a reusable prompt prefix, then copy or save a structured context bundle.

## Features

- Visual file selection with native VS Code checkboxes
- Rough token estimates for Claude, OpenAI, and Gemini
- Optional recent Git commit diff selection
- Reusable prompt prefixes
- Readable or compact XML-like output
- `.gitignore`, `.contextignore`, and `.towerignore` support
- Local-only context generation for filesystem workspaces

## Output

Lupinum Context generates structured text like this:

```xml
<context>
<project_tree>
src/
└─ core/
   └─ context/ContextAssembler.ts
</project_tree>
<project_files>
<file name="ContextAssembler.ts" path="/src/core/context/ContextAssembler.ts">
...
</file>
</project_files>
<git_diffs>
...
</git_diffs>
</context>
```

## Quick start

1. Install **Lupinum Context** in VS Code.
2. Open the Lupinum Context view from the Activity Bar.
3. Select files and, optionally, Git commits.
4. Add a prompt prefix if needed.
5. Click **Copy Context**.
6. Paste into your LLM of choice.

## Ignore files

Create a `.contextignore` file in your workspace root to keep noisy files out of context:

```gitignore
tests/fixtures/
docs/generated/
*.min.js
data/
```

Lupinum Context also honors `.gitignore` and `.towerignore`.

## Development

Requirements:

- Node.js 20+
- pnpm 10+
- VS Code 1.96+

```bash
git clone https://github.com/lupinum-dev/context.git
cd context
vp install
vp run watch
```

Then press `F5` in VS Code to launch the Extension Development Host.

Before opening a PR:

```bash
vp run validate
```

Before release or command-wiring changes:

```bash
pnpm run smoke:vscode
vp run bench:smoke
```

Build and install a local VSIX:

```bash
vp run deploy:local
```

## Release

Releases use Conventional Commits and changelogen. The first public version is
`0.1.0`.

```bash
pnpm run changelog                 # preview generated notes
pnpm run release -- -r 0.1.0       # first release commit + tag
pnpm run release:github -- 0.1.0   # sync GitHub release from CHANGELOG.md
```

See [docs/RELEASING.md](docs/RELEASING.md) for marketplace publishing.

## Architecture

```txt
src/core   → pure domain logic
src/app    → application workflows
src/vscode → VS Code adapters and shell
src/webview → Vue UI
```

Import boundaries are enforced by `scripts/check-boundaries.mjs`.

## License

AGPL-3.0

---

Built by [Lupinum](https://lupinum.com).
Originally forked from [prompt-tower](https://github.com/backnotprop/prompt-tower).
