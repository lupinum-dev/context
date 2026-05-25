# Releasing Lupinum Context

`Lupinum Context` is published to both the VS Code Marketplace and Open VSX.
Release notes, version bumps, release commits, and tags are handled by
[changelogen](https://github.com/unjs/changelogen) from Conventional Commits.

## Release Identity

| Field               | Value                                    |
| ------------------- | ---------------------------------------- |
| Extension `name`    | `lupinum-context`                        |
| `displayName`       | `Lupinum Context`                        |
| Publisher/namespace | `lupinum-dev`                            |
| Marketplace ID      | `lupinum-dev.lupinum-context`            |
| Repository          | <https://github.com/lupinum-dev/context> |
| First release       | `0.1.0`                                  |

## Tooling

The local scripts are the release interface:

```sh
pnpm run changelog          # preview notes in the terminal
pnpm run release            # changelog + version + commit + tag
pnpm run release:github     # sync GitHub release from CHANGELOG.md
```

`release` runs changelogen with `--clean`, so it expects a clean working tree.
For the first public release, keep the repo on a prerelease working version such
as `0.1.0-pre.0`, then release explicitly as `0.1.0`.

## Access

Required publisher credentials:

- VS Code Marketplace publisher access for `lupinum-dev`, cached with:
  ```sh
  pnpm exec vsce login lupinum-dev
  ```
- Open VSX namespace access for `lupinum-dev`, with:
  ```sh
  export OVSX_PAT='<token>'
  ```
- GitHub release access through `gh auth login` or `GITHUB_TOKEN`.

## Release Checklist

### 1. Preflight

```sh
git fetch origin --tags
git status --short
vp install
vp run validate
pnpm run smoke:vscode
vp run bench:smoke
pnpm run changelog
```

For the first release only, changelogen may print `fatal: No names found,
cannot describe anything.` because there is no existing tag. The command still
falls back to the full commit history.

### 2. Create the release commit and tag

First public release:

```sh
pnpm run release -- -r 0.1.0
```

Regular releases:

```sh
pnpm run release
```

This updates `package.json`, updates `CHANGELOG.md`, creates
`chore(release): v<version>`, and tags `v<version>`.

To inspect generated files without committing or tagging:

```sh
pnpm run release:prepare -- -r <version>
```

### 3. Package the VSIX

```sh
pnpm run package:vsix
unzip -l lupinum-context-<version>.vsix | head -40
```

Expected package contents include:

- `extension/package.json`
- `extension/README.md`
- `extension/CHANGELOG.md`
- `extension/assets/*`
- `extension/dist/extension.js`
- `extension/dist/webview/*`

Source files and `node_modules` should stay out of the VSIX.

### 4. Publish

```sh
pnpm exec vsce publish --packagePath lupinum-context-<version>.vsix
pnpm exec ovsx publish lupinum-context-<version>.vsix -p "$OVSX_PAT"
```

Publishing the same VSIX to both registries keeps the marketplace artifacts
identical.

### 5. Push and Sync GitHub

```sh
git push origin main --follow-tags
pnpm run release:github -- <version>
gh release upload v<version> lupinum-context-<version>.vsix --clobber
```

`release:github` reads `CHANGELOG.md`. The VSIX upload gives users a manual
install fallback.

### 6. Verify

- VS Code Marketplace:
  <https://marketplace.visualstudio.com/items?itemName=lupinum-dev.lupinum-context>
- Open VSX:
  <https://open-vsx.org/extension/lupinum-dev/lupinum-context>
- Fresh VS Code install can select files and copy `<context>...</context>`.
- Cursor or VSCodium can install the Open VSX build and pass the same smoke.

## Rollback

Marketplace versions are effectively immutable. Ship a patch release for fixes.
Use publisher dashboards to unlist a bad version if needed.

## Troubleshooting

| Symptom                                      | Likely fix                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `vsce publish` returns `403`                 | Recreate the Azure PAT with Marketplace Manage scope for all accessible organizations.                          |
| `vsce publish` returns `409 conflict`        | The version already exists. Publish a new patch version.                                                        |
| `ovsx publish` says namespace does not exist | Claim `lupinum-dev` in Open VSX namespace settings.                                                             |
| Marketplace icon is broken                   | Check that the `icon` path in [package.json](../package.json) is included by [.vscodeignore](../.vscodeignore). |
| `release:github` cannot authenticate         | Run `gh auth login`, set `GITHUB_TOKEN`, or pass `--token <token>` after the script separator.                  |
| Listing description is stale                 | Update the opening paragraphs of [README.md](../README.md), then publish a patch release.                       |
