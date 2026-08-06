param(
  [string]$TaskName = 'NianNianAICodexWorkerDispatcher',
  [ValidateSet('queue', 'execute')]
  [string]$Mode = 'queue'
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run_codex_worker_dispatcher.ps1'
if (!(Test-Path -LiteralPath $runner)) {
  throw "Missing Codex worker runner: $runner"
}
if (!(Get-Command codex -ErrorAction SilentlyContinue)) {
  throw 'Codex CLI is not available on this machine'
}

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Watch -Mode {1}' -f $runner, $Mode)
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
  -Description 'Dispatches validated NianNian AI website jobs to isolated Codex worker sessions. Provider submission remains authorization-gated.' `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName,State
