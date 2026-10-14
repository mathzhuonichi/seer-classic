#!/usr/bin/env python3
"""Package an already-built frontend; never run a build or include development data."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import shutil
import tarfile
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[2]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def files_under(directory):
    return sorted(
        path for path in directory.rglob("*")
        if path.is_file() and not any(part.startswith(".") for part in path.relative_to(directory).parts)
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=["tar.gz", "zip"], default="tar.gz")
    parser.add_argument("--revision", type=int, default=18)
    args = parser.parse_args()
    if args.revision < 1:
        parser.error("revision must be a positive integer")
    package_name = "seer-classic-linux-playtest-v{}".format(args.revision)
    dist, public = ROOT / "dist", ROOT / "public"
    if not (dist / "index.html").is_file():
        parser.error("dist/index.html is missing; run the approved frontend build first")
    public_files = files_under(public)
    for source in public_files:
        target = dist / source.relative_to(public)
        if not target.is_file() or sha256(source) != sha256(target):
            parser.error("dist is missing or has outdated public asset: {}".format(source.relative_to(public)))
    if not files_under(dist / "assets"):
        parser.error("dist/assets is empty; a production frontend build is required")
    game_files = [dist / "index.html"] + files_under(dist / "assets")
    game_files += [dist / source.relative_to(public) for source in public_files]
    game_files = sorted(set(game_files))
    for path in game_files:
        if path.is_symlink() or path.suffix in {".map", ".log", ".pyc"}:
            parser.error("unexpected file in frontend output: {}".format(path.relative_to(dist)))
    releases = ROOT / "releases"
    releases.mkdir(exist_ok=True)
    archive = releases / (package_name + "." + args.format)
    with tempfile.TemporaryDirectory(prefix="linux-playtest-", dir=releases) as temporary:
        package = Path(temporary) / package_name
        (package / "game").mkdir(parents=True)
        for path in game_files:
            target = package / "game" / path.relative_to(dist)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
        for name in ("start.py", "PLAYTEST.md", "BUG_REPORT.md"):
            shutil.copy2(ROOT / "distribution" / name, package / name)
        (package / "start.py").chmod(0o755)
        inventory = {
            str(path.relative_to(package)): {"bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in files_under(package)
        }
        identity = hashlib.sha256(json.dumps(inventory, sort_keys=True).encode()).hexdigest()
        manifest = {
            "package": package_name,
            "createdUTC": datetime.now(timezone.utc).isoformat(),
            "contentSHA256": identity,
            "runtime": "Python >= 3.8 and a modern JavaScript browser with local storage",
            "linuxPlaytest": "Requires target-environment verification",
            "publicFileCount": len(public_files),
            "files": inventory,
        }
        (package / "PACKAGE.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        if args.format == "tar.gz":
            with tarfile.open(archive, "w:gz") as output:
                output.add(package, arcname=package_name)
        else:
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
                for path in files_under(package):
                    output.write(path, str(Path(package_name) / path.relative_to(package)))
    checksum = sha256(archive)
    archive.with_name(archive.name + ".sha256").write_text(checksum + "  " + archive.name + "\n", encoding="utf-8")
    print(json.dumps({"archive": str(archive), "bytes": archive.stat().st_size,
                      "sha256": checksum, "contentSHA256": identity,
                      "gameFileCount": len(game_files), "publicFileCount": len(public_files)}, indent=2))


if __name__ == "__main__":
    main()
