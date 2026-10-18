#!/usr/bin/env python3
"""Package the current source worktree and complete public assets separately."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIRECTORIES = ("src", "battle", "raising", "data", "design", "tools", "distribution", "src-tauri")
SOURCE_FILES = (".gitignore", "AGENTS.md", "ARCHITECTURE.md", "CHANGELOG.md", "CLAUDE.md", "README.md", "approved-plan.json",
                "index.html", "preview.html", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts")
EXCLUDED_PARTS = {".git", "node_modules", "dist", "artifacts", "releases", ".cache", "__pycache__", ".DS_Store"}
MAX_ARCHIVE_BYTES = 500_000_000


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def selected(path):
    relative = path.relative_to(ROOT)
    if any(part in EXCLUDED_PARTS for part in relative.parts):
        return False
    if relative.parts[:2] in (("src-tauri", "target"), ("src-tauri", "gen")):
        return False
    if path.suffix in {".log", ".pyc"}:
        return False
    if path.is_symlink():
        raise ValueError(f"Refusing symbolic link: {relative}")
    return path.is_file()


def instructions(revision):
    return f"""# Seer Classic revision {revision}: editable source

This delivery contains the current editable application source and the complete
offline game assets. The earlier `linux-playtest` archives were compiled browser
exports and did not contain the application source.

Download all three ZIP files:

1. `seer-classic-v{revision}-source.zip`: TypeScript/React source, battle and raising
   engines, data, documentation, tools, Rust/Tauri source, and dependency lockfiles.
2. `seer-classic-v{revision}-assets-1-of-2.zip`: the first portion of `public/`.
3. `seer-classic-v{revision}-assets-2-of-2.zip`: the remainder of `public/`.

Extract all three into the same destination directory. Every archive uses the
same top-level directory, `seer-classic-v{revision}-source/`. Their files do not
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
snapshot is identified as development revision {revision}; the existing package
metadata remains version 0.3.2.

The package excludes Git history, installed dependencies, compiled output,
temporary artifacts, old releases, research caches, Tauri target/generated
directories, operating-system metadata, and player saves.
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", type=int, required=True)
    args = parser.parse_args()
    if args.revision < 1:
        parser.error("revision must be positive")
    name = f"seer-classic-v{args.revision}"
    root_name = name + "-source"
    source = [ROOT / filename for filename in SOURCE_FILES]
    for directory in SOURCE_DIRECTORIES:
        source.extend(path for path in (ROOT / directory).rglob("*") if selected(path))
    source = sorted(set(source))
    if any(not selected(path) for path in source):
        parser.error("A required source file is absent or excluded")
    assets = sorted(path for path in (ROOT / "public").rglob("*") if selected(path))
    groups = [(name + "-source.zip", source), (name + "-assets-1-of-2.zip", []),
              (name + "-assets-2-of-2.zip", [])]
    sizes = [0, 0]
    for path in sorted(assets, key=lambda item: (-item.stat().st_size, str(item))):
        part = min(range(2), key=lambda index: sizes[index])
        groups[part + 1][1].append(path)
        sizes[part] += path.stat().st_size
    inventory = {}
    for archive_name, paths in groups:
        for path in paths:
            relative = str(path.relative_to(ROOT))
            inventory[relative] = {"bytes": path.stat().st_size, "sha256": digest(path), "archive": archive_name}
    inventory = dict(sorted(inventory.items()))
    identity = hashlib.sha256(json.dumps(inventory, sort_keys=True).encode()).hexdigest()
    manifest = {"package": root_name, "revision": args.revision,
                "createdUTC": datetime.now(timezone.utc).isoformat(),
                "contentSHA256": identity, "sourceFileCount": len(source),
                "publicFileCount": len(assets), "files": inventory}
    releases = ROOT / "releases"
    releases.mkdir(exist_ok=True)
    metadata = []
    for archive_name, paths in groups:
        archive = releases / archive_name
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as output:
            for path in sorted(paths):
                relative = str(path.relative_to(ROOT))
                output.write(path, root_name + "/" + relative)
                if digest(path) != inventory[relative]["sha256"]:
                    raise RuntimeError(f"File changed during packaging: {relative}")
            if archive_name == name + "-source.zip":
                output.writestr(root_name + "/START-HERE-SOURCE.md", instructions(args.revision))
                output.writestr(root_name + "/SOURCE-MANIFEST.json", json.dumps(manifest, indent=2) + "\n")
        if archive.stat().st_size >= MAX_ARCHIVE_BYTES:
            raise RuntimeError(f"Archive exceeds upload size target: {archive_name}")
        checksum = digest(archive)
        archive.with_suffix(".zip.sha256").write_text(checksum + "  " + archive_name + "\n")
        metadata.append({"archive": archive_name, "bytes": archive.stat().st_size, "sha256": checksum})
    readme = instructions(args.revision) + "\n## Archive identities\n\n| File | Bytes | SHA-256 |\n| --- | ---: | --- |\n"
    for entry in metadata:
        readme += f"| `{entry['archive']}` | {entry['bytes']:,} | `{entry['sha256']}` |\n"
    (releases / (name + "-SOURCE-README.md")).write_text(readme, encoding="utf-8")
    report = {"package": root_name, "contentSHA256": identity, "sourceFileCount": len(source),
              "publicFileCount": len(assets), "archives": metadata}
    report_path = releases / (name + "-source-package.json")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
