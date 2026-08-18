[CmdletBinding()]
param(
  [string]$DolaExecutable = 'E:\8.15V3版本\国际-客户便携版\国际豆包-客户便携版\国际豆包.exe',
  [string]$BridgeRoot = $PSScriptRoot,
  [int]$BridgePort = 9190,
  [int]$CdpPort = 9229
)

$ErrorActionPreference = 'Stop'
$healthUrl = "http://127.0.0.1:$BridgePort/api/v1/capabilities"

function Test-HttpHealthy {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    return ($response.ready -eq $true -and $response.seedance_2_5_available -eq $true)
  } catch { return $false }
}

function Test-PortListening([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-HttpHealthy)) {
  if (-not (Test-PortListening $CdpPort)) {
    if (-not (Test-Path -LiteralPath $DolaExecutable)) {
      throw "Dola 客户端不存在: $DolaExecutable"
    }
    Start-Process -FilePath $DolaExecutable -ArgumentList "--remote-debugging-port=$CdpPort" -WorkingDirectory (Split-Path -Parent $DolaExecutable) | Out-Null
    Start-Sleep -Seconds 3
  }

  if (-not (Test-PortListening $BridgePort)) {
    $entry = Join-Path $BridgeRoot 'niannian_dola_playwright_api_server.js'
    if (-not (Test-Path -LiteralPath $entry)) { throw "Dola 桥接入口不存在: $entry" }
    Start-Process -FilePath 'node' -ArgumentList $entry -WorkingDirectory $BridgeRoot -WindowStyle Hidden | Out-Null
  }
}

$deadline = (Get-Date).AddSeconds(15)
do {
  if (Test-HttpHealthy) { Write-Output 'DOLA_BRIDGE_READY'; exit 0 }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)

throw 'Dola 桥接启动超时，请确认客户端已登录。'
