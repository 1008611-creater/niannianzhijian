[CmdletBinding()]
param(
  [int]$Port = 8091,
  [string]$ApiKey = $env:DOLA_FASTAPI_KEY
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw '请先设置 DOLA_FASTAPI_KEY' }
$env:DOLA_FASTAPI_KEY = $ApiKey
$env:DOLA_BRIDGE_URL = if ($env:DOLA_BRIDGE_URL) { $env:DOLA_BRIDGE_URL } else { 'http://127.0.0.1:9190' }
python -m uvicorn api.dola_fastapi:app --host 127.0.0.1 --port $Port
