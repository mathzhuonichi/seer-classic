@echo off
rem Seer Classic for Windows: double-click to play. Starts the game server with the bundled Node.js; server.mjs opens the
rem game in Microsoft Edge (or the default browser) and prints, in Chinese, where it runs. Closing this window stops it.
rem The packer (tools/distribution/pack_browser.mjs) ships it with CRLF line ends under its Chinese name. Every line up to the
rem first label is ASCII, so the console's code page does not matter there; the messages after it switch the console to UTF-8.
rem server.mjs exits with 3 after it has shown its own message and the player pressed a key; any other failure is reported here.
setlocal
set "NODE=%~dp0runtime\win-x64\node.exe"
if not exist "%NODE%" goto missing
"%NODE%" "%~dp0server.mjs"
if "%errorlevel%"=="0" exit /b 0
if "%errorlevel%"=="3" exit /b 3
goto stopped

:missing
chcp 65001 >nul
echo.
echo 找不到游戏的运行环境（runtime\win-x64\node.exe）。
echo 请先把下载的 ZIP 完整解压到本地文件夹（例如 C:\Games），再双击解压出来的“启动游戏-Windows.bat”。
echo 不要在压缩包窗口里直接双击运行。
echo.
pause
exit /b 1

:stopped
chcp 65001 >nul
echo.
echo 游戏服务意外停止了。请把这个窗口里的文字截图发给提供游戏的人。
echo.
pause
exit /b 1
