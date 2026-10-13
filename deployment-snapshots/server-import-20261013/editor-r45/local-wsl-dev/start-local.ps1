param(
  [int]$EditorPort = 5199,
  [int]$MainPort = 3026
)

$workspace = (Resolve-Path (Join-Path $PSScriptRoot ".."))
$wslPath = (wsl.exe -d Ubuntu -- wslpath -a ($workspace.Path.Replace('\', '/'))).Trim()
if (-not $wslPath) {
  throw "无法把工作区转换为 WSL 路径：$($workspace.Path)"
}

wsl.exe -d Ubuntu -- bash -lc "cd '$wslPath' && EDITOR_PORT=$EditorPort MAIN_PORT=$MainPort bash local-wsl-dev/start-local.sh"
