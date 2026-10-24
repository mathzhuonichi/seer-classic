#!/usr/bin/env python3
"""Stage the browser package's payload: the files of public/ that the game can request, in <out>/public/.

The packer (tools/distribution/pack_browser.mjs) builds the game without public/ and moves this payload into the package's
game/ folder beside the build. Files named in tools/distribution/payload-exclusions.json are left out. On APFS every file is a
clone, so staging costs no disk space. payload.json records the version and every file's size and SHA-256; server.mjs checks
the sizes at startup and the release gate (tools/verification/payload.mjs) checks it all before zipping.
"""

import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
EXCLUSIONS = Path(__file__).with_name("payload-exclusions.json")
MANIFEST = "payload.json"
NOTICES = "THIRD-PARTY-NOTICES.txt"


def load_exclusions():
    data = json.loads(EXCLUSIONS.read_text(encoding="utf-8"))
    paths = {path for group in data["groups"] for path in group["paths"]}
    return set(data["names"]), tuple(data["suffixes"]), paths


def payload_files(names, suffixes, paths):
    """Relative POSIX paths of the public/ files that ship, sorted."""
    staged = []
    for directory, folders, files in os.walk(PUBLIC):
        folders.sort()
        for name in sorted(files):
            source = Path(directory, name)
            relative = source.relative_to(PUBLIC).as_posix()
            if source.is_symlink():
                sys.exit("public/ must not hold symbolic links: {}".format(relative))
            if name in names or name.endswith(suffixes) or relative in paths:
                continue
            staged.append(relative)
    return staged


def clone_or_copy():
    """APFS clonefile on macOS, else a plain copy."""
    if sys.platform == "darwin":
        clonefile = ctypes.CDLL("libc.dylib", use_errno=True).clonefile

        def clone(source, target):
            if clonefile(os.fsencode(source), os.fsencode(target), 0) != 0:
                shutil.copyfile(source, target)
        return clone
    return shutil.copyfile


def sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="staging directory; the payload goes into its public/")
    parser.add_argument("--notices", type=Path, required=True, help="THIRD-PARTY-NOTICES.txt to place at the payload root")
    args = parser.parse_args()
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    names, suffixes, excluded = load_exclusions()
    staged = payload_files(names, suffixes, excluded)
    stale = sorted(path for path in excluded if not (PUBLIC / path).is_file())
    target_root = args.out / "public"
    if args.out.exists():
        shutil.rmtree(args.out)
    target_root.mkdir(parents=True)
    copy, entries = clone_or_copy(), {}
    sources = [(relative, PUBLIC / relative) for relative in staged] + [(NOTICES, args.notices)]
    for relative, source in sources:
        target = target_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        copy(source, target)
        entries[relative] = [target.stat().st_size, sha256(target)]
    total = sum(size for size, _ in entries.values())
    manifest = {"version": version, "files": len(entries), "bytes": total, "entries": entries}
    (target_root / MANIFEST).write_text(json.dumps(manifest, separators=(",", ":")) + "\n", encoding="utf-8")
    print("staged {} files, {:.1f} MiB, version {} in {}".format(len(entries), total / 2**20, version, target_root))
    if stale:
        print("excluded paths no longer in public/ (prune the list): {}".format(", ".join(stale)))


if __name__ == "__main__":
    main()
