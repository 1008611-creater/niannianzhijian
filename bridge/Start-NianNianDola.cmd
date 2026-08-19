@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-NianNianDolaBridge.ps1"
if errorlevel 1 (
  echo Dola 启动失败，请确认客户端已登录。
  pause
)
