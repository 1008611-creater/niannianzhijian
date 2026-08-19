@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-NianNianDolaStartup.ps1"
if errorlevel 1 (
  echo 自动启动安装失败。
  pause
) else (
  echo 已安装：登录 Windows 后会自动启动 Dola 和桥接服务。
  pause
)
