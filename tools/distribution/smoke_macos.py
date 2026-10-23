#!/usr/bin/env python3
"""Packaged smoke test of the macOS app, silent and in the background.

Runs the smoke build (`npm run package:smoke`: the same app with `--features smoke` under its own identifier, so the player's
saves are never touched). Its page driver (src-tauri/smoke/driver.js) mutes the game before it loads and drives it; this
script launches it as its own process (it never activates itself or takes focus) and checks, across launches:

1. first start: the 0.2 app's save in local storage becomes the save file (tools/verification/fixtures/save-version-1-app-0.2.json);
2. the world map with no broken image, a real 404 for a missing file, the content security policy in force; a wild battle,
   its creatures animated and its first skill effect drawn; export writes a file; quit; the save file holds the journey;
3. a relaunch loads that save file (its export equals it), keeps a backup of it, and 关于 shows the license texts; a saved
   window size too large for this screen is fitted to it;
4. an unreadable save file (truncated, empty, not UTF-8) is kept byte for byte as unreadable-*.json (and in the run's backup),
   listed in settings, and a new journey starts;
5. with every save file deleted (the player README's way to start over), a new journey starts, not the imported one again;
6. the payload check fires, and the game does not open, without payload.json and without one listed file.

It reports startup, battle entry and first-effect times, and deletes the smoke identifier's data before and after.
"""

import argparse
import ctypes
import json
import os
from pathlib import Path
import plistlib
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_APP = ROOT / "src-tauri/target/release/bundle/macos/Seer Classic Smoke.app"
SEED = ROOT / "tools/verification/fixtures/save-version-1-app-0.2.json"
LAUNCH_TIMEOUT_S = 240
REFUSAL_TIMEOUT_S = 30
POLL_S = 0.2
HOME = Path.home()
# A window state saved on a larger or denser screen (physical pixels), and the window's configured minimum (logical pixels).
OVERSIZED_WINDOW = {"width": 4000, "height": 3000, "x": 0, "y": 0, "prev_x": 0, "prev_y": 0, "maximized": False, "visible": True,
                    "decorated": True, "fullscreen": False}
MINIMUM_WINDOW = (1000, 700)
UNREADABLE = {"truncated": b'{"version":5,"party"', "empty": b"", "not UTF-8": b'\xff\xfe{"version":5}\x00\x81\xc3'}


def data_dirs(identifier):
    """Everything macOS and the app keep for the smoke identifier."""
    library = HOME / "Library"
    return [library / "Application Support" / identifier, library / "Logs" / identifier, library / "WebKit" / identifier,
            library / "Caches" / identifier, library / "HTTPStorages" / identifier,
            library / "Saved Application State" / (identifier + ".savedState")]


def clear(identifier):
    """The smoke identifier's data, and the single-instance socket a killed run leaves (the plugin's name for it)."""
    if not identifier.endswith(".smoke"):
        sys.exit("refusing to clear data of a non-smoke identifier: " + identifier)
    for path in data_dirs(identifier):
        shutil.rmtree(path, ignore_errors=True)
    (Path("/tmp") / (identifier.replace(".", "_").replace("-", "_") + "_si.sock")).unlink(missing_ok=True)


