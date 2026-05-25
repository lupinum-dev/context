# Lupinum Context

Lupinum Context is a VS Code extension for turning selected workspace files and optional recent Git diffs into a clean, LLM-ready context bundle.

It is built for developers who want precise code context for ChatGPT, Claude, Gemini, and other coding assistants without pasting whole repositories or hand-curating prompt files.

## At a Glance

| Question      | Answer                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| What is it?   | A local-first VS Code tool for assembling AI chat context from your codebase.                                                      |
| Best for      | Code review, debugging, implementation planning, refactors, and explaining a focused slice of a repo.                              |
| Inputs        | Selected files, folder selections filtered by file type, optional recent Git commit diffs, and an optional reusable prompt prefix. |
| Output        | XML-like structured text that can be copied to the clipboard or saved as `.md` / `.txt`.                                           |
| Privacy model | Context generation runs locally against filesystem workspaces.                                                                     |
| Main tradeoff | Token counts are rough estimates, not model-provider billing numbers.                                                              |

## Why Developers Use It

- Pick exactly which files go into the prompt from native VS Code tree views.
- Include recent Git commit diffs when the question is about changes, not just current files.
- Keep reusable prompt prefixes for review instructions, coding standards, or handoff notes.
- See rough selected-file, line, Claude, OpenAI, and Gemini token estimates before copying.
- Switch between readable output and compact tags when token budget matters.
- Save generated prompts under `.lupinum-context/prompts` or copy directly to your LLM.

## What It Produces

The generated context is structured so an LLM can distinguish project shape, file contents, and selected diffs:

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

Output can be readable for inspection or compact to reduce prompt size.

## Workflow

1. Open a local filesystem workspace in VS Code.
2. Open the Lupinum Context activity view.
3. Select files or folders from the file tree.
4. Use file type filters to exclude broad groups such as tests, declarations, or specific extensions.
5. Select recent Git commits if the prompt should include diffs.
6. Add or choose a prompt prefix when you want reusable instructions.
7. Create, copy, or save the context bundle.

## Ignore and Safety Rules

Lupinum Context honors `.gitignore`, `.contextignore`, and `.towerignore`.

Create `.contextignore` in the workspace root for prompt-specific exclusions:

```gitignore
tests/fixtures/
docs/generated/
*.min.js
data/
```

The extension also applies built-in exclusions for common dependency folders, build outputs, caches, secrets, media, archives, and binary artifacts. Files larger than 2 MB and files that appear binary are omitted from generated context.

## Requirements

- VS Code 1.96+
- Local filesystem workspace

For extension development:

- Node.js 20+
- pnpm 10+

## Development

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

## Architecture

The dependency direction is intentionally small:

```txt
vscode shell
-> app
-> core
```

- `src/core`: pure TypeScript domain logic for context assembly, file indexing, Git diff formatting, token estimates, and export naming.
- `src/app`: application workflows, prompt prefix storage, and workspace settings.
- `src/vscode`: VS Code adapters, command registration, tree providers, webview host, and extension bootstrap.
- `src/webview`: Vue UI for the context panel.
- `src/test`: core invariants, golden context output, storage behavior, and webview contract tests.

Import boundaries are enforced by `scripts/check-boundaries.mjs`.

## Release

Releases use Conventional Commits and changelogen. The first public version is `0.1.0`.

```bash
pnpm run changelog                 # preview generated notes
pnpm run release -- -r 0.1.0       # first release commit + tag
pnpm run release:github -- 0.1.0   # sync GitHub release from CHANGELOG.md
```

See [docs/RELEASING.md](docs/RELEASING.md) for marketplace publishing.

## License

AGPL-3.0

---

Built by [Lupinum](https://lupinum.com).
Originally forked from [prompt-tower](https://github.com/backnotprop/prompt-tower).
