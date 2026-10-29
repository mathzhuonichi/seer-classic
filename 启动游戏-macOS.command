#!/bin/sh
# Double-click in Finder to play this checkout. 启动游戏-Windows.bat and 启动游戏-Linux.desktop run the same `npm run play`: the
# game at http://127.0.0.1:1426/ (the browser package's address, so saves carry over) in the default browser. Closing this
# Terminal window stops the game. A checkout without node_modules gets them first.
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm ci || exit 1
npm run play
