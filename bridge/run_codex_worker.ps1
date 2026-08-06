param(
  [Parameter(Mandatory = $true)]
  [string]$CodexArgsPath
)

$ErrorActionPreference = 'Stop'

try {
  $resolvedArgsPath = (Resolve-Path -LiteralPath $CodexArgsPath -ErrorAction Stop).Path
  $workerRoot = $env:NIANNIAN_WORKER_JOB_ROOT
  if ($workerRoot) {
    $resolvedWorkerRoot = (Resolve-Path -LiteralPath $workerRoot -ErrorAction Stop).Path.TrimEnd('\')
    if ($resolvedArgsPath -ne $resolvedWorkerRoot -and -not $resolvedArgsPath.StartsWith($resolvedWorkerRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'Codex argument file must stay inside the worker job root.'
    }
  }
  $parsedArgs = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $resolvedArgsPath -Raw -ErrorAction Stop) -ErrorAction Stop
} catch {
  throw 'CodexArgsPath must resolve to a JSON string array inside the worker job root.'
}

$codexArgs = @($parsedArgs)
if ($codexArgs.Count -eq 0 -or ($codexArgs | Where-Object { $_ -isnot [string] }).Count -gt 0) {
  throw 'Codex argument file must contain at least one string argument.'
}

& codex @codexArgs
exit $LASTEXITCODE