def spawn(program, env, log):
    """posix_spawn as its own responsible process, as LaunchServices would: its WebKit services are attributed to it."""
    lib = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
    attributes, actions, pid = ctypes.c_void_p(), ctypes.c_void_p(), ctypes.c_int()
    assert lib.posix_spawnattr_init(ctypes.byref(attributes)) == 0
    assert lib.responsibility_spawnattrs_setdisclaim(ctypes.byref(attributes), 1) == 0
    assert lib.posix_spawn_file_actions_init(ctypes.byref(actions)) == 0
    lib.posix_spawn_file_actions_addopen(ctypes.byref(actions), 0, b"/dev/null", os.O_RDONLY, 0)
    lib.posix_spawn_file_actions_addopen(ctypes.byref(actions), 1, os.fsencode(log), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    lib.posix_spawn_file_actions_adddup2(ctypes.byref(actions), 1, 2)
    argv = (ctypes.c_char_p * 2)(os.fsencode(program), None)
    pairs = [f"{key}={value}".encode() for key, value in env.items()]
    envp = (ctypes.c_char_p * (len(pairs) + 1))(*pairs, None)
    if lib.posix_spawn(ctypes.byref(pid), os.fsencode(program), ctypes.byref(actions), ctypes.byref(attributes), argv, envp) != 0:
        sys.exit("posix_spawn failed")
    return pid.value


def alive(pid):
    try:
        finished, _ = os.waitpid(pid, os.WNOHANG)
        return finished == 0
    except ChildProcessError:
        return False


def log_lines(identifier):
    folder = HOME / "Library" / "Logs" / identifier
    return [line for path in sorted(folder.glob("*.log")) for line in path.read_text(errors="replace").splitlines()]


def smoke_events(identifier):
    events = []
    for line in log_lines(identifier):
        if "smoke {" in line:
            events.append(json.loads(line.split("smoke ", 1)[1]))
    return events


class Run:
    def __init__(self, app, out):
        info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
        self.identifier, self.program = info["CFBundleIdentifier"], app / "Contents/MacOS" / info["CFBundleExecutable"]
        self.public, self.out = app / "Contents/Resources/public", out
        self.saves = HOME / "Library/Application Support" / self.identifier / "saves"
        self.export = HOME / "Library/Application Support" / self.identifier / "smoke-export.json"
        self.window_state = HOME / "Library/Application Support" / self.identifier / ".window-state.json"
        self.results = {"identifier": self.identifier, "phases": {}}

    def launch(self, phase, seed=None, until=None, timeout=LAUNCH_TIMEOUT_S):
        """Runs the app for one phase; returns that phase's smoke events and the launch time (epoch ms)."""
        before = len(smoke_events(self.identifier))
        env = {key: value for key, value in os.environ.items() if key in ("HOME", "PATH", "USER", "TMPDIR", "LANG")}
        env["SEER_SMOKE_PHASE"] = phase
        if seed:
            env["SEER_SMOKE_SEED"] = str(seed)
        started = time.time() * 1000
        pid = spawn(self.program, env, self.out / f"smoke-{phase}.stdout")
        deadline = time.time() + timeout
        while alive(pid) and time.time() < deadline and not (until and until()):
            time.sleep(POLL_S)
        if alive(pid):
            os.kill(pid, 9)
            os.waitpid(pid, 0)
        return smoke_events(self.identifier)[before:], started

    def save(self):
        return json.loads((self.saves / "save.json").read_text())

    def phase(self, name, events, started, checks):
        by_event = {event["event"]: event for event in events}
        failures = [label for label, ok in checks(by_event) if not ok]
        world = by_event.get("world")
        record = {"events": events, "failures": failures, "startupMs": round(world["shown"] - started) if world else None}
        self.results["phases"][name] = record
        print(f"{name}: {'ok' if not failures else 'FAILED ' + ', '.join(failures)}; startup {record['startupMs']} ms")
        return not failures


def refuses(run, hide):
    """The app with one payload path hidden: the check logs a refusal (the player sees its dialog) and the app quits."""
    hidden = run.public / hide
    moved = hidden.with_name(hidden.name + ".smoke-hidden")
    hidden.rename(moved)
    refusals = lambda: [line for line in log_lines(run.identifier) if "payload check failed" in line]
    before = len(refusals())
    try:
        events, _ = run.launch("refuse", until=lambda: len(refusals()) > before, timeout=REFUSAL_TIMEOUT_S)
        lines = refusals()[before:]
        return bool(lines), {"log": lines, "worldShown": any(event["event"] == "world" for event in events)}
    finally:
        moved.rename(hidden)


def fitted(world):
    """Whether the window's inner size is within the screen's available size and no smaller than the minimum."""
    inner_width, inner_height, available_width, available_height = world.get("window", [0, 0, 0, 0])
    return MINIMUM_WINDOW[0] <= inner_width <= available_width and MINIMUM_WINDOW[1] <= inner_height <= available_height


def first_runs(run, seed):
    """The first start's import, a battle and an export, and a relaunch with a saved window state too large for the screen."""
    events, started = run.launch("import", seed=SEED)
    imported = run.save() if (run.saves / "save.json").exists() else {}
    ok = run.phase("import", events, started, lambda e: [
        ("world shown", "world" in e), ("done", "done" in e), ("save file written", bool(imported)),
        ("the 0.2 save imported and migrated", imported.get("seed") == seed["seed"] and imported.get("version", 0) > seed["version"])])
    events, started = run.launch("battle")
    after_battle = run.save()
    exported = json.loads(run.export.read_text()) if run.export.exists() else None
    ok &= run.phase("battle", events, started, lambda e: [
        ("no broken image", e.get("world", {}).get("broken") == []), ("missing file is 404", e.get("world", {}).get("missing", [0])[0] == 404),
        ("present file is 200", e.get("world", {}).get("present", [0])[0] == 200), ("eval blocked by the CSP", e.get("world", {}).get("evalBlocked")),
        ("battle entered", "battle" in e), ("both creatures animated", e.get("battle", {}).get("animated") == 2),
        ("a skill effect drew", e.get("battle", {}).get("firstEffectMs") is not None),
        ("export message", e.get("export", {}).get("toast") == "航行存档已导出。"), ("export file equals the save", exported == after_battle),
        ("still the imported journey", after_battle.get("seed") == seed["seed"]), ("done", "done" in e)])
    run.export.unlink(missing_ok=True)
    run.window_state.write_text(json.dumps({"main": OVERSIZED_WINDOW}))
    events, started = run.launch("relaunch")
    exported = json.loads(run.export.read_text()) if run.export.exists() else None
    return ok & run.phase("relaunch", events, started, lambda e: [
        ("world shown", "world" in e), ("the save file loaded", exported is not None and exported.get("seed") == seed["seed"]),
        ("progress kept", exported == run.save()), ("backup of the previous run", (run.saves / "backup-1.json").exists()),
        ("关于 shows the license texts", e.get("about", {}).get("head", "").startswith("赛尔经典")),
        ("an oversized saved window is fitted to the screen", fitted(e.get("world", {}))), ("done", "done" in e)])


def unreadable_runs(run, seed):
    """Each unreadable save file is kept byte for byte, backed up, named in a notice and listed; a new journey replaces it."""
    ok = True
    for label, broken in UNREADABLE.items():
        for kept in run.saves.glob("unreadable-*.json"):
            kept.unlink()
        (run.saves / "save.json").write_bytes(broken)
        events, started = run.launch("unreadable")
        kept = sorted(run.saves.glob("unreadable-*.json"))
        ok &= run.phase("unreadable " + label, events, started, lambda e: [
            ("the notice", "已另存原存档" in (e.get("unreadable", {}).get("notice") or "")),
            ("settings lists it", len(e.get("unreadable", {}).get("listed", [])) == 1),
            ("kept byte for byte", len(kept) == 1 and kept[0].read_bytes() == broken), ("a new journey written", run.save().get("seed") != seed["seed"]),
            ("the broken file also backed up", (run.saves / "backup-1.json").read_bytes() == broken), ("done", "done" in e)])
    return ok


def reset_run(run, seed):
    """The player README's way to start over: with every save file deleted, a new journey starts, not the imported one again."""
    for path in run.saves.iterdir():
        path.unlink()
    events, started = run.launch("import")
    return run.phase("reset", events, started, lambda e: [
        ("world shown", "world" in e), ("local storage still holds the 0.2 save", e.get("world", {}).get("localSave") is True),
        ("a new journey written", (run.saves / "save.json").exists() and run.save().get("seed") != seed["seed"]), ("done", "done" in e)])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--app", type=Path, default=DEFAULT_APP)
    parser.add_argument("--out", type=Path, default=ROOT / "artifacts" / "desktop-smoke")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    run = Run(args.app, args.out)
    clear(run.identifier)
    seed = json.loads(SEED.read_text())
    ok = True
    try:
        ok &= first_runs(run, seed)
        ok &= unreadable_runs(run, seed)
        ok &= reset_run(run, seed)
        for hide in ("payload.json", "portraits/1.png"):
            refused, details = refuses(run, hide)
            run.results["phases"]["refuse " + hide] = {"refused": refused, **details}
            print(f"refuse without {hide}: {'ok' if refused else 'FAILED'} {details}")
            ok &= refused
    finally:
        (args.out / "smoke-macos.json").write_text(json.dumps(run.results, indent=1, ensure_ascii=False) + "\n")
        clear(run.identifier)
    print("smoke " + ("passed" if ok else "FAILED") + "; details in " + str(args.out / "smoke-macos.json"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
