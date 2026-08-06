[CmdletBinding()]
param(
  [string]$ProjectRoot,
  [string]$CredentialPath = (Join-Path $env:USERPROFILE '.config\niannian-ai\cos-broker-credentials.dpapi'),
  [string]$GrantProtocolReadbackSha256,
  [string]$SessionEndpoint,
  [switch]$PrintReadinessOnly,
  [switch]$RunSyntheticProbe
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

function ConvertFrom-DpapiSecureString([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw 'NIANNIAN_COS_CREDENTIAL_BLOB_MISSING'
  }
  $encrypted = [IO.File]::ReadAllText($Path).Trim()
  if ($encrypted -notmatch '^[0-9a-f]+$') {
    throw 'NIANNIAN_COS_CREDENTIAL_BLOB_INVALID'
  }
  $secure = ConvertTo-SecureString $encrypted
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$payload = ConvertFrom-DpapiSecureString $CredentialPath | ConvertFrom-Json
if ($payload.schema_version -ne 'niannian_cos_broker_credentials_v1' -or
    $payload.secret_id -notmatch '^AKID[A-Za-z0-9]{20,}$' -or
    $payload.secret_key -notmatch '^[A-Za-z0-9]{24,64}$') {
  throw 'NIANNIAN_COS_CREDENTIAL_PAYLOAD_INVALID'
}

$resolvedProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$serverPath = Join-Path $resolvedProjectRoot 'server.js'
if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
  throw 'NIANNIAN_CANONICAL_SERVER_MISSING'
}

$env:NIANNIAN_STEP01_ARTIFACT_TRANSPORT = 'cos'
$env:NIANNIAN_COS_ENDPOINT = 'https://niannian-step01-artifacts-prod-1412440010.cos.ap-beijing.myqcloud.com'
$env:NIANNIAN_COS_BUCKET = 'niannian-step01-artifacts-prod-1412440010'
$env:NIANNIAN_COS_REGION = 'ap-beijing'
$env:NIANNIAN_COS_SECRET_ID = [string]$payload.secret_id
$env:NIANNIAN_COS_SECRET_KEY = [string]$payload.secret_key

if ($GrantProtocolReadbackSha256) {
  if ($GrantProtocolReadbackSha256 -notmatch '^[a-f0-9]{64}$') {
    throw 'NIANNIAN_STEP01_COS_GRANT_PROTOCOL_READBACK_SHA256_INVALID'
  }
  $env:NIANNIAN_STEP01_COS_GRANT_PROTOCOL_VERSION = 'v1'
  $env:NIANNIAN_STEP01_COS_GRANT_PROTOCOL_READBACK_SHA256 = $GrantProtocolReadbackSha256
}

if ($SessionEndpoint) {
  if ($SessionEndpoint -notmatch '^https://[A-Za-z0-9.-]+(?::\d{1,5})?(?:/[^?#]*)?$') {
    throw 'NIANNIAN_STEP01_ARTIFACT_BROKER_SESSION_ENDPOINT_INVALID'
  }
  $env:NIANNIAN_STEP01_ARTIFACT_BROKER_SESSION_ENDPOINT = $SessionEndpoint.TrimEnd('/')
}

if ($PrintReadinessOnly) {
  $script = "const broker=require('./bridge/niannian_step01_artifact_broker');process.stdout.write(JSON.stringify(broker.brokerReadiness())+'\n')"
  & node -e $script
  exit $LASTEXITCODE
}

if ($RunSyntheticProbe) {
  & node (Join-Path $resolvedProjectRoot 'bridge\niannian_step01_artifact_broker_probe.js')
  exit $LASTEXITCODE
}

Set-Location -LiteralPath $resolvedProjectRoot
& node $serverPath
exit $LASTEXITCODE
