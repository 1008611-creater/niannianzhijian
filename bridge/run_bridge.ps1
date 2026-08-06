param(
  [switch]$Watch
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot 'niannian_controller_bridge.js'
$logRoot = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd'
$stdout = Join-Path $logRoot ("bridge-$stamp.out.log")
$stderr = Join-Path $logRoot ("bridge-$stamp.err.log")
$arguments = @($script)
if ($Watch) { $arguments += '--watch' }
& $node @arguments 1>> $stdout 2>> $stderr
exit $LASTEXITCODE
