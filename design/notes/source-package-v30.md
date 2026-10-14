# Editable source package, revision 30

Date: 2026-10-14. The user clarified that the Space/Library delivery must contain
the editable source. The preceding `linux-playtest-v30` delivery contained only a
compiled browser export and did not satisfy that requirement.

## Delivery layout

`tools/distribution/pack_source.py --revision 30` packages the current working
tree, including modified and untracked files. It does not use a Git commit as
the source snapshot. The package consists of three ordinary ZIP archives with
the common root `seer-classic-v30-source/`:

- `seer-classic-v30-source.zip` contains the editable application, battle and
  raising engines, data, documentation, tools, Rust/Tauri source, and dependency
  lockfiles. It also contains `START-HERE-SOURCE.md` and `SOURCE-MANIFEST.json`.
- `seer-classic-v30-assets-1-of-2.zip` and
  `seer-classic-v30-assets-2-of-2.zip` together contain the complete `public/`
  directory, including assets excluded by the repository's Git ignore rules.

All three archives must be extracted into the same destination. The source ZIP
alone supports code inspection; the two asset ZIPs complete the runnable project.
Every original file retains its exact bytes. The manifest records file lengths,
SHA-256 values, archive assignments, and the inventory's content identity.
`releases/seer-classic-v30-SOURCE-README.md` provides standalone instructions and
archive hashes suitable for the Library.

## Requirements and exclusions

Node.js 22.18 or newer and npm support the retained source and verification
scripts. Install dependencies with `npm ci`, run the development game with
`npm run dev -- --port 1426`, and compile with `npm run build`. Dependency
installation requires the public npm registry. All locked npm dependencies use
registry URLs; the application has no local-file or workspace package dependency.

The package includes all game assets needed by an ordinary browser build.
Provenance replays and asset exporters can require original cached inputs and
optional third-party extraction tools; those workflows are separate from source
compilation. Developer-only local SimSun/SimHei copies are excluded, and available
system fonts supply the existing fallback stack. Tauri sources are retained, but
native packaging requires the corresponding Rust/platform toolchain; the current
native package script targets a macOS application.

Excluded material comprises `.git`, `node_modules`, `dist`, `artifacts`,
`releases`, `.cache`, Tauri `target` and generated directories, operating-system
metadata, Python bytecode, logs, and player saves. Existing local releases,
development servers, and unrelated working-tree changes are preserved.

## Verification and handoff

Validation uses a fresh extraction of all three archives. It checks exact union
membership, member CRCs, byte lengths and SHA-256 values against the original
working tree, then installs locked dependencies and builds in the extracted
directory. Generated reports and command logs are retained under ignored
`artifacts/source-package-v30/`; archive identities are also recorded in
`releases/seer-classic-v30-source-package.json`.

Successful compilation establishes source completeness for the checked browser
build. It does not establish native packaging, other-platform execution, full
gameplay correctness, or visual acceptance with another computer's fonts.
Cloud replacement is performed after the local archives have been validated.
