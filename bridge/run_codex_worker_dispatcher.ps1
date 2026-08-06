param(
  [switch]$Watch,
  [ValidateSet('queue', 'execute')]
  [string]$Mode = 'queue'
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot 'niannian_codex_worker_dispatcher.js'
$logRoot = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd'
$stdout = Join-Path $logRoot ("codex-worker-$stamp.out.log")
$stderr = Join-Path $logRoot ("codex-worker-$stamp.err.log")
$arguments = @($script)
if ($Watch) { $arguments += '--watch' }
$env:NIANNIAN_CODEX_WORKER_MODE = $Mode
& $node @arguments 1>> $stdout 2>> $stderr
exit $LASTEXITCODE
