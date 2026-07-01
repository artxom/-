#!/bin/bash
# 一键唤起控制台脚本
cd "$(dirname "$0")"

# 检查系统自带的 python3
if command -v python3 &>/dev/null; then
    PYTHON_BIN="python3"
elif command -v python &>/dev/null; then
    PYTHON_BIN="python"
else
    echo "Error: Python is not installed or not in PATH."
    exit 1
fi

echo "正在启动造数工具控制台..."
$PYTHON_BIN launcher.py &

# 退出当前终端窗口 (macOS Terminal behavior)
osascript -e 'tell application "Terminal" to close (every window whose name contains "Start_Tool")' &
exit 0
