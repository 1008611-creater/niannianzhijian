param(
  [string]$ProjectId = 'NS-MRGUJUH9-9E8904',
  [string]$LegacyJobRoot = 'D:\codex-work\zhuanhui\06_AUTOMATION\direct_jobs\web_ns-ns-mrgujuh9-9e8904'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $root 'data-local'
$projectsPath = Join-Path $dataRoot 'script-projects.json'
$workspace = Join-Path $dataRoot ('script-workspaces\' + $ProjectId)
$targetSource = Join-Path $workspace 'source_ingest\source_text.txt'
$legacySource = Join-Path $LegacyJobRoot 'source\source_text.txt'
$statePath = Join-Path $LegacyJobRoot '00_AUTHORITY\n06_video_generation_state.json'

foreach ($path in @($projectsPath, $targetSource, $legacySource, $statePath)) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "migration_required_file_missing:$path" } }
$legacyHash = (Get-FileHash -LiteralPath $legacySource -Algorithm SHA256).Hash.ToLowerInvariant()
$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
$v001 = $state.groups.V001
if (-not $v001 -or $v001.status -ne 'dry_run_intent_recorded' -or $v001.quality_decision -ne 'keep_720p_hard_gate' -or -not $v001.spec_sha256) { throw 'legacy_n06_v001_contract_invalid' }

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$backup = Join-Path $dataRoot ("migration-backups\$ProjectId-$stamp")
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item -LiteralPath $projectsPath -Destination (Join-Path $backup 'script-projects.json')
Copy-Item -LiteralPath (Join-Path $workspace 'source_ingest') -Destination (Join-Path $backup 'source_ingest') -Recurse

$projects = Get-Content -Raw -LiteralPath $projectsPath | ConvertFrom-Json
$project = @($projects | Where-Object { $_.id -eq $ProjectId })
if ($project.Count -ne 1) { throw 'script_project_not_found_or_duplicate' }
$project = $project[0]
Copy-Item -LiteralPath $legacySource -Destination $targetSource -Force
$copiedHash = (Get-FileHash -LiteralPath $targetSource -Algorithm SHA256).Hash.ToLowerInvariant()
if ($copiedHash -ne $legacyHash) { throw 'legacy_source_copy_hash_mismatch' }

$project.source.sha256 = $legacyHash
$project.ingest.extractedTextSha256 = $legacyHash
$project.ingest.status = 'verified'
$project.runtime.productionStatus = 'n06_v001_dry_run_recorded_720p_hard_gate_migration_ready'
$project.runtime.currentNode = 'N06'
$project.runtime.nextAction = '历史 N06 V001 已与网站源版本重新一致；准备 canonical real_submit_v1 事务，随后等待显式 Mac relay 派发。'
$project.runtime.blocker = 'awaiting_canonical_real_submit_prepare'
$project.gates.video_provider = 'awaiting_mimo_mac_relay_prepare'
$project.updatedAt = (Get-Date).ToUniversalTime().ToString('o')

$temporary = $projectsPath + '.migration-' + $PID
$projects | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $temporary -Encoding utf8
Move-Item -LiteralPath $temporary -Destination $projectsPath -Force
$receipt = [ordered]@{
  schema_version = 'niannian_legacy_script_source_migration_v1'
  project_id = $ProjectId
  legacy_job_id = 'web_ns-ns-mrgujuh9-9e8904'
  source_sha256 = $legacyHash
  v001_status = $v001.status
  v001_spec_sha256 = $v001.spec_sha256
  quality_decision = $v001.quality_decision
  backup_path = $backup
  provider_submission_requested = $false
  uploads_requested = $false
  downloads_requested = $false
  migrated_at = (Get-Date).ToUniversalTime().ToString('o')
}
$receiptPath = Join-Path $backup 'migration-receipt.json'
$receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $receiptPath -Encoding utf8
$receipt | ConvertTo-Json -Compress
