param(
  [string]$TaskName = 'NianNianAIControllerBridge'
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run_bridge.ps1'
$tokenFile = 'C:\Users\lsb\.config\niannian-ai\bridge-token.txt'

if (!(Test-Path -LiteralPath $runner)) {
  throw "Missing bridge runner: $runner"
}
if (!(Test-Path -LiteralPath $tokenFile)) {
  throw "Missing controller token: $tokenFile"
}

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Watch' -f $runner)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Polls authorized NianNian AI redraw jobs and mirrors controller status without provider submission.' `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName,State
