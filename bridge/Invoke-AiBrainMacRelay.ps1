[CmdletBinding()]
param(
  [ValidateSet('Status', 'Prepare', 'ExecuteOnce', 'AppTurn', 'AppReadback', 'InstallRelease', 'Step01PhaseExecute', 'HqComposite', 'HqReadback', 'HqDiagnose', 'ModelChannelAudit', 'ModelChannelRepair', 'ModelChannelRollback')]
  [string]$Action = 'Status',
  [string]$JobId,
  [string]$RequestId,
  [string]$FixedThreadId,
  [string]$PromptFile,
  [string]$EnvelopeFile,
  [string]$ReleaseVersion,
  [string]$ManifestSha256,
  [string]$ArchiveSha256,
  [string]$PhaseKey,
  [string]$ArtifactBrokerEnvelopeFile,
  [string]$MacHost = '100.68.119.126',
  [string]$MacUser = 'lsb'
)

$ErrorActionPreference = 'Stop'
if ($Action -ne 'Step01PhaseExecute' -and $PhaseKey) {
  throw 'ai_brain_mac_relay_phase_key_only_allowed_for_step01_phase_execute'
}
$allowedMacHosts = @('100.68.119.126')
if ($MacHost -notin $allowedMacHosts) {
  throw 'ai_brain_mac_relay_host_rejected'
}
if ($MacUser -ne 'lsb') {
  throw 'ai_brain_mac_relay_user_rejected'
}

$keyPath = Join-Path $env:USERPROFILE '.ssh\ai_brain_windows_to_mac_relay'
$knownHostsPath = Join-Path $env:USERPROFILE '.ssh\ai_brain_mac_relay_known_hosts'
if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) {
  throw 'ai_brain_mac_relay_private_key_missing'
}

$allowedThreadIds = @(
  '019f6201-c013-7cf3-b155-61d2789085f4',
  '019f6201-cb91-7cf0-819e-696eeabd9e78',
  '019f6201-d5e8-7083-884d-c714eb1a78b0',
  '019f6201-dff9-7f63-94d8-7f9020b3c223',
  '019f6201-ea1b-7e22-9dd0-a3b851b15b69'
)
function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
function Get-Sha256Hex([byte[]]$Bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return (($sha.ComputeHash($Bytes) | ForEach-Object { $_.ToString('x2') }) -join '') }
  finally { $sha.Dispose() }
}
function Assert-NoSecretLikeText([string]$Text) {
  if ($Text -match '(?i)sk-[A-Za-z0-9_-]{12,}' -or
      $Text -match '(?i)(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie|authorization)\s*[:=]\s*["'']?[A-Za-z0-9_./+=-]{8,}' -or
      $Text -match '(?i)bearer\s+[A-Za-z0-9_./+=-]{8,}' -or
      $Text -match '(?i)-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----') {
    throw 'ai_brain_mac_relay_app_turn_secret_like_content_rejected'
  }
}

