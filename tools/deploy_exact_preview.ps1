param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 999999)]
  [int]$PullRequest,

  [ValidateRange(19000, 19999)]
  [int]$Port = 19090,

  [string]$RemoteHost = 'haika-niannian'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$gitSha = (& git -C $repoRoot rev-parse HEAD).Trim().ToLowerInvariant()
if ($LASTEXITCODE -ne 0 -or $gitSha -notmatch '^[a-f0-9]{40}$') { throw 'PREVIEW_GIT_SHA_INVALID' }

& git -C $repoRoot diff --quiet HEAD --
if ($LASTEXITCODE -ne 0) { throw 'PREVIEW_TRACKED_WORKTREE_NOT_CLEAN' }

$temporaryBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryRoot = Join-Path $temporaryBase ("niannian-preview-pr-{0}-{1}" -f $PullRequest, [Guid]::NewGuid().ToString('N'))
$resolvedTemporary = [IO.Path]::GetFullPath($temporaryRoot)
if (-not $resolvedTemporary.StartsWith($temporaryBase, [StringComparison]::OrdinalIgnoreCase) -or
    -not ([IO.Path]::GetFileName($resolvedTemporary)).StartsWith('niannian-preview-pr-', [StringComparison]::Ordinal)) {
  throw 'PREVIEW_TEMPORARY_PATH_INVALID'
}

$candidateRoot = Join-Path $resolvedTemporary 'candidate'
$archiveName = "niannian-preview-pr-$PullRequest-$($gitSha.Substring(0, 12)).tar.gz"
$archivePath = Join-Path $resolvedTemporary $archiveName
$remoteArchive = "/tmp/$archiveName"
$remoteScript = "/tmp/niannian-remote-start-preview-$($gitSha.Substring(0, 12)).sh"

try {
  New-Item -ItemType Directory -Path $resolvedTemporary | Out-Null
  & node (Join-Path $repoRoot 'build_canonical_release_stage.js') --output $candidateRoot
  if ($LASTEXITCODE -ne 0) { throw 'PREVIEW_CANDIDATE_BUILD_FAILED' }

  & tar -czf $archivePath -C $candidateRoot package release-package-manifest.json release-candidate-summary.json release-activation.json
  if ($LASTEXITCODE -ne 0) { throw 'PREVIEW_ARCHIVE_FAILED' }

  & scp $archivePath "${RemoteHost}:$remoteArchive"
  if ($LASTEXITCODE -ne 0) { throw 'PREVIEW_ARCHIVE_UPLOAD_FAILED' }
  & scp (Join-Path $PSScriptRoot 'remote_start_exact_preview.sh') "${RemoteHost}:$remoteScript"
  if ($LASTEXITCODE -ne 0) { throw 'PREVIEW_SCRIPT_UPLOAD_FAILED' }

  $remoteResult = & ssh $RemoteHost "bash '$remoteScript' '$remoteArchive' '$PullRequest' '$gitSha' '$Port'"
  if ($LASTEXITCODE -ne 0) { throw 'PREVIEW_REMOTE_START_FAILED' }
  $preview = ($remoteResult | Select-Object -Last 1 | ConvertFrom-Json)
  if ($preview.gitSha -ne $gitSha -or $preview.previewUrl -notmatch '^https://') { throw 'PREVIEW_REMOTE_IDENTITY_INVALID' }

  & node (Join-Path $repoRoot 'scripts\verify_exact_preview.js') $preview.previewUrl $gitSha
  if ($LASTEXITCODE -ne 0) { throw 'PREVIEW_PUBLIC_VERIFY_FAILED' }
  $preview | ConvertTo-Json -Compress
}
finally {
  if (Test-Path -LiteralPath $resolvedTemporary) {
    Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
  }
}
