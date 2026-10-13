$workspace = (Resolve-Path (Join-Path $PSScriptRoot ".."))
$wslPath = (wsl.exe -d Ubuntu -- wslpath -a ($workspace.Path.Replace('\', '/'))).Trim()
if (-not $wslPath) {
  throw "无法把工作区转换为 WSL 路径：$($workspace.Path)"
}
wsl.exe -d Ubuntu -- bash -lc "cd '$wslPath' && bash local-wsl-dev/stop-local.sh"
