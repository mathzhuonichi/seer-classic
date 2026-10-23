赛尔经典 · Seer Classic — 请先阅读

赛尔经典（Seer Classic）是非官方的爱好者重制版，与上海淘米网络科技有限公司无关。游戏中的原版美术、音效、动画与 SWF 素材版权归 © 上海淘米网络科技有限公司所有。本作免费提供，仅供个人怀旧与学习，不得出售或用于任何商业用途。

一、安装前
- 安装过程中请预留约 5.5 GB 可用磁盘空间（安装包约 2.7 GB，游戏本身约 2.8 GB）。
- 游戏完全离线运行，不需要网络。

二、macOS（Apple 芯片的 Mac）
1. 打开 .dmg，把“Seer Classic”拖进“应用程序”文件夹。
2. 第一次打开时，系统会提示无法验证开发者。请打开“系统设置 > 隐私与安全性”，在页面下方找到 Seer Classic，点“仍要打开”，再确认一次。之后即可正常打开。
3. 请不要修改“应用程序”中 Seer Classic 包内的任何文件，否则系统会认为它已损坏。

三、Windows 10 / 11（64 位）
1. 解压前，在 ZIP 文件上右键 > 属性，勾选“解除锁定”，再点“确定”。
2. 解压到本地文件夹，例如 C:\Games\SeerClassic。不要解压到 OneDrive 同步的“桌面”或“文档”中：同步会上传约 2.8 GB 文件，还可能让文件只留在云端。
3. 必须完整解压整个文件夹：Seer Classic.exe 要和 public 文件夹放在一起。如果提示“资源不完整，请重新解压或安装。”，请删除这个文件夹后重新完整解压。
4. 双击 Seer Classic.exe。如果出现“Windows 已保护你的电脑”，点“更多信息 > 仍要运行”。
5. 游戏需要 Microsoft Edge WebView2 运行时（Windows 11 和多数 Windows 10 已自带）。如果打开时提示缺少 WebView2，请从 https://developer.microsoft.com/microsoft-edge/webview2/ 安装 Evergreen 运行时后再打开。

四、把浏览器版的存档搬进来
1. 在浏览器版游戏中（双击 test.command 打开，地址为 http://127.0.0.1:1426/），打开“设置”，点“导出存档”，保存得到的 .json 文件。
2. 在本应用中打开“设置”，点“导入存档”，选择刚才的文件。

五、存档在哪里
游戏自动保存。存档是普通文件，删除或更新应用都不会删除它：
- macOS：~/Library/Application Support/local.chizhuoni.seer-classic/saves/
- Windows：%APPDATA%\local.chizhuoni.seer-classic\saves\
save.json 是当前存档，backup-1.json 到 backup-3.json 是较早的备份；无法读取的旧存档会以 unreadable-*.json 原样保留，也可以在“设置”中导出。
随时可以在“设置”中点“导出存档”另存一份。
想从头开始：先退出游戏并导出存档备份，再删除上面的 save.json（备份文件可以一并删除）。下次打开时会开始新的旅程。
日志在 macOS 的 ~/Library/Logs/local.chizhuoni.seer-classic/ 和 Windows 的 %LOCALAPPDATA%\local.chizhuoni.seer-classic\logs\，反馈问题时请一并附上。

六、开源许可
游戏使用的开源软件及其许可条款见同目录的 THIRD-PARTY-NOTICES.txt，也可以在游戏的“设置 > 关于”中查看。
