#!/bin/sh
# Seer Classic for macOS: double-click in Finder to play. With the bundled Node.js (Apple silicon or Intel), server.mjs checks
# the game files, starts the game server in the background, opens the game in Google Chrome or Microsoft Edge (Safari may delete
# the save after 7 days without a visit), else in the default browser, and closes this window. The server stops by itself about
# a minute after the last game page closes. A failure is explained here, in Chinese, and the window stays until a key is pressed.
# The packer (tools/distribution/pack_browser.mjs) ships it executable under its Chinese name. Gatekeeper asks once before an
# unsigned script from a download runs; the node binaries are notarized (Developer ID, Node.js Foundation) and run quarantined.
here=$(cd "$(dirname "$0")" && pwd -P) || exit 1
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; then platform=darwin-arm64; else platform=darwin-x64; fi
node="$here/runtime/$platform/node"
if [ ! -f "$node" ]; then
  echo "找不到游戏的运行环境（runtime/$platform/node）。请把下载的 ZIP 完整解压后，再双击解压出来的“启动游戏-macOS.command”。"
  printf '按回车键关闭这个窗口…'
  read -r _
  exit 1
fi
exec "$node" "$here/server.mjs"
