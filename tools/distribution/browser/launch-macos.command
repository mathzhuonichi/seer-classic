#!/bin/sh
# Seer Classic for macOS: double-click in Finder to play. Starts the game server with the bundled Node.js (Apple silicon or
# Intel); server.mjs opens the game in the default browser and prints, in Chinese, where it runs. Closing this window stops it.
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
