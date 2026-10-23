#!/usr/bin/env python3
"""Pack the built macOS app into a DMG with the player README and the third-party notices.

The DMG holds Seer Classic.app (an APFS clone of the signed bundle), a link to /Applications, 请先阅读.txt
(tools/distribution/player-readme.txt) and THIRD-PARTY-NOTICES.txt (the copy inside the app's payload). It is written as
releases/SeerClassic-<version>-macos-<arch>.dmg and checked with hdiutil verify; the app is checked with codesign first.
"""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_APP = ROOT / "src-tauri/target/release/bundle/macos/Seer Classic.app"
README = Path(__file__).with_name("player-readme.txt")


def run(*command):
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, default=DEFAULT_APP)
    parser.add_argument("--out", type=Path, default=ROOT / "releases")
    args = parser.parse_args()
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    executable = args.app / "Contents/MacOS" / "seer-classic"
    arch = "-".join(run("lipo", "-archs", str(executable)).split())
    run("codesign", "--verify", "--deep", "--strict", str(args.app))
    stage = args.out / "dmg-stage"
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    try:
        run("cp", "-cR", str(args.app), str(stage / args.app.name))
        os.symlink("/Applications", stage / "Applications")
        shutil.copyfile(README, stage / "请先阅读.txt")
        shutil.copyfile(args.app / "Contents/Resources/public/THIRD-PARTY-NOTICES.txt", stage / "THIRD-PARTY-NOTICES.txt")
        dmg = args.out / "SeerClassic-{}-macos-{}.dmg".format(version, arch)
        run("hdiutil", "create", "-volname", "Seer Classic", "-srcfolder", str(stage), "-format", "UDZO", "-ov", str(dmg))
        run("hdiutil", "verify", str(dmg))
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print("{}: {:.2f} GiB, {}".format(dmg.relative_to(ROOT) if dmg.is_relative_to(ROOT) else dmg, dmg.stat().st_size / 2**30, arch))


if __name__ == "__main__":
    main()
