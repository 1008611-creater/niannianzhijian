$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'bridge\Start-NianNianCanonical.ps1'
$source = [IO.File]::ReadAllText($scriptPath)

foreach ($required in @(
  'ConvertFrom-DpapiSecureString',
  'niannian_cos_broker_credentials_v1',
  'NIANNIAN_STEP01_ARTIFACT_TRANSPORT',
  'NIANNIAN_COS_SECRET_ID',
  'NIANNIAN_COS_SECRET_KEY',
  'NIANNIAN_STEP01_COS_GRANT_PROTOCOL_VERSION',
  'NIANNIAN_STEP01_COS_GRANT_PROTOCOL_READBACK_SHA256',
  'NIANNIAN_STEP01_ARTIFACT_BROKER_SESSION_ENDPOINT',
  'RunSyntheticProbe',
  'niannian_step01_artifact_broker_probe.js'
)) {
  if (-not $source.Contains($required)) { throw "missing_contract:$required" }
}

foreach ($forbidden in @(
  'NIANNIAN_COS_SECRET_ID=',
  'NIANNIAN_COS_SECRET_KEY=',
  'ConvertTo-SecureString -AsPlainText'
)) {
  if ($source.Contains($forbidden)) { throw "forbidden_contract:$forbidden" }
}

if ($source -notmatch "GrantProtocolReadbackSha256 -notmatch '\^\[a-f0-9\]\{64\}\$'") {
  throw 'grant_protocol_sha_gate_missing'
}
if ($source -notmatch "SessionEndpoint -notmatch '\^https://") {
  throw 'https_session_endpoint_gate_missing'
}
if ($source -notmatch 'ProjectRoot = Split-Path -Parent \$PSScriptRoot') {
  throw 'runtime_project_root_resolution_missing'
}

[Console]::Out.WriteLine('Start-NianNianCanonical contract tests passed')
