# RELEASE.md

Procedure for cutting a Schlag release. Read this in full before bumping a
version or pushing a `v*` tag — the CI workflow builds the release artifacts
itself, and the mistakes below each caused a broken or asset-less release.

## How releasing actually works

- `.github/workflows/release.yml` triggers on **any push of a `v*` tag**.
- It runs on `windows-latest` only (this is a Windows-only app) and uses
  `tauri-apps/tauri-action`, which **builds the app and uploads all 7 bundle
  assets** (msi, nsis, sig files, `latest.json`, etc.) to a **draft** GitHub
  Release (`releaseDraft: true`).
- A human reviews the draft and publishes it. CI publishing a draft ≠ "ready
  for every existing install to auto-update to."

**Consequence:** the release artifacts are produced by CI, not by you. Never
manually `gh release create` / publish. Doing so creates an empty, published
release and blocks CI from attaching the real assets.

## Version locations (bump ALL of them)

The app version lives in four places and must stay in sync:

1. `package.json` → `"version"`
2. `src-tauri/tauri.conf.json` → `"version"`
3. `src-tauri/Cargo.toml` → `version`
4. `src-tauri/Cargo.lock` → the `[[package]]` block for `name = "schlag"` only

Also update `CHANGELOG.md` with a new `## [x.y.z]` entry.

## ⚠️ The Cargo.lock trap (caused two broken releases)

`Cargo.lock` lists hundreds of crates. Many independent crates happen to be at
version `1.0.1` (e.g. `http-body`, `ident_case`, `equivalent`, `sync_wrapper`).
A blanket edit like:

```bash
sed -i 's/^version = "1.0.1"$/version = "1.0.2"/' src-tauri/Cargo.lock
```

is WRONG. It also rewrites every *other* crate that was at `1.0.1` to `1.0.2`,
producing pins that don't exist on crates.io (`ident_case` only publishes
1.0.0/1.0.1; `http-body` only 1.0.0/1.0.1/1.1.0). The build then fails with
`failed to select a version for the requirement ... (locked to 1.0.2)`.

### Correct way to bump Cargo.lock

Only the `schlag` package should change. Edit that single block:

```
[[package]]
name = "schlag"
version = "1.0.1"   ← change ONLY this line
```

The safest approach when in doubt: restore the whole lock from the last good
commit and re-apply just the schlag bump:

```bash
git show <last-good-sha>:src-tauri/Cargo.lock > src-tauri/Cargo.lock
# then edit the schlag [[package]] version to the new version
```

Do NOT trust `grep version = "1.0.2"` to find "what you changed" — `equivalent`
and `sync_wrapper` are legitimately `1.0.2` in the wild and were never `1.0.1`.

## Step-by-step

1. Bump `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
   and the `schlag` block in `src-tauri/Cargo.lock` (see trap above).
2. Add a `## [x.y.z]` entry to `CHANGELOG.md`.
3. Commit: `git commit -m "chore: bump version to x.y.z"` (and a separate
   changelog commit if you prefer). Push.
4. Create and push the tag:
   ```bash
   git tag -a vx.y.z -m "vx.y.z"
   git push origin vx.y.z
   ```
5. **Do not create or publish a release manually.** Wait for the CI run
   triggered by the tag to finish.
6. Verify the draft release has all 7 assets (msi, nsis, `.sig` files,
   `latest.json`). If assets are missing, the run failed — check the logs,
   fix, and re-push the tag (you may need to delete and recreate it).
7. Publish the draft from the GitHub UI (or `gh release edit vx.y.z
   --draft=false`) only after confirming the build succeeded and assets are
   present.

## If a tag needs to move (after a fix)

CI keys off the tag, not the version string. If you fix something post-tag,
move the tag to the new HEAD so CI rebuilds:

```bash
git tag -d vx.y.z
git push origin :vx.y.z
git tag -a vx.y.z -m "vx.y.z"
git push origin vx.y.z
```

If a bad manual release already exists, delete it first
(`gh release delete vx.y.z --yes`) so CI is free to create its own draft.
