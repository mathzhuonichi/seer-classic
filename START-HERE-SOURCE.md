# Seer Classic revision 30: editable source

This delivery contains the current editable application source and the complete
offline game assets. The earlier `linux-playtest` archives were compiled browser
exports and did not contain the application source.

Download all three ZIP files:

1. `seer-classic-v30-source.zip`: TypeScript/React source, battle and raising
   engines, data, documentation, tools, Rust/Tauri source, and dependency lockfiles.
2. `seer-classic-v30-assets-1-of-2.zip`: the first portion of `public/`.
3. `seer-classic-v30-assets-2-of-2.zip`: the remainder of `public/`.

Extract all three into the same destination directory. Every archive uses the
same top-level directory, `seer-classic-v30-source/`. Their files do not
overlap. Keep the resulting `public/` directory beside `src/` and `package.json`.
The source ZIP alone permits code inspection, but both asset ZIPs are needed to
run the complete game. These are ordinary ZIP files; no binary joining is needed.

## Install, edit, and run

Use Node.js 22.18 or newer and npm. Installation requires access to the public npm
registry. The included lockfile pins the npm dependency versions; `node_modules`
is intentionally excluded. From the extracted project directory, run:

```sh
npm ci
npm run dev -- --port 1426
```

Open `http://127.0.0.1:1426/`. Edit files under `src/`, `battle/`, `raising/`, and
`data/`. To check and compile the source, run `npm run build`. To serve that build,
run `npm run preview -- --port 1426`. Choose another free port if necessary.
The default package scripts use port 1420; the example uses 1426 to avoid the
original development server. Browser saves belong to the browser origin; no
player save or browser profile is included.

Rust/Tauri desktop sources and `Cargo.lock` are included. Desktop development
additionally requires Rust and the operating system's Tauri build prerequisites.
The existing `npm run package` script targets a macOS `.app`; it is not a generic
Linux installer. Desktop packaging and other-platform execution are separate
from verification of the browser-source build.

## Fonts, provenance, and optional tools

The developer stylesheet optionally loads locally installed SimSun and SimHei,
or copies prepared under ignored `.cache/classic-ui-v27/`. Those local font files
are not included. The existing font stack falls back to available system fonts.
To prepare a local copy, use `tools/assets/prepare_classic_development_font.py`
with `--family` and `--source`. Production builds omit the development-only font
import. Font rendering can therefore differ across computers.

All current `public/` files are included, including animation atlases, compressed
animation metadata, skill effects, music, and images ignored by Git. Re-exporting
original third-party assets or replaying some historical provenance audits also
requires their original cached inputs and optional Java/FFDec, Python, or
Playwright tooling; those ignored research caches are not included. They are not
needed for ordinary source editing, browser builds, or playing with the included
assets. See `tools/assets/README.md` and the relevant design notes for those
optional workflows and their source requirements.

`SOURCE-MANIFEST.json` records the byte count and SHA-256 digest of every original
file in this delivery, including modified and untracked source files. It also
records which ZIP contains each file. Its content identity covers that inventory;
the manifest and this generated instruction file are not self-hashed. The source
snapshot is identified as development revision 30; the existing package
metadata remains version 0.3.2.

The package excludes Git history, installed dependencies, compiled output,
temporary artifacts, old releases, research caches, Tauri target/generated
directories, operating-system metadata, and player saves.
