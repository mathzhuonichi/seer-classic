#!/usr/bin/env python3
"""Serve the bundled game with Python's standard library."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PlaytestServer(ThreadingHTTPServer):
    # Battle entry loads portraits, timelines and audio in concurrent bursts.
    request_queue_size = 64


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=1427)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    game = Path(__file__).resolve().parent / "game"
    if not (game / "index.html").is_file():
        parser.error("game/index.html is missing; extract the complete archive first")
    handler = partial(SimpleHTTPRequestHandler, directory=str(game))
    try:
        server = PlaytestServer((args.host, args.port), handler)
    except OSError as error:
        parser.exit(1, "Unable to start game server: {}\n".format(error))
    browser_host = "127.0.0.1" if args.host == "0.0.0.0" else args.host
    print("Seer Classic: http://{}:{}/".format(browser_host, args.port), flush=True)
    print("Keep this terminal open. Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
