@echo off
rem Double-click on Windows to play this checkout. 启动游戏-macOS.command and 启动游戏-Linux.desktop run the same `npm run play`:
rem the game at http://127.0.0.1:1426/ (the browser package's address, so saves carry over) in the default browser. Closing this
rem window stops the game. A checkout without node_modules gets them first.
cd /d "%~dp0"
if not exist node_modules call npm ci
call npm run play
pause
