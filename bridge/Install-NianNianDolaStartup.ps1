[CmdletBinding()]
param(
  [string]$TaskName = 'NianNian Dola Bridge',
  [string]$Launcher = (Join-Path $PSScriptRoot 'Start-NianNianDolaBridge.ps1')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Launcher)) { throw "启动脚本不存在: $Launcher" }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Write-Output "DOLA_STARTUP_TASK_INSTALLED: $TaskName"
