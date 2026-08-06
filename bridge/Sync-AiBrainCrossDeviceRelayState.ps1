[CmdletBinding()]
param(
  [string]$StatePath = (Join-Path $env:USERPROFILE 'ai-brain-share\cross_device_relay_state.json')
)

$ErrorActionPreference = 'Stop'
$callerPath = Join-Path $env:USERPROFILE '.local\bin\Invoke-AiBrainMacRelay.ps1'
$relayStatePath = Join-Path $env:USERPROFILE 'ai-brain-mac-relay-runtime\relay_state.json'

if (-not (Test-Path -LiteralPath $callerPath -PathType Leaf)) {
  throw 'cross_device_relay_windows_caller_missing'
}

$raw = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $callerPath -Action Status 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw 'cross_device_relay_status_failed'
}

$gatewayStatus = $null
foreach ($line in $raw) {
  try {
    $candidate = ([string]$line | ConvertFrom-Json -ErrorAction Stop)
    if ($candidate.ok -eq $true -and $candidate.service -eq 'ai-brain-mac-relay') {
      $gatewayStatus = $candidate
    }
  } catch {}
}
if ($null -eq $gatewayStatus -or $gatewayStatus.shell -ne $false -or $gatewayStatus.project_present -ne $true) {
  throw 'cross_device_relay_status_contract_invalid'
}

$pendingExportJob = $null
if (Test-Path -LiteralPath $relayStatePath -PathType Leaf) {
  $relayState = Get-Content -LiteralPath $relayStatePath -Raw | ConvertFrom-Json
  $candidate = [string]$relayState.pending.job_id
  if ($candidate -match '^web_n[ns]-[a-z0-9-]{10,100}$') {
    $pendingExportJob = $candidate
  }
}

$state = [ordered]@{
  schema_version = 'ai_brain_cross_device_relay_state_v1'
  updated_at = (Get-Date).ToUniversalTime().ToString('o')
  gateway = 'verified'
  gateway_status = [ordered]@{
    service = $gatewayStatus.service
    shell = [bool]$gatewayStatus.shell
    lock = [string]$gatewayStatus.lock
    project_present = [bool]$gatewayStatus.project_present
  }
  mac_ip = '100.68.119.126'
  windows_ip = '100.125.247.33'
  ssh_user = 'lsb'
  skills = @('mx-shortdrama-00-router','mx-shortdrama-01-frame-extract')
  worker_mode = 'policy_auto_low_risk'
  active_job = $null
  pending_export_job = $pendingExportJob
  execution_requires_user_approval = $false
  execution_policy = [ordered]@{
    policy_id = 'niannian_low_risk_analysis_v1'
    auto_approve_scope = 'step01_evidence_only'
    provider_submission = 'manual_approval_required'
    deploy = 'manual_approval_required'
    package_send = 'manual_approval_required'
    account_change = 'manual_approval_required'
  }
  transitions = [ordered]@{
    status = [ordered]@{requires_exact_job=$false;requires_user_approval=$false;allowed_now=$true}
    prepare = [ordered]@{requires_exact_job=$true;requires_user_approval=$false;allowed_now=$false}
    execute_once = [ordered]@{requires_exact_job=$true;requires_user_approval=$false;requires_policy_approval=$true;allowed_now=$true}
  }
  blocked_actions = @('provider','deploy','package_send','user_visible_acceptance','account_change','local_image_editing')
  evidence = [ordered]@{
    mac_gateway_status = 'live_status_verified'
    mac_security_policy = 'verified_by_mac_setup_report'
    skill_installation = 'verified_by_mac_setup_report'
  }
}

$directory = Split-Path -Parent $StatePath
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$temporary = "$StatePath.tmp-$PID"
$state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding UTF8
Move-Item -LiteralPath $temporary -Destination $StatePath -Force

[ordered]@{
  ok = $true
  state_path = $StatePath
  gateway = $state.gateway
  worker_mode = $state.worker_mode
  pending_export_job = $state.pending_export_job
  active_job = $state.active_job
} | ConvertTo-Json -Compress