if ($Action -in @('Prepare', 'ExecuteOnce')) {
  if ($JobId -notmatch '^web_n[ns]-[a-z0-9-]{10,100}$') {
    throw 'ai_brain_mac_relay_job_id_rejected'
  }
  $verb = if ($Action -eq 'Prepare') { 'prepare' } else { 'execute-once' }
  $remoteCommand = "ai-brain-relay $verb $JobId"
} elseif ($Action -eq 'HqComposite') {
  if ($JobId -or $RequestId -or $FixedThreadId -or $PromptFile -or $EnvelopeFile -or $ReleaseVersion -or $ManifestSha256 -or $ArchiveSha256) {
    throw 'ai_brain_mac_relay_hq_composite_does_not_accept_arguments'
  }
  $remoteCommand = 'ai-brain-relay hq-composite'
} elseif ($Action -eq 'HqReadback') {
  if ($JobId -or $RequestId -or $FixedThreadId -or $PromptFile -or $EnvelopeFile -or $ReleaseVersion -or $ManifestSha256 -or $ArchiveSha256) {
    throw 'ai_brain_mac_relay_hq_readback_does_not_accept_arguments'
  }
  $remoteCommand = 'ai-brain-relay hq-readback'
} elseif ($Action -eq 'HqDiagnose') {
  if ($JobId -or $RequestId -or $FixedThreadId -or $PromptFile -or $EnvelopeFile -or $ReleaseVersion -or $ManifestSha256 -or $ArchiveSha256) {
    throw 'ai_brain_mac_relay_hq_diagnose_does_not_accept_arguments'
  }
  $remoteCommand = 'ai-brain-relay hq-diagnose'
} elseif ($Action -eq 'ModelChannelAudit') {
  if ($JobId -or $RequestId -or $FixedThreadId -or $PromptFile -or $EnvelopeFile -or $ReleaseVersion -or $ManifestSha256 -or $ArchiveSha256) {
    throw 'ai_brain_mac_relay_model_channel_audit_does_not_accept_arguments'
  }
  $remoteCommand = 'ai-brain-relay model-channel-audit'
} elseif ($Action -eq 'ModelChannelRepair') {
  if ($JobId -or $RequestId -or $FixedThreadId -or $PromptFile -or $EnvelopeFile -or $ReleaseVersion -or $ManifestSha256 -or $ArchiveSha256) {
    throw 'ai_brain_mac_relay_model_channel_repair_does_not_accept_arguments'
  }
  $remoteCommand = 'ai-brain-relay model-channel-repair'
} elseif ($Action -eq 'ModelChannelRollback') {
  if ($JobId -or $RequestId -or $FixedThreadId -or $PromptFile -or $EnvelopeFile -or $ReleaseVersion -or $ManifestSha256 -or $ArchiveSha256) {
    throw 'ai_brain_mac_relay_model_channel_rollback_does_not_accept_arguments'
  }
  $remoteCommand = 'ai-brain-relay model-channel-rollback'
} elseif ($Action -eq 'AppTurn') {
  if ($JobId -or $ReleaseVersion -or $ManifestSha256 -or $ArchiveSha256) { throw 'ai_brain_mac_relay_app_turn_argument_rejected' }
  if ($RequestId -notmatch '^[A-Za-z0-9._-]{8,96}$') { throw 'ai_brain_mac_relay_app_turn_request_id_rejected' }
  if ($FixedThreadId -notin $allowedThreadIds) { throw 'ai_brain_mac_relay_app_turn_thread_rejected' }
  if ($EnvelopeFile -and $PromptFile) { throw 'ai_brain_mac_relay_app_turn_single_input_file_required' }
  if ($EnvelopeFile) {
    $resolvedEnvelope = Resolve-Path -LiteralPath $EnvelopeFile -ErrorAction Stop
    $bytes = [System.IO.File]::ReadAllBytes($resolvedEnvelope.Path)
    if ($bytes.Length -le 0 -or $bytes.Length -gt 65536) { throw 'ai_brain_mac_relay_app_turn_envelope_size_rejected' }
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    Assert-NoSecretLikeText $text
    $parsed = $text | ConvertFrom-Json -ErrorAction Stop
    if ($parsed.schema_version -ne 'niannian_mac_fixed_thread_app_turn_request_v1' -or $parsed.request_id -ne $RequestId -or $parsed.thread_id -ne $FixedThreadId -or $parsed.project_root -ne '/Users/lsb/AI-Brain/niannian-ai-canonical-local') {
      throw 'ai_brain_mac_relay_app_turn_envelope_binding_rejected'
    }
  } elseif ($PromptFile) {
    $resolvedPrompt = Resolve-Path -LiteralPath $PromptFile -ErrorAction Stop
    $promptBytes = [System.IO.File]::ReadAllBytes($resolvedPrompt.Path)
    if ($promptBytes.Length -le 0 -or $promptBytes.Length -gt 32000) { throw 'ai_brain_mac_relay_app_turn_prompt_size_rejected' }
    $prompt = [System.Text.Encoding]::UTF8.GetString($promptBytes)
    Assert-NoSecretLikeText $prompt
    $envelope = [ordered]@{
      schema_version = 'niannian_mac_fixed_thread_app_turn_request_v1'
      request_id = $RequestId
      thread_id = $FixedThreadId
      project_root = '/Users/lsb/AI-Brain/niannian-ai-canonical-local'
      purpose = 'windows_owner_read_only_fixed_thread_turn'
      read_only = $true
      network_access = $false
      prompt = $prompt
      media_provider_network_requested = $false
      media_provider_submit_requested = $false
      media_provider_upload_requested = $false
      spend_requested = $false
      package_send_requested = $false
      registry_promotion_requested = $false
      deployment_requested = $false
      local_image_editing_requested = $false
      production_write_requested = $false
      shell_command_requested = $false
    }
    $json = ($envelope | ConvertTo-Json -Depth 8) + "`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  } else {
    throw 'ai_brain_mac_relay_app_turn_input_file_required'
  }
  $sha = Get-Sha256Hex $bytes
  $encoded = ConvertTo-Base64Url $bytes
  $remoteCommand = "ai-brain-relay app-turn $RequestId $FixedThreadId $sha $encoded"
} elseif ($Action -eq 'AppReadback') {
  if ($JobId -or $PromptFile -or $EnvelopeFile -or $ReleaseVersion -or $ManifestSha256 -or $ArchiveSha256) { throw 'ai_brain_mac_relay_app_readback_argument_rejected' }
  if ($RequestId -notmatch '^[A-Za-z0-9._-]{8,96}$') { throw 'ai_brain_mac_relay_app_readback_request_id_rejected' }
  if ($FixedThreadId -notin $allowedThreadIds) { throw 'ai_brain_mac_relay_app_readback_thread_rejected' }
  $remoteCommand = "ai-brain-relay app-readback $RequestId $FixedThreadId"
} elseif ($Action -eq 'InstallRelease') {
  if ($JobId -or $FixedThreadId -or $PromptFile -or $EnvelopeFile) { throw 'ai_brain_mac_relay_install_argument_rejected' }
  if ($RequestId -notmatch '^[A-Za-z0-9._-]{8,96}$') { throw 'ai_brain_mac_relay_install_request_id_rejected' }
  if ($ReleaseVersion -notmatch '^20\d{2}\.\d{2}\.\d{2}\.\d+$') { throw 'ai_brain_mac_relay_install_version_rejected' }
  if ($ManifestSha256 -notmatch '^[a-f0-9]{64}$') { throw 'ai_brain_mac_relay_install_manifest_sha_rejected' }
  if ($ArchiveSha256 -notmatch '^[a-f0-9]{64}$') { throw 'ai_brain_mac_relay_install_archive_sha_rejected' }
  $remoteCommand = "ai-brain-relay install-release $RequestId $ReleaseVersion $ManifestSha256 $ArchiveSha256"
} elseif ($Action -eq 'Step01PhaseExecute') {
  if ($FixedThreadId -or $PromptFile -or $EnvelopeFile -or $ReleaseVersion -or $ArchiveSha256 -or -not $ArtifactBrokerEnvelopeFile) { throw 'ai_brain_mac_relay_step01_phase_execute_argument_rejected' }
  if ($RequestId -notmatch '^[A-Za-z0-9._-]{8,96}$') { throw 'ai_brain_mac_relay_step01_phase_execute_request_id_rejected' }
  if ($JobId -notmatch '^web_nn-[a-z0-9-]{10,100}$') { throw 'ai_brain_mac_relay_step01_phase_execute_job_id_rejected' }
  if ($ManifestSha256 -notmatch '^[a-f0-9]{64}$') { throw 'ai_brain_mac_relay_step01_phase_execute_manifest_sha_rejected' }
  if ($PhaseKey -notmatch '^step01phase-[a-f0-9]{64}$') { throw 'ai_brain_mac_relay_step01_phase_execute_phase_key_rejected' }
  $resolvedBrokerEnvelope = Resolve-Path -LiteralPath $ArtifactBrokerEnvelopeFile -ErrorAction Stop
  $brokerEnvelopeBytes = [System.IO.File]::ReadAllBytes($resolvedBrokerEnvelope.Path)
  if ($brokerEnvelopeBytes.Length -le 0 -or $brokerEnvelopeBytes.Length -gt 524288) { throw 'ai_brain_mac_relay_step01_phase_execute_broker_envelope_size_rejected' }
  $brokerEnvelope = [System.Text.Encoding]::UTF8.GetString($brokerEnvelopeBytes) | ConvertFrom-Json -ErrorAction Stop
  if ($brokerEnvelope.schema_version -ne 'niannian_step01_mac_broker_envelope_v1' -or $brokerEnvelope.project_id -ne 'NN-20260715083045-8120F5' -or $brokerEnvelope.phase_key -ne $PhaseKey -or $brokerEnvelope.manifest_sha256 -ne $ManifestSha256 -or -not $brokerEnvelope.return_session -or -not $brokerEnvelope.package_grants) { throw 'ai_brain_mac_relay_step01_phase_execute_broker_envelope_binding_rejected' }
  $remoteCommand = "ai-brain-relay step01-phase-execute $RequestId $JobId $PhaseKey $ManifestSha256"
} elseif ($JobId) {
  throw 'ai_brain_mac_relay_status_does_not_accept_job_id'
} else {
  $remoteCommand = 'ai-brain-relay status'
}
$sshArguments = @(
  '-i', $keyPath,
  '-o', 'BatchMode=yes',
  '-o', 'PasswordAuthentication=no',
  '-o', 'KbdInteractiveAuthentication=no',
  '-o', 'IdentitiesOnly=yes',
  '-o', 'ForwardAgent=no',
  '-o', 'ForwardX11=no',
  '-o', 'ClearAllForwardings=yes',
  '-o', 'RequestTTY=no',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', "UserKnownHostsFile=$knownHostsPath",
  '-o', 'ConnectTimeout=15',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  "$MacUser@$MacHost",
  $remoteCommand
)

if ($Action -eq 'Step01PhaseExecute') {
  # Short-lived COS grants only cross stdin and are removed from Windows after use.
  [System.Text.Encoding]::UTF8.GetString($brokerEnvelopeBytes) | & "$env:WINDIR\System32\OpenSSH\ssh.exe" @sshArguments
  $exitCode = $LASTEXITCODE
  Remove-Item -LiteralPath $resolvedBrokerEnvelope.Path -Force -ErrorAction SilentlyContinue
  exit $exitCode
}
& "$env:WINDIR\System32\OpenSSH\ssh.exe" @sshArguments
exit $LASTEXITCODE
