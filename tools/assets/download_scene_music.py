#!/usr/bin/env python3
"""Fetch the world themes, public/audio/scene/<track>.mp3, from the official Flash resource server.

The themes and their pins are `sceneMusic.files` of public/audio/source-manifest.json; data/scene-music.json says which map
plays which (design/notes/bgm-2026-10-24.md). The files are ignored by Git. A present file whose SHA-256 matches its pin is
kept; a download whose size or SHA-256 differs from its pin is refused and nothing is written. urllib reads HTTPS_PROXY.

Usage: python3 tools/assets/download_scene_music.py [--check]
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / "public/audio"
MANIFEST = AUDIO / "source-manifest.json"
TIMEOUT_SECONDS = 60


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def fetch(entry):
    """The pinned bytes of one theme, or the reason they could not be had."""
    data = urllib.request.urlopen(entry["officialUrl"], timeout=TIMEOUT_SECONDS).read()
    if len(data) != entry["bytes"] or sha256(data) != entry["sha256"]:
        return None, "{}: {} bytes, SHA-256 {}; pinned {}, {}".format(
            entry["officialUrl"], len(data), sha256(data), entry["bytes"], entry["sha256"])
    return data, None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="only verify the present files; download nothing")
    args = parser.parse_args()
    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))["sceneMusic"]["files"]
    problems, fetched = [], 0
    for entry in entries:
        target = AUDIO / entry["file"]
        if target.is_file() and sha256(target.read_bytes()) == entry["sha256"]:
            continue
        if args.check:
            problems.append("{}: missing or not the pinned file".format(entry["file"]))
            continue
        data, problem = fetch(entry)
        if problem:
            problems.append(problem)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        part = target.with_name(target.name + ".part")
        part.write_bytes(data)
        part.replace(target)
        fetched += 1
    print("{} themes pinned, {} downloaded, {} problems".format(len(entries), fetched, len(problems)))
    for problem in problems:
        print(problem, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
