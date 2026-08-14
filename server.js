const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pipeline:streamPipeline } = require('stream/promises');
const { resolveStep04Python } = require('./bridge/niannian_step04_runtime');
const Busboy = require('busboy');
const mammoth = require('mammoth');
const sharp = require('sharp');
const mammothVersion = require('mammoth/package.json').version;
const lowRiskPolicy = require('./bridge/niannian_low_risk_policy');
const videoChannelRegistry = require('./bridge/niannian_video_channel_registry');
const dolaSkillAdapter = require('./bridge/niannian_dola_skill_adapter');
const n06PhaseTransport = require('./bridge/niannian_n06_mac_app_phase_transport');
const step02Vertical = require('./bridge/niannian_redraw_step02_vertical');
const step02Carrier = require('./bridge/niannian_redraw_step02_windows_mac_phase_carrier');
const sourceVideoExecution = require('./bridge/niannian_source_video_execution');
const sourceVideoHttpGuard = require('./bridge/niannian_source_video_http_guard');
const step01FailureReducer = require('./bridge/niannian_step01_orchestrator_failure_reducer');
const controllerAuth = require('./bridge/niannian_controller_auth');
const step01Evidence = require('./bridge/niannian_step01_evidence_package');
const step01EvidenceEvents = require('./bridge/niannian_step01_evidence_events');
const serverStep01Executor = require('./bridge/niannian_step01_server_executor');
const fixedStep01Dispatch = require('./bridge/niannian_step01_fixed_app_dispatch');
const step01ArtifactBroker = require('./bridge/niannian_step01_artifact_broker');
const step01ArtifactBrokerSessions = require('./bridge/niannian_step01_artifact_broker_session');
const shotReviewBackend = require('./bridge/niannian_shot_review');
const step02RuntimeBackend = require('./bridge/niannian_step02_runtime');
const step03RuntimeBackend = require('./bridge/niannian_step03_runtime');
const step04AbcdBackend = require('./bridge/niannian_step04_abcd');
const step01SourceLedger = require('./bridge/niannian_step01_source_ledger');
const step01StoryAuthority = require('./bridge/niannian_step01_story_authority');
const step01RoleCardAuthority = require('./bridge/niannian_step01_role_card_authority');
const step01FullEvidenceIndex = require('./bridge/niannian_step01_full_evidence_index');
const step01AuthorityRevision = require('./bridge/niannian_step01_authority_revision');
const step01AuthorityImport = require('./bridge/niannian_step01_authority_import');
const step01PromotionGate = require('./bridge/niannian_step01_promotion_gate');
const webMediaDelivery = require('./bridge/niannian_web_media_delivery');
const redrawCanonicalDag = require('./bridge/niannian_redraw_canonical_dag');
const localizationConfirmation = require('./bridge/niannian_localization_confirmation');
const step05ReferenceAuthority = require('./bridge/niannian_step05_reference_authority');
const videoBatchGate = require('./bridge/niannian_video_batch_gate');
const videoBatchHttp = require('./bridge/niannian_video_batch_http');
const videoBatchInput = require('./bridge/niannian_video_batch_input');
const fullSourceStep01Authority = require('./bridge/niannian_full_source_step01_authority');
const canvasGenerationJobs = require('./bridge/niannian_canvas_generation_jobs');
const canvasAssets = require('./bridge/niannian_canvas_assets');
const canvasImage2RuntimeModule = require('./bridge/niannian_canvas_image2_runtime');
const yunfeiImage2Adapter = require('./bridge/niannian_yunfei_image2_adapter');
const canvasImage2Channels = require('./bridge/niannian_canvas_image2_channels');
const canvasH3RuntimeModule = require('./bridge/niannian_canvas_h3_runtime');
const canvasAnimateRuntimeModule = require('./bridge/niannian_canvas_animate_runtime');
const canvasVideoChannels = require('./bridge/niannian_canvas_video_channels');
const canvasProviderConfig = require('./bridge/niannian_canvas_provider_config');
const canvasTextRuntimeModule = require('./bridge/niannian_canvas_text_runtime');
const canvasTextJobs = require('./bridge/niannian_canvas_text_jobs');
const canvasSkillNodes = require('./bridge/niannian_canvas_skill_nodes');
const canvasS1Chain = require('./bridge/niannian_canvas_s1_chain');
const canvasImage2Node = require('./bridge/niannian_canvas_image2_node');
const canvasH3Node = require('./bridge/niannian_canvas_h3_node');
const nomiSkillChain = require('./bridge/niannian_nomi_skill_chain');
const nomiRunningHubH3 = require('./bridge/niannian_nomi_runninghub_h3');
const h3MediaValidation = require('./bridge/niannian_h3_media_validation');
const nomiWebTaskStoreModule = require('./bridge/niannian_nomi_web_task_store');
const smartCutJobs = require('./bridge/niannian_smart_cut_jobs');
const releaseIdentity = require('./bridge/niannian_release_identity').readReleaseIdentity();

const port = Number(process.env.PORT || 8787);
const root = __dirname;
const dataRoot = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const localizationConfirmationService = localizationConfirmation.createLocalizationConfirmationService({root:path.join(dataRoot,'localization-confirmation')});
const step05ReferenceRegistryRoot = path.resolve(process.env.NIANNIAN_STEP05_REFERENCE_REGISTRY_ROOT || path.join(dataRoot,'step04-reference-registry'));
const step05ReferenceStateRoot = path.resolve(process.env.NIANNIAN_STEP05_REFERENCE_STATE_ROOT || path.join(dataRoot,'step05-reference-authority','v1'));
const videoBatchFixtureMode = process.env.NIANNIAN_VIDEO_BATCH_FIXTURE_MODE === '1';
const videoBatchService = videoBatchFixtureMode ? videoBatchGate.createService({root:path.join(dataRoot,'video-batch-gate'),adapter:videoBatchGate.createFixtureAdapter()}) : null;
const uploadsRoot = path.join(dataRoot, 'uploads');
const jobsRoot = path.join(dataRoot, 'jobs');
const scriptSourcesRoot = path.join(dataRoot, 'script-sources');
const scriptWorkspacesRoot = path.join(dataRoot, 'script-workspaces');
const scriptUploadSessionsRoot = path.join(dataRoot, 'script-upload-sessions');
const scriptUploadIndexPath = path.join(scriptUploadSessionsRoot, 'sessions.json');
const zhuanhuiWorkspace = path.resolve(process.env.ZHUANHUI_WORKSPACE || 'D:/codex-work/zhuanhui');
const directJobsRoot = path.resolve(process.env.NIANNIAN_DIRECT_JOBS_ROOT || path.join(zhuanhuiWorkspace, '06_AUTOMATION', 'direct_jobs'));
const productionIndexPath = path.resolve(process.env.NIANNIAN_PRODUCTION_INDEX || path.join(zhuanhuiWorkspace, '06_AUTOMATION', 'production_jobs.index.json'));
const websiteReferenceEvidenceRoot = path.resolve(process.env.WEBSITE_REFERENCE_EVIDENCE_ROOT || path.join(root, '..', 'outputs', 'website_reference_20260711', 'step01_evidence'));
const websiteReferenceEpisodeId = 'WEBSITE_REF_20260711';
const exactStep01EvidenceId = 'NN-20260715083045-8120F5-EP001';
const exactStep01EvidenceRoot = path.resolve(process.env.NIANNIAN_EXACT_STEP01_EVIDENCE_ROOT || path.join(dataRoot, 'step01-evidence', 'NN-20260715083045-8120F5', 'EP001'));
const step01SourceLedgerOverlayRoot = path.resolve(process.env.NIANNIAN_STEP01_SOURCE_LEDGER_OVERLAY_ROOT || path.join(dataRoot, 'step01-source-ledger-overlays'));
const step01StoryAuthorityRoot = path.resolve(process.env.NIANNIAN_STEP01_STORY_AUTHORITY_ROOT || path.join(dataRoot, 'step01-story-authority'));
const step01RoleCardAuthorityRoot = path.resolve(process.env.NIANNIAN_STEP01_ROLE_CARD_AUTHORITY_ROOT || path.join(dataRoot, 'step01-role-card-authority'));
const step01AuthorityRevisionRoot = path.resolve(process.env.NIANNIAN_STEP01_AUTHORITY_REVISION_ROOT || path.join(dataRoot, 'step01-authority-revisions'));
const step03PreviewRoot = path.resolve(process.env.NIANNIAN_STEP03_PREVIEW_ROOT || path.join(dataRoot, 'step03-preview-cache'));
const webMediaDeliveryRoot = path.resolve(process.env.NIANNIAN_WEB_MEDIA_DELIVERY_ROOT || path.join(dataRoot, 'web-media-delivery'));
const step03PreviewLocks = new Map();
const step04AbcdRuntimeRoot = path.resolve(process.env.NIANNIAN_STEP04_ABCD_RUNTIME_ROOT || path.join(dataRoot, 'step04-abcd'));
const step04AbcdService = step04AbcdBackend.createStep04AbcdService({root:step04AbcdRuntimeRoot});
const bundledStep04DToolsRoot = path.join(root, 'tools');
const workspaceStep04DToolsRoot = path.resolve(root, '..', 'tools');
const step04DToolsRoot = path.resolve(process.env.NIANNIAN_STEP04_D_TOOLS_ROOT || (fs.existsSync(bundledStep04DToolsRoot) ? bundledStep04DToolsRoot : workspaceStep04DToolsRoot));
const step04DocxRendererPath = path.resolve(process.env.NIANNIAN_STEP04_DOCX_RENDERER || path.join(step04DToolsRoot, 'render_step04_abcd_docx.py'));
const step04DocxQaPath = path.resolve(process.env.NIANNIAN_STEP04_DOCX_QA || path.join(step04DToolsRoot, 'qa_step04_abcd_docx_preview.js'));
  const step04RendererPython = resolveStep04Python(process.env);
const exactStep01ProjectId = 'NN-20260715083045-8120F5';
const exactStep01AnalysisRunId = 'analysis-1-0dc5c5d751592e9fd0656a81';
const exactStep01SourceSha256 = 'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c';
const exactStep01SourceBytes = 145897161;
const exactStep01AuthorityImport = Object.freeze({
  revision_id:'analysis-20260727-full-evidence-r1',
  archive_sha256:'92418503b70a51c63e80c5681fc524c6e13f2e8059bad9835a0440152a0b5edb',
  archive_bytes:504967275,
  strict_manifest_sha256:'2f8bc4b4147e7b4eeab1ff5870c2a0c535eac6174a0ef1c26546c808ea5aa1d2',
  full_evidence_index_sha256:'38b3cf07f49a5050c7ea9b09994d4f0e2dc609e6c2412e065640ae02cf189d3d',
  source_revision:1,
  counts:Object.freeze({frames:254,shots:37,triad_frames:111})
});
// Runtime services must be bound to the accepted authority revision, not to the
// pilot's historical evidence directory captured at process start.
const authorityRuntimeServices = new Map();
const webMediaMigrationLocks = new Map();
const websiteReferenceShotsPath = path.join(websiteReferenceEvidenceRoot, websiteReferenceEpisodeId + '_shot_list.json');
const websiteReferenceShotFramesPath = path.join(websiteReferenceEvidenceRoot, 'shotlevel_start_mid_end_manifest.json');
const websiteReferenceSummaryPath = path.join(websiteReferenceEvidenceRoot, websiteReferenceEpisodeId + '_evidence_pack_summary.json');
const websiteReferenceValidationPath = path.join(websiteReferenceEvidenceRoot, websiteReferenceEpisodeId + '_evidence_validation.json');
const websiteReferenceAudioPath = path.join(websiteReferenceEvidenceRoot, websiteReferenceEpisodeId + '_audio_evidence_summary.md');
const websiteReferenceShotFramesRoot = path.join(websiteReferenceEvidenceRoot, 'shotlevel_start_mid_end_frames');
const projectsPath = path.join(dataRoot, 'projects.json');
const scriptProjectsPath = path.join(dataRoot, 'script-projects.json');
const workspaceBindingsPath = path.join(dataRoot, 'workspace-bindings.json');
const websiteIdempotencyPath = path.join(dataRoot, 'website-idempotency.json');
const canvasDocumentsPath = path.join(dataRoot, 'canvas-documents.json');
const canvasProjectsPath = path.join(dataRoot, 'canvas-projects.json');
const directorDeskDocumentsPath = path.join(dataRoot, 'director-desk-documents.json');
const canvasGenerationJobsPath = path.join(dataRoot, 'canvas-generation-jobs.json');
const canvasTextJobsPath = path.join(dataRoot, 'canvas-text-jobs.json');
const smartCutJobsPath = path.join(dataRoot, 'smart-cut-jobs.json');
const canvasAssetsPath = path.join(dataRoot, 'canvas-assets.json');
const nomiWebTasksPath = path.join(dataRoot, 'nomi-web-tasks.json');
const canvasAssetsRoot = path.join(dataRoot, 'canvas-assets');
const usersPath = path.join(dataRoot, 'users.json');
const sessionsPath = path.join(dataRoot, 'sessions.json');
const authAuditPath = path.join(dataRoot, 'auth_audit.jsonl');
const maxUploadBytes = Math.max(1024 * 1024, Math.min(300 * 1024 * 1024, Number(process.env.MAX_UPLOAD_BYTES || 300 * 1024 * 1024)));
const maxScriptDocumentBytes = Math.max(1024 * 1024, Math.min(100 * 1024 * 1024, Number(process.env.MAX_SCRIPT_DOCUMENT_BYTES || 25 * 1024 * 1024)));
const scriptUploadChunkBytes = Math.max(256 * 1024, Math.min(4 * 1024 * 1024, Number(process.env.SCRIPT_UPLOAD_CHUNK_BYTES || 1024 * 1024)));
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
// Exact previews use an isolated data root and must be directly usable for
// browser acceptance without borrowing production cookies or credentials.
const previewAutoLogin = String(process.env.NIANNIAN_PREVIEW || '') === '1';
const previewUser = Object.freeze({id:'USR-PREVIEW', email:'preview@niannian.local'});
const canvasGenerationJobService = canvasGenerationJobs.createCanvasGenerationJobService({filePath:canvasGenerationJobsPath});
const canvasAssetService = canvasAssets.createCanvasAssetService({indexPath:canvasAssetsPath,storageRoot:canvasAssetsRoot,maxBytes:process.env.CANVAS_ASSET_MAX_BYTES});
const canvasProviderStatus = canvasProviderConfig.readCanvasProviderConfig();
const canvasImage2Runtime = canvasImage2RuntimeModule.createCanvasImage2Runtime({
  jobService:canvasGenerationJobService,
  assetService:canvasAssetService,
  enabled:canvasProviderStatus.imageSubmitEnabled,
  adapters:{
    runninghub: undefined,
    'yunfei-1k': yunfeiImage2Adapter.createYunfeiImage2Adapter({baseUrl:canvasProviderStatus.yunfei1kBaseUrl,apiKey:process.env.YUNFEI_IMAGE2_1K_API_KEY}),
    'yunfei-hd': yunfeiImage2Adapter.createYunfeiImage2Adapter({baseUrl:canvasProviderStatus.yunfeiHdBaseUrl,apiKey:process.env.YUNFEI_IMAGE2_HD_API_KEY})
  }
});
const canvasH3Runtime = canvasH3RuntimeModule.createCanvasH3Runtime({jobService:canvasGenerationJobService,assetService:canvasAssetService,enabled:canvasProviderStatus.videoSubmitEnabled});
const canvasAnimateRuntime = canvasAnimateRuntimeModule.createCanvasAnimateRuntime({
  jobService:canvasGenerationJobService,
  assetService:canvasAssetService,
  enabled:canvasProviderStatus.animateSubmitEnabled,
  runningHub:{baseUrl:canvasProviderStatus.baseUrl,apiKey:process.env.NIANNIAN_RUNNINGHUB_ANIMATE_API_KEY}
});
const canvasTextRuntime = canvasTextRuntimeModule.createCanvasTextRuntime();
const canvasTextJobService = canvasTextJobs.createCanvasTextJobService({filePath:canvasTextJobsPath});
const activeCanvasTextJobs = new Set();
const nomiWebH3 = nomiRunningHubH3.createNomiRunningHubH3();
const nomiWebTaskStore = nomiWebTaskStoreModule.createNomiWebTaskStore({filePath:nomiWebTasksPath});
const smartCutJobService = smartCutJobs.createSmartCutJobService({filePath:smartCutJobsPath});
const smartCutEditorBaseUrl = String(process.env.NIANNIAN_SMART_CUT_EDITOR_URL || 'https://edit.cauai.fun').replace(/\/+$/, '');
const smartCutPublicBaseUrl = String(process.env.NIANNIAN_PUBLIC_BASE_URL || 'https://ai.cauai.fun').replace(/\/+$/, '');
const smartCutBridgeSecret = String(process.env.NIANNIAN_SMART_CUT_BRIDGE_SECRET || '');
let workspaceBindingsWriteTail = Promise.resolve();
let websiteIdempotencyWriteTail = Promise.resolve();

async function currentStep01Authority(project) {
  return step01AuthorityRevision.current({
    root:step01AuthorityRevisionRoot,
    project,
    legacyEvidenceRoot:isExactStep01PilotProject(project) ? exactStep01EvidenceRoot : null,
    legacyAnalysisRunId:isExactStep01PilotProject(project) ? exactStep01AnalysisRunId : null
  });
}

async function currentStep01EvidenceRoot(project) {
  return (await currentStep01Authority(project)).evidence_root;
}

async function step01EvidenceForRevision(project, revisionId) {
  if (!revisionId) return currentStep01Authority(project);
  const resolved = await step01AuthorityRevision.evidenceRootForRevision({root:step01AuthorityRevisionRoot, project, revisionId});
  return {kind:'revision', revision_id:resolved.revision.revision_id, evidence_root:resolved.evidence_root, revision:resolved.revision, pointer:null};
}

function projectBoundToStep01Authority(project, authority) {
  if (authority.kind !== 'revision') return project;
  return {...project, analysis:{...(project.analysis || {}), runId:authority.revision_id, authorityRevisionId:authority.revision_id, sourceRevision:authority.revision.source_revision, sourceSha256:authority.revision.source_sha256}};
}

async function runtimeServicesFor(project) {
  const authority = await currentStep01Authority(project);
  const authorityProject = projectBoundToStep01Authority(project, authority);
  const ledger = await step01SourceLedger.readLedger({
    evidenceRoot:authority.evidence_root,
    overlayRoot:step01SourceLedgerOverlayRoot,
    project:authorityProject
  });
  const key = [project.id, authority.revision_id || 'legacy', ledger.snapshot_sha256].join(':');
  const cached = authorityRuntimeServices.get(key);
  if (cached) return cached;
  const expected = {
    projectId:project.id,
    analysisRunId:authorityProject.analysis?.runId,
    sourceSha256:project.source?.sha256,
    sourceBytes:Number(project.source?.bytes),
    evidenceId:authority.kind === 'legacy' ? exactStep01EvidenceId : null
  };
  const shotReviewService = shotReviewBackend.createShotReviewService({
    contractRoot:path.resolve(process.env.NIANNIAN_SHOT_REVIEW_CONTRACT_ROOT || path.join(root, 'docs', 'shot-review-contract')),
    evidenceRoot:authority.evidence_root,
    overlayRoot:path.resolve(process.env.NIANNIAN_SHOT_REVIEW_OVERLAY_ROOT || path.join(dataRoot, 'shot-review-overlays')),
    expected
  });
  const step02 = step02RuntimeBackend.createStep02Service({
    root:path.resolve(process.env.NIANNIAN_STEP02_RUNTIME_ROOT || path.join(dataRoot, 'step02-runtime')),
    evidenceRoot:authority.evidence_root,
    bundleRoot:path.resolve(process.env.NIANNIAN_STEP02_SKILL_BUNDLE_ROOT || path.join(root, 'runtime', 'skill-bundles', 'shortdrama-localization-runtime-1')),
    shotReviewService,
    expected
  });
  const step03 = step03RuntimeBackend.createStep03Service({
    root:path.resolve(process.env.NIANNIAN_STEP03_RUNTIME_ROOT || path.join(dataRoot, 'step03-runtime')),
    evidenceRoot:authority.evidence_root,
    step01SourceLedgerOverlayRoot,
    bundleRoot:path.resolve(process.env.NIANNIAN_STEP03_SKILL_BUNDLE_ROOT || path.join(root, 'runtime', 'skill-bundles', 'shortdrama-visual-assets-runtime-1')),
    step02Service:step02,
    roleCardService:step01RoleCardAuthority,
    roleCardRoot:step01RoleCardAuthorityRoot,
    expected
  });
  const services = {authority, authorityProject, ledger, shotReviewService, step02, step03};
  authorityRuntimeServices.set(key, services);
  for (const priorKey of authorityRuntimeServices.keys()) if (priorKey.startsWith(project.id + ':') && priorKey !== key) authorityRuntimeServices.delete(priorKey);
  return services;
}

function authorityImportDeclarationPath(projectId, revisionId) {
  return path.join(step01AuthorityRevision.projectRoot(step01AuthorityRevisionRoot, projectId), 'imports', revisionId + '.json');
}

function authorityImportBinding(project, revisionId, body) {
  const archiveSha = String(body?.archive_sha256 || '').toLowerCase();
  const manifestSha = String(body?.strict_manifest_sha256 || '').toLowerCase();
  const indexSha = String(body?.full_evidence_index_sha256 || '').toLowerCase();
  const archiveBytes = Number(body?.archive_bytes);
  const sourceRevision = Number(body?.source_revision);
  const counts = {frames:Number(body?.counts?.frames), shots:Number(body?.counts?.shots), triad_frames:Number(body?.counts?.triad_frames)};
  if (!/^[a-f0-9]{64}$/.test(archiveSha) || !/^[a-f0-9]{64}$/.test(manifestSha) || !/^[a-f0-9]{64}$/.test(indexSha) || !Number.isSafeInteger(archiveBytes) || archiveBytes < 1 || archiveBytes > 1024 * 1024 * 1024 || !Number.isInteger(sourceRevision) || sourceRevision < 1 || counts.frames < 1 || counts.shots < 1 || counts.triad_frames !== counts.shots * 3) throw createCodeError('STEP01_AUTHORITY_IMPORT_DECLARATION_INVALID', '完整证据导入声明无效');
  const exact = exactStep01AuthorityImport;
  if (project?.id !== exactStep01ProjectId || project?.source?.sha256 !== exactStep01SourceSha256 || Number(project?.source?.bytes) !== exactStep01SourceBytes || revisionId !== exact.revision_id || archiveSha !== exact.archive_sha256 || archiveBytes !== exact.archive_bytes || manifestSha !== exact.strict_manifest_sha256 || indexSha !== exact.full_evidence_index_sha256 || sourceRevision !== exact.source_revision || counts.frames !== exact.counts.frames || counts.shots !== exact.counts.shots || counts.triad_frames !== exact.counts.triad_frames) throw createCodeError('STEP01_AUTHORITY_IMPORT_SCOPE_FORBIDDEN', '该入口仅接受当前项目已锁定的 exact Step01 authority 证据');
  const phaseKey = 'step01phase-' + crypto.createHash('sha256').update([project.id, revisionId, archiveSha, indexSha].join(':')).digest('hex');
  return {revision_id:revisionId, archive_sha256:archiveSha, archive_bytes:archiveBytes, strict_manifest_sha256:manifestSha, full_evidence_index_sha256:indexSha, source_revision:sourceRevision, counts, binding:{project_id:project.id, analysis_run_id:revisionId, phase_key:phaseKey, package_manifest_sha256:manifestSha}};
}

async function issueAuthorityImportGrant(project, revisionId, body, idempotencyKey) {
  if (!idempotencyKey) throw createCodeError('STEP01_AUTHORITY_IMPORT_IDEMPOTENCY_REQUIRED', '缺少 Idempotency-Key');
  const declaration = authorityImportBinding(project, revisionId, body);
  const declarationPath = authorityImportDeclarationPath(project.id, revisionId);
  const existing = await readJsonFile(declarationPath, null);
  if (existing && (existing.idempotency_key !== idempotencyKey || step01AuthorityRevision.canonical(existing.declaration) !== step01AuthorityRevision.canonical(declaration))) throw createCodeError('STEP01_AUTHORITY_IMPORT_CONFLICT', '该 revision 已绑定另一份导入证据');
  if (!existing) {
    await fsp.mkdir(path.dirname(declarationPath), {recursive:true});
    await writeJson(declarationPath, {schema_version:'niannian.step01_authority_import.v1', project_id:project.id, idempotency_key:idempotencyKey, declaration, created_at:new Date().toISOString()});
  }
  const prior = await step01AuthorityRevision.readRevision({root:step01AuthorityRevisionRoot, project, revisionId}).catch(error => ['STEP01_AUTHORITY_REVISION_NOT_FOUND','ENOENT'].includes(error.code) ? null : Promise.reject(error));
  if (prior) {
    if (prior.source_sha256 !== project.source.sha256 || prior.full_evidence_index_sha256 !== declaration.full_evidence_index_sha256 || prior.strict_manifest_sha256 !== declaration.strict_manifest_sha256 || step01AuthorityRevision.canonical(prior.counts) !== step01AuthorityRevision.canonical(declaration.counts)) throw createCodeError('STEP01_AUTHORITY_IMPORT_CONFLICT', '既有 revision 与本次 exact 导入声明不一致');
    return {declaration, revision:prior, reconciled:true};
  }
  const config = step01ArtifactBroker.configuredCosBroker(process.env, {purpose:'browser_authority_import'});
  if (!config.ready) throw createCodeError('STEP01_AUTHORITY_IMPORT_BROKER_UNAVAILABLE', '受控证据传输暂不可用');
  const broker = step01ArtifactBroker.createCosBroker(config);
  const objectKey = step01ArtifactBroker.packageObjectKey(declaration.binding, 'authority-evidence-archive', declaration.archive_sha256);
  const grant = broker.issue({operation:'PUT', object_key:objectKey, sha256:declaration.archive_sha256, bytes:declaration.archive_bytes, binding:declaration.binding, ttl_seconds:15 * 60});
  return {declaration, grant};
}

async function importAuthorityEvidence(project, revisionId, ifMatch, idempotencyKey) {
  const declarationRecord = await readJsonFile(authorityImportDeclarationPath(project.id, revisionId), null);
  if (!declarationRecord?.declaration) throw createCodeError('STEP01_AUTHORITY_IMPORT_NOT_PREPARED', '请先创建受控证据导入');
  if (!idempotencyKey || idempotencyKey !== declarationRecord.idempotency_key) throw createCodeError('STEP01_AUTHORITY_IMPORT_CONFLICT', '导入恢复键与已锁定声明不一致');
  if (ifMatch !== '*') throw createCodeError('STEP01_AUTHORITY_IMPORT_PRECONDITION_INVALID', '创建 evidence revision 必须使用 If-Match: *');
  const declaration = authorityImportBinding(project, revisionId, declarationRecord.declaration);
  const prior = await step01AuthorityRevision.readRevision({root:step01AuthorityRevisionRoot, project, revisionId}).catch(error => ['STEP01_AUTHORITY_REVISION_NOT_FOUND','ENOENT'].includes(error.code) ? null : Promise.reject(error));
  if (prior) return prior;
  const config = step01ArtifactBroker.configuredCosBroker(process.env, {purpose:'browser_authority_import'});
  if (!config.ready) throw createCodeError('STEP01_AUTHORITY_IMPORT_BROKER_UNAVAILABLE', '受控证据传输暂不可用');
  const broker = step01ArtifactBroker.createCosBroker(config);
  const objectKey = step01ArtifactBroker.packageObjectKey(declaration.binding, 'authority-evidence-archive', declaration.archive_sha256);
  const grant = broker.issue({operation:'GET', object_key:objectKey, sha256:declaration.archive_sha256, bytes:declaration.archive_bytes, binding:declaration.binding, ttl_seconds:15 * 60});
  const body = await broker.get(grant.url);
  const imported = await step01AuthorityImport.importArchive({root:step01AuthorityRevisionRoot, project, revisionId, archive:{filename:'evidence.tar.gz',body,bytes:declaration.archive_bytes,sha256:declaration.archive_sha256},expected:declaration.counts});
  if (imported.index.index_sha256 !== declaration.full_evidence_index_sha256 || imported.index.evidence_manifest_sha256 !== declaration.strict_manifest_sha256) throw createCodeError('STEP01_AUTHORITY_IMPORT_INTEGRITY_FAILED', '受控证据导入校验失败');
  const current = await currentStep01Authority(project).catch(error => error.code === 'STEP01_CURRENT_AUTHORITY_MISSING' ? null : Promise.reject(error));
  const revision = await step01AuthorityRevision.createRevision({root:step01AuthorityRevisionRoot, project, revisionId, sourceRevision:declaration.source_revision, manifestSha256:declaration.strict_manifest_sha256, fullEvidenceIndexSha256:declaration.full_evidence_index_sha256, evidenceRootRelative:'evidence', counts:declaration.counts, parentRevisionId:current?.revision_id || null});
  return revision;
}

async function step03WebPreview(artifact, requestedWidth) {
  try {
  const width = [640, 960, 1280, 1600].includes(Number(requestedWidth)) ? Number(requestedWidth) : 1280;
  const previewKey = artifact.sha256 + '-w' + width + '-q82-v1.webp';
  const previewPath = path.join(step03PreviewRoot, artifact.sha256.slice(0, 2), previewKey);
  const existing = await fsp.stat(previewPath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!existing) {
    let pending = step03PreviewLocks.get(previewPath);
    if (!pending) {
      pending = (async () => {
        await fsp.mkdir(path.dirname(previewPath), {recursive:true});
        const temporary = previewPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(5).toString('hex');
        try {
          const sourceBytes = await fsp.readFile(artifact.path);
          await sharp(sourceBytes, {failOn:'error'}).rotate().resize({width, fit:'inside', withoutEnlargement:true}).webp({quality:82, effort:4, smartSubsample:true}).toFile(temporary);
          await fsp.rename(temporary, previewPath);
        } finally {
          await fsp.rm(temporary, {force:true}).catch(() => {});
        }
      })().finally(() => step03PreviewLocks.delete(previewPath));
      step03PreviewLocks.set(previewPath, pending);
    }
    await pending;
  }
  const previewBytes = await fsp.readFile(previewPath);
  return {path:previewPath, bytes:previewBytes.length, sha256:crypto.createHash('sha256').update(previewBytes).digest('hex'), mime:'image/webp', filename:artifact.filename.replace(/\.[^.]+$/, '') + '-preview.webp', source_sha256:artifact.sha256, width};
  } catch (error) {
    error.code = 'STEP03_PREVIEW_GENERATION_FAILED';
    error.httpStatus = 503;
    error.message = '网页预览图暂时无法生成';
    throw error;
  }
}
// Local HTTP preview cannot retain a Secure cookie. Production stays secure by default.
const localPreviewInsecureSession = String(process.env.NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION || '').toLowerCase() === 'on';
const authRateLimits = new Map();
const bridgeTokenHash = controllerAuth.resolveBridgeTokenHash();
const bridgeLeaseMs = Math.max(60 * 1000, Number(process.env.BRIDGE_LEASE_MS || 5 * 60 * 1000));
let step01ArtifactSessionStore = null;
let step01ArtifactSessionIdentity = null;
const mediaPreflightEnabled = String(process.env.NIANNIAN_MEDIA_PREFLIGHT || 'on').toLowerCase() !== 'off';
const ffprobePath = String(process.env.NIANNIAN_FFPROBE_PATH || 'ffprobe').trim() || 'ffprobe';
const mediaPreflightTimeoutMs = Math.max(3000, Math.min(60000, Number(process.env.NIANNIAN_MEDIA_PREFLIGHT_TIMEOUT_MS || 20000)));
const redrawMinDurationSeconds = Math.max(1, Number(process.env.NIANNIAN_REDRAW_MIN_DURATION_SECONDS || 15));
const redrawMaxDurationSeconds = Math.max(redrawMinDurationSeconds, Number(process.env.NIANNIAN_REDRAW_MAX_DURATION_SECONDS || 180));
const step01AutoExecute = String(process.env.NIANNIAN_STEP01_AUTO_EXECUTE || 'on').toLowerCase() !== 'off';
const step01OrchestratorPath = path.join(root, 'bridge', 'niannian_step01_orchestrator.js');
const step01ServerExecutorPath = path.join(root, 'bridge', 'niannian_step01_server_executor.js');
const n05RegenerationAutoStart = String(process.env.NIANNIAN_N05_REGENERATION_AUTOSTART || 'on').toLowerCase() !== 'off';
const n05RegenerationOrchestratorPath = path.join(root, 'bridge', 'niannian_n05_regeneration_orchestrator.js');
const macEmployeeRouteMatrixPath = path.join(root, 'bridge', 'mac-employee-training', 'route_matrix.json');
const macSkillBundleManifestPath = path.join(root, 'bridge', 'mac-skill-bundles', 'niannian-mac-production-skills-v1.manifest.json');
const macEmployeeAgentsPath = path.join(root, 'AGENTS.md');
const macN06Employees = Object.freeze([
  {employee:'01',title:'念念 AI · Mac 员工 01',thread_id:'019f6201-c013-7cf3-b155-61d2789085f4'},
  {employee:'02',title:'念念 AI · Mac 员工 02',thread_id:'019f6201-cb91-7cf0-819e-696eeabd9e78'},
  {employee:'03',title:'念念 AI · Mac 员工 03',thread_id:'019f6201-d5e8-7083-884d-c714eb1a78b0'},
  {employee:'04',title:'念念 AI · Mac 员工 04',thread_id:'019f6201-dff9-7f63-94d8-7f9020b3c223'},
  {employee:'05',title:'念念 AI · Mac 员工 05',thread_id:'019f6201-ea1b-7e22-9dd0-a3b851b15b69'}
]);
const controllerStatuses = new Set([
  'received','prepared','preflight','queued','capability_preflight','codex_dispatched','codex_running','return_received','reducer_verifying','evidence_ready','running_step01','step01_verified','running_step02','step02_return_ready',
  'step02_blocked_upstream','step02_blocked_contract','step02_blocked_resource','step02_blocked_quality',
  'running_step04','step04_accepted','running_step05','qa_running','accepted','packaged','sent',
  'user_visible_acceptance','blocked_authorization','blocked_resource','blocked_contract','blocked_quality','blocked_transport','infra_failed','send_failed'
]);
const terminalControllerStatuses = new Set(['user_visible_acceptance']);
const projectEventClients = new Set();
const projectEventRevisions = new Map();
const redrawProjectEventSnapshots = new Map();
const scriptProjectEventSnapshots = new Map();
const projectSourceIntegrityCache = new Map();
let redrawProjectsWriteTail = Promise.resolve();
let canvasProjectsWriteTail = Promise.resolve();
let canvasDocumentsWriteTail = Promise.resolve();
let directorDeskDocumentsWriteTail = Promise.resolve();

const contentTypes = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.zip':'application/zip'};

async function ensureData() {
  await fsp.mkdir(uploadsRoot, { recursive: true });
  await fsp.mkdir(jobsRoot, { recursive: true });
  await fsp.mkdir(scriptSourcesRoot, { recursive: true });
  await fsp.mkdir(scriptWorkspacesRoot, { recursive: true });
  await fsp.mkdir(scriptUploadSessionsRoot, { recursive: true });
  try { await fsp.access(projectsPath); } catch { await fsp.writeFile(projectsPath, '[]\n'); }
  try { await fsp.access(scriptProjectsPath); } catch { await fsp.writeFile(scriptProjectsPath, '[]\n'); }
  try { await fsp.access(workspaceBindingsPath); } catch { await fsp.writeFile(workspaceBindingsPath, '[]\n'); }
  try { await fsp.access(canvasDocumentsPath); } catch { await fsp.writeFile(canvasDocumentsPath, '{}\n'); }
  try { await fsp.access(canvasProjectsPath); } catch { await fsp.writeFile(canvasProjectsPath, '[]\n'); }
  try { await fsp.access(directorDeskDocumentsPath); } catch { await fsp.writeFile(directorDeskDocumentsPath, '{}\n'); }
  try { await fsp.access(canvasGenerationJobsPath); } catch { await fsp.writeFile(canvasGenerationJobsPath, '[]\n'); }
  try { await fsp.access(canvasAssetsPath); } catch { await fsp.writeFile(canvasAssetsPath, '[]\n'); }
  try { await fsp.access(usersPath); } catch { await fsp.writeFile(usersPath, '[]\n'); }
  try { await fsp.access(sessionsPath); } catch { await fsp.writeFile(sessionsPath, '[]\n'); }
  try { await fsp.access(scriptUploadIndexPath); } catch { await fsp.writeFile(scriptUploadIndexPath, '[]\n'); }
}

async function readProjects() {
  await ensureData();
  return JSON.parse(await fsp.readFile(projectsPath, 'utf8'));
}

async function writeProjects(projects) {
  const temp = projectsPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(temp, JSON.stringify(projects, null, 2) + '\n', {flag:'wx'});
  try {
    await fsp.rename(temp, projectsPath);
  } catch (error) {
    await fsp.rm(temp, {force:true}).catch(() => {});
    throw error;
  }
  broadcastProjectEvent('redraw_project_projection_changed', changedProjectIdsByOwner(projects, redrawProjectEventSnapshots, 'redrawProjectIds'));
}

async function readCanvasProjects() {
  await ensureData();
  const stored = await readJsonFile(canvasProjectsPath, []);
  return Array.isArray(stored) ? stored : [];
}

async function writeCanvasProjects(projects) {
  const temporary = canvasProjectsPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(Array.isArray(projects) ? projects : [], null, 2) + '\n', {encoding:'utf8',flag:'wx'});
  try { await fsp.rename(temporary, canvasProjectsPath); }
  catch (error) { await fsp.rm(temporary, {force:true}).catch(() => {}); throw error; }
}

async function withCanvasProjectsWriteLock(operation) {
  const previous = canvasProjectsWriteTail;
  let release;
  canvasProjectsWriteTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
}

async function readCanvasDocuments() {
  await ensureData();
  const documents = await readJsonFile(canvasDocumentsPath, {});
  return documents && typeof documents === 'object' && !Array.isArray(documents) ? documents : {};
}

async function writeCanvasDocuments(documents) {
  const temporary = canvasDocumentsPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(documents, null, 2) + '\n', {encoding:'utf8',flag:'wx'});
  try { await fsp.rename(temporary, canvasDocumentsPath); }
  catch (error) { await fsp.rm(temporary, {force:true}).catch(() => {}); throw error; }
}

function directorDeskDocumentKey(projectKind, projectId) {
  return projectKind + ':' + projectId;
}

function directorDeskEtag(revision) {
  return '"director-rev-' + Number(revision || 0) + '"';
}

function directorDeskSafeValue(value, depth = 0) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const text = value.slice(0, 8000);
    return /^data:image\/(?:png|jpeg|webp);base64,/i.test(text) ? '' : text;
  }
  if (depth >= 7) return null;
  if (Array.isArray(value)) return value.slice(0, 240).map(item => directorDeskSafeValue(item, depth + 1));
  if (typeof value !== 'object') return null;
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 120)) {
    if (!/^(?:__proto__|prototype|constructor)$/.test(key)) result[String(key).slice(0, 120)] = directorDeskSafeValue(item, depth + 1);
  }
  return result;
}

function normalizeDirectorDeskDocument(value) {
  const document = directorDeskSafeValue(value);
  if (!document || typeof document !== 'object' || Array.isArray(document)) return {objects:[],cameras:[],bindings:{}};
  return {
    ...document,
    objects:Array.isArray(document.objects) ? document.objects.slice(0, 200) : [],
    cameras:Array.isArray(document.cameras) ? document.cameras.slice(0, 80) : [],
    bindings:document.bindings && typeof document.bindings === 'object' && !Array.isArray(document.bindings) ? document.bindings : {}
  };
}

async function readDirectorDeskDocuments() {
  await ensureData();
  const documents = await readJsonFile(directorDeskDocumentsPath, {});
  return documents && typeof documents === 'object' && !Array.isArray(documents) ? documents : {};
}

async function writeDirectorDeskDocuments(documents) {
  const temporary = directorDeskDocumentsPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(documents, null, 2) + '\n', {encoding:'utf8',flag:'wx'});
  try { await fsp.rename(temporary, directorDeskDocumentsPath); }
  catch (error) { await fsp.rm(temporary, {force:true}).catch(() => {}); throw error; }
}

async function withCanvasDocumentsWriteLock(operation) {
  const previous = canvasDocumentsWriteTail;
  let release;
  canvasDocumentsWriteTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
}

async function withDirectorDeskDocumentsWriteLock(operation) {
  const previous = directorDeskDocumentsWriteTail;
  let release;
  directorDeskDocumentsWriteTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
}

async function withRedrawProjectsWriteLock(operation) {
  const previous = redrawProjectsWriteTail;
  let release;
  redrawProjectsWriteTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
}

async function readScriptProjects() {
  await ensureData();
  const stored = JSON.parse(await fsp.readFile(scriptProjectsPath, 'utf8'));
  // Historical migration A wrote its sole project as an object. Keep the API
  // iterable while writeScriptProjects continues to canonicalize new writes.
  if (Array.isArray(stored)) return stored;
  return stored && typeof stored === 'object' && typeof stored.id === 'string' ? [stored] : [];
}

async function writeScriptProjects(projects) {
  const temp = scriptProjectsPath + '.tmp';
  await fsp.writeFile(temp, JSON.stringify(projects, null, 2) + '\n');
  await fsp.rename(temp, scriptProjectsPath);
  broadcastProjectEvent('script_project_projection_changed', changedProjectIdsByOwner(projects, scriptProjectEventSnapshots, 'scriptProjectIds'));
}

async function readWorkspaceBindings() {
  await ensureData();
  const stored = await readJsonFile(workspaceBindingsPath, []);
  return Array.isArray(stored) ? stored : [];
}

async function readWebsiteIdempotency() {
  await ensureData();
  const stored = await readJsonFile(websiteIdempotencyPath, []);
  return Array.isArray(stored) ? stored : [];
}

async function writeWebsiteIdempotency(records) {
  await writeJson(websiteIdempotencyPath, Array.isArray(records) ? records : []);
}

async function withWebsiteIdempotencyWriteLock(operation) {
  const previous = websiteIdempotencyWriteTail;
  let release;
  websiteIdempotencyWriteTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
}

function idempotencyKeyFromRequest(request, requiredCode = 'IDEMPOTENCY_KEY_INVALID') {
  const key = String(request.headers['idempotency-key'] || '').trim();
  if (!key) return null;
  if (!/^[A-Za-z0-9._:-]{16,160}$/.test(key)) throw createCodeError(requiredCode, '幂等标识格式无效');
  return key;
}

async function beginWebsiteIdempotency(user, scope, key, fingerprint) {
  if (!key) return {status:'disabled'};
  return withWebsiteIdempotencyWriteLock(async () => {
    const records = await readWebsiteIdempotency();
    const existing = records.find(item => item.ownerId === user.id && item.scope === scope && item.key === key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw createCodeError('IDEMPOTENCY_KEY_CONFLICT', '该幂等标识已用于另一份请求');
      return {status:existing.status || 'pending', record:existing};
    }
    const record = {schemaVersion:'niannian.website_idempotency_v1', ownerId:user.id, scope, key, fingerprint, status:'pending', createdAt:new Date().toISOString(), projectId:null};
    records.unshift(record);
    await writeWebsiteIdempotency(records);
    return {status:'claimed', record};
  });
}

async function completeWebsiteIdempotency(user, scope, key, fingerprint, projectId) {
  if (!key) return;
  await withWebsiteIdempotencyWriteLock(async () => {
    const records = await readWebsiteIdempotency();
    const index = records.findIndex(item => item.ownerId === user.id && item.scope === scope && item.key === key);
    if (index < 0) return;
    if (records[index].fingerprint !== fingerprint) throw createCodeError('IDEMPOTENCY_KEY_CONFLICT', '幂等标识与原请求不一致');
    records[index] = {...records[index], status:'completed', projectId:String(projectId), completedAt:new Date().toISOString()};
    await writeWebsiteIdempotency(records);
  });
}

async function failWebsiteIdempotency(user, scope, key) {
  if (!key) return;
  await withWebsiteIdempotencyWriteLock(async () => {
    const records = await readWebsiteIdempotency();
    const next = records.filter(item => !(item.ownerId === user.id && item.scope === scope && item.key === key && item.status === 'pending'));
    if (next.length !== records.length) await writeWebsiteIdempotency(next);
  });
}

function bindingProjectIds(binding, kind) {
  const plural = kind === 'redraw' ? 'redrawProjectIds' : 'scriptProjectIds';
  const singular = kind === 'redraw' ? 'redrawProjectId' : 'scriptProjectId';
  const values = Array.isArray(binding?.[plural]) ? binding[plural] : (binding?.[singular] ? [binding[singular]] : []);
  return [...new Set(values.map(value => normalizeWorkspaceProjectId(value)).filter(Boolean))];
}

async function writeWorkspaceBindings(bindings) {
  const temporary = workspaceBindingsPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(5).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(bindings, null, 2) + '\n', {encoding:'utf8', flag:'wx'});
  try { await fsp.rename(temporary, workspaceBindingsPath); }
  catch (error) { await fsp.rm(temporary, {force:true}).catch(() => {}); throw error; }
}

async function withWorkspaceBindingsWriteLock(operation) {
  const previous = workspaceBindingsWriteTail;
  let release;
  workspaceBindingsWriteTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
}

function normalizeWorkspaceProjectId(value) {
  const id = String(value || '').trim();
  return id && /^[A-Za-z0-9._:-]{3,120}$/.test(id) ? id : null;
}

async function assertWorkspaceProjectOwned(user, workspaceProjectId, selfId = null) {
  const requested = normalizeWorkspaceProjectId(workspaceProjectId);
  if (!requested) return selfId || null;
  if (requested === selfId) return requested;
  const [redrawProjects, scriptProjects, bindings] = await Promise.all([readProjects(), readScriptProjects(), readWorkspaceBindings()]);
  const exists = redrawProjects.some(item => item.id === requested && item.ownerId === user.id)
    || scriptProjects.some(item => item.id === requested && item.ownerId === user.id)
    || bindings.some(item => item.id === requested && item.ownerId === user.id);
  if (!exists) throw createCodeError('WORKSPACE_PROJECT_NOT_FOUND', '项目不存在或不属于当前账户');
  return requested;
}

async function ensureWorkspaceBinding(user, workspaceProjectId, defaults = {}) {
  const id = normalizeWorkspaceProjectId(workspaceProjectId);
  if (!id) return null;
  return withWorkspaceBindingsWriteLock(async () => {
    const bindings = await readWorkspaceBindings();
    const index = bindings.findIndex(item => item.id === id);
    const now = new Date().toISOString();
    if (index >= 0) {
      if (bindings[index].ownerId !== user.id) throw createCodeError('WORKSPACE_PROJECT_NOT_FOUND', '项目不存在或不属于当前账户');
      const current = bindings[index];
      const redrawProjectIds = [...new Set([...bindingProjectIds(current, 'redraw'), ...([defaults.redrawProjectId].filter(Boolean).map(value => String(value)))])];
      const scriptProjectIds = [...new Set([...bindingProjectIds(current, 'script'), ...([defaults.scriptProjectId].filter(Boolean).map(value => String(value)))])];
      bindings[index] = {...current, redrawProjectIds, scriptProjectIds, redrawProjectId:redrawProjectIds[0] || null, scriptProjectId:scriptProjectIds[0] || null, updatedAt:now};
    } else {
      const redrawProjectIds = [defaults.redrawProjectId].filter(Boolean).map(value => String(value));
      const scriptProjectIds = [defaults.scriptProjectId].filter(Boolean).map(value => String(value));
      bindings.unshift({id, ownerId:user.id, name:String(defaults.name || id).slice(0, 80), redrawProjectIds, scriptProjectIds, redrawProjectId:redrawProjectIds[0] || null, scriptProjectId:scriptProjectIds[0] || null, createdAt:now, updatedAt:now});
    }
    await writeWorkspaceBindings(bindings);
    return bindings[index >= 0 ? index : 0];
  });
}

function projectEventRevisionForUser(userId) {
  return projectEventRevisions.get(String(userId || '')) || 0;
}

function changedProjectIdsByOwner(projects, snapshots, property) {
  const previous = snapshots;
  const next = new Map();
  const changed = new Map();
  const mark = (ownerId, projectId) => {
    if (!ownerId || !projectId) return;
    const item = changed.get(ownerId) || {redrawProjectIds:[],scriptProjectIds:[]};
    if (!item[property].includes(projectId)) item[property].push(projectId);
    changed.set(ownerId, item);
  };
  for (const project of Array.isArray(projects) ? projects : []) {
    const ownerId = String(project?.ownerId || '');
    const projectId = String(project?.id || '');
    if (!ownerId || !projectId) continue;
    const signature = crypto.createHash('sha256').update(JSON.stringify(project)).digest('hex');
    const ownerSnapshot = next.get(ownerId) || new Map();
    ownerSnapshot.set(projectId, signature);
    next.set(ownerId, ownerSnapshot);
    if (previous.get(ownerId)?.get(projectId) !== signature) mark(ownerId, projectId);
  }
  for (const [ownerId, priorSnapshot] of previous) {
    const ownerSnapshot = next.get(ownerId);
    for (const projectId of priorSnapshot.keys()) if (!ownerSnapshot?.has(projectId)) mark(ownerId, projectId);
  }
  snapshots.clear();
  for (const [ownerId, snapshot] of next) snapshots.set(ownerId, snapshot);
  return changed;
}

function writeProjectEvent(response, event, payload, revision = null) {
  if (Number.isSafeInteger(revision) && revision > 0) response.write('id: ' + revision + '\n');
  response.write('event: ' + event + '\n');
  response.write('data: ' + JSON.stringify(payload) + '\n\n');
}

function broadcastProjectEvent(reason, changesByOwner) {
  for (const [userId, changes] of changesByOwner || []) {
    const revision = projectEventRevisionForUser(userId) + 1;
    projectEventRevisions.set(userId, revision);
    const payload = {
      revision,
      reason:String(reason || 'project_projection_changed'),
      redrawProjectIds:Array.isArray(changes.redrawProjectIds) ? changes.redrawProjectIds : [],
      scriptProjectIds:Array.isArray(changes.scriptProjectIds) ? changes.scriptProjectIds : [],
      updated_at:new Date().toISOString()
    };
    for (const client of Array.from(projectEventClients)) {
      if (client.userId !== userId) continue;
      try { writeProjectEvent(client.response, 'project-update', payload, revision); }
      catch { projectEventClients.delete(client); }
    }
  }
}

function openProjectEventStream(request, response, user) {
  response.writeHead(200, {
    'Content-Type':'text/event-stream; charset=utf-8',
    'Cache-Control':'no-store, no-cache, must-revalidate',
    'Connection':'keep-alive',
    'X-Accel-Buffering':'no'
  });
  response.flushHeaders?.();
  const client = {response, userId:user.id};
  projectEventClients.add(client);
  writeProjectEvent(response, 'ready', {revision:projectEventRevisionForUser(user.id), updated_at:new Date().toISOString()}, projectEventRevisionForUser(user.id));
  const heartbeat = setInterval(() => {
    try { writeProjectEvent(response, 'keepalive', {revision:projectEventRevisionForUser(user.id), updated_at:new Date().toISOString()}); }
    catch { projectEventClients.delete(client); clearInterval(heartbeat); }
  }, 25000);
  const close = () => { projectEventClients.delete(client); clearInterval(heartbeat); };
  request.on('close', close);
  response.on('close', close);
}

function json(response, status, payload, headers = {}) {
  response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
  response.end(JSON.stringify(payload));
}

function artifactBrokerSessionEndpoint() {
  const endpoint=String(process.env.NIANNIAN_STEP01_ARTIFACT_BROKER_SESSION_ENDPOINT||'').trim();
  if(!/^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^?#]*)?$/.test(endpoint))throw createCodeError('ARTIFACT_BROKER_SESSION_NOT_CONFIGURED','私有 COS broker 的短期回传端点尚未配置');
  return endpoint.replace(/\/$/,'');
}

function currentArtifactSessionStore() {
  const config=step01ArtifactBroker.configuredCosBroker();
  if(config.ready!==true)throw createCodeError('ARTIFACT_BROKER_NOT_CONFIGURED','私有 COS broker 身份尚未配置');
  const identity=[config.endpoint,config.bucket,config.region,config.secret_id].join('|');
  if(!step01ArtifactSessionStore||step01ArtifactSessionIdentity!==identity){
    step01ArtifactSessionStore=step01ArtifactBrokerSessions.createSessionStore({brokerFactory:()=>step01ArtifactBroker.createCosBroker(config)});
    step01ArtifactSessionIdentity=identity;
  }
  return step01ArtifactSessionStore;
}

function fixedStep01BrokerOptions(brokerState) {
  return {requireArtifactBroker:true,brokerState,artifactSessionStore:currentArtifactSessionStore(),brokerSessionEndpoint:artifactBrokerSessionEndpoint()};
}

async function handleStep01ArtifactBrokerSession(request,response,pathname) {
  const match=pathname.match(/^\/api\/internal\/step01-artifact-broker\/sessions\/(broker-[a-f0-9]{32})\/return-manifest$/);
  if(!match)return false;
  if(request.method!=='POST')return json(response,405,{code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  const authorization=String(request.headers.authorization||'');
  const token=authorization.startsWith('Bearer ')?authorization.slice(7).trim():'';
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(token))return json(response,401,{code:'ARTIFACT_BROKER_SESSION_REJECTED',error:'短期回传授权无效'});
  try{
    const raw=await readRequestBuffer(request,512*1024);
    const body=JSON.parse(raw.toString('utf8'));
    if(!body||Object.keys(body).some(key=>!['return_manifest_base64','sha256','bytes'].includes(key))||typeof body.return_manifest_base64!=='string'||!/^[a-f0-9]{64}$/.test(String(body.sha256||''))||!Number.isSafeInteger(Number(body.bytes)))throw createCodeError('ARTIFACT_BROKER_RETURN_MANIFEST_INVALID','return manifest 请求无效');
    const manifestBytes=Buffer.from(body.return_manifest_base64,'base64');
    if(manifestBytes.length!==Number(body.bytes)||crypto.createHash('sha256').update(manifestBytes).digest('hex')!==body.sha256||manifestBytes.length>512*1024)throw createCodeError('ARTIFACT_BROKER_RETURN_MANIFEST_INVALID','return manifest 完整性无效');
    const manifest=JSON.parse(manifestBytes.toString('utf8'));
    const issued=await currentArtifactSessionStore().submitReturnManifest(match[1],token,manifest,manifestBytes);
    return json(response,200,issued);
  }catch(error){
    const code=error.code||'ARTIFACT_BROKER_RETURN_MANIFEST_INVALID';
    const status=['ARTIFACT_BROKER_SESSION_REJECTED','ARTIFACT_BROKER_RETURN_REPLAY_REJECTED'].includes(code)?401:409;
    return json(response,status,{code,error:'原片事实回传对象未获精确授权'});
  }
}

async function readJson(filePath) {
  await ensureData();
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  const temp = filePath + '.tmp';
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await fsp.rename(temp, filePath);
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function referenceNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function referenceTimecode(seconds) {
  const value = Math.max(0, referenceNumber(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = (value % 60).toFixed(3).padStart(6, '0');
  return [hours, minutes].map(part => String(part).padStart(2, '0')).join(':') + ':' + remainder;
}

function evidenceSecondsFromTimecode(timecode) {
  return String(timecode || '').split(':').reduce((sum, part) => sum * 60 + Number(part || 0), 0);
}

function publicEvidenceDuration(shots) {
  if (!Array.isArray(shots) || !shots.length) return 0;
  return Math.max(...shots.map(shot => referenceNumber(shot.endSec, evidenceSecondsFromTimecode(shot.endTimecode))));
}

function exactFrameFileName(frame) {
  const named = String(frame?.file || '').trim();
  if (named && !named.includes('/') && !named.includes('\\')) return named;
  const fromPath = path.basename(String(frame?.path || ''));
  return fromPath && fromPath !== '.' ? fromPath : '';
}

async function loadExactStep01Evidence() {
  const wrapper = await readJsonFile(path.join(exactStep01EvidenceRoot, 'step01-evidence-manifest.json'));
  const artifactRoot = path.join(exactStep01EvidenceRoot, 'artifacts');
  const strictManifest = await readJsonFile(path.join(artifactRoot, 'step01_evidence_manifest.json'));
  const shotFrames = await readJsonFile(path.join(artifactRoot, 'shotlevel_start_mid_end_manifest.json'));
  const transnetShots = await readJsonFile(path.join(artifactRoot, 'transnet_shots', 'EP001_transnet_shots.json'));
  const ocrLedger = await readJsonFile(path.join(artifactRoot, 'smart_ocr', 'EP001_smart_ocr_ledger.json'), {});
  const dialogueLedger = await readJsonFile(path.join(artifactRoot, 'EP001_dialogue_ledger.json'), {});
  if (!wrapper || wrapper.status !== 'completed' || wrapper.projectId !== exactStep01ProjectId || wrapper.analysisRunId !== exactStep01AnalysisRunId) {
    throw createCodeError('REFERENCE_EVIDENCE_INVALID', 'EP001 Step01 导入清单未绑定当前项目与 run。');
  }
  if (wrapper.source?.sha256 !== exactStep01SourceSha256 || referenceNumber(wrapper.source?.bytes) !== exactStep01SourceBytes) {
    throw createCodeError('REFERENCE_EVIDENCE_INVALID', 'EP001 Step01 源视频 SHA 或 bytes 与权威项目不一致。');
  }
  if (!strictManifest || strictManifest.schema !== 'niannian.step01_evidence_manifest.v1' || strictManifest.node_id !== 'step01_evidence' || strictManifest.status !== 'verified' || strictManifest.downstream_consumable !== true) {
    throw createCodeError('REFERENCE_EVIDENCE_INVALID', 'EP001 Step01 严格证据 manifest 未 verified。');
  }
  if (strictManifest.source?.sha256 !== exactStep01SourceSha256 || referenceNumber(strictManifest.source?.bytes) !== exactStep01SourceBytes) {
    throw createCodeError('REFERENCE_EVIDENCE_INVALID', 'EP001 Step01 严格证据源视频身份不一致。');
  }
  if (!Array.isArray(shotFrames) || !Array.isArray(transnetShots)) {
    throw createCodeError('REFERENCE_EVIDENCE_INVALID', 'EP001 Step01 镜头或关键帧清单缺失。');
  }
  const frameRoot = path.join(artifactRoot, 'shotlevel_start_mid_end_frames');
  const frameNames = new Set(await fsp.readdir(frameRoot).catch(() => []));
  const framesByShot = new Map();
  for (const frame of shotFrames) {
    const shotId = String(frame.shot_id || '');
    const point = String(frame.point || '');
    const fileName = exactFrameFileName(frame);
    if (!/^\d+$/.test(shotId) || !['start', 'mid', 'end'].includes(point) || !fileName || !frameNames.has(fileName)) continue;
    const row = framesByShot.get(shotId) || {};
    row[point] = {
      timecode:String(frame.timecode || referenceTimecode(frame.time_sec)),
      frameIndex:referenceNumber(frame.frame_index),
      url:'/api/reference-evidence/' + exactStep01EvidenceId + '/shots/' + shotId + '/' + point,
      file:fileName
    };
    framesByShot.set(shotId, row);
  }
  const dialogueRows = (Array.isArray(dialogueLedger) ? dialogueLedger : dialogueLedger.rows || dialogueLedger.segments || []).map(row => ({
    eventId:String(row.event_id || ''),
    startSec:referenceNumber(row.start_sec),
    endSec:referenceNumber(row.end_sec),
    timecode:String(row.timecode || referenceTimecode(row.start_sec)),
    speaker:String(row.speaker || 'speaker_unknown'),
    text:String(row.text || ''),
    sourceTool:String(row.source_tool || ''),
    notes:String(row.notes || '')
  })).filter(row => row.text && row.endSec >= row.startSec);
  const ocrRows = (Array.isArray(ocrLedger) ? ocrLedger : ocrLedger.rows || []).map(row => ({
    order:referenceNumber(row.order),
    timeSec:referenceNumber(row.time_sec),
    timecode:String(row.timecode || referenceTimecode(row.time_sec)),
    region:String(row.region || ''),
    text:String(row.ocr_text || row.text || ''),
    model:String(row.paddle_model || ''),
    selectionReason:String(row.selection_reasons || '')
  })).filter(row => row.text);
  const publicShots = transnetShots.map(shot => {
    const id = String(shot.shot_id || '');
    const startSec = referenceNumber(shot.start_sec);
    const endSec = referenceNumber(shot.end_sec);
    return {
      id:'S' + id.padStart(3, '0'),
      sequence:referenceNumber(id),
      startSec,
      endSec,
      startTimecode:String(shot.start_timecode || referenceTimecode(startSec)),
      endTimecode:String(shot.end_timecode || referenceTimecode(endSec)),
      midTimecode:String(shot.mid_timecode || referenceTimecode(shot.mid_sec)),
      durationSec:Number((endSec - startSec).toFixed(3)),
      probability:referenceNumber(shot.probability),
      sourceDetector:String(shot.source_detector || 'transnetv2'),
      frames:framesByShot.get(id) || {},
      dialogue:dialogueRows.filter(row => row.endSec >= startSec && row.startSec <= endSec),
      ocr:ocrRows.filter(row => row.timeSec >= startSec && row.timeSec <= endSec)
    };
  }).filter(shot => shot.sequence > 0 && shot.frames.start && shot.frames.mid && shot.frames.end);
  if (!publicShots.length) throw createCodeError('REFERENCE_EVIDENCE_INVALID', 'EP001 Step01 没有可展示的原分辨率关键帧。');
  const strictCounts = strictManifest.counts || wrapper.strictEvidence?.counts || {};
  return {
    id:exactStep01EvidenceId,
    projectId:exactStep01ProjectId,
    analysisRunId:exactStep01AnalysisRunId,
    title:'001.mp4 · 真实短剧 Step01',
    status:'verified',
    nextAction:'Step02 可读取此 Step01 证据包，建立源片事实时间线。',
    counts:{
      originalFrames:referenceNumber(strictCounts.frame_manifest_rows || strictCounts.native_pngs),
      primaryShots:referenceNumber(strictCounts.transnet_shots || transnetShots.length),
      shotSupplements:referenceNumber(strictCounts.shot_triad_rows || shotFrames.length),
      transnetShots:referenceNumber(strictCounts.transnet_shots || transnetShots.length),
      ocrStates:Array.isArray(ocrLedger) ? ocrLedger.length : referenceNumber(ocrLedger.ocr_rows || ocrLedger.rows || ocrLedger.candidate_frames),
      dialogueSegments:Array.isArray(dialogueLedger) ? dialogueLedger.length : referenceNumber(dialogueLedger.rows?.length || dialogueLedger.segment_count || dialogueLedger.segments?.length),
      audioEvents:referenceNumber(dialogueLedger.audio_event_rows || 0),
      vadSegments:referenceNumber(dialogueLedger.vad_rows || 0),
      previewableShots:publicShots.length
    },
    validation:{
      ok:true,
      ocrBasis:'paddle_smart_ocr',
      framePolicy:'strict_server_step01_exact_source',
      errors:0,
      warnings:0
    },
    source:{
      sha256:exactStep01SourceSha256,
      bytes:exactStep01SourceBytes,
      durationSec:referenceNumber(strictManifest.source?.ffprobe?.duration_sec || strictManifest.ffprobe?.format?.duration || publicEvidenceDuration(publicShots)),
      resolution:String(strictManifest.source?.ffprobe?.width || 1080) + ' x ' + String(strictManifest.source?.ffprobe?.height || 1920),
      fps:25
    },
    shots:publicShots
  };
}

async function loadLegacyWebsiteReferenceEvidence() {
  const [shots, shotFrames, summary, validation, audioSummary] = await Promise.all([
    readJsonFile(websiteReferenceShotsPath),
    readJsonFile(websiteReferenceShotFramesPath),
    readJsonFile(websiteReferenceSummaryPath),
    readJsonFile(websiteReferenceValidationPath),
    fsp.readFile(websiteReferenceAudioPath, 'utf8')
  ]);
  if (!Array.isArray(shots) || !Array.isArray(shotFrames) || !validation || validation.ok !== true) {
    throw createCodeError('REFERENCE_EVIDENCE_INVALID', '本地 Step01 证据包未通过验证，不能进入转绘工作台。');
  }
  const framesByShot = new Map();
  shotFrames.forEach(frame => {
    const shotId = String(frame.shot_id || '');
    const point = String(frame.point || '');
    if (!/^\d+$/.test(shotId) || !['start', 'mid', 'end'].includes(point)) return;
    const row = framesByShot.get(shotId) || {};
    row[point] = {
      timecode:String(frame.timecode || referenceTimecode(frame.time_sec)),
      frameIndex:referenceNumber(frame.frame_index),
      url:'/api/reference-evidence/' + websiteReferenceEpisodeId + '/shots/' + shotId + '/' + point
    };
    framesByShot.set(shotId, row);
  });
  const publicShots = shots.map(shot => {
    const id = String(shot.shot_id || '');
    const startSec = referenceNumber(shot.start_sec);
    const endSec = referenceNumber(shot.end_sec);
    return {
      id:'S' + id.padStart(3, '0'),
      sequence:referenceNumber(id),
      startTimecode:String(shot.start_timecode || referenceTimecode(startSec)),
      endTimecode:String(shot.end_timecode || referenceTimecode(endSec)),
      startSec,
      endSec,
      durationSec:Number((endSec - startSec).toFixed(3)),
      frames:framesByShot.get(id) || {}
    };
  }).filter(shot => shot.sequence > 0 && shot.frames.start && shot.frames.mid && shot.frames.end);
  const audioAsrSegments = (audioSummary.match(/ASR:.*?\/\s*(\d+)\s*segments/i) || [])[1] || '0';
  return {
    id:websiteReferenceEpisodeId,
    status:'verified',
    nextAction:'Step02 可读取此 Step01 证据包，建立源片事实时间线。',
    counts:{
      originalFrames:referenceNumber(validation.frame_count),
      primaryShots:referenceNumber(validation.shot_list_rows),
      shotSupplements:referenceNumber(validation.shotlevel_supplement_rows),
      transnetShots:referenceNumber(validation.transnet_shots || summary?.transnet_shot_count),
      ocrStates:referenceNumber(validation.primary_ocr_rows),
      dialogueSegments:referenceNumber(validation.dialogue_ledger_rows || audioAsrSegments),
      audioEvents:referenceNumber(validation.audio_event_rows),
      vadSegments:referenceNumber(validation.vad_rows)
    },
    validation:{
      ok:true,
      ocrBasis:String(validation.ocr_evidence_basis || 'primary_paddle_ocr'),
      framePolicy:String(validation.frame_count_policy || 'unbounded_evidence_coverage'),
      errors:referenceNumber(Array.isArray(validation.errors) ? validation.errors.length : 0),
      warnings:referenceNumber(Array.isArray(validation.warnings) ? validation.warnings.length : 0)
    },
    source:{
      durationSec:publicEvidenceDuration(publicShots),
      resolution:'1280 x 720',
      fps:30
    },
    shots:publicShots
  };
}

async function loadWebsiteReferenceEvidence(evidenceId = websiteReferenceEpisodeId) {
  if (evidenceId === exactStep01EvidenceId) return loadExactStep01Evidence();
  if (evidenceId === websiteReferenceEpisodeId) return loadLegacyWebsiteReferenceEvidence();
  throw createCodeError('REFERENCE_EVIDENCE_ROUTE_NOT_FOUND', '证据资源不存在');
}

async function handleWebsiteReferenceEvidence(request, response, pathname) {
  const match = pathname.match(/^\/api\/reference-evidence\/([^/]+)(?:\/shots\/(\d+)\/(start|mid|end))?$/);
  if (!match) return json(response, 404, {code:'REFERENCE_EVIDENCE_ROUTE_NOT_FOUND', error:'证据资源不存在'});
  const evidenceId = decodeURIComponent(match[1]);
  if (![websiteReferenceEpisodeId, exactStep01EvidenceId].includes(evidenceId)) return json(response, 404, {code:'REFERENCE_EVIDENCE_ROUTE_NOT_FOUND', error:'证据资源不存在'});
  if (request.method === 'GET' && !match[2]) return json(response, 200, {evidence:await loadWebsiteReferenceEvidence(evidenceId)});
  const frameMatch = match[2] ? match : null;
  if (!frameMatch || request.method !== 'GET') return json(response, 404, {code:'REFERENCE_EVIDENCE_ROUTE_NOT_FOUND', error:'证据资源不存在'});
  const [, , shotId, point] = frameMatch;
  const evidence = await loadWebsiteReferenceEvidence(evidenceId);
  const shot = evidence.shots.find(item => item.sequence === referenceNumber(shotId));
  const frame = shot?.frames?.[point];
  if (!frame) return json(response, 404, {code:'REFERENCE_FRAME_NOT_FOUND', error:'证据帧不存在'});
  const frameRoot = evidenceId === exactStep01EvidenceId ? path.join(exactStep01EvidenceRoot, 'artifacts', 'shotlevel_start_mid_end_frames') : websiteReferenceShotFramesRoot;
  const candidates = await fsp.readdir(frameRoot);
  const prefixName = evidenceId === exactStep01EvidenceId ? 'EP001_transnet_shot_' + String(shot.sequence).padStart(4, '0') + '_' + point + '_' : websiteReferenceEpisodeId + '_S' + String(shot.sequence).padStart(3, '0') + '_' + point + '_';
  const fileName = frame.file || candidates.find(name => name.startsWith(prefixName) && name.toLowerCase().endsWith('.png'));
  if (!fileName) return json(response, 404, {code:'REFERENCE_FRAME_FILE_NOT_FOUND', error:'证据帧文件不存在'});
  const filePath = path.resolve(frameRoot, fileName);
  if (!filePath.startsWith(frameRoot + path.sep)) return json(response, 403, {code:'REFERENCE_FRAME_PATH_INVALID', error:'证据帧路径无效'});
  const stats = await fsp.stat(filePath);
  response.writeHead(200, {'Content-Type':'image/png','Content-Length':stats.size,'Cache-Control':'no-store'});
  return fs.createReadStream(filePath).pipe(response);
}

function createCodeError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const child = spawn(command, args, { windowsHide:true, stdio:['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      child.kill();
      finish(createCodeError('SOURCE_PREFLIGHT_TIMEOUT', '源视频预检超时'));
    }, timeoutMs);
    child.on('error', error => {
      finish(createCodeError(error.code === 'ENOENT' ? 'FFPROBE_UNAVAILABLE' : 'SOURCE_PREFLIGHT_TOOL_FAILED', error.message));
    });
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => {
      if (code !== 0) return finish(createCodeError('SOURCE_MEDIA_INVALID', stderr.trim() || '无法读取源视频'));
      finish(null, { stdout, stderr });
    });
  });
}

function parseRational(value) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!match || Number(match[2]) === 0) return null;
  const result = Number(match[1]) / Number(match[2]);
  return Number.isFinite(result) && result > 0 ? Number(result.toFixed(3)) : null;
}

function mediaPreflightMessage(code) {
  return ({
    FFPROBE_UNAVAILABLE:'本机未找到 ffprobe，暂时无法验证源视频。',
    SOURCE_PREFLIGHT_TIMEOUT:'源视频预检超时，请检查文件是否可正常播放。',
    SOURCE_MEDIA_INVALID:'无法读取有效的视频流，请重新上传 MP4 或 MOV 文件。',
    SOURCE_VIDEO_STREAM_MISSING:'文件中没有可用的视频流，请重新上传视频文件。',
    SOURCE_AUDIO_STREAM_REQUIRED:'hq_full Step01 需要至少一条带有效采样率的音轨，请上传包含原始音频的视频。',
    SOURCE_DURATION_TOO_SHORT:'源视频不足 ' + redrawMinDurationSeconds + ' 秒，请上传符合当前转绘规格的视频。',
    SOURCE_DURATION_TOO_LONG:'源视频超过 ' + redrawMaxDurationSeconds + ' 秒，请拆分后再创建项目。',
    SOURCE_FILE_TYPE_UNSUPPORTED:'一键转绘仅支持 MP4 或 MOV 视频。'
  })[code] || '源视频预检失败，请重新上传后再试。';
}

async function inspectSourceMedia(source) {
  const result = await runProcess(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration,format_name,size,bit_rate:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,pix_fmt,channels,sample_rate',
    '-of', 'json',
    source.storedPath
  ], mediaPreflightTimeoutMs);
  let raw;
  try {
    raw = JSON.parse(result.stdout || '{}');
  } catch {
    throw createCodeError('SOURCE_MEDIA_INVALID', 'ffprobe 未返回可解析的视频信息');
  }
  const streams = Array.isArray(raw.streams) ? raw.streams : [];
  const video = streams.find(stream => stream.codec_type === 'video');
  if (!video) throw createCodeError('SOURCE_VIDEO_STREAM_MISSING');
  const duration = Number(raw.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw createCodeError('SOURCE_MEDIA_INVALID', '视频时长无效');
  if (duration < redrawMinDurationSeconds) throw createCodeError('SOURCE_DURATION_TOO_SHORT');
  if (duration > redrawMaxDurationSeconds) throw createCodeError('SOURCE_DURATION_TOO_LONG');
  const audio = streams.filter(stream => stream.codec_type === 'audio');
  const validAudio = audio.filter(stream => Number.isFinite(Number(stream.sample_rate)) && Number(stream.sample_rate) > 0);
  if (!validAudio.length) throw createCodeError('SOURCE_AUDIO_STREAM_REQUIRED');
  return {
    status:'passed',
    inspectedAt:new Date().toISOString(),
    tool:'ffprobe',
    durationSeconds:Number(duration.toFixed(3)),
    format:String(raw.format?.format_name || '').slice(0, 160) || null,
    containerBytes:Number(raw.format?.size) || source.bytes,
    video:{
      codec:String(video.codec_name || '').slice(0, 80) || null,
      width:Number(video.width) || null,
      height:Number(video.height) || null,
      fps:parseRational(video.avg_frame_rate) || parseRational(video.r_frame_rate),
      pixelFormat:String(video.pix_fmt || '').slice(0, 80) || null
    },
    audio:{
      streamCount:audio.length,
      codecs:audio.map(stream => String(stream.codec_name || '').slice(0, 80)).filter(Boolean),
      channels:audio.map(stream => Number(stream.channels) || null).filter(Boolean),
      sampleRates:audio.map(stream => Number(stream.sample_rate) || null).filter(Boolean)
    },
    limitations:['仅完成本机媒体预检，不包含 ASR、OCR、镜头切分或任何外部视频生成。']
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseCookies(request) {
  return String(request.headers.cookie || '').split(';').reduce((result, item) => {
    const split = item.indexOf('=');
    if (split > 0) result[item.slice(0, split).trim()] = decodeURIComponent(item.slice(split + 1).trim());
    return result;
  }, {});
}

function requestIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',')[0].trim();
}

function consumeRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const current = authRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    authRateLimits.set(key, { count:1, resetAt:now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function scryptPassword(password, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, derived) => error ? reject(error) : resolve(derived.toString('hex'))));
}

function safeEqualHex(left, right) {
  try {
    const a = Buffer.from(String(left), 'hex');
    const b = Buffer.from(String(right), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function sessionCookie(token, maxAge = 604800) {
  const attributes = [
    'niannian_session=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    ...(localPreviewInsecureSession ? [] : ['Secure']),
    'SameSite=Lax',
    'Max-Age=' + maxAge
  ];
  return attributes.join('; ');
}

async function auditAuth(event, request, details = {}) {
  const row = { event, at:new Date().toISOString(), ip_hash:crypto.createHash('sha256').update(requestIp(request)).digest('hex'), ...details };
  await fsp.appendFile(authAuditPath, JSON.stringify(row) + '\n');
}

async function readBodyJson(request, maxBytes = 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function createSession(user, request, response) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = (await readJson(sessionsPath)).filter(item => new Date(item.expiresAt).getTime() > Date.now());
  sessions.push({ id:crypto.randomBytes(12).toString('hex'), userId:user.id, tokenHash:crypto.createHash('sha256').update(token).digest('hex'), createdAt:new Date().toISOString(), expiresAt:new Date(Date.now() + sessionTtlMs).toISOString() });
  await writeJson(sessionsPath, sessions);
  json(response, 200, { user:{ id:user.id, email:user.email } }, { 'Set-Cookie':sessionCookie(token) });
}

async function currentUser(request) {
  const token = parseCookies(request).niannian_session;
  if (!token) return previewAutoLogin ? previewUser : null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const sessions = await readJson(sessionsPath);
  const session = sessions.find(item => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > Date.now());
  if (!session) return previewAutoLogin ? previewUser : null;
  const user = (await readJson(usersPath)).find(item => item.id === session.userId && item.status === 'active');
  return user ? { id:user.id, email:user.email } : (previewAutoLogin ? previewUser : null);
}

async function handleRegister(request, response) {
  const body = await readBodyJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const rateKey = 'register:' + requestIp(request) + ':' + email;
  if (!consumeRateLimit(rateKey, 5, 60 * 60 * 1000)) return json(response, 429, { code:'AUTH_RATE_LIMITED', error:'注册请求过于频繁，请稍后再试' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(response, 400, { code:'EMAIL_INVALID', error:'请输入有效邮箱' });
  if (password.length < 8 || password.length > 128) return json(response, 400, { code:'PASSWORD_INVALID', error:'密码至少需要 8 位' });
  const users = await readJson(usersPath);
  if (users.some(item => item.email === email)) return json(response, 409, { code:'EMAIL_ALREADY_REGISTERED', error:'该邮箱已经注册' });
  const salt = crypto.randomBytes(16).toString('hex');
  const user = { id:'USR-' + crypto.randomBytes(8).toString('hex').toUpperCase(), email, passwordSalt:salt, passwordHash:await scryptPassword(password, salt), status:'active', createdAt:new Date().toISOString() };
  users.push(user);
  await writeJson(usersPath, users);
  await auditAuth('register_success', request, { user_id:user.id });
  return createSession(user, request, response);
}

async function handleLogin(request, response) {
  const body = await readBodyJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const rateKey = 'login:' + requestIp(request) + ':' + email;
  if (!consumeRateLimit(rateKey, 10, 15 * 60 * 1000)) return json(response, 429, { code:'AUTH_RATE_LIMITED', error:'登录尝试过于频繁，请稍后再试' });
  const user = (await readJson(usersPath)).find(item => item.email === email && item.status === 'active');
  const candidate = user ? await scryptPassword(password, user.passwordSalt) : await scryptPassword(password || 'invalid-password', '00000000000000000000000000000000');
  if (!user || !safeEqualHex(candidate, user.passwordHash)) {
    await auditAuth('login_failed', request, {});
    return json(response, 401, { code:'LOGIN_INVALID', error:'邮箱或密码不正确' });
  }
  await auditAuth('login_success', request, { user_id:user.id });
  return createSession(user, request, response);
}

async function handleLogout(request, response) {
  const token = parseCookies(request).niannian_session;
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await writeJson(sessionsPath, (await readJson(sessionsPath)).filter(item => item.tokenHash !== tokenHash));
  }
  json(response, 200, { ok:true }, { 'Set-Cookie':sessionCookie('', 0) });
}

function shotReviewFailure(response, error) {
  const known = error && typeof error.code === 'string';
  return json(response, known && Number.isInteger(error.status) ? error.status : 500, {
    code:known ? error.code : 'SHOT_REVIEW_INTERNAL_ERROR',
    error:known ? error.message : '镜头核对服务暂不可用'
  });
}

async function handleShotReviewApi(request, response, pathname, user) {
  const fullMatch = pathname.match(/^\/api\/projects\/([^/]+)\/shot-review$/);
  const shotMatch = pathname.match(/^\/api\/projects\/([^/]+)\/shot-review\/shots\/(S\d{3,})$/i);
  const revisionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/shot-review\/shots\/(S\d{3,})\/revisions$/i);
  const reanalysisMatch = pathname.match(/^\/api\/projects\/([^/]+)\/shot-review\/shots\/(S\d{3,})\/reanalysis$/i);
  const match = revisionMatch || reanalysisMatch || shotMatch || fullMatch;
  if (!match) return false;
  const projectId = match[1];
  // Shot review is a read/overlay path. It must never trigger project reducer
  // reconciliation or write production project facts.
  const project = (await readProjects()).find(item => item.id === projectId && item.ownerId === user.id);
  if (!project) { json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'}); return true; }
  try {
    if (request.method === 'GET' && fullMatch) {
      const analysisRunId = new URL(request.url,'http://127.0.0.1').searchParams.get('analysis_run_id');
      if (!analysisRunId) throw Object.assign(new Error('必须指定 analysis_run_id'),{code:'ANALYSIS_RUN_ID_REQUIRED',status:400});
      const result = await shotReviewService.getReview({ownerId:user.id,project,analysisRunId});
      json(response,200,result.model,{ETag:result.etag,'X-Shot-Review-Revision':result.etag,'X-Shot-Review-Contract':shotReviewService.contractSha256});
      return true;
    }
    if (request.method === 'GET' && shotMatch) {
      const analysisRunId = new URL(request.url,'http://127.0.0.1').searchParams.get('analysis_run_id');
      if (!analysisRunId) throw Object.assign(new Error('必须指定 analysis_run_id'),{code:'ANALYSIS_RUN_ID_REQUIRED',status:400});
      const result = await shotReviewService.getShot({ownerId:user.id,project,analysisRunId,shotId:shotMatch[2]});
      json(response,200,{shot:result.shot,revision_history:result.revision_history},{ETag:result.etag,'X-Shot-Review-Revision':result.etag,'X-Shot-Review-Contract':shotReviewService.contractSha256});
      return true;
    }
    if (request.method === 'POST' && revisionMatch) {
      let body;
      try { body = await readBodyJson(request); }
      catch { throw Object.assign(new Error('请求 JSON 无效'),{code:'REQUEST_JSON_INVALID',status:400}); }
      const result = await shotReviewService.createRevision({ownerId:user.id,project,analysisRunId:body.analysis_run_id,shotId:revisionMatch[2],ifMatch:request.headers['if-match'],revision:body});
      json(response,201,{code:result.idempotent?'SHOT_REVISION_REPLAYED':'SHOT_REVISION_CREATED',revision:result.revision,idempotent:result.idempotent},{ETag:result.etag,'X-Shot-Review-Revision':result.etag,'X-Shot-Review-Contract':shotReviewService.contractSha256});
      return true;
    }
    if (request.method === 'POST' && reanalysisMatch) {
      let body;
      try { body = await readBodyJson(request); }
      catch { throw Object.assign(new Error('请求 JSON 无效'),{code:'REQUEST_JSON_INVALID',status:400}); }
      const unavailable = await shotReviewService.unavailableReanalysis({ownerId:user.id,project,analysisRunId:body.analysis_run_id,shotId:reanalysisMatch[2]});
      json(response,503,unavailable,{'X-Shot-Review-Contract':shotReviewService.contractSha256});
      return true;
    }
    json(response,405,{code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
    return true;
  } catch (error) {
    shotReviewFailure(response,error);
    return true;
  }
}

function step02RuntimeFailure(response, error) {
  const known = error && typeof error.code === 'string';
  return json(response, known && Number.isInteger(error.status) ? error.status : 500, {
    code:known ? error.code : 'STEP02_RUNTIME_INTERNAL_ERROR',
    error:known ? error.message : 'Step02 服务暂不可用'
  });
}

function step04AbcdFailure(response, error) {
  const known = error && typeof error.code === 'string';
  const status = known && Number.isInteger(error.status) ? error.status : 500;
  return json(response, status, {
    code: known ? error.code : 'STEP04_ABCD_INTERNAL_ERROR',
    error: known ? error.message : 'Step04 编译服务暂不可用',
    details: error && error.details ? error.details : undefined,
    provider_calls: {image:false, video:false}
  });
}

function runStep04DTool(command, args, timeoutMs, errorCode) {
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const child = spawn(command, args, {cwd:root, windowsHide:true, stdio:['ignore','pipe','pipe']});
    const timer = setTimeout(() => { child.kill(); finish(Object.assign(new Error('Step04 D 层渲染超时'), {code:errorCode, status:503})); }, timeoutMs);
    child.on('error', error => finish(Object.assign(new Error(`Step04 D 层工具不可用：${error.message}`), {code:errorCode, status:503})));
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => {
      if (code !== 0) return finish(Object.assign(new Error(stderr.trim() || 'Step04 D 层工具执行失败'), {code:errorCode, status:503}));
      finish(null, {stdout, stderr});
    });
  });
}

async function renderStep04D({projectId, contractPath}) {
  if (!step04RendererPython) {
    throw Object.assign(new Error('Step04 D 层没有可验证的 Python 运行时'), {code:'STEP04_D_PYTHON_RUNTIME_UNAVAILABLE', status:503});
  }
  if (!fs.existsSync(step04DocxRendererPath) || !fs.existsSync(step04DocxQaPath)) {
    throw Object.assign(new Error('Step04 D 层渲染器未部署到受控工作器'), {code:'STEP04_D_RENDERER_UNAVAILABLE', status:503});
  }
  const outputDir = path.dirname(contractPath);
  const wordPath = path.join(outputDir, `${projectId}-Step04-ABCD-中文权威生产包.docx`);
  const qaDir = path.join(outputDir, 'docx_visual_qa');
  await runStep04DTool(step04RendererPython, [step04DocxRendererPath, '--contract', contractPath, '--output', wordPath], 120000, 'STEP04_D_RENDER_FAILED');
  await runStep04DTool(process.execPath, [step04DocxQaPath, '--docx', wordPath, '--out-dir', qaDir], 120000, 'STEP04_D_VISUAL_QA_FAILED');
  const receiptPath = path.join(outputDir, 'step04d_render_receipt.json');
  const receipt = JSON.parse(await fsp.readFile(receiptPath, 'utf8'));
  if (receipt.contract_sha256 !== (JSON.parse(await fsp.readFile(contractPath, 'utf8')).contract_sha256) || receipt.visual_qa?.status !== 'passed') {
    throw Object.assign(new Error('Step04 D 层回读或视觉检查未通过'), {code:'STEP04_D_RECEIPT_INVALID', status:503});
  }
  return {word_path:wordPath, word_sha256:receipt.output_docx_sha256, word_bytes:receipt.output_docx_bytes, receipt_path:receiptPath, screenshot_path:receipt.visual_qa.screenshot_path, visual_qa:receipt.visual_qa};
}

async function handleStep04AbcdApi(request, response, pathname, user) {
  const statusMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step04\/contract$/);
  const compileMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step04\/compile$/);
  const wordMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step04\/word$/);
  const match = statusMatch || compileMatch || wordMatch;
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  const project = (await readProjects()).find(item => item.id === projectId && item.ownerId === user.id);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND', error:'项目不存在'});
  try {
    if (request.method === 'GET' && statusMatch) {
      const contract = await step04AbcdService.get({projectId});
      return json(response, 200, {code:'STEP04_ABCD_CONTRACT_READY', contract, provider_calls:{image:false,video:false}});
    }
    if (request.method === 'GET' && wordMatch) {
      const wordPath = path.join(step04AbcdRuntimeRoot, projectId, `${projectId}-Step04-ABCD-中文权威生产包.docx`);
      const stat = await fsp.stat(wordPath);
      // Node rejects non-ASCII header bytes. Keep a portable fallback name and
      // expose the Chinese filename through RFC 5987 percent-encoding.
      response.writeHead(200, {
        'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length':stat.size,
        'Cache-Control':'private, no-store',
        'Content-Disposition':"inline; filename=\"Step04-ABCD.docx\"; filename*=UTF-8''Step04-ABCD-%E4%B8%AD%E6%96%87%E6%9D%83%E5%A8%81%E7%94%9F%E4%BA%A7%E5%8C%85.docx"
      });
      return fs.createReadStream(wordPath).pipe(response);
    }
    if (request.method !== 'POST' || !compileMatch) return json(response, 405, {code:'METHOD_NOT_ALLOWED', error:'请求方法不允许'});
    const body = await readBodyJson(request);
    const input = body.input && typeof body.input === 'object' ? body.input : body;
    const source = {...(input.source || {}), project_id:projectId};
    const result = await step04AbcdService.save({projectId, input:{...input, source}});
    const delivery = await renderStep04D({projectId, contractPath:result.exact_path});
    return json(response, 201, {
      code:'STEP04_ABCD_COMPILED',
      contract:result.contract,
      artifact:{sha256:result.sha256,bytes:result.bytes},
      delivery,
      provider_calls:{image:false,video:false}
    });
  } catch (error) {
    step04AbcdFailure(response, error);
    return true;
  }
}

function localizationAuthorityRevision(project) {
  return projectCanonicalTrace(project)?.authority_revision || project?.canonical?.authority_revision || project?.analysis?.authorityRevisionId || project?.analysis?.runId || null;
}

function currentAcceptedLocalizationSource(project) {
  const authorityRevision=localizationAuthorityRevision(project);
  const acceptance=project?.step02?.acceptance;
  const trace=redrawCanonicalDag.resolveCanonicalState({
    legacy:{legacy_step_name:'Step02'},
    authority_revision:authorityRevision,
    current_authority_revision:authorityRevision,
    input_contract:{S01_EVIDENCE:true},
    output_contract:{accepted:acceptance?.status==='accepted',artifact_ledger_verified:acceptance?.downstream_consumable===true&&Boolean(acceptance?.sha256)}
  });
  redrawCanonicalDag.assertDownstreamGate(trace,'S04_LOCALIZATION_COMPILE',authorityRevision);
  return {
    canonical_node_id:'S02_SOURCE_TIMELINE',
    status:'accepted',
    accepted:true,
    downstream_consumable:true,
    artifact_ledger_verified:true,
    acceptance_identity:String(acceptance.sha256),
    acceptance_sha256:String(acceptance.sha256),
    project_id:project.id,
    authority_revision:authorityRevision,
    authority_binding:{project_id:project.id,authority_revision:authorityRevision,acceptance_identity:String(acceptance.sha256)}
  };
}

async function currentAcceptedLocalizationSourceVerified(project,user,services=null) {
  const binding=currentAcceptedLocalizationSource(project),acceptance=project.step02?.acceptance;
  if(!acceptance?.variantId)return binding;
  const runtime=services||await runtimeServicesFor(project);
  const variant=await runtime.step02.getVariant({ownerId:user.id,project:runtime.authorityProject,variantId:acceptance.variantId});
  if(variant.status!=='confirmed'||variant.confirmed_sha256!==acceptance.semanticSha256)throw Object.assign(new Error('原片时间轴所绑定的地区稿已更新，请重新完成整集检查'),{code:'LOCALIZATION_ACCEPTED_S02_STALE',status:409});
  return binding;
}

function localizationProjectionFromVariant(variant) {
  const shots=Array.isArray(variant?.shots)?variant.shots:[];
  const context=variant?.global_context&&typeof variant.global_context==='object'?variant.global_context:{};
  const characterRows=Array.isArray(context.character_map)?context.character_map:[];
  const fallbackCharacters=[...new Set(shots.map(row=>String(row.target_people_identity||'').trim()).filter(Boolean))];
  const character_relationship_adaptations=(characterRows.length?characterRows:fallbackCharacters.map(name=>({source_identity:name,localized_identity:name,function:'保持当前剧情关系功能'}))).map(row=>({
    source_name:String(row.source_identity||row.localized_identity||'原片角色'),
    localized_name:String(row.localized_identity||row.source_identity||'地区角色'),
    relationship:String(row.function||'保持当前剧情关系功能')
  }));
  const localized_key_dialogue=shots.filter(row=>String(row.target_dialogue||'').trim()).slice(0,40).map(row=>({
    speaker:String(row.target_people_identity||'角色'),
    source_text:String(row.chinese_back_translation||row.target_dialogue),
    localized_text:String(row.target_dialogue)
  }));
  const cultural=[...new Set(shots.flatMap(row=>Array.isArray(row.cultural_replacements)?row.cultural_replacements:[]).map(value=>String(value).trim()).filter(Boolean))];
  const pick=pattern=>cultural.filter(value=>pattern.test(value));
  const classified=new Set([...pick(/地点|城市|街区|学校|医院|公司|住宅|餐厅|酒吧/i),...pick(/货币|比索|美元|价格|金额|工资|租金/i),...pick(/称呼|先生|女士|夫人|小姐|叔|姨|哥|姐/i)]);
  const outline=(Array.isArray(context.causality)?context.causality:[]).map(String).filter(Boolean).join('；') || shots.slice(0,8).map(row=>String(row.chinese_back_translation||row.action||'').trim()).filter(Boolean).join('；') || '保持原片核心因果、人物关系、主要冲突与结尾悬念。';
  const findings=Array.isArray(variant?.qa?.findings)?variant.qa.findings:[];
  const structureItems=shots.filter(row=>row.structure_change&&row.structure_change!=='none').slice(0,20).map(row=>row.shot_id+'：'+row.structure_change);
  return {
    character_relationship_adaptations,
    story_outline_zh:outline,
    localized_key_dialogue:localized_key_dialogue.length?localized_key_dialogue:[{speaker:'旁白',source_text:outline,localized_text:outline}],
    replacements:{
      locations:pick(/地点|城市|街区|学校|医院|公司|住宅|餐厅|酒吧/i),
      currency:pick(/货币|比索|美元|价格|金额|工资|租金/i),
      address_terms:pick(/称呼|先生|女士|夫人|小姐|叔|姨|哥|姐/i),
      cultural_context:cultural.filter(value=>!classified.has(value))
    },
    confirmation_items:[...findings.map(row=>String(row.message||row.suggestion||'').trim()).filter(Boolean),...structureItems].slice(0,40)
  };
}

function localizationRuntimeFailure(response,error) {
  const known=error&&typeof error.code==='string';
  const status=known&&(Number.isInteger(error.httpStatus)||Number.isInteger(error.status))?(error.httpStatus||error.status):500;
  return json(response,status,{error:known?error.message:'地区改编状态暂时无法读取'});
}

function publicLocalizationStatus(result) {
  return {
    schema_version:result.schema_version,
    stage:result.stage,
    candidate:result.candidate?{status:'candidate',target_region:result.candidate.target_region,projection:result.candidate.projection,created_at:result.candidate.created_at,updated_at:result.candidate.updated_at}:null,
    confirmation:result.confirmation,
    downstream_ready:result.downstream_ready===true,
    public:result.public,
  };
}

function publicLocalizationMutationStatus(result) {
  const projected=publicLocalizationStatus(result);
  if(projected.candidate&&result?.candidate?.localization_revision){
    projected.candidate.localization_revision=result.candidate.localization_revision;
  }
  return projected;
}

function localizationResponseHeaders(result,etag=result?.etag) {
  const headers={'Cache-Control':'private, no-store'};
  if(etag)headers.ETag=etag;
  if(result?.candidate?.localization_revision)headers['X-Localization-Revision']=result.candidate.localization_revision;
  return headers;
}

async function handleLocalizationConfirmationApi(request,response,pathname,user) {
  const statusMatch=pathname.match(/^\/api\/projects\/([^/]+)\/localization-confirmation$/);
  const candidateMatch=pathname.match(/^\/api\/projects\/([^/]+)\/localization-confirmation\/candidate$/);
  const confirmMatch=pathname.match(/^\/api\/projects\/([^/]+)\/localization-confirmation\/confirm$/);
  const match=statusMatch||candidateMatch||confirmMatch;
  if(!match)return false;
  const projectId=decodeURIComponent(match[1]);
  const project=(await readProjects()).find(item=>item.id===projectId&&item.ownerId===user.id);
  if(!project){json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'});return true;}
  const authorityRevision=localizationAuthorityRevision(project);
  if(!authorityRevision){json(response,409,{code:'LOCALIZATION_AUTHORITY_REQUIRED',error:'请先完成并确认原片时间轴'});return true;}
  try{
    let acceptedStep02;
    try{acceptedStep02=await currentAcceptedLocalizationSourceVerified(project,user);}
    catch(error){
      if(!(statusMatch&&request.method==='GET'&&error.code==='LOCALIZATION_ACCEPTED_S02_STALE'))throw error;
      acceptedStep02=currentAcceptedLocalizationSource(project);
      await localizationConfirmationService.invalidateForChange({projectId,authorityRevision,reason:'地区改编内容已修改'}).catch(invalidation=>{if(!['LOCALIZATION_CANDIDATE_REQUIRED','localization_candidate_required'].includes(invalidation.code))throw invalidation;});
    }
    if(statusMatch&&request.method==='GET'){
      const result=await localizationConfirmationService.reconcileAuthority({projectId,authorityRevision,acceptedStep02});
      json(response,200,{localization:publicLocalizationStatus(result)},localizationResponseHeaders(result));return true;
    }
    if(candidateMatch&&request.method==='POST'){
      const body=await readBodyJson(request);
      const services=await runtimeServicesFor(project);
      const variant=await services.step02.getVariant({ownerId:user.id,project:services.authorityProject,variantId:String(body.variant_id||'')});
      if(variant.status!=='confirmed'||!variant.confirmed_sha256)throw Object.assign(new Error('地区改编稿尚未完成整集检查'),{code:'LOCALIZATION_VARIANT_NOT_READY',status:409});
      const acceptance=project.step02?.acceptance;
      if(acceptance?.variantId!==variant.variant_id||acceptance?.semanticSha256!==variant.confirmed_sha256)throw Object.assign(new Error('当前地区改编稿与已接受的原片时间轴不匹配'),{code:'LOCALIZATION_VARIANT_BINDING_MISMATCH',status:409});
      const targetRegion={code:variant.locale,label:variant.market||variant.locale};
      const result=await localizationConfirmationService.createCandidate({projectId,authorityRevision,acceptedStep02,targetRegion,projection:localizationProjectionFromVariant(variant),idempotencyKey:request.headers['idempotency-key']||variant.confirmed_sha256});
      const status=await localizationConfirmationService.getStatus({projectId,authorityRevision,acceptedStep02});
      json(response,result.idempotent?200:201,{localization:publicLocalizationMutationStatus(status)},localizationResponseHeaders(status,result.etag));return true;
    }
    if(confirmMatch&&request.method==='POST'){
      const body=await readBodyJson(request);
      const result=await localizationConfirmationService.confirm({projectId,authorityRevision,acceptedStep02,localizationRevision:body.localization_revision,ifMatch:request.headers['if-match'],actor:user.id});
      const status=await localizationConfirmationService.getStatus({projectId,authorityRevision,acceptedStep02});
      json(response,200,{localization:publicLocalizationMutationStatus(status)},localizationResponseHeaders(status,result.etag));return true;
    }
    json(response,405,{code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});return true;
  }catch(error){localizationRuntimeFailure(response,error);return true;}
}

function step05ReferenceKey(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function step05ReferenceRegistryPath(projectId) {
  return path.join(step05ReferenceRegistryRoot, step05ReferenceKey(projectId) + '.json');
}

function step05ReferenceStatePath(projectId,authorityRevision,localizationRevision) {
  return path.join(step05ReferenceStateRoot,step05ReferenceKey(projectId),step05ReferenceKey(authorityRevision),step05ReferenceKey(localizationRevision),'state.json');
}

async function loadStep05ReferenceContext({project,user,localizationRevision,consumer='S05B_FIRST_FRAMES'}) {
  const authorityRevision=localizationAuthorityRevision(project);
  const acceptedStep02=await currentAcceptedLocalizationSourceVerified(project,user);
  const revision=String(localizationRevision||'').trim();
  await localizationConfirmationService.requireDownstream({projectId:project.id,authorityRevision,acceptedStep02,localizationRevision:revision,consumer});
  let registry;
  try{registry=JSON.parse(await fsp.readFile(step05ReferenceRegistryPath(project.id),'utf8'));}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    const services=await runtimeServicesFor(project),plans=await services.step03.listPlans({ownerId:user.id,project:services.authorityProject,locale:null});let lastError;
    for(const plan of [...(plans.plans||[])].reverse()){
      try{registry=await services.step03.getStep04ReferenceRegistry({ownerId:user.id,project:services.authorityProject,planId:plan.plan_id,authorityRevision,localizationRevision:revision});break;}catch(candidateError){lastError=candidateError;}
    }
    if(!registry)throw Object.assign(new Error(lastError?.message||'视频参考职责尚未准备好'),{code:'STEP05_REFERENCE_REGISTRY_REQUIRED',httpStatus:409});
    await fsp.mkdir(step05ReferenceRegistryRoot,{recursive:true});const target=step05ReferenceRegistryPath(project.id),temp=target+'.'+process.pid+'.tmp';await fsp.writeFile(temp,JSON.stringify(registry,null,2)+'\n',{encoding:'utf8',mode:0o600});await fsp.rename(temp,target);
  }
  if(registry.project_id!==project.id||registry.authority_revision!==authorityRevision||registry.localization_revision!==revision||registry.authority_source!=='step04_explicit_registry'){
    throw Object.assign(new Error('视频参考职责已更新，请重新准备'),{code:'STEP05_REFERENCE_REGISTRY_STALE',httpStatus:409});
  }
  const service=new step05ReferenceAuthority.Step05ReferenceAuthority({stateFile:step05ReferenceStatePath(project.id,authorityRevision,revision)});
  if(!service.state)service.initialize(registry);
  const binding=service.snapshot().state.project;
  if(binding.project_id!==project.id||binding.authority_revision!==authorityRevision||binding.localization_revision!==revision)throw Object.assign(new Error('视频参考图版本已更新，请重新读取'),{code:'STEP05_REFERENCE_BINDING_STALE',httpStatus:409});
  return{service,authorityRevision,localizationRevision:revision,acceptedStep02,registry};
}

async function handleVideoBatchApi(request,response,pathname,user) {
  if(!videoBatchHttp.CURRENT_ROUTE.test(pathname))return false;
  if(!videoBatchFixtureMode||!videoBatchService){
    json(response,409,{code:'VIDEO_BATCH_PREFLIGHT_MODE_REQUIRED',message:'本地免费预检尚未启用'},{'Cache-Control':'private, no-store'});return true;
  }
  const url=new URL(request.url,'http://127.0.0.1');
  const localizationRevision=String(request.headers['x-localization-revision']||url.searchParams.get('localization_revision')||'').trim();
  const handler=videoBatchHttp.createHttpHandler({
    service:videoBatchService,
    authenticate:async()=>user,
    resolveProject:async(projectId,currentUser)=>(await readProjects()).find(item=>item.id===projectId&&item.ownerId===currentUser.id)||null,
    ensurePlan:async({project,currentUser,user:resolvedUser,service,now})=>{
      const owner=resolvedUser||currentUser||user;
      const context=await loadStep05ReferenceContext({project,user:owner,localizationRevision,consumer:'video_task_spec_locked'});
      context.service.assertDownstreamAllowed('video_task_spec');
      const referenceState=context.service.snapshot().state;
      const planIds=[...new Set(referenceState.refs.filter(ref=>ref.current&&ref.required&&ref.actual_video_input).map(ref=>String(ref.candidate?.plan_id||'')).filter(Boolean))];
      if(planIds.length!==1)throw videoBatchGate.contractError('VIDEO_BATCH_STEP03_PLAN_AMBIGUOUS','当前视频参考图未绑定唯一制作方案',409);
      const services=await runtimeServicesFor(project);
      const plan=await services.step03.getVideoBatchAuthorityInput({ownerId:owner.id,project:services.authorityProject,planId:planIds[0]});
      const input=videoBatchInput.buildVideoBatchInput({project,step05Context:context,step03Plan:plan,step04Registry:context.registry});
      await service.lockAndPreflight({projectId:project.id,ownerId:owner.id,ownerRef:'codex-thread:'+owner.id,input,now});
    }
  });
  return handler(request,response,pathname);
}

function step05ReferenceFailure(response,error) {
  const status=Number.isInteger(error?.httpStatus)?error.httpStatus:Number.isInteger(error?.status)?error.status:500;
  const safe=status===400?'请完整填写本批视频参考图的处理信息':status===404?'当前视频参考图暂时无法读取':status===412?'视频参考图已更新，请刷新后重试':status===428?'请刷新视频参考图后再继续':status===409?'视频参考图尚未全部确认，或当前版本已更新':status>=500?'视频参考图状态暂时无法读取':'视频参考图状态已更新，请重新读取';
  return json(response,status,{error:safe},{'Cache-Control':'private, no-store'});
}

async function handleStep05ReferenceApi(request,response,pathname,user) {
  const baseMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step05\/references$/);
  const confirmMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step05\/references\/confirm-batch$/);
  const rejectMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step05\/references\/([^/]+)\/reject$/);
  const rerollMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step05\/references\/([^/]+)\/reroll$/);
  const actionMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step05\/references\/([^/]+)\/action$/);
  const mediaMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step05\/references\/([^/]+)\/candidate$/);
  const gateMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step05\/video-gate\/(video_task_spec|provider_preflight|provider_upload|provider_submit)$/);
  const match=baseMatch||confirmMatch||rejectMatch||rerollMatch||actionMatch||mediaMatch||gateMatch;
  if(!match)return false;
  const projectId=decodeURIComponent(match[1]);
  const project=(await readProjects()).find(item=>item.id===projectId&&item.ownerId===user.id);
  if(!project){json(response,404,{error:'项目不存在'});return true;}
  try{
    const url=new URL(request.url,'http://127.0.0.1');
    const localizationRevision=String(request.headers['x-localization-revision']||url.searchParams.get('localization_revision')||'').trim();
    const context=await loadStep05ReferenceContext({project,user,localizationRevision,consumer:gateMatch&&gateMatch[2]==='video_task_spec'?'video_task_spec_locked':'S05B_FIRST_FRAMES'});
    if(baseMatch&&request.method==='GET'){
      json(response,200,{references:context.service.userProjection()},{ETag:context.service.etag(),'Cache-Control':'private, no-store'});return true;
    }
    if(mediaMatch&&['GET','HEAD'].includes(request.method)){
      const ref=context.service.current(decodeURIComponent(mediaMatch[2])),artifactId=String(ref.candidate?.artifact_id||''),planId=String(ref.candidate?.plan_id||'');
      if(!artifactId||!planId)throw Object.assign(new Error('当前候选图暂时无法读取'),{httpStatus:404});
      const services=await runtimeServicesFor(project),served=await services.step03.getArtifact({ownerId:user.id,project:services.authorityProject,planId,artifactId});
      if(served.sha256!==ref.candidate.content_sha)throw Object.assign(new Error('当前候选图版本已更新'),{httpStatus:409});
      const etag='"step05-candidate-'+crypto.createHash('sha256').update([project.id,ref.ref_key,ref.candidate.candidate_revision,served.sha256].join('\0')).digest('base64url')+'"';
      response.writeHead(200,{'Content-Type':served.mime,'Content-Length':served.bytes,'Cache-Control':'private, max-age=31536000, immutable','ETag':etag,'Vary':'Cookie','X-Content-Type-Options':'nosniff'});if(request.method==='HEAD'){response.end();return true;}fs.createReadStream(served.path).pipe(response);return true;
    }
    if(confirmMatch&&request.method==='POST'){
      const body=await readBodyJson(request),decisions=Array.isArray(body.decisions)?body.decisions:[];
      if(!decisions.length||decisions.some(row=>row?.decision!=='pass'||typeof row?.ref_key!=='string'))throw Object.assign(new Error('请完整选择本批需要确认的视频参考图'),{httpStatus:400});
      const refs=decisions.map(row=>context.service.current(row.ref_key));
      const items=refs.map(step05ReferenceAuthority.exactIdentity);
      const result=context.service.batchConfirm({ifMatch:request.headers['if-match'],idempotency_key:request.headers['idempotency-key'],items,confirmed_at:new Date().toISOString()});
      json(response,200,{result:{confirmed_count:result.confirmed_count,idempotent:result.idempotent},references:context.service.userProjection()},{ETag:context.service.etag(),'Cache-Control':'private, no-store'});return true;
    }
    if(rejectMatch&&request.method==='POST'){
      const body=await readBodyJson(request);
      context.service.reject({ifMatch:request.headers['if-match'],ref_key:decodeURIComponent(rejectMatch[2]),issue_category:body.issue_category,note:body.note});
      json(response,200,{references:context.service.userProjection()},{ETag:context.service.etag(),'Cache-Control':'private, no-store'});return true;
    }
    if((rerollMatch||actionMatch)&&request.method==='POST'){
      const body=await readBodyJson(request),refKey=decodeURIComponent((rerollMatch||actionMatch)[2]),action=rerollMatch?'reroll':String(body.action||'');
      context.service.requestAction({ifMatch:request.headers['if-match'],ref_key:refKey,action,note:body.note});
      json(response,202,{message:action==='return_upstream'?'已记录返回上游修订':'已记录素材处理请求',references:context.service.userProjection()},{ETag:context.service.etag(),'Cache-Control':'private, no-store'});return true;
    }
    if(gateMatch&&['GET','POST'].includes(request.method)){
      context.service.assertDownstreamAllowed(gateMatch[2]);
      json(response,200,{gate_ready:true,provider_action_performed:false},{'Cache-Control':'private, no-store'});return true;
    }
    json(response,405,{error:'请求方法不允许'});return true;
  }catch(error){step05ReferenceFailure(response,error);return true;}
}

function step03RuntimeFailure(response,error) {
  const known=error&&typeof error.code==='string';
  const status=known&&(Number.isInteger(error.httpStatus)||Number.isInteger(error.status))?(error.httpStatus||error.status):500;
  const payload={code:known?error.code:'STEP03_RUNTIME_INTERNAL_ERROR',error:known?error.message:'Step03 服务暂不可用'};
  if(error?.code==='STEP03_CONFIRM_INCOMPLETE'&&Array.isArray(error.items))payload.items=error.items;
  return json(response,status,payload);
}

function syncProjectStep03Canonical(project,plan) {
  const contracts=step03RuntimeBackend.canonicalContractsForPlan(plan);
  project.canonical=contracts.active;
  project.pipeline=pipelineForStatus(project.productionStatus || 'running_step04',{},contracts.active);
  project.runtime={...(project.runtime||{}),publicStage:redrawCanonicalDag.publicProjection(contracts.active)};
}

async function handleStep03RuntimeApi(request,response,pathname,user) {
  const plansMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans$/);
  const planMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)$/);
  const styleConfirmMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/styles\/([^/]+)\/confirm$/);
  const candidatesMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/characters\/([^/]+)\/candidates$/);
  const characterConfirmMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/characters\/([^/]+)\/confirm$/);
  const rebuildMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/groups\/rebuild$/);
  const groupRevisionMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/groups\/([^/]+)\/revisions$/);
  const assetsGenerateMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/assets\/generate$/);
  const assetConfirmMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/assets\/([^/]+)\/confirm$/);
  const assetRerollMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/assets\/([^/]+)\/reroll$/);
  const firstframesMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/firstframes\/generate$/);
  const firstframeDecisionMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/firstframes\/([^/]+)\/decision$/);
  const confirmMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/plans\/([^/]+)\/confirm$/);
  const artifactMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step03\/(?:plans\/([^/]+)\/artifacts|artifacts)\/([^/]+)(?:\/download)?$/);
  const match=plansMatch||styleConfirmMatch||candidatesMatch||characterConfirmMatch||rebuildMatch||groupRevisionMatch||assetsGenerateMatch||assetConfirmMatch||assetRerollMatch||firstframesMatch||firstframeDecisionMatch||confirmMatch||artifactMatch||planMatch;
  if(!match)return false;
  const projectId=decodeURIComponent(match[1]);
  const projects=await readProjects();
  const project=projects.find(item=>item.id===projectId&&item.ownerId===user.id);
  if(!project){json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'});return true;}
  try {
    const services = await runtimeServicesFor(project); const authorityProject = services.authorityProject; const step03RuntimeService = services.step03;
    if(plansMatch&&request.method==='POST'){
      const body=await readBodyJson(request),authorityRevision=localizationAuthorityRevision(project),acceptedStep02=await currentAcceptedLocalizationSourceVerified(project,user,services);
      const localizationRevision=String(body.localization_revision||request.headers['x-localization-revision']||'').trim();
      await localizationConfirmationService.requireDownstream({projectId:project.id,authorityRevision,acceptedStep02,localizationRevision,consumer:'S05A_SUPPORT_ASSETS',legacyState:{step02_variant_id:body.step02_variant_id||null}});
      const result=await step03RuntimeService.createPlan({ownerId:user.id,project:authorityProject,locale:body.locale,step02VariantId:body.step02_variant_id,idempotencyKey:request.headers['idempotency-key']});syncProjectStep03Canonical(project,result.plan);await writeProjects(projects);json(response,result.created?202:200,{code:result.created?'STEP03_PLAN_ACCEPTED':'STEP03_PLAN_REUSED',plan:result.plan},{ETag:result.plan.etag});return true;
    }
    if(plansMatch&&request.method==='GET'){const url=new URL(request.url,'http://127.0.0.1');const result=await step03RuntimeService.listPlans({ownerId:user.id,project:authorityProject,locale:url.searchParams.get('locale')||null});json(response,200,{code:'STEP03_PLANS_READY',...result});return true;}
    if(planMatch&&request.method==='GET'){const plan=await step03RuntimeService.getPlan({ownerId:user.id,project:authorityProject,planId:decodeURIComponent(planMatch[2])});json(response,200,{code:'STEP03_PLAN_READY',plan},{ETag:plan.etag});return true;}
    if(artifactMatch&&['GET','HEAD'].includes(request.method)){
      const planId=decodeURIComponent(artifactMatch[2]||new URL(request.url,'http://127.0.0.1').searchParams.get('plan_id')||'');
      const artifact=await step03RuntimeService.getArtifact({ownerId:user.id,project:authorityProject,planId,artifactId:decodeURIComponent(artifactMatch[3])});
      const artifactUrl=new URL(request.url,'http://127.0.0.1');
      const download=pathname.endsWith('/download')||artifactUrl.searchParams.get('download')==='1';
      const preview=artifactUrl.searchParams.get('view')==='preview'&&!download?await step03WebPreview(artifact,artifactUrl.searchParams.get('width')):null;
      const served=preview||artifact;
      const etag='"'+served.sha256+'"';
      const cacheHeaders={'Cache-Control':'private, max-age=31536000, immutable','ETag':etag,'Vary':'Cookie'};
      if(request.headers['if-none-match']===etag){response.writeHead(304,cacheHeaders);response.end();return true;}
      response.writeHead(200,{'Content-Type':served.mime,'Content-Length':served.bytes,...cacheHeaders,'X-Content-SHA256':served.sha256,'X-Source-SHA256':artifact.sha256,'X-Preview-Width':preview?String(preview.width):'original','X-Content-Type-Options':'nosniff','Content-Disposition':(download?'attachment':'inline')+'; filename="'+served.filename+'"'});
      if(request.method==='HEAD'){response.end();return true;}
      fs.createReadStream(served.path).pipe(response);return true;
    }
    if(request.method!=='POST'){json(response,405,{code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});return true;}
    const body=await readBodyJson(request),common={ownerId:user.id,project:authorityProject,planId:decodeURIComponent(match[2]),ifMatch:request.headers['if-match'],idempotencyKey:request.headers['idempotency-key']};let result,code;
    const authorityRevision=localizationAuthorityRevision(project);
    const localizationRevision=String(body.localization_revision||request.headers['x-localization-revision']||'').trim();
    const localizationConsumer=(styleConfirmMatch||candidatesMatch||characterConfirmMatch||assetsGenerateMatch||assetConfirmMatch||assetRerollMatch)?'S05A_SUPPORT_ASSETS':(firstframesMatch||firstframeDecisionMatch)?'S05B_FIRST_FRAMES':confirmMatch?'video_task_spec_locked':null;
    const acceptedStep02=await currentAcceptedLocalizationSourceVerified(project,user,services);
    if(localizationConsumer)await localizationConfirmationService.requireDownstream({projectId:project.id,authorityRevision,acceptedStep02,localizationRevision,consumer:localizationConsumer,legacyState:{step02_variant_id:body.step02_variant_id||null,step03_plan_id:common.planId}});
    if(styleConfirmMatch){result=await step03RuntimeService.confirmStyle({...common,styleId:decodeURIComponent(styleConfirmMatch[3]),candidateSha256:body.candidate_sha256});code='STEP03_STYLE_CONFIRMED';}
    else if(candidatesMatch){result=await step03RuntimeService.queueCharacterCandidates({...common,characterId:decodeURIComponent(candidatesMatch[3]),forceTemplateRefresh:body.force_template_refresh===true||body.forceTemplateRefresh===true,resolution:body.resolution});code='STEP03_CHARACTER_CANDIDATES_QUEUED';}
    else if(characterConfirmMatch){result=await step03RuntimeService.decideCharacter({...common,characterId:decodeURIComponent(characterConfirmMatch[3]),candidateId:body.candidate_id,decision:body.decision,note:body.note});code='STEP03_CHARACTER_DECISION_RECORDED';}
    else if(rebuildMatch){result=await step03RuntimeService.rebuildGroups({...common,hardBoundariesAfter:body.hard_boundaries_after||[]});code='STEP03_GROUPS_REBUILT';}
    else if(groupRevisionMatch){result=await step03RuntimeService.reviseGroups({...common,groupId:decodeURIComponent(groupRevisionMatch[3]),operation:body.operation,boundaryShotId:body.boundary_shot_id,reason:body.reason});code='STEP03_GROUP_REVISION_RECORDED';}
    else if(assetsGenerateMatch){result=await step03RuntimeService.queueAssets({...common,assetIds:body.asset_ids,resolution:body.resolution});code='STEP03_ASSETS_QUEUED';}
    else if(assetConfirmMatch){result=await step03RuntimeService.decideAsset({...common,assetId:decodeURIComponent(assetConfirmMatch[3]),candidateId:body.candidate_id,decision:body.decision,note:body.note});code='STEP03_ASSET_DECISION_RECORDED';}
    else if(assetRerollMatch){result=await step03RuntimeService.rerollAsset({...common,assetId:decodeURIComponent(assetRerollMatch[3]),promptRevisionId:body.prompt_revision_id,adjustment:body.adjustment,replacementPrompt:body.replacement_prompt,resolution:body.resolution});code='STEP03_ASSET_REROLL_QUEUED';}
    else if(firstframesMatch){result=await step03RuntimeService.queueFirstFrames({...common,groupIds:body.group_ids,resolution:body.resolution});code='STEP03_FIRSTFRAMES_QUEUED';}
    else if(firstframeDecisionMatch){result=await step03RuntimeService.decideFirstFrame({...common,candidateId:decodeURIComponent(firstframeDecisionMatch[3]),decision:body.decision,note:body.note});code='STEP03_FIRSTFRAME_DECISION_RECORDED';}
    else if(confirmMatch){
      const referenceContext=await loadStep05ReferenceContext({project,user,localizationRevision,consumer:'video_task_spec_locked'});
      referenceContext.service.assertDownstreamAllowed('video_task_spec');
      result=await step03RuntimeService.confirmPlan(common);code='STEP03_CONFIRMED';
    }
    else{json(response,404,{code:'STEP03_ROUTE_NOT_FOUND',error:'第三步接口不存在'});return true;}
    if(candidatesMatch||assetsGenerateMatch||assetRerollMatch||firstframesMatch){
      const providerTasks=(result.plan?.tasks||[]).filter(task=>task.type!=='planning'&&!task.provider_task_id);
      await localizationConfirmationService.authorizeProviderTasks({projectId:project.id,authorityRevision,acceptedStep02,localizationRevision,tasks:providerTasks});
    }
    if(rebuildMatch||groupRevisionMatch)await localizationConfirmationService.invalidateForChange({projectId:project.id,authorityRevision,reason:'地区改编内容已修改'}).catch(error=>{if(!['LOCALIZATION_CANDIDATE_REQUIRED','localization_candidate_required'].includes(error.code))throw error;});
    syncProjectStep03Canonical(project,result.plan);await writeProjects(projects);
    json(response,200,{code,...result},{ETag:result.plan.etag});return true;
  } catch(error){step03RuntimeFailure(response,error);return true;}
}

function syncProjectStep02RuntimeCanonical(project,services,variant) {
  const authorityRevision=String(services?.authority?.revision_id||services?.authorityProject?.analysis?.authorityRevisionId||services?.authorityProject?.analysis?.runId||'').trim();
  const ledger=services?.ledger;
  const sourceMatches=ledger?.project_id===project.id&&ledger?.source_sha256===project.source?.sha256&&Number(ledger?.source_bytes)===Number(project.source?.bytes);
  const authorityMatches=Boolean(authorityRevision)&&ledger?.analysis_run_id===services?.authorityProject?.analysis?.runId&&variant?.analysis_run_id===services?.authorityProject?.analysis?.runId;
  const durableAcceptance=variant?.status==='confirmed'&&variant?.qa?.passed===true&&/^[a-f0-9]{64}$/.test(String(variant?.confirmed_sha256||''))&&/^[a-f0-9]{64}$/.test(String(variant?.snapshot_sha256||''))&&/^[a-f0-9]{64}$/.test(String(ledger?.snapshot_sha256||''));
  if(!sourceMatches||!authorityMatches||!durableAcceptance)throw Object.assign(new Error('STEP02_RUNTIME_ACCEPTANCE_CONTRACT_BLOCKED'),{code:'STEP02_RUNTIME_ACCEPTANCE_CONTRACT_BLOCKED',httpStatus:409});
  const acceptanceIdentity=crypto.createHash('sha256').update(redrawCanonicalDag.AUTHORITY_REVISION+':'+variant.confirmed_sha256+':'+ledger.snapshot_sha256).digest('hex');
  const canonicalTrace=redrawCanonicalDag.resolveCanonicalState({legacy:{legacy_step_name:'Step02'},authority_revision:authorityRevision,current_authority_revision:authorityRevision,input_contract:{S01_EVIDENCE:true},output_contract:{accepted:true,artifact_ledger_verified:true}});
  redrawCanonicalDag.assertDownstreamGate(canonicalTrace,'S04_LOCALIZATION_COMPILE',authorityRevision);
  project.step02={status:'step02_accepted',transactionId:null,sourceSha256:ledger.source_sha256,step01ManifestSha256:ledger.evidence_manifest_sha256||null,rightsAuthoritySha256:null,settingsVersion:project.settingsVersion||null,candidate:null,acceptance:{status:'accepted',sha256:acceptanceIdentity,acceptedAt:variant.confirmed_at,semanticSha256:variant.confirmed_sha256,downstream_consumable:true,artifactLedgerSha256:ledger.snapshot_sha256,variantId:variant.variant_id,snapshotSha256:variant.snapshot_sha256},step04Ready:true,updatedAt:new Date().toISOString()};
  project.canonical=canonicalTrace;
  project.productionStatus='step02_accepted';project.status='running';
  project.route={...(project.route||{}),earliestNode:'Step04',nextSkill:'mx-shortdrama-04-asset-prompts'};
  project.pipeline=pipelineForStatus('step02_accepted',{},canonicalTrace);
  project.runtime={...(project.runtime||{}),productionStatus:'step02_accepted',currentNode:'Step04',earliestIncompleteNode:'Step04',nextSkill:'mx-shortdrama-04-asset-prompts',blocker:null,nextAction:'原片时间轴已确认，可以进入地区改编。',gateState:'step02_runtime_adapter_accepted',publicStage:redrawCanonicalDag.publicProjection(canonicalTrace),checkpointUpdatedAt:new Date().toISOString()};
  return canonicalTrace;
}

async function handleStep02RuntimeApi(request, response, pathname, user) {
  const confirmStep01Match = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/confirm$/);
  const currentSnapshotMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/snapshots\/current$/);
  const variantsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step02\/variants$/);
  const variantMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step02\/variants\/([^/]+)$/);
  const revisionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step02\/variants\/([^/]+)\/shots\/(S\d{3})\/revisions$/i);
  const candidateMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step02\/variants\/([^/]+)\/shots\/(S\d{3})\/candidates$/i);
  const adoptMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step02\/variants\/([^/]+)\/shots\/(S\d{3})\/adopt$/i);
  const confirmVariantMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step02\/variants\/([^/]+)\/confirm$/);
  const match = confirmStep01Match || currentSnapshotMatch || variantsMatch || revisionMatch || candidateMatch || adoptMatch || confirmVariantMatch || variantMatch;
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  const projects = await readProjects();
  const project = projects.find(item => item.id === projectId && item.ownerId === user.id);
  if (!project) { json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'}); return true; }
  try {
    const services = await runtimeServicesFor(project); const authorityProject = services.authorityProject; const step02RuntimeService = services.step02;
    if (request.method === 'POST' && confirmStep01Match) {
      const body = await readBodyJson(request);
      const result = await step02RuntimeService.confirmStep01({ownerId:user.id,project:authorityProject,analysisRunId:body.analysis_run_id,ifMatch:request.headers['if-match'],confirmedBy:user.id});
      json(response,result.idempotent?200:201,{code:result.idempotent?'STEP01_SNAPSHOT_REUSED':'STEP01_SNAPSHOT_CREATED',snapshot:result.snapshot,idempotent:result.idempotent});
      return true;
    }
    if (request.method === 'GET' && currentSnapshotMatch) {
      const snapshot = await step02RuntimeService.getCurrentSnapshot({ownerId:user.id,project:authorityProject});
      json(response,200,{code:'STEP01_SNAPSHOT_READY',snapshot});
      return true;
    }
    if (request.method === 'POST' && variantsMatch) {
      const body = await readBodyJson(request);
      const result = await step02RuntimeService.createVariant({ownerId:user.id,project:authorityProject,locale:body.locale,idempotencyKey:request.headers['idempotency-key']});
      json(response,202,{code:'STEP02_VARIANT_ACCEPTED',...result});
      return true;
    }
    if (request.method === 'GET' && variantsMatch) {
      const result = await step02RuntimeService.listVariants({ownerId:user.id,project:authorityProject});
      json(response,200,{code:'STEP02_VARIANTS_READY',...result});
      return true;
    }
    if (request.method === 'GET' && variantMatch) {
      const variant = await step02RuntimeService.getVariant({ownerId:user.id,project:authorityProject,variantId:decodeURIComponent(variantMatch[2])});
      json(response,200,{code:'STEP02_VARIANT_READY',variant},{ETag:variant.etag});
      return true;
    }
    if (request.method === 'POST' && revisionMatch) {
      const body = await readBodyJson(request);
      const result = await step02RuntimeService.createRevision({ownerId:user.id,project:authorityProject,variantId:decodeURIComponent(revisionMatch[2]),shotId:revisionMatch[3].toUpperCase(),ifMatch:request.headers['if-match'],body,beforeCommit:()=>localizationConfirmationService.invalidateForChange({projectId:project.id,authorityRevision:localizationAuthorityRevision(project),reason:'地区改编内容已修改'}).catch(error=>{if(!['LOCALIZATION_CANDIDATE_REQUIRED','localization_candidate_required'].includes(error.code))throw error;})});
      json(response,result.idempotent?200:201,{code:result.idempotent?'STEP02_REVISION_REPLAYED':'STEP02_REVISION_CREATED',revision:result.revision,idempotent:result.idempotent,variant:result.variant},{ETag:result.variant.etag});
      return true;
    }
    if (request.method === 'POST' && candidateMatch) {
      const body = await readBodyJson(request);
      const result = await step02RuntimeService.createCandidate({ownerId:user.id,project:authorityProject,variantId:decodeURIComponent(candidateMatch[2]),shotId:candidateMatch[3].toUpperCase(),ifMatch:request.headers['if-match'],body});
      json(response,result.idempotent?200:201,{code:result.idempotent?'STEP02_CANDIDATE_REPLAYED':'STEP02_CANDIDATE_CREATED',...result});
      return true;
    }
    if (request.method === 'POST' && adoptMatch) {
      const body = await readBodyJson(request);
      const result = await step02RuntimeService.adoptCandidate({ownerId:user.id,project:authorityProject,variantId:decodeURIComponent(adoptMatch[2]),shotId:adoptMatch[3].toUpperCase(),ifMatch:request.headers['if-match'],body,beforeCommit:()=>localizationConfirmationService.invalidateForChange({projectId:project.id,authorityRevision:localizationAuthorityRevision(project),reason:'地区改编候选已采用'}).catch(error=>{if(!['LOCALIZATION_CANDIDATE_REQUIRED','localization_candidate_required'].includes(error.code))throw error;})});
      json(response,result.idempotent?200:201,{code:result.idempotent?'STEP02_CANDIDATE_ALREADY_ADOPTED':'STEP02_CANDIDATE_ADOPTED',revision:result.revision,variant:result.variant},{ETag:result.variant.etag});
      return true;
    }
    if (request.method === 'POST' && confirmVariantMatch) {
      const variant = await step02RuntimeService.confirmVariant({ownerId:user.id,project:authorityProject,variantId:decodeURIComponent(confirmVariantMatch[2]),ifMatch:request.headers['if-match']});
      syncProjectStep02RuntimeCanonical(project,services,variant);
      await writeProjects(projects);
      json(response,200,{code:'STEP02_VARIANT_CONFIRMED',variant},{ETag:variant.etag});
      return true;
    }
    json(response,405,{code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
    return true;
  } catch (error) {
    step02RuntimeFailure(response,error);
    return true;
  }
}

function safeName(value) {
  return String(value || 'source.mp4').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
}

const redrawProjectFieldNames = new Set(['name','notes','rightsConfirmed','workspaceProjectId']);
const redrawProjectEnums = Object.freeze({
  remakeMode:new Set(['subject_replace','style_remake','short_drama']),
  targetLanguage:new Set(['source','zh-CN','en-US','ja-JP','ko-KR','es-MX','es-ES','pt-BR']),
  visualStyle:new Set(['faithful_redraw','cinematic_realism','premium_short_drama','stylized_realism','commercial_polish']),
  aspectRatio:new Set(['9:16','16:9','1:1','4:5','source']),
  quality:new Set(['480p','720p','1080p'])
});
const redrawAnalysisPolicyVersion = 'source-evidence-v1';
let testProjectIdSequenceIndex = 0;

function cleanProjectText(value, field, min, max) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max || /[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) throw createCodeError('PROJECT_FIELD_INVALID', '项目字段无效：' + field);
  return text;
}

function redrawProductionSettings(project) {
  const baseline = '保留源片剧情时序、镜头时长、机位、构图、人物动作、道具交接与画面中心事实；按目标语种、作品风格、画面比例与输出质量完成本土化分析；不得改变源片证据链、使用权边界或既定质量门。';
  const specialRequirements = String(project.replacementBrief || '').trim();
  const effectiveRequirements = baseline + '\n目标语种：' + String(project.targetLanguage || 'source') + '\n作品风格：' + String(project.visualStyle || 'faithful_redraw') + '\n画面比例：' + String(project.aspectRatio || '9:16') + '\n输出质量：' + String(project.quality || '720p') + (specialRequirements ? '\n客户特殊要求：\n' + specialRequirements : '');
  return {
    policy_version:redrawAnalysisPolicyVersion,
    baseline_requirements:baseline,
    special_requirements:specialRequirements,
    effective_requirements:effectiveRequirements,
    effective_requirements_sha256:crypto.createHash('sha256').update(effectiveRequirements, 'utf8').digest('hex')
  };
}

function step01SourceFactRequest(project) {
  return {
    name:project.name,
    analysis_scope:'source_evidence_only',
    required_evidence:['media_probe','native_frames','shots','asr','audio_alignment','ocr']
  };
}

function step01SettingsBinding(project) {
  const settings = redrawProductionSettings(project);
  return {
    schema_version:'niannian_step01_settings_binding_v1',
    settings_version:Number(project.settingsVersion || 1),
    effective_requirements_sha256:settings.effective_requirements_sha256
  };
}

function step01SourceMediaContract(project) {
  const preflight = project.preflight || {};
  return {
    width:Number(preflight.video?.width || 0),
    height:Number(preflight.video?.height || 0),
    duration_seconds:Number(preflight.durationSeconds || 0),
    fps:Number(preflight.video?.fps || 0),
    audio_stream_count:Number(preflight.audio?.streamCount || 0),
    audio_sample_rate:Number(preflight.audio?.sampleRates?.[0] || 0),
    ffprobe_status:String(preflight.status || '')
  };
}

function sourceOnlyStep01Task({project, analysisRun, authorization, rightsEvidence, requestedAt}) {
  const source = project.source || {};
  const settingsBinding = step01SettingsBinding(project);
  return {
    schema_version:'niannian_web_redraw_job_v1',
    job_id:project.id,
    created_at:String(project.createdAt || requestedAt),
    updated_at:requestedAt,
    entrypoint:'web_step01_source_only_start',
    required_router:'mx-shortdrama-00-router',
    runtime_profile:serverStep01Executor.PROFILE,
    requested_by:{user_id:project.ownerId},
    source_video:{
      originalName:source.originalName,
      storedPath:source.storedPath,
      mimeType:source.mimeType,
      bytes:source.bytes,
      sha256:source.sha256,
      media_contract:step01SourceMediaContract(project)
    },
    request:step01SourceFactRequest(project),
    analysis_run:analysisRun,
    analysis_settings_binding:settingsBinding,
    rights_authority:{event_id:rightsEvidence.rights.event_id,exact_path:rightsEvidence.path,sha256:rightsEvidence.sha256,bytes:rightsEvidence.bytes,status:'confirmed',source_sha256:rightsEvidence.rights.source_sha256,source_bytes:rightsEvidence.rights.source_bytes,scope:rightsEvidence.rights.scope,confirmed_at:rightsEvidence.rights.confirmed_at,revoked:false},
    analysis_authorization:{event_id:authorization.event_id,source_sha256:source.sha256,source_bytes:source.bytes,settings_version:settingsBinding.settings_version,settings_binding:settingsBinding,rights_authority:{event_id:rightsEvidence.rights.event_id,sha256:rightsEvidence.sha256,bytes:rightsEvidence.bytes},allowed_scope:'step01_evidence_only',allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'],provider_submission_requested:false,package_send_requested:false,approval_mode:authorization.approval_mode,approval_policy_id:authorization.approval_policy_id,risk_class:authorization.risk_class,auto_approved:true},
    analysis_service_network_authority:authorization.analysis_service_network_authority,
    transaction_intent:{run_id:analysisRun.id,node_id:'step01_evidence',owner_thread:'haika_server_responses_executor',expected_outputs:['route_decision.json','visual_facts.json','step01_evidence_manifest.json','step01_customer_evidence_index.json','step01_customer_delivery_manifest.json','step01_customer_delivery_receipt.json','checkpoint.json','worker_report.md','result_manifest.json','artifact_ledger.json','gate_dashboard.json','server_step01_result.json'],cost_gate:'current_project_gpt_authorization_required',promote_policy:'verified_only'},
    constraints:{local_image_editing:false,provider_submit_requires_authorization:true,package_send_requires_authorization:true,cli_fallback_allowed:false,relay_fallback_allowed:false,server_execution_only:true}
  };
}

function validateRedrawProjectFields(fields) {
  for (const name of Object.keys(fields)) if (!redrawProjectFieldNames.has(name)) throw createCodeError('PROJECT_FIELD_NOT_ALLOWED', '不支持的项目字段：' + name);
  if (fields.rightsConfirmed !== 'on') throw createCodeError('SOURCE_RIGHTS_REQUIRED', '创建项目前必须确认该源视频的使用与改编权限');
  const projectName = String(fields.name || '').trim();
  if (!projectName) throw createCodeError('PROJECT_NAME_REQUIRED', '请填写项目名称');
  if (projectName.length < 2) throw createCodeError('PROJECT_NAME_TOO_SHORT', '项目名称至少需要 2 个字符');
  const input = {
    name:cleanProjectText(projectName, 'name', 2, 80),
    notes:cleanProjectText(fields.notes || '', 'notes', 0, 2000),
    workspaceProjectId:normalizeWorkspaceProjectId(fields.workspaceProjectId),
    remakeMode:'subject_replace',
    targetLanguage:'es-MX',
    visualStyle:'faithful_redraw',
    aspectRatio:'9:16',
    quality:String(fields.quality || '720p')
  };
  input.replacementBrief = '';
  for (const [name, allowed] of Object.entries(redrawProjectEnums)) if (!allowed.has(input[name])) throw createCodeError('PROJECT_SETTING_INVALID', '制作设置无效：' + name);
  return input;
}

function nextRedrawProjectIdCandidate() {
  if (process.env.NODE_ENV === 'test' && process.env.NIANNIAN_TEST_PROJECT_ID_SEQUENCE) {
    const sequence = String(process.env.NIANNIAN_TEST_PROJECT_ID_SEQUENCE).split(',').map(value => value.trim()).filter(Boolean);
    if (testProjectIdSequenceIndex < sequence.length) return sequence[testProjectIdSequenceIndex++];
  }
  return 'NN-' + new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14) + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function allocateRedrawProjectId(projects, uploadFileName = '') {
  const used = new Set(projects.map(item => item.id));
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const id = nextRedrawProjectIdCandidate();
    if (!/^NN-[A-Z0-9-]{10,80}$/.test(id) || used.has(id)) continue;
    if (await fsp.lstat(path.join(jobsRoot, id)).catch(() => null)) continue;
    if (uploadFileName && await fsp.lstat(path.join(uploadsRoot, id + '-' + uploadFileName)).catch(() => null)) continue;
    return id;
  }
  throw createCodeError('PROJECT_ID_ALLOCATION_CONFLICT', '无法安全分配新的项目 ID，请稍后重试');
}

function rightsAuthorityBytes(rights) { return Buffer.from(JSON.stringify(rights, null, 2) + '\n', 'utf8'); }
function rightsAuthorityEvidence(rights) { const bytes=rightsAuthorityBytes(rights);return {sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}; }

function assertRightsAuthorityContract(rights, project, expectedUserId) {
  const expectedScope = 'source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates';
  if (!rights || rights.schema_version !== 'niannian_source_rights_authority_v1' || rights.status !== 'confirmed' || rights.revoked !== false) throw createCodeError('STEP01_RIGHTS_AUTHORITY_REVOKED_OR_INVALID', '源片权利声明已撤销或无效');
  if (rights.confirmed_by_user_id !== expectedUserId) throw createCodeError('STEP01_RIGHTS_AUTHORITY_USER_MISMATCH', '源片权利声明与当前用户不匹配');
  if (rights.source_sha256 !== project.source?.sha256 || Number(rights.source_bytes) !== Number(project.source?.bytes)) throw createCodeError('STEP01_RIGHTS_AUTHORITY_SOURCE_MISMATCH', '源片权利声明与当前源文件不匹配');
  if (rights.scope !== expectedScope || rights.declaration !== 'user_confirmed_rights_to_use_and_adapt_uploaded_source') throw createCodeError('STEP01_RIGHTS_AUTHORITY_SCOPE_MISMATCH', '源片权利声明范围不满足当前转绘任务');
  if (!/^rights-[a-f0-9]{24}$/.test(String(rights.event_id || ''))) throw createCodeError('STEP01_RIGHTS_AUTHORITY_EVENT_INVALID', '源片权利声明事件无效');
  return rights;
}

async function verifyProjectRightsAuthority(project, expectedUserId) {
  const jobDir = path.join(jobsRoot, project.id);
  const rightsPath = path.join(jobDir, 'rights_authority.json');
  const stats = await fsp.lstat(rightsPath).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) throw createCodeError('STEP01_RIGHTS_AUTHORITY_MISSING', '缺少可验证的源片权利声明');
  const bytes = await fsp.readFile(rightsPath);
  const evidence = {sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
  const receipt = project.rightsAuthorityReceipt;
  if (!receipt || receipt.event_id !== project.rightsAuthority?.event_id || receipt.sha256 !== evidence.sha256 || Number(receipt.bytes) !== evidence.bytes) throw createCodeError('STEP01_RIGHTS_AUTHORITY_SHA256_MISMATCH', '源片权利声明内容已变化，已拒绝派发');
  let rights;
  try { rights = JSON.parse(bytes.toString('utf8')); }
  catch { throw createCodeError('STEP01_RIGHTS_AUTHORITY_INVALID_JSON', '源片权利声明无法解析'); }
  assertRightsAuthorityContract(rights, project, expectedUserId);
  if (JSON.stringify(rights) !== JSON.stringify(project.rightsAuthority)) throw createCodeError('STEP01_RIGHTS_AUTHORITY_PROJECTION_MISMATCH', '项目权利声明投影与权威文件不一致');
  return {rights,path:rightsPath,...evidence};
}

async function acquireRightsReadbackLease(projectId, nowMs = Date.now()) {
  const leasePath = path.join(jobsRoot, projectId, '.rights-authority-readback-lease');
  try { await fsp.mkdir(leasePath, {recursive:false}); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stats = await fsp.stat(leasePath).catch(() => null);
    if (stats && nowMs - stats.mtimeMs > 60000) { await fsp.rm(leasePath,{recursive:true,force:true});return acquireRightsReadbackLease(projectId,nowMs); }
    throw createCodeError('STEP01_RIGHTS_AUTHORITY_LEASE_CONFLICT', '源片权利声明正在被校验，请稍后重试');
  }
  await fsp.writeFile(path.join(leasePath, 'lease.json'), JSON.stringify({project_id:projectId,pid:process.pid,acquired_at:new Date(nowMs).toISOString()}) + '\n', {flag:'wx'});
  return {path:leasePath,release:() => fsp.rm(leasePath,{recursive:true,force:true})};
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireStep01StartLease(projectId, options = {}) {
  const leasePath = path.join(jobsRoot, projectId, '.step01-start-lease');
  const attempts = Math.max(1, Math.min(80, Number(options.attempts || 40)));
  const waitMs = Math.max(5, Math.min(250, Number(options.waitMs || 25)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fsp.mkdir(leasePath, {recursive:false});
      await fsp.writeFile(path.join(leasePath, 'lease.json'), JSON.stringify({project_id:projectId,pid:process.pid,acquired_at:new Date().toISOString()}) + '\n', {flag:'wx'});
      return {path:leasePath,release:() => fsp.rm(leasePath,{recursive:true,force:true})};
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stats = await fsp.stat(leasePath).catch(() => null);
      if (stats && Date.now() - stats.mtimeMs > 60000) {
        await fsp.rm(leasePath, {recursive:true,force:true}).catch(() => {});
        continue;
      }
      if (attempt + 1 < attempts) await delay(waitMs);
    }
  }
  throw createCodeError('STEP01_START_LEASE_CONFLICT', 'Step01 启动请求正在收敛，请稍后重试');
}

async function recoverSingleSourceOnlyRun(jobDir, project, candidate, recoveryEligible) {
  if (!recoveryEligible) return candidate;
  const runRoot = path.join(jobDir, 'analysis_runs');
  const expectedKey = candidate.idempotency_key;
  const entries = await fsp.readdir(runRoot, {withFileTypes:true}).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^analysis-[A-Za-z0-9-]{8,100}$/.test(entry.name)) continue;
    const file = path.join(runRoot, entry.name, 'analysis_run.json');
    const value = await readJsonFile(file, null);
    if (value?.schema_version === 'niannian_step01_source_analysis_run_v1' && value.source_sha256 === candidate.source_sha256 && Number(value.source_revision) === candidate.source_revision && value.idempotency_key === expectedKey && value.analysis_scope === 'source_evidence_only') matches.push({value,root:path.join(runRoot,entry.name)});
  }
  for (const prior of matches) {
    const state = {schema_version:'niannian_step01_analysis_run_recovery_state_v1',status:'superseded_invalidated',project_id:project.id,analysis_run_id:prior.value.id,superseded_by:candidate.id,reason:'recovery_reissued_new_authority_bound_run',source_sha256:candidate.source_sha256,source_revision:candidate.source_revision,recorded_at:new Date().toISOString()};
    await writeJson(path.join(prior.root, 'recovery_state.json'), state);
    await step01EvidenceEvents.appendEvidenceEvent(path.join(jobDir,'evidence_events.jsonl'), {type:'analysis_run_superseded',project_id:project.id,analysis_run_id:prior.value.id,superseded_by:candidate.id,source_revision:candidate.source_revision,source_sha256:candidate.source_sha256,status:'superseded_invalidated',evidence_sha256:expectedKey});
  }
  return candidate;
}

function validateRedrawUpload(info = {}) {
  const extension = path.extname(String(info.filename || '')).toLowerCase();
  const mimeType = String(info.mimeType || '').toLowerCase();
  const allowedExtension = ['.mp4', '.mov'].includes(extension);
  const allowedMime = ['video/mp4', 'video/quicktime', 'application/octet-stream'].includes(mimeType);
  if (!allowedExtension || !allowedMime) {
    throw createCodeError('SOURCE_FILE_TYPE_UNSUPPORTED', '一键转绘仅支持 MP4 或 MOV 视频');
  }
}

async function sha256StoredFile(filePath) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return {bytes, sha256:hash.digest('hex')};
}

function isInside(parent, candidate) {
  const base = path.resolve(parent);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(base + path.sep);
}

function validateProjectSourceStorageKey(value) {
  const key=String(value||'');
  if(!key||path.isAbsolute(key)||key.includes('\\')||key.includes('\0')||/[\x00-\x1f\x7f]/.test(key)||path.posix.normalize(key)!==key||!/^uploads\/[^/]{1,240}$/.test(key))throw createCodeError('PROJECT_SOURCE_KEY_INVALID','项目源视频存储键无效');
  return key;
}

async function resolveProjectSource(project,{verify=true}={}) {
  const legacyName=project?.source?.storedPath?path.basename(String(project.source.storedPath)):'';
  const key=validateProjectSourceStorageKey(project?.source?.storage_key||('uploads/'+legacyName));
  const filePath=path.resolve(dataRoot,...key.split('/'));
  if(!isInside(uploadsRoot,filePath)||filePath===path.resolve(uploadsRoot))throw createCodeError('PROJECT_SOURCE_PATH_INVALID','项目源视频路径无效');
  const stats=await fsp.stat(filePath).catch(()=>null);
  if(!stats||!stats.isFile())throw createCodeError('PROJECT_SOURCE_NOT_FOUND','项目源视频不存在');
  if(Number(project.source?.bytes)!==stats.size)throw createCodeError('PROJECT_SOURCE_INTEGRITY_FAILED','项目源视频校验失败');
  if(verify){
    const cacheKey=filePath+'|'+stats.size+'|'+stats.mtimeMs,expected=String(project.source?.sha256||''),cached=projectSourceIntegrityCache.get(cacheKey);
    const evidence=cached||await sha256StoredFile(filePath);
    if(!cached)projectSourceIntegrityCache.set(cacheKey,evidence);
    if(!/^[a-f0-9]{64}$/.test(expected)||evidence.bytes!==stats.size||evidence.sha256!==expected)throw createCodeError('PROJECT_SOURCE_INTEGRITY_FAILED','项目源视频校验失败');
  }
  return{path:filePath,key,stats,sha256:project.source.sha256,mime:project.source.mimeType||'application/octet-stream'};
}

function webMediaMime(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.png') return 'image/png';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}

async function redirectProjectMediaToCos(response, {project, category, filePath, mime, revision = 'current', video = false}) {
  const grant = await webMediaDelivery.redirectForVerifiedFile({
    root:webMediaDeliveryRoot,
    projectId:project.id,
    category,
    localPath:filePath,
    mime,
    revision
  });
  if (!grant) {
    const readiness = webMediaDelivery.configuredCosDelivery();
    if (readiness.ready) void queueProjectMediaCosMigration(project, readiness);
    return false;
  }
  response.writeHead(video ? 307 : 302, {
    Location:grant.url,
    'Cache-Control':'private, no-store',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    Vary:'Cookie'
  });
  response.end();
  return true;
}

function queueProjectMediaCosMigration(project, readiness = webMediaDelivery.configuredCosDelivery()) {
  if (!readiness.ready) return null;
  const lockKey = project.id + ':background';
  const running = webMediaMigrationLocks.get(lockKey);
  if (running) return running;
  const operation = (async () => {
    const entries = await listProjectMediaForCosMigration(project);
    for (const entry of entries) await webMediaDelivery.migrateFile({root:webMediaDeliveryRoot, projectId:project.id, ...entry, config:readiness});
    return entries.length;
  })();
  webMediaMigrationLocks.set(lockKey, operation);
  operation.catch(() => {}).finally(() => { if (webMediaMigrationLocks.get(lockKey) === operation) webMediaMigrationLocks.delete(lockKey); });
  return operation;
}

async function listProjectMediaForCosMigration(project) {
  const entries = [];
  const seen = new Set();
  const add = (category, filePath, mime, revision = 'current') => {
    const key = [revision, filePath].join('|');
    if (!seen.has(key)) { seen.add(key); entries.push({category, localPath:filePath, mime, revision}); }
  };
  const source = await resolveProjectSource(project, {verify:true});
  add('source-video', source.path, source.mime, 'source-' + String(project.sourceRevision || 1));
  const authority = await currentStep01Authority(project).catch(error => error?.code === 'STEP01_CURRENT_AUTHORITY_MISSING' ? {kind:'legacy'} : Promise.reject(error));
  const evidencePackage = await readVerifiedStep01Evidence(project).catch(() => null);
  if (evidencePackage?.index?.timeline) {
    const evidenceRoot = authority.kind === 'revision'
      ? authority.evidence_root
      : (project.analysis?.runtimeProfile === serverStep01Executor.PROFILE
        ? path.join(jobsRoot, project.id, 'analysis_runs', String(project.analysis?.runId || ''), 'server_evidence')
        : String((await readJsonFile(path.join(jobsRoot, project.id, 'status.json'), {})).fixed_app_return?.archive_root || ''));
    for (const shot of evidencePackage.index.timeline) for (const frame of (shot.evidence?.keyframes || [])) {
      const framePath = path.resolve(evidenceRoot, String(frame.relative_path || ''));
      if (evidenceRoot && isInside(evidenceRoot, framePath)) add('step01-evidence-frame', framePath, webMediaMime(framePath), authority.revision_id || String(project.analysis?.runId || 'legacy'));
    }
  }
  const evidenceRoot = await currentStep01EvidenceRoot(project).catch(() => null);
  if (evidenceRoot) {
    const ledger = await step01SourceLedger.readLedger({evidenceRoot, overlayRoot:step01SourceLedgerOverlayRoot, project:projectBoundToStep01Authority(project, authority)}).catch(() => null);
    for (const shot of (ledger?.shots || [])) for (const frame of (shot.frame_evidence || [])) {
      const relative = String(frame.relative_path || '').replace(/\\/g, '/');
      const framePath = path.resolve(evidenceRoot, 'artifacts', ...relative.split('/'));
      if (relative && !path.posix.isAbsolute(relative) && !relative.includes('..') && isInside(path.resolve(evidenceRoot, 'artifacts'), framePath)) add('step01-ledger-frame', framePath, webMediaMime(framePath), authority.revision_id || 'legacy');
    }
  }
  return entries;
}

function publicDispatch(dispatch = {}) {
  return {
    status:dispatch.status || 'queued',
    claimedAt:dispatch.claimedAt || null,
    leaseUntil:dispatch.leaseUntil || null,
    heartbeatAt:dispatch.heartbeatAt || null,
    mirroredAt:dispatch.mirroredAt || null,
    localJobId:dispatch.localJobId || null,
    blocker:dispatch.blocker || null
  };
}

function redactPublicAuthority(value, parentKey = '') {
  if (Array.isArray(value)) return value.map(item => redactPublicAuthority(item, parentKey));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'confirmed_by_user_id' || (parentKey === 'authorized_by' && key === 'user_id')) continue;
    output[key] = redactPublicAuthority(item, key);
  }
  return output;
}

function projectCanonicalTrace(project) {
  return redrawCanonicalDag.legacyProjectTrace(project, {
    current_authority_revision:project?.canonical?.authority_revision || project?.analysis?.authorityRevisionId || project?.analysis?.runId || null
  });
}

function canonicalStep01Evidence(project) {
  const revision=String(project.analysis?.authorityRevisionId||project.analysis?.runId||'').trim()||null;
  return redrawCanonicalDag.resolveCanonicalState({legacy:{legacy_step_name:'Step01'},authority_revision:revision,current_authority_revision:revision,input_contract:{source_authority_bound:Boolean(revision&&project.source?.sha256)},output_contract:{node_contract_complete:true,artifact_ledger_verified:true}});
}

function publicProject(project) {
  const trace = projectCanonicalTrace(project);
  const stage = redrawCanonicalDag.publicProjection(trace);
  const runtime = project.runtime || {};
  const fullSourceAuthority = fullSourceStep01Authority.publicProjection(project);
  const projectedRuntime = fullSourceAuthority?.status === 'blocked' ? {
    ...runtime,
    productionStatus: 'blocked_full_source_authority',
    currentNode: 'Step01',
    earliestIncompleteNode: 'Step01',
    blocker: fullSourceAuthority.blocker?.code || 'STEP01_FULL_SOURCE_AUTHORITY_PENDING',
    nextAction: '等待 Haika 完成完整 61 镜头 Step01 权威链；旧 9 镜头证据不会被读取。',
    gateState: 'step01_full_source_authority_blocked',
    worker: {...(runtime.worker || {}), status:'blocked_upstream', mode:'haika_server_responses', blocker:fullSourceAuthority.blocker?.message || '新源片 Step01 权威尚未完成'}
  } : runtime;
  const source = project.source || {};
  const preflight = project.preflight || null;
  const safePreflight = preflight ? {
    status:preflight.status || null,
    message:preflight.message || null,
    inspectedAt:preflight.inspectedAt || null,
    video:preflight.video ? {
      durationSeconds:preflight.video.durationSeconds,
      width:preflight.video.width,
      height:preflight.video.height,
      fps:preflight.video.fps,
      hasAudio:preflight.video.hasAudio
    } : null
  } : null;
  return {
    id:project.id,
    workspaceProjectId:project.workspaceProjectId || project.id,
    name:project.name,
    status:project.status,
    productionStatus:project.productionStatus,
    createdAt:project.createdAt,
    remakeMode:project.remakeMode,
    targetLanguage:project.targetLanguage,
    visualStyle:project.visualStyle,
    aspectRatio:project.aspectRatio,
    quality:project.quality,
    replacementBrief:project.replacementBrief,
    notes:project.notes,
    source:project.source ? {originalName:source.originalName,mimeType:source.mimeType,bytes:source.bytes,previewUrl:'/api/projects/' + encodeURIComponent(project.id) + '/source'} : null,
    preflight:safePreflight,
    analysis:project.analysis ? {status:project.analysis.status,requestedAt:project.analysis.requestedAt || null,updatedAt:project.analysis.updatedAt || null,completedAt:project.analysis.completedAt || null} : null,
    pipeline:fullSourceAuthority?.status === 'blocked'
      ? stage.stages.map(item=>({id:item.key,label:item.label,status:item.key === 'source-analysis' ? 'running' : 'pending'}))
      : stage.stages.map(item=>({id:item.key,label:item.label,status:item.index<stage.stage_index?'completed':item.index===stage.stage_index?(stage.gate==='ready'?'completed':'running'):'pending'})),
    step02:project.step02 ? {status:project.step02.status,step04Ready:project.step02.step04Ready === true,updatedAt:project.step02.updatedAt || null} : null,
    runtime:{
      productionStatus:projectedRuntime.productionStatus || project.productionStatus || 'queued',
      currentNode:projectedRuntime.currentNode || null,
      earliestIncompleteNode:projectedRuntime.earliestIncompleteNode || null,
      blocker:projectedRuntime.blocker || null,
      nextAction:humanizePublicRedrawAction(projectedRuntime.nextAction),
      artifactCount:Number(projectedRuntime.artifactCount || 0),
      verifiedArtifactCount:Number(projectedRuntime.verifiedArtifactCount || 0),
      publicStage:stage
    },
    step01Authority:fullSourceAuthority,
    publicStage:stage
  };
}

function humanizePublicRedrawAction(value) {
  const raw=String(value||'').trim();
  if(!raw)return '等待当前阶段准备完成。';
  if(/(?:[A-Z0-9_]{4,}|sha|hash|provider|receipt|controller|lease|token|\/|\\)/i.test(raw))return '当前阶段正在核验，完成后会自动更新进度。';
  return raw.slice(0,240);
}

function fullSourceStep01BlockerResponse(response, project) {
  const blocker = fullSourceStep01Authority.guard(project);
  if (!blocker) return false;
  json(response, 409, {
    code: blocker.blocker.code,
    error: blocker.blocker.message,
    step01Authority: blocker,
    oldAuthorityHidden: true,
    providerSubmitAllowed: false
  });
  return true;
}

function scriptPipeline(currentNode = 'N00') {
  const normalizedCurrentNode = scriptNodeId(currentNode, 'N00');
  const nodes = [
    ['N00', '文本来源与方向门'],
    ['N01', '人物与世界观事实账本'],
    ['N02', '分集改编与钩子结构'],
    ['N03', '可拍摄剧本与镜头事实卡'],
    ['N04', '人物、场景、首帧与提示词包'],
    ['N05', 'Image2 资产与首帧候选'],
    ['N06', '锁定视频任务与生成'],
    ['N07', '剪辑、声音、字幕与交付']
  ];
  const currentIndex = Math.max(0, nodes.findIndex(([id]) => id === normalizedCurrentNode));
  return nodes.map(([id, label], index) => ({ id, label, status:index < currentIndex ? 'completed' : index === currentIndex ? 'running' : 'queued' }));
}

function scriptNodeId(value, fallback = 'N01') {
  const match = String(value || '').toUpperCase().match(/N0[0-7]/);
  return match ? match[0] : fallback;
}

function scriptGateStatus(gates, key, fallback = 'pending') {
  const value = gates && gates[key];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.status === 'string') return value.status;
  return fallback;
}

function scriptBlockerText(value) {
  if (typeof value === 'string') return value.slice(0, 1000) || null;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') return first.slice(0, 1000) || null;
    if (first && typeof first === 'object') return String(first.blocker_signature || first.message || first.type || '').slice(0, 1000) || null;
  }
  if (value && typeof value === 'object') return String(value.blocker_signature || value.message || value.type || '').slice(0, 1000) || null;
  return null;
}

function publicScriptProject(project) {
  const runtime = project.runtime || {};
  const blocker = publicWorkflowBlocker(runtime.blocker);
  return {
    id:project.id,
    workspaceProjectId:project.workspaceProjectId || project.id,
    name:project.name,
    genre:project.genre,
    audience:project.audience,
    episodeDuration:project.episodeDuration,
    aspectRatio:project.aspectRatio,
    createdAt:project.createdAt,
    updatedAt:project.updatedAt || project.createdAt,
    source:{
      type:project.source.type,
      originalName:project.source.originalName || null,
      mimeType:project.source.mimeType || null,
      bytes:project.source.bytes || null,
      characters:project.source.characters,
      integrity:'verified',
      extraction:project.source.extraction ? {status:'verified', warningCount:Number(project.source.extraction.warningCount || 0)} : null
    },
    route:{ rootSkill:'mx-shortdrama-00-router', productionSkill:'mx-shortdrama-script-only-production', currentNode:project.runtime?.currentNode || 'N00' },
    pipeline:project.pipeline,
    runtime:{
      productionStatus:String(runtime.productionStatus || 'canon_pending'),
      currentNode:scriptNodeId(runtime.currentNode, 'N00'),
      nextAction:humanizePublicRedrawAction(runtime.nextAction),
      blocker,
      artifactCount:Number(runtime.artifactCount || 0),
      verifiedArtifactCount:Number(runtime.verifiedArtifactCount || 0),
      productionRegistration:Boolean(runtime.workerJob?.localJobId)
    },
    gates:project.gates,
    ingest:project.ingest ? {
      status:project.ingest.status,
      chapterCount:project.ingest.chapterCount,
      paragraphCount:project.ingest.paragraphCount,
      integrity:project.ingest.status === 'verified' ? 'verified' : 'pending'
    } : null
  };
}

function publicWorkflowBlocker(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^[A-Z0-9_:-]{4,}$/.test(raw) || /(?:provider|worker|dispatch|receipt|path|sha|hash|token|\/|\\)/i.test(raw)) return '当前阶段需要处理后才能继续。';
  return raw.slice(0, 240);
}

function publicWorkspaceRow(row) {
  const redrawProjectIds = [...new Set([...(Array.isArray(row.redrawProjectIds) ? row.redrawProjectIds : []), ...(row.redrawProjectId ? [row.redrawProjectId] : [])].map(value => normalizeWorkspaceProjectId(value)).filter(Boolean))];
  const scriptProjectIds = [...new Set([...(Array.isArray(row.scriptProjectIds) ? row.scriptProjectIds : []), ...(row.scriptProjectId ? [row.scriptProjectId] : [])].map(value => normalizeWorkspaceProjectId(value)).filter(Boolean))];
  return {
    id:row.id,
    name:row.name,
    createdAt:row.createdAt || null,
    updatedAt:row.updatedAt || row.createdAt || null,
    redrawProjectId:redrawProjectIds[0] || null,
    scriptProjectId:scriptProjectIds[0] || null,
    redrawProjectIds,
    scriptProjectIds,
    tools:{canvas:true,redraw:true,shortDrama:true},
    deliveriesUrl:'/api/workspace-projects/' + encodeURIComponent(row.id) + '/deliveries'
  };
}

async function readOwnedWorkspaceRows(userId) {
  const [redrawProjects, scriptProjects, bindings] = await Promise.all([readProjects(), readScriptProjects(), readWorkspaceBindings()]);
  const ownedRedraw = redrawProjects.filter(item => item.ownerId === userId);
  const ownedScript = scriptProjects.filter(item => item.ownerId === userId);
  const ownedBindings = bindings.filter(item => item.ownerId === userId);
  const rows = new Map();
  const add = (id, project, kind) => {
    const workspaceId = normalizeWorkspaceProjectId(id) || project.id;
    const existing = rows.get(workspaceId) || {id:workspaceId,name:project.name,createdAt:project.createdAt,updatedAt:project.updatedAt || project.createdAt};
    existing.name = existing.name || project.name;
    existing.createdAt = existing.createdAt || project.createdAt;
    existing.updatedAt = new Date(Math.max(new Date(existing.updatedAt || 0).getTime(), new Date(project.updatedAt || project.createdAt || 0).getTime())).toISOString();
    if (kind === 'redraw') {
      existing.redrawProjectIds = [...new Set([...(existing.redrawProjectIds || []), project.id])];
      existing.redrawProjectId = existing.redrawProjectIds[0];
    }
    if (kind === 'script') {
      existing.scriptProjectIds = [...new Set([...(existing.scriptProjectIds || []), project.id])];
      existing.scriptProjectId = existing.scriptProjectIds[0];
    }
    rows.set(workspaceId, existing);
  };
  for (const binding of ownedBindings) rows.set(binding.id, {...binding});
  for (const project of ownedRedraw) add(project.workspaceProjectId || project.id, project, 'redraw');
  for (const project of ownedScript) add(project.workspaceProjectId || project.id, project, 'script');
  return Array.from(rows.values()).sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

async function readOwnedWorkspaceOverview(user, workspaceId) {
  const id = normalizeWorkspaceProjectId(workspaceId);
  if (!id) return null;
  const [redrawProjects, scriptProjects, bindings] = await Promise.all([readProjects(), readScriptProjects(), readWorkspaceBindings()]);
  const binding = bindings.find(item => item.id === id && item.ownerId === user.id) || null;
  const redrawRows = redrawProjects.filter(item => item.ownerId === user.id && (item.workspaceProjectId || item.id) === id).sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const scriptRows = scriptProjects.filter(item => item.ownerId === user.id && (item.workspaceProjectId || item.id) === id).sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const redraw = redrawRows[0] || null;
  const script = scriptRows[0] || null;
  if (!binding && !redrawRows.length && !scriptRows.length) return null;
  return {
    project:publicWorkspaceRow({id,name:binding?.name || redraw?.name || script?.name || id,createdAt:binding?.createdAt || redraw?.createdAt || script?.createdAt,updatedAt:binding?.updatedAt || redraw?.updatedAt || script?.updatedAt,redrawProjectIds:redrawRows.map(item => item.id),scriptProjectIds:scriptRows.map(item => item.id)}),
    redraw:redraw ? publicProject(redraw) : null,
    shortDrama:script ? publicScriptProject(script) : null,
    redrawProjects:redrawRows.map(publicProject),
    shortDramaProjects:scriptRows.map(publicScriptProject),
    canvas:{projectId:id,source:'server',status:'bound'}
  };
}

async function findVerifiedStep04Word(project) {
  const roots = [
    path.join(jobsRoot, project.id, 'employee_returns', 'step04'),
    path.join(directJobsRoot, scriptDirectJobId(project.id), 'employee_returns', 'step04')
  ];
  const receiptNames = ['step04_worker_receipt.json', 'employee_worker_receipt.json', 'delivery_manifest.json', 'result_manifest.json'];
  for (const rootPath of [...new Set(roots.map(value => path.resolve(value)))]) {
    if (!isInside(path.dirname(rootPath), rootPath)) continue;
    for (const receiptName of receiptNames) {
      const receiptPath = path.join(rootPath, receiptName);
      const receipt = await readJsonFile(receiptPath, null);
      if (!receipt || receipt.project_id !== project.id || receipt.test_only === true) continue;
      const sourceSha = String(project.source?.sha256 || '').toLowerCase();
      const receiptSourceSha = String(receipt.source_sha256 || receipt.source?.sha256 || '').toLowerCase();
      if (receiptSourceSha && sourceSha && receiptSourceSha !== sourceSha && receiptSourceSha !== String(project.source?.extractedTextSha256 || '').toLowerCase() && receiptSourceSha !== String(project.ingest?.extractedTextSha256 || '').toLowerCase()) continue;
      const word = receipt.delivery?.word || receipt.word || receipt.artifacts?.word || null;
      if (!word || !['ready', 'delivered', 'accepted'].includes(String(word.status || receipt.status || '').toLowerCase())) continue;
      const exactPath = path.resolve(String(word.exact_path || word.path || ''));
      const expectedSha = String(word.sha256 || '').toLowerCase();
      const expectedBytes = Number(word.bytes || 0);
      if (!exactPath || path.extname(exactPath).toLowerCase() !== '.docx' || !isInside(rootPath, exactPath) || !validSha256(expectedSha) || !Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) continue;
      const evidence = await sha256File(exactPath).catch(() => null);
      if (!evidence || evidence.sha256 !== expectedSha || evidence.bytes !== expectedBytes) continue;
      return {exactPath, sha256:evidence.sha256, bytes:evidence.bytes, fileName:safeName(word.file_name || word.filename || path.basename(exactPath)), projectId:project.id};
    }
  }
  return null;
}

async function readOwnedWorkspaceSourceProjects(user, workspaceId) {
  const id = normalizeWorkspaceProjectId(workspaceId);
  if (!id) return null;
  const [redrawProjects, scriptProjects, bindings] = await Promise.all([readProjects(), readScriptProjects(), readWorkspaceBindings()]);
  const redraw = redrawProjects.filter(project => project.ownerId === user.id && (project.workspaceProjectId || project.id) === id);
  const script = scriptProjects.filter(project => project.ownerId === user.id && (project.workspaceProjectId || project.id) === id);
  const binding = bindings.find(item => item.id === id && item.ownerId === user.id) || null;
  if (!binding && !redraw.length && !script.length) return null;
  return {workspaceId:id, redraw, script};
}

async function serveWorkspaceWord(request, response, user, workspaceId) {
  const sources = await readOwnedWorkspaceSourceProjects(user, workspaceId);
  if (!sources) return json(response, 404, {code:'WORKSPACE_PROJECT_NOT_FOUND', error:'项目不存在或不属于当前账户'});
  for (const project of [...sources.redraw, ...sources.script]) {
    const word = await findVerifiedStep04Word(project);
    if (!word) continue;
    const download = new URL(request.url, 'http://127.0.0.1').searchParams.get('download') === '1';
    response.writeHead(200, { 'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Length':word.bytes, 'Cache-Control':'private, no-store', 'ETag':'"' + word.sha256 + '"', 'X-Content-Type-Options':'nosniff', 'Content-Disposition':(download ? 'attachment' : 'inline') + '; filename="' + word.fileName.replace(/"/g, '') + '"' });
    if (request.method === 'HEAD') return response.end();
    return fs.createReadStream(word.exactPath).pipe(response);
  }
  return json(response, 404, {code:'WORKSPACE_WORD_NOT_READY', error:'当前项目还没有通过完整性校验的 Step04 Word 交付'});
}

async function workspaceDeliveries(user, workspaceId) {
  const overview = await readOwnedWorkspaceOverview(user, workspaceId);
  if (!overview) return null;
  const sources = await readOwnedWorkspaceSourceProjects(user, workspaceId);
  if (!sources) return null;
  const words = await Promise.all([...sources.redraw, ...sources.script].map(findVerifiedStep04Word));
  const wordReady = words.some(Boolean);
  const nomi = await workspaceNomiVideoDeliveries(user, workspaceId, sources);
  return {
    project:overview.project,
    currentStages:{redraw:overview.redraw?.runtime?.currentNode || null,shortDrama:overview.shortDrama?.runtime?.currentNode || null,canvasVideo:nomi.currentStage},
    blocker:overview.redraw?.runtime?.blocker || overview.shortDrama?.runtime?.blocker || nomi.blocker || null,
    word:{status:wordReady ? 'ready' : 'not_ready',openUrl:wordReady ? '/api/workspace-projects/' + encodeURIComponent(workspaceId) + '/deliveries/word' : null},
    deliveries:nomi.deliveries,
    note:(wordReady || nomi.deliveries.length) ? '仅列出已通过网站权限和完整性校验的项目交付。' : '当前项目尚无可通过网站打开或下载的真实交付物。'
  };
}

function scriptProjectErrorStatus(error) {
  if (['SCRIPT_TEXT_TOO_LARGE', 'SCRIPT_DOCUMENT_TOO_LARGE', 'SCRIPT_UPLOAD_TOO_LARGE', 'SCRIPT_UPLOAD_CHUNK_TOO_LARGE'].includes(error.code)) return 413;
  if (error.code === 'SCRIPT_UPLOAD_NOT_FOUND') return 404;
  if (error.code === 'IDEMPOTENCY_KEY_CONFLICT' || error.code === 'IDEMPOTENCY_IN_PROGRESS') return 409;
  if (error.code === 'IDEMPOTENCY_KEY_INVALID') return 400;
  if (String(error.code || '').startsWith('SCRIPT_') || error.code === 'WORKSPACE_PROJECT_NOT_FOUND') return 400;
  return 500;
}

function scriptProjectInput(body) {
  const name = String(body.name || '').trim().slice(0, 80);
  const workspaceProjectId = normalizeWorkspaceProjectId(body.workspaceProjectId);
  const genre = String(body.genre || '都市情感').trim().slice(0, 40) || '都市情感';
  const audience = String(body.audience || '短剧用户').trim().slice(0, 80) || '短剧用户';
  const episodeDuration = [60, 90].includes(Number(body.episodeDuration)) ? Number(body.episodeDuration) : 60;
  const aspectRatio = ['9:16', '16:9'].includes(String(body.aspectRatio)) ? String(body.aspectRatio) : '9:16';
  if (!name) throw createCodeError('SCRIPT_PROJECT_NAME_REQUIRED', '请填写短剧项目名称');
  if (body.rightsConfirmed !== true && body.rightsConfirmed !== 'on') throw createCodeError('SCRIPT_RIGHTS_REQUIRED', '请确认拥有小说或剧本的使用、改编权限');
  return {name, genre, audience, episodeDuration, aspectRatio, workspaceProjectId};
}

function cleanScriptSourceText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim();
}

function validateScriptSourceText(sourceText) {
  if (sourceText.length < 120) throw createCodeError('SCRIPT_TEXT_TOO_SHORT', '请提供至少 120 个字符的小说或剧本正文');
  if (sourceText.length > 500000) throw createCodeError('SCRIPT_TEXT_TOO_LARGE', '单次文本不能超过 50 万字符');
  return sourceText;
}

function scriptUploadId() {
  return 'SUD-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

function validSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function scriptUploadSessionDirectory(uploadId) {
  const normalized = String(uploadId || '').trim().toUpperCase();
  if (!/^SUD-[A-Z0-9]+-[A-F0-9]{10}$/.test(normalized)) throw createCodeError('SCRIPT_UPLOAD_ID_INVALID', '上传会话无效');
  const directory = path.join(scriptUploadSessionsRoot, normalized);
  if (!isInside(scriptUploadSessionsRoot, directory)) throw createCodeError('SCRIPT_UPLOAD_PATH_INVALID', '上传会话路径无效');
  return directory;
}

async function readScriptUploadSessions() {
  const sessions = await readJsonFile(scriptUploadIndexPath, []);
  return Array.isArray(sessions) ? sessions : [];
}

async function writeScriptUploadSessions(sessions) {
  await writeJson(scriptUploadIndexPath, Array.isArray(sessions) ? sessions : []);
}

function publicScriptUploadSession(session) {
  return {
    id:String(session.id || ''),
    originalName:String(session.originalName || 'novel.docx'),
    bytesExpected:Number(session.bytesExpected || 0),
    uploadedBytes:Number(session.uploadedBytes || 0),
    chunkSize:Number(session.chunkSize || scriptUploadChunkBytes),
    status:String(session.status || 'uploading'),
    createdAt:String(session.createdAt || ''),
    updatedAt:String(session.updatedAt || ''),
    verifiedAt:session.verifiedAt ? String(session.verifiedAt) : null,
    projectId:session.projectId ? String(session.projectId) : null
  };
}

function validateScriptDocumentMetadata(body = {}) {
  const originalName = safeName(body.originalName || 'novel.docx');
  const mimeType = String(body.mimeType || '').toLowerCase();
  const bytesExpected = Number(body.bytes);
  const sha256 = String(body.sha256 || '').toLowerCase();
  if (path.extname(originalName).toLowerCase() !== '.docx') throw createCodeError('SCRIPT_DOCUMENT_INVALID', '仅支持 .docx Word 文档');
  if (!Number.isSafeInteger(bytesExpected) || bytesExpected <= 0) throw createCodeError('SCRIPT_UPLOAD_SIZE_INVALID', 'Word 文档大小无效');
  if (bytesExpected > maxScriptDocumentBytes) throw createCodeError('SCRIPT_UPLOAD_TOO_LARGE', 'Word 文档不能超过当前 25MB 限制');
  if (!validSha256(sha256)) throw createCodeError('SCRIPT_UPLOAD_SHA_REQUIRED', '请校验 Word 文档完整性后再上传');
  if (mimeType && !['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'].includes(mimeType)) {
    throw createCodeError('SCRIPT_DOCUMENT_INVALID', '仅支持 .docx Word 文档');
  }
  return {originalName, mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytesExpected, sha256};
}

async function ownedScriptUploadSession(uploadId, user) {
  const sessions = await readScriptUploadSessions();
  const index = sessions.findIndex(session => String(session?.id || '') === String(uploadId || ''));
  if (index < 0 || sessions[index].ownerId !== user.id) throw createCodeError('SCRIPT_UPLOAD_NOT_FOUND', '未找到这个上传会话');
  const session = sessions[index];
  const directory = scriptUploadSessionDirectory(session.id);
  if (!isInside(scriptUploadSessionsRoot, session.directory || directory)) throw createCodeError('SCRIPT_UPLOAD_PATH_INVALID', '上传会话路径无效');
  return {sessions, index, session};
}

async function readRequestBuffer(request, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw createCodeError('SCRIPT_UPLOAD_CHUNK_TOO_LARGE', '上传分片超过允许大小');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function createScriptUploadSession(request, response, user) {
  try {
    const metadata = validateScriptDocumentMetadata(await readBodyJson(request));
    await ensureData();
    const sessions = await readScriptUploadSessions();
    const reusable = sessions.find(session => session.ownerId === user.id && session.originalName === metadata.originalName && session.bytesExpected === metadata.bytesExpected && session.sha256Expected === metadata.sha256 && ['uploading', 'verified'].includes(session.status));
    if (reusable) return json(response, 200, {code:'SCRIPT_UPLOAD_SESSION_REUSED', upload:publicScriptUploadSession(reusable)});
    const id = scriptUploadId();
    const directory = scriptUploadSessionDirectory(id);
    await fsp.mkdir(directory, {recursive:false});
    const timestamp = new Date().toISOString();
    const session = {
      id,
      ownerId:user.id,
      originalName:metadata.originalName,
      mimeType:metadata.mimeType,
      bytesExpected:metadata.bytesExpected,
      sha256Expected:metadata.sha256,
      chunkSize:scriptUploadChunkBytes,
      uploadedBytes:0,
      chunks:{},
      status:'uploading',
      directory,
      partPath:path.join(directory, 'source.part'),
      storedPath:null,
      createdAt:timestamp,
      updatedAt:timestamp,
      verifiedAt:null,
      projectId:null
    };
    sessions.push(session);
    await writeScriptUploadSessions(sessions);
    return json(response, 201, {code:'SCRIPT_UPLOAD_SESSION_CREATED', upload:publicScriptUploadSession(session)});
  } catch (error) {
    return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_UPLOAD_SESSION_FAILED', error:error.message || '无法创建 Word 上传会话'});
  }
}

async function readScriptUploadSession(request, response, user, uploadId) {
  try {
    const {session} = await ownedScriptUploadSession(uploadId, user);
    return json(response, 200, {code:'SCRIPT_UPLOAD_SESSION_READY', upload:publicScriptUploadSession(session)});
  } catch (error) {
    return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_UPLOAD_SESSION_READ_FAILED', error:error.message || '无法读取 Word 上传状态'});
  }
}

async function appendScriptUploadChunk(request, response, user, uploadId, offsetValue) {
  try {
    const offset = Number(offsetValue);
    if (!Number.isSafeInteger(offset) || offset < 0) throw createCodeError('SCRIPT_UPLOAD_OFFSET_INVALID', '上传分片位置无效');
    const {sessions, index, session} = await ownedScriptUploadSession(uploadId, user);
    if (session.status !== 'uploading') throw createCodeError('SCRIPT_UPLOAD_NOT_WRITABLE', '当前上传会话不能继续写入');
    const remaining = session.bytesExpected - offset;
    const expectedBytes = Math.min(Number(session.chunkSize || scriptUploadChunkBytes), remaining);
    if (offset >= session.bytesExpected || expectedBytes <= 0) throw createCodeError('SCRIPT_UPLOAD_OFFSET_INVALID', '上传分片位置超出文档范围');
    const chunk = await readRequestBuffer(request, expectedBytes + 1);
    const expectedHash = String(request.headers['x-niannian-chunk-sha256'] || '').toLowerCase();
    const actualHash = crypto.createHash('sha256').update(chunk).digest('hex');
    if (!validSha256(expectedHash) || actualHash !== expectedHash) throw createCodeError('SCRIPT_UPLOAD_CHUNK_HASH_MISMATCH', '上传分片校验失败，请重试该分片');
    const existing = session.chunks?.[String(offset)];
    if (existing) {
      if (existing.bytes !== chunk.length || existing.sha256 !== actualHash) throw createCodeError('SCRIPT_UPLOAD_CHUNK_CONFLICT', '该分片与已上传内容不一致');
      return json(response, 200, {code:'SCRIPT_UPLOAD_CHUNK_ALREADY_RECORDED', upload:publicScriptUploadSession(session), idempotent:true});
    }
    if (offset !== session.uploadedBytes) throw createCodeError('SCRIPT_UPLOAD_OFFSET_CONFLICT', '请从当前已上传位置继续');
    if (chunk.length !== expectedBytes) throw createCodeError('SCRIPT_UPLOAD_CHUNK_SIZE_INVALID', '上传分片大小不正确');
    const stats = await fsp.stat(session.partPath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if ((stats?.size || 0) !== session.uploadedBytes) throw createCodeError('SCRIPT_UPLOAD_STATE_CONFLICT', '上传会话状态与已接收文件不一致');
    await fsp.appendFile(session.partPath, chunk, {flag:'a'});
    session.chunks = {...(session.chunks || {}), [String(offset)]:{bytes:chunk.length,sha256:actualHash}};
    session.uploadedBytes += chunk.length;
    session.updatedAt = new Date().toISOString();
    sessions[index] = session;
    await writeScriptUploadSessions(sessions);
    return json(response, 200, {code:'SCRIPT_UPLOAD_CHUNK_ACCEPTED', upload:publicScriptUploadSession(session), idempotent:false});
  } catch (error) {
    return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_UPLOAD_CHUNK_FAILED', error:error.message || 'Word 文档分片上传失败'});
  }
}

async function completeScriptUploadSession(request, response, user, uploadId) {
  try {
    const body = await readBodyJson(request);
    const {sessions, index, session} = await ownedScriptUploadSession(uploadId, user);
    const suppliedSha256 = String(body.sha256 || '').toLowerCase();
    if (!validSha256(suppliedSha256) || suppliedSha256 !== session.sha256Expected) throw createCodeError('SCRIPT_UPLOAD_SHA_MISMATCH', '文档完整性校验不一致');
    if (session.status === 'verified' || session.status === 'consumed') return json(response, 200, {code:'SCRIPT_UPLOAD_ALREADY_VERIFIED', upload:publicScriptUploadSession(session), idempotent:true});
    if (session.status !== 'uploading' || session.uploadedBytes !== session.bytesExpected) throw createCodeError('SCRIPT_UPLOAD_INCOMPLETE', 'Word 文档尚未上传完整');
    const evidence = await sha256File(session.partPath).catch(() => null);
    if (!evidence || evidence.bytes !== session.bytesExpected || evidence.sha256 !== session.sha256Expected) throw createCodeError('SCRIPT_UPLOAD_FILE_HASH_MISMATCH', 'Word 文档完整性校验失败');
    const storedPath = path.join(scriptSourcesRoot, 'upload-' + session.id.toLowerCase() + '.docx');
    if (!isInside(scriptSourcesRoot, storedPath)) throw createCodeError('SCRIPT_UPLOAD_PATH_INVALID', 'Word 文档存储路径无效');
    await fsp.rename(session.partPath, storedPath);
    session.status = 'verified';
    session.storedPath = storedPath;
    session.verifiedAt = new Date().toISOString();
    session.updatedAt = session.verifiedAt;
    sessions[index] = session;
    await writeScriptUploadSessions(sessions);
    return json(response, 200, {code:'SCRIPT_UPLOAD_VERIFIED', upload:publicScriptUploadSession(session), idempotent:false});
  } catch (error) {
    return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_UPLOAD_COMPLETE_FAILED', error:error.message || 'Word 文档完整性校验失败'});
  }
}

async function createScriptProjectFromUpload(request, response, user) {
  let idempotencyClaimed = false;
  let idempotencyKey = null;
  let idempotencyFingerprint = null;
  try {
    const body = await readBodyJson(request);
    const input = scriptProjectInput(body);
    idempotencyKey = idempotencyKeyFromRequest(request);
    const uploadId = String(body.uploadSessionId || '');
    const {sessions, index, session} = await ownedScriptUploadSession(uploadId, user);
    if (session.status === 'consumed') throw createCodeError('SCRIPT_UPLOAD_ALREADY_CONSUMED', '这份 Word 文档已经创建过项目');
    if (session.status !== 'verified' || !session.storedPath || !isInside(scriptSourcesRoot, session.storedPath)) throw createCodeError('SCRIPT_UPLOAD_NOT_VERIFIED', '请先完成 Word 文档上传与完整性校验');
    const evidence = await sha256File(session.storedPath).catch(() => null);
    if (!evidence || evidence.bytes !== session.bytesExpected || evidence.sha256 !== session.sha256Expected) throw createCodeError('SCRIPT_UPLOAD_FILE_HASH_MISMATCH', 'Word 文档完整性校验失败');
    idempotencyFingerprint = sha256Text(JSON.stringify({scope:'script-project-from-upload',input,sourceSha256:evidence.sha256,sourceBytes:evidence.bytes,uploadId}));
    const idem = await beginWebsiteIdempotency(user, 'script-project-from-upload', idempotencyKey, idempotencyFingerprint);
    if (idem.status === 'completed' && idem.record?.projectId) {
      const existingProject = (await readScriptProjects()).find(item => item.id === idem.record.projectId && item.ownerId === user.id);
      if (existingProject) return json(response, 200, {code:'SCRIPT_PROJECT_REUSED', project:publicScriptProject(existingProject), idempotent:true});
    }
    if (idem.status === 'pending') throw createCodeError('IDEMPOTENCY_IN_PROGRESS', '相同请求正在处理中，请稍后读取项目状态');
    idempotencyClaimed = idem.status === 'claimed';
    let extracted;
    try {
      extracted = await mammoth.extractRawText({path:session.storedPath});
    } catch {
      throw createCodeError('SCRIPT_DOCUMENT_PARSE_FAILED', '无法读取该 Word 文档，请确认它是未损坏的 .docx 文件');
    }
    const sourceText = validateScriptSourceText(cleanScriptSourceText(extracted.value));
    const project = await persistScriptProject(user, input, sourceText, {
      id:scriptProjectId(),
      type:'docx',
      originalName:session.originalName,
      storedPath:session.storedPath,
      mimeType:session.mimeType,
      bytes:evidence.bytes,
      sha256:evidence.sha256,
      extraction:{engine:'mammoth@' + mammothVersion, warningCount:Array.isArray(extracted.messages) ? extracted.messages.length : 0}
    });
    session.status = 'consumed';
    session.projectId = project.id;
    session.updatedAt = new Date().toISOString();
    sessions[index] = session;
    await writeScriptUploadSessions(sessions);
    await completeWebsiteIdempotency(user, 'script-project-from-upload', idempotencyKey, idempotencyFingerprint, project.id);
    return json(response, 201, {code:'SCRIPT_PROJECT_CREATED_FROM_UPLOAD', project:publicScriptProject(project)});
  } catch (error) {
    if (idempotencyClaimed) await failWebsiteIdempotency(user, 'script-project-from-upload', idempotencyKey).catch(() => {});
    return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_UPLOAD_PROJECT_CREATE_FAILED', error:error.message || '无法从 Word 文档创建短剧项目'});
  }
}

function scriptProjectId() {
  return 'NS-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
    input.on('error', reject);
    input.on('end', resolve);
  });
  return { bytes, sha256:hash.digest('hex') };
}

function scriptParagraphs(sourceText) {
  return sourceText.split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
}

function scriptChapterIndex(paragraphs) {
  const heading = /^(?:第\s*[0-9一二三四五六七八九十百千零〇两]+\s*[章节]|chapter\s+\d+)/i;
  const starts = paragraphs.map((text, index) => heading.test(text) ? index : -1).filter(index => index >= 0);
  if (!starts.length) return [{chapterId:'C001', title:'全文', paragraphStart:1, paragraphEnd:paragraphs.length, sourceType:'derived_index'}];
  return starts.map((start, index) => ({
    chapterId:'C' + String(index + 1).padStart(3, '0'),
    title:paragraphs[start].slice(0, 120),
    paragraphStart:start + 1,
    paragraphEnd:(starts[index + 1] || paragraphs.length) > start ? (starts[index + 1] || paragraphs.length) : paragraphs.length,
    sourceType:'source_heading'
  }));
}

async function writeScriptJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const tempPath = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(tempPath, filePath);
}

async function buildScriptSourceIngest(source, sourceText) {
  const workspaceRoot = path.join(scriptWorkspacesRoot, source.id);
  const ingestRoot = path.join(workspaceRoot, 'source_ingest');
  const sourceTextPath = path.join(ingestRoot, 'source_text.txt');
  const chaptersPath = path.join(ingestRoot, 'chapter_index.json');
  const checkpointPath = path.join(ingestRoot, 'ingestion_checkpoint.json');
  const manifestPath = path.join(ingestRoot, 'source_manifest.json');
  const paragraphs = scriptParagraphs(sourceText);
  const chapters = scriptChapterIndex(paragraphs);
  const extractedTextSha256 = sha256Text(sourceText);
  await fsp.mkdir(ingestRoot, {recursive:true});
  await fsp.writeFile(sourceTextPath, sourceText + '\n', 'utf8');
  await writeScriptJson(chaptersPath, {schema_version:'niannian_script_chapter_index_v1', project_id:source.id, paragraph_count:paragraphs.length, chapters, source_type:'derived_index'});
  const chapterIndexSha256 = sha256Text(JSON.stringify({paragraph_count:paragraphs.length, chapters}));
  const checkpoint = {
    schema_version:1,
    project_id:source.id,
    status:'source_ingest_verified_canon_pending',
    current_node:'N01',
    completed:['N00 rights-confirmed intake', 'N01 source text extraction', 'N01 chapter index'],
    blockers:['CANON_LEDGER_PENDING_AI_ADAPTATION'],
    next_action:'由 AI 编剧基于带段落引用的源文本建立人物、关系、世界观与时间线事实账本。',
    updated_at:new Date().toISOString()
  };
  await writeScriptJson(checkpointPath, checkpoint);
  const manifest = {
    schema_version:'niannian_script_source_ingest_v1',
    project_id:source.id,
    source_document:{type:source.type, exact_path:source.storedPath, sha256:source.sha256, bytes:source.bytes, original_name:source.originalName || null},
    extracted_text:{exact_path:sourceTextPath, sha256:extractedTextSha256, characters:sourceText.length, paragraphs:paragraphs.length},
    chapter_index:{exact_path:chaptersPath, sha256:chapterIndexSha256, count:chapters.length},
    checkpoint_path:checkpointPath,
    status:'verified',
    allowed_consumers:['script_only_canon_ledger'],
    generated_at:new Date().toISOString()
  };
  await writeScriptJson(manifestPath, manifest);
  return {
    status:'verified',
    workspaceRoot,
    sourceTextPath,
    manifestPath,
    chapterIndexPath:chaptersPath,
    checkpointPath,
    sourceManifestSha256:sha256Text(JSON.stringify(manifest)),
    extractedTextSha256,
    chapterCount:chapters.length,
    paragraphCount:paragraphs.length
  };
}

async function persistScriptProject(user, input, sourceText, source) {
  const createdAt = new Date().toISOString();
  const textSha256 = crypto.createHash('sha256').update(sourceText, 'utf8').digest('hex');
  try {
    const workspaceProjectId = await assertWorkspaceProjectOwned(user, input.workspaceProjectId, source.id);
    const ingest = await buildScriptSourceIngest(source, sourceText);
    const project = {
      id:source.id,
      ownerId:user.id,
      workspaceProjectId:workspaceProjectId || source.id,
      name:input.name,
      genre:input.genre,
      audience:input.audience,
      episodeDuration:input.episodeDuration,
      aspectRatio:input.aspectRatio,
      createdAt,
      source:{...source, characters:sourceText.length, extractedTextSha256:source.extractedTextSha256 || textSha256},
      ingest,
      pipeline:scriptPipeline('N01'),
      runtime:{
        productionStatus:'canon_pending',
        currentNode:'N01',
        nextAction:'原文已提取并建立章节索引。等待 AI 编剧基于源文本建立人物、世界观与时间线事实账本。',
        blocker:'CANON_LEDGER_PENDING_AI_ADAPTATION',
        artifactCount:4,
        verifiedArtifactCount:4
      },
      gates:{
        rights:'confirmed',
        source_ingest:'verified',
        canon_ledger:'pending_ai_adaptation',
        direction:'pending_user_confirmation',
        image_assets:'not_started',
        video_provider:'blocked'
      }
    };
    try {
      await materializeScriptAdaptationJob(project);
    } catch (error) {
      const blockerCode = String(error.code || 'SCRIPT_ADAPTATION_JOB_FAILED').slice(0, 120);
      project.runtime = {
        ...(project.runtime || {}),
        productionStatus:'blocked_contract',
        currentNode:'N01',
        blocker:blockerCode,
        nextAction:'源文本已安全保存，但 N01 AI 编剧任务未能入队。请修复任务根或生产索引后在工作台重试。'
      };
      project.gates = {...(project.gates || {}), canon_ledger:'blocked_task_materialization', video_provider:'blocked'};
    }
    const projects = await readScriptProjects();
    projects.unshift(project);
    await writeScriptProjects(projects);
    await ensureWorkspaceBinding(user, project.workspaceProjectId, {name:project.name, scriptProjectId:project.id});
    return project;
  } catch (error) {
    await fsp.rm(path.join(scriptWorkspacesRoot, source.id), {recursive:true, force:true}).catch(() => {});
    throw error;
  }
}

function scriptDirectJobId(projectId) {
  const normalized = String(projectId || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return 'web_ns-' + normalized;
}

function appendOnce(values, value) {
  const next = Array.isArray(values) ? values.slice() : [];
  if (!next.includes(value)) next.push(value);
  return next;
}

function n04PromptArtifact(ledger) {
  const artifacts = Array.isArray(ledger?.artifacts) ? ledger.artifacts : [];
  return artifacts.find(item => item && item.artifact_id === 'n04_ep001_prompt_package_json') || artifacts.find(item => (
    item &&
    String(item.node_id || '').startsWith('N04') &&
    /step04_prompt_package\.json$/i.test(String(item.exact_path || ''))
  )) || null;
}

function n04NamedArtifact(ledger, artifactId) {
  const artifacts = Array.isArray(ledger?.artifacts) ? ledger.artifacts : [];
  return artifacts.find(item => item && item.artifact_id === artifactId) || null;
}

async function loadScriptN04Review(project) {
  const localJobId = String(project.runtime?.workerJob?.localJobId || scriptDirectJobId(project.id)).trim();
  if (!/^web_ns-[a-z0-9-]+$/.test(localJobId)) throw createCodeError('SCRIPT_N04_REVIEW_NOT_READY', '当前小说项目还没有可审核的本地短剧任务');
  const jobRoot = path.join(directJobsRoot, localJobId);
  if (!isInside(directJobsRoot, jobRoot)) throw createCodeError('SCRIPT_N04_REVIEW_NOT_READY', '本地短剧任务路径不在允许的任务根目录内');
  const [task, status, checkpoint, dashboard, ledger, result] = await Promise.all([
    readJsonFile(path.join(jobRoot, 'task.json')),
    readJsonFile(path.join(jobRoot, 'status.json')),
    readJsonFile(path.join(jobRoot, 'checkpoint.json')),
    readJsonFile(path.join(jobRoot, 'gate_dashboard.json')),
    readJsonFile(path.join(jobRoot, 'artifact_ledger.json')),
    readJsonFile(path.join(jobRoot, 'result_manifest.json'))
  ]);
  if (!task || !dashboard || !ledger || !task.source_script) throw createCodeError('SCRIPT_N04_REVIEW_NOT_READY', '本地短剧任务缺少审核所需的合同或质量门');
  if (task.job_id !== localJobId || task.remote_job_id !== project.id) throw createCodeError('SCRIPT_N04_REVIEW_CONTRACT_MISMATCH', '网站项目与本地短剧任务合同不匹配');
  const sourceEvidence = await sha256File(project.source.storedPath).catch(() => null);
  if (!sourceEvidence || sourceEvidence.sha256 !== task.source_script.sha256) throw createCodeError('SCRIPT_N04_REVIEW_SOURCE_MISMATCH', '网站文本与本地短剧任务源文本哈希不一致');
  const packageArtifact = n04PromptArtifact(ledger);
  if (!packageArtifact || !packageArtifact.exact_path || !isInside(jobRoot, packageArtifact.exact_path)) {
    throw createCodeError('SCRIPT_N04_REVIEW_NOT_READY', 'N04 提示词包不在当前短剧任务的允许目录内');
  }
  const promptPackage = await readJsonFile(packageArtifact.exact_path);
  const packageSha = await sha256File(packageArtifact.exact_path).catch(() => null);
  const firstFrameArtifact = n04NamedArtifact(ledger, 'n04_ep001_first_frame_plan');
  const videoGroupsArtifact = n04NamedArtifact(ledger, 'n04_ep001_video_groups');
  if (!firstFrameArtifact?.exact_path || !videoGroupsArtifact?.exact_path || !isInside(jobRoot, firstFrameArtifact.exact_path) || !isInside(jobRoot, videoGroupsArtifact.exact_path)) {
    throw createCodeError('SCRIPT_N04_REVIEW_NOT_READY', 'N04 首帧计划或视频分组不在当前短剧任务的允许目录内');
  }
  const [firstFramePlan, videoGroups, firstFrameSha, videoGroupsSha] = await Promise.all([
    readJsonFile(firstFrameArtifact.exact_path),
    readJsonFile(videoGroupsArtifact.exact_path),
    sha256File(firstFrameArtifact.exact_path).catch(() => null),
    sha256File(videoGroupsArtifact.exact_path).catch(() => null)
  ]);
  if (
    !promptPackage || promptPackage.job_id !== localJobId || !packageSha || packageArtifact.sha256 !== packageSha.sha256 ||
    !firstFramePlan || firstFramePlan.job_id !== localJobId || !firstFrameSha || firstFrameArtifact.sha256 !== firstFrameSha.sha256 || !Array.isArray(firstFramePlan.frames) ||
    !videoGroups || videoGroups.job_id !== localJobId || !videoGroupsSha || videoGroupsArtifact.sha256 !== videoGroupsSha.sha256 || !Array.isArray(videoGroups.groups)
  ) {
    throw createCodeError('SCRIPT_N04_REVIEW_NOT_READY', 'N04 提示词包、首帧计划或分组计划不完整，不能在网站中授权');
  }
  const assetRegistryPath = path.join(path.dirname(packageArtifact.exact_path), 'asset_registry.json');
  const assetRegistry = isInside(jobRoot, assetRegistryPath) ? await readJsonFile(assetRegistryPath) : null;
  const reviewAssets = assetRegistry && assetRegistry.job_id === localJobId && Array.isArray(assetRegistry.assets) ? assetRegistry.assets : [];
  const n05CandidateArtifact = n04NamedArtifact(ledger, 'n05_ep001_candidate_review_manifest');
  const n05QaArtifact = n04NamedArtifact(ledger, 'n05_ep001_automatic_visual_qa');
  let n05CandidateManifest = null;
  let n05Qa = null;
  if (n05CandidateArtifact?.exact_path && n05QaArtifact?.exact_path) {
    if (!isInside(jobRoot, n05CandidateArtifact.exact_path) || !isInside(jobRoot, n05QaArtifact.exact_path)) {
      throw createCodeError('SCRIPT_N05_CANDIDATE_PATH_INVALID', 'N05 候选清单或质量检查不在当前任务目录内');
    }
    const [candidateData, qaData, candidateSha, qaSha] = await Promise.all([
      readJsonFile(n05CandidateArtifact.exact_path),
      readJsonFile(n05QaArtifact.exact_path),
      sha256File(n05CandidateArtifact.exact_path).catch(() => null),
      sha256File(n05QaArtifact.exact_path).catch(() => null)
    ]);
    if (
      !candidateData || candidateData.job_id !== localJobId || !Array.isArray(candidateData.items) ||
      !candidateSha || candidateSha.sha256 !== n05CandidateArtifact.sha256 ||
      !qaData || !Array.isArray(qaData.items) || !qaSha || qaSha.sha256 !== n05QaArtifact.sha256
    ) {
      throw createCodeError('SCRIPT_N05_CANDIDATE_CONTRACT_MISMATCH', 'N05 候选清单或质量检查哈希不一致');
    }
    const candidateFiles = await Promise.all(candidateData.items.map(async item => {
      const exactPath = String(item.exact_path || '');
      if (!exactPath || !isInside(jobRoot, exactPath)) throw createCodeError('SCRIPT_N05_CANDIDATE_PATH_INVALID', 'N05 候选图片不在当前任务目录内');
      const evidence = await sha256File(exactPath).catch(() => null);
      if (!evidence || evidence.sha256 !== String(item.sha256 || '').toLowerCase() || evidence.bytes !== Number(item.bytes || 0)) {
        throw createCodeError('SCRIPT_N05_CANDIDATE_HASH_MISMATCH', 'N05 候选图片哈希或字节数不一致');
      }
      return {...item, verified_file:evidence};
    }));
    n05CandidateManifest = {...candidateData, items:candidateFiles};
    n05Qa = qaData;
  }
  const n05DecisionPath = path.join(jobRoot, '00_AUTHORITY', 'n05_candidate_decisions.json');
  const n05Decisions = await readJsonFile(n05DecisionPath, {items:[]});
  const n05RegenerationQueuePath = path.join(jobRoot, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json');
  const n05RegenerationQueue = await readJsonFile(n05RegenerationQueuePath, {items:[]});
  const authorizationPath = path.join(jobRoot, '00_AUTHORITY', 'n04_review_authorization.json');
  const authorization = await readJsonFile(authorizationPath);
  const authorizationValid = Boolean(
    authorization &&
    authorization.job_id === localJobId &&
    authorization.remote_job_id === project.id &&
    authorization.prompt_package_sha256 === packageSha.sha256 &&
    authorization.authorization_scope?.n05_whole_image_candidate_generation === true &&
    authorization.provider_submit === false &&
    authorization.package_send === false &&
    authorization.registry_promotion === false
  );
  return {
    jobRoot,
    localJobId,
    task,
    status:status || {},
    checkpoint:checkpoint || {},
    dashboard,
    ledger,
    result:result || {},
    packageArtifact,
    promptPackage,
    packageSha,
    firstFramePlan,
    videoGroups,
    reviewAssets,
    n05CandidateManifest,
    n05Qa,
    n05DecisionPath,
    n05Decisions,
    n05RegenerationQueuePath,
    n05RegenerationQueue,
    authorization:authorizationValid ? authorization : null,
    authorizationPath
  };
}

function publicScriptN04Review(review) {
  const packageData = review.promptPackage || {};
  const frames = Array.isArray(review.firstFramePlan?.frames) ? review.firstFramePlan.frames : [];
  const groups = Array.isArray(review.videoGroups?.groups) ? review.videoGroups.groups : [];
  const decisions = new Map((Array.isArray(review.n05Decisions?.items) ? review.n05Decisions.items : []).map(item => [String(item.id || ''), item]));
  const regenerationRequests = new Map((Array.isArray(review.n05RegenerationQueue?.items) ? review.n05RegenerationQueue.items : []).map(item => [String(item.candidate_id || ''), item]));
  const candidates = Array.isArray(review.n05CandidateManifest?.items) ? review.n05CandidateManifest.items : [];
  return {
    episodeId:String(packageData.episode_id || 'EP001'),
    reviewStatus:candidates.length ? 'n05_candidates_awaiting_user_confirmation' : (review.authorization ? 'n05_authorized_waiting_execution' : 'pending_user_visual_review'),
    visualDirection:packageData.visual_direction || {},
    reviewRequired:Array.isArray(packageData.review_required) ? packageData.review_required : [],
    physicalLightContract:String(review.firstFramePlan?.physical_light_contract || review.videoGroups?.global_physical_light_contract || ''),
    assets:(review.reviewAssets || []).map(asset => ({
      assetId:String(asset.asset_id || ''),
      type:String(asset.type || ''),
      priority:String(asset.priority || ''),
      scope:String(asset.scope || ''),
      generationStatus:String(asset.generation_status || 'planned_not_generated'),
      userConfirmed:Boolean(asset.user_confirmed),
      uploadEligible:Boolean(asset.upload_eligible),
      referenceDuty:String(asset.chinese_reference_duty || '')
    })),
    n05Candidates:candidates.map(item => {
      const decision = decisions.get(String(item.id || '')) || {};
      const regeneration = regenerationRequests.get(String(item.id || '')) || null;
      return {
        id:String(item.id || ''),
        dimensions:String(item.dimensions || ''),
        qaScore:Number(item.qa_score || 0),
        qaStatus:String(item.qa_status || ''),
        referenceDuty:String(item.chinese_reference_duty || ''),
        imageUrl:'/api/script-projects/' + encodeURIComponent(review.task.remote_job_id || '') + '/n05-candidates/' + encodeURIComponent(String(item.id || '')) + '/image',
        decision:String(decision.decision || 'pending'),
        decisionReason:String(decision.reason || ''),
        regenerationRequest:regeneration ? {
          status:String(regeneration.status || ''),
          requestedAt:String(regeneration.requested_at || ''),
          reason:String(regeneration.reason || '')
        } : null,
        userConfirmed:decision.decision === 'confirm',
        uploadEligible:decision.decision === 'confirm' && decision.sha256 === item.sha256
      };
    }),
    n05Summary:review.n05CandidateManifest ? {
      status:String(review.n05CandidateManifest.status || ''),
      candidateCount:candidates.length,
      confirmedCount:candidates.filter(item => decisions.get(String(item.id || ''))?.decision === 'confirm').length,
      pendingCount:candidates.filter(item => !decisions.has(String(item.id || '')) || decisions.get(String(item.id || ''))?.decision === 'pending').length,
      rejectedCount:candidates.filter(item => ['reject', 'regenerate'].includes(decisions.get(String(item.id || ''))?.decision)).length,
      videoSubmitAllowed:false
    } : null,
    firstFrames:frames.map(frame => ({
      refKey:String(frame.ref_key || ''),
      videoGroupId:String(frame.video_group_id || ''),
      startShotId:String(frame.start_shot_id || ''),
      composition:String(frame.composition || ''),
      characterState:String(frame.character_state || ''),
      lightReasoning:String(frame.light_reasoning || ''),
      assetDependencies:Array.isArray(frame.asset_dependencies) ? frame.asset_dependencies : [],
      referenceDuty:String(frame.reference_duty || ''),
      generationPrompt:String(frame.generation_prompt || ''),
      userConfirmed:Boolean(frame.user_confirmed),
      uploadEligible:Boolean(frame.upload_eligible)
    })),
    videoGroups:groups.map(group => ({
      videoGroupId:String(group.video_group_id || ''),
      durationSec:Number(group.duration_sec || 0),
      shots:Array.isArray(group.shots) ? group.shots : [],
      factCard:{
        cameraAndComposition:String(group.current_shot_fact_card?.camera_and_composition || ''),
        visibleSubjectsAndBlocking:String(group.current_shot_fact_card?.visible_subjects_and_blocking || ''),
        handActionAndProps:String(group.current_shot_fact_card?.hand_action_and_props || ''),
        imageCenter:String(group.current_shot_fact_card?.image_center || ''),
        continuity:String(group.current_shot_fact_card?.continuity || '')
      },
      referencePlan:{
        primaryFirstFrameRefKey:String(group.reference_plan?.primary_first_frame_ref_key || ''),
        laterRequiredRefs:Array.isArray(group.reference_plan?.later_required_refs) ? group.reference_plan.later_required_refs : [],
        confirmedRefs:Array.isArray(group.reference_plan?.confirmed_refs) ? group.reference_plan.confirmed_refs : []
      },
      channelPrompt2part:String(group.channel_prompt_2part || '')
    })),
    authorization:review.authorization ? {
      status:'authorized',
      authorizationId:review.authorization.authorization_id,
      authorizedAt:review.authorization.authorized_at,
      scope:'仅 N05：按当前 N04 包整图生成角色、场景、房门与五张真首帧候选；不提交视频。'
    } : {
      status:'not_authorized',
      scope:'需要在网站中明确确认视觉方向并授权 N05 候选图生成；不会提交视频、打包、发送或提升 registry。'
    }
  };
}

function scriptActivityAt(value, fallback) {
  const timestamp = new Date(value || fallback || Date.now());
  return Number.isNaN(timestamp.getTime()) ? new Date(fallback || Date.now()).toISOString() : timestamp.toISOString();
}

function scriptActivityText(value, fallback = '') {
  return String(value || fallback).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function scriptActivityStageCopy(node) {
  const normalized = scriptNodeId(node, 'N01');
  const copy = {
    N01:{title:'原文与改编权', description:'原文已校验，正在整理故事事实与分集基础。'},
    N02:{title:'角色与分集', description:'正在核对角色、场景与首集节拍。'},
    N03:{title:'分镜规划', description:'正在整理镜头事实、首帧职责与连续性。'},
    N04:{title:'视觉方案审核', description:'当前方案用于审核，等待视觉方向确认。'},
    N05:{title:'候选审核', description:'候选版本需经网站确认后才能作为后续参考。'},
    N06:{title:'视频准备', description:'视频规格与参考需满足质量门后才能进入真实执行。'},
    N07:{title:'交付验收', description:'只有真实媒体和质量校验齐全后才会进入交付验收。'}
  };
  return copy[normalized] || copy.N01;
}

function scriptActivityCandidateDuty(candidate, fallback) {
  const duty = scriptActivityText(candidate?.chinese_reference_duty || candidate?.reference_duty || '');
  return duty || fallback;
}

async function loadPublicScriptProjectActivity(project) {
  const runtime = project.runtime || {};
  const events = [
    {
      id:'project-created',
      at:scriptActivityAt(project.createdAt),
      kind:'source',
      tone:'ready',
      title:'项目已创建',
      description:'已导入原文，并确认拥有该内容的使用与改编权限。'
    },
    {
      id:'current-stage',
      at:scriptActivityAt(runtime.checkpointUpdatedAt || project.updatedAt, project.createdAt),
      kind:'progress',
      tone:runtime.blocker ? 'waiting' : 'active',
      title:'当前制作进度：' + scriptActivityStageCopy(runtime.currentNode).title,
      description:runtime.blocker ? '当前步骤暂未放行，等待必要条件完成。' : scriptActivityStageCopy(runtime.currentNode).description
    }
  ];
  try {
    const review = await loadScriptN04Review(project);
    const candidates = Array.isArray(review.n05CandidateManifest?.items) ? review.n05CandidateManifest.items : [];
    const candidatesById = new Map(candidates.map(candidate => [String(candidate.id || ''), candidate]));
    if (review.authorization) {
      events.push({
        id:'visual-scope-authorized',
        at:scriptActivityAt(review.authorization.authorized_at, runtime.checkpointUpdatedAt || project.updatedAt),
        kind:'review',
        tone:'ready',
        title:'视觉方案已确认',
        description:'当前方案已进入候选审核流程，视频执行仍由后续质量门控制。'
      });
    }
    const decisions = Array.isArray(review.n05Decisions?.items) ? review.n05Decisions.items : [];
    for (const decision of decisions) {
      const candidate = candidatesById.get(String(decision.id || ''));
      const duty = scriptActivityCandidateDuty(candidate, '该候选');
      const decisionCopy = decision.decision === 'confirm'
        ? {title:'候选已确认', description:duty + ' 已确认，可作为后续参考。', tone:'ready'}
        : (decision.decision === 'regenerate'
          ? {title:'候选已请求重做', description:duty + ' 的问题已记录，等待新版本返回审核。', tone:'waiting'}
          : {title:'候选已否决', description:duty + ' 已保留审核结论，暂不进入后续参考。', tone:'waiting'});
      events.push({
        id:'candidate-decision-' + scriptActivityText(decision.decided_at, 'unknown'),
        at:scriptActivityAt(decision.decided_at, runtime.checkpointUpdatedAt || project.updatedAt),
        kind:'review',
        ...decisionCopy
      });
    }
    const n06State = await readJsonFile(scriptN06StatePath(review), {groups:{}});
    const groups = n06State && typeof n06State.groups === 'object' && n06State.groups ? Object.values(n06State.groups) : [];
    for (const group of groups) {
      const status = String(group?.status || '');
      if (status === 'dry_run_intent_recorded') {
        events.push({
          id:'video-spec-' + scriptActivityText(group.updated_at, 'recorded'),
          at:scriptActivityAt(group.updated_at, runtime.checkpointUpdatedAt || project.updatedAt),
          kind:'video',
          tone:'waiting',
          title:'视频规格已记录',
          description:'当前版本已确认，等待网站执行条件与真实任务回执。'
        });
      } else if (status === 'real_submit_prepared') {
        events.push({
          id:'video-dispatch-prepared-' + scriptActivityText(group.updated_at, 'prepared'),
          at:scriptActivityAt(group.updated_at, runtime.checkpointUpdatedAt || project.updatedAt),
          kind:'video',
          tone:'waiting',
          title:'视频执行已准备',
          description:'当前版本正在等待网站对本次执行条件的确认。'
        });
      }
    }
  } catch {
    // A timeline is a projection only. Missing review artifacts must not expose an internal error or block the project.
  }
  const deduped = new Map();
  for (const event of events) {
    const key = [event.id, event.at, event.title].join('|');
    if (!deduped.has(key)) deduped.set(key, event);
  }
  return {
    generatedAt:new Date().toISOString(),
    projectUpdatedAt:String(project.updatedAt || project.createdAt || ''),
    events:Array.from(deduped.values()).sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 24)
  };
}

function scriptN06StatePath(review) {
  return path.join(review.jobRoot, '00_AUTHORITY', 'n06_video_generation_state.json');
}

function scriptN06AdapterContractPath(review) {
  return path.join(review.jobRoot, '00_AUTHORITY', 'n06_mimo_adapter_contract.json');
}

function scriptN06EmployeeDispatchRoot(review, groupId) {
  return path.join(review.jobRoot, '06_N06_EXECUTION', groupId, 'employee_dispatch');
}

function scriptN06EmployeeDispatchPath(review, groupId) {
  return path.join(scriptN06EmployeeDispatchRoot(review, groupId), 'employee_dispatch.json');
}

function scriptN06EmployeeReturnRoot(review, groupId) {
  return path.join(review.jobRoot, '06_N06_EXECUTION', groupId, 'mac_employee_return');
}

function selectMacN06Employee(jobId, transactionId) {
  const hash = crypto.createHash('sha256').update(String(jobId) + '|' + String(transactionId)).digest('hex');
  return macN06Employees[Number.parseInt(hash.slice(0, 8), 16) % macN06Employees.length];
}

async function currentMacEmployeeAuthorityHashes() {
  const [agents, matrix, manifest] = await Promise.all([
    sha256File(macEmployeeAgentsPath),
    sha256File(macEmployeeRouteMatrixPath),
    sha256File(macSkillBundleManifestPath)
  ]);
  return {
    agents:{exact_path:'/Users/lsb/AI-Brain/niannian-ai-canonical-local/AGENTS.md',sha256:agents.sha256},
    route_matrix:{exact_path:'/Users/lsb/AI-Brain/niannian-ai-canonical-local/bridge/mac-employee-training/route_matrix.json',sha256:matrix.sha256},
    skill_bundle_manifest:{exact_path:'/Users/lsb/AI-Brain/niannian-ai-canonical-local/bridge/mac-skill-bundles/niannian-mac-production-skills-v1.manifest.json',sha256:manifest.sha256}
  };
}

function publicN06EmployeeDispatch(dispatch) {
  if (!dispatch || typeof dispatch !== 'object') return null;
  return {
    status:String(dispatch.status || ''),
    testOnly:dispatch.test_only === true,
    realDelivery:dispatch.real_delivery === true,
    updatedAt:dispatch.completed_at || dispatch.prepared_at || null
  };
}

async function scriptN06RealReceiptReady(review, groupId, stored) {
  const summary=stored?.receipt;
  if(!summary||summary.status!=='qa_passed'||summary.test_only===true||!summary.receipt_path||!isInside(review.jobRoot,summary.receipt_path))return false;
  const receipt=await readJsonFile(summary.receipt_path,null);
  if(!receipt||receipt.schema_version!=='niannian_n06_provider_receipt_v1'||receipt.job_id!==review.localJobId||receipt.group_id!==groupId||receipt.status!=='qa_passed'||receipt.test_only!==false||receipt.real_delivery_qa_passed!==true)return false;
  if(receipt.media_provider_network_requested!==true||receipt.media_provider_submit_requested!==true||!receipt.provider_task_id)return false;
  const download=receipt.download||{};
  const filePath=String(download.exact_path||'');
  if(!filePath||!isInside(review.jobRoot,filePath))return false;
  const evidence=await sha256File(filePath).catch(()=>null);
  if(!evidence||evidence.sha256!==String(download.sha256||'').toLowerCase()||evidence.bytes!==Number(download.bytes||0))return false;
  return /^passed|qa_passed/i.test(String(receipt.ffprobe?.status||''))&&/^passed|qa_passed/i.test(String(receipt.visual_qa?.status||''));
}

function n06SafeGroupId(value) {
  const groupId = String(value || '').trim().toUpperCase();
  if (!/^V\d{3}$/.test(groupId)) throw createCodeError('SCRIPT_N06_GROUP_INVALID', '视频组编号无效');
  return groupId;
}

function scriptN06QualityDecision(value) {
  const decision = String(value || '').trim();
  if (!['keep_720p_hard_gate', 'accept_mimo_uncommitted_resolution'].includes(decision)) {
    throw createCodeError('SCRIPT_N06_QUALITY_DECISION_REQUIRED', '请明确选择“保持 720p 严格质量门”或“接受 Mimo 未承诺分辨率”；不能把 720p/1080p 伪装为渠道可选规格。');
  }
  return decision;
}

function mimoN06Adapter() {
  const reject = operation => {
    throw createCodeError('SCRIPT_N06_PROVIDER_DRY_RUN', 'Mimo ' + operation + ' 在本地 dry-run 候选中被硬性关闭；没有发生上传、提交、轮询或下载。');
  };
  return {
    provider:'mimo',
    executionEnabled:false,
    credentialAccess:'forbidden',
    allowedOperations:['validate_spec','record_dry_run_intent'],
    blockedOperations:['upload','submit','poll','download'],
    validateSpec(spec) {
      if (!spec || spec.provider !== 'mimo' || spec.execution_mode !== 'dry_run_no_submit') {
        throw createCodeError('SCRIPT_N06_MIMO_ONLY_REQUIRED', 'N06 仅允许 Mimo dry-run 合同，不能改用其他渠道。');
      }
      return {provider:'mimo', executionEnabled:false, credentialAccess:'forbidden'};
    },
    upload() { reject('上传'); },
    submit() { reject('提交'); },
    poll() { reject('轮询'); },
    download() { reject('下载'); }
  };
}

function n06FakeTransportEnabled() {
  return String(process.env.NIANNIAN_N06_FAKE_TRANSPORT || '').toLowerCase() === 'on';
}

function n06MacAppCarrierEnabled() {
  return String(process.env.NIANNIAN_N06_MAC_APP_CARRIER || '').toLowerCase() === 'on';
}

function parseN06CarrierResult(value) {
  for (const line of String(value || '').split(/\r?\n/).reverse()) {
    try { const parsed = JSON.parse(line); if (parsed?.ok === true) return parsed; } catch {}
  }
  throw createCodeError('SCRIPT_N06_MAC_CARRIER_RESULT_MISSING', 'Mac phase carrier 未返回可验证结果。');
}

function terminateN06CarrierProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    try { const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true, stdio:'ignore'}); killer.unref(); }
    catch { try { child.kill(); } catch {} }
  } else {
    try { child.kill('SIGTERM'); } catch {}
  }
}

function runN06MacAppCarrier(dispatch, returnRoot, response) {
  return new Promise((resolve, reject) => {
    const carrierPath = path.join(root, 'bridge', 'niannian_n06_windows_mac_phase_carrier.js');
    const args = [carrierPath,'--package',dispatch.transport_export.package_root,'--manifest-sha',dispatch.transport_export.manifest_sha256,'--windows-return',returnRoot];
    const child = spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout=''; let stderr=''; let settled=false;
    const onResponseClose=()=>{if(!response?.writableEnded){terminateN06CarrierProcessTree(child);finish(createCodeError('SCRIPT_N06_MAC_CARRIER_CLIENT_DISCONNECTED','客户端已断开，受限 carrier 进程树已终止。'));}};
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);response?.removeListener('close',onResponseClose);if(error)reject(error);else resolve(result);};
    const timer=setTimeout(()=>{terminateN06CarrierProcessTree(child);finish(createCodeError('SCRIPT_N06_MAC_CARRIER_TIMEOUT','Mac App 员工测试链路超时，进程树已终止。'));},30*60*1000);
    response?.once('close',onResponseClose);
    child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString('utf8')).slice(-1024*1024);});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString('utf8')).slice(-1024*1024);});
    child.on('error',error=>finish(createCodeError('SCRIPT_N06_MAC_CARRIER_START_FAILED',error.message)));
    child.on('close',code=>{
      if(code!==0)return finish(createCodeError('SCRIPT_N06_MAC_CARRIER_FAILED',stderr.trim().slice(-2000)||'Mac phase carrier 执行失败。'));
      try{finish(null,parseN06CarrierResult(stdout));}catch(error){finish(error);}
    });
  });
}

function mimoN06ExecutionTransport(jobRoot) {
  if (!n06FakeTransportEnabled()) return mimoN06Adapter();
  const outputRoot = path.join(jobRoot, '06_N06_EXECUTION', 'fake_mimo_transport');
  return {
    provider:'mimo', executionEnabled:true, testOnly:true, credentialAccess:'forbidden',
    async upload(spec) { return {upload_id:'fake-upload-' + spec.group_id.toLowerCase(), reference_count:spec.references.length}; },
    async generate(spec) { return {provider_task_id:'fake-mimo-' + spec.group_id.toLowerCase() + '-' + spec.transaction_id.toLowerCase()}; },
    async poll(task) { return {...task, status:'succeeded'}; },
    async download(task) {
      await fsp.mkdir(outputRoot, {recursive:true});
      const outputPath = path.join(outputRoot, task.provider_task_id + '.mp4');
      await fsp.writeFile(outputPath, Buffer.from('NIANNIAN_N06_FAKE_MP4_TEST_ONLY\n', 'utf8'));
      return {exact_path:outputPath, media:{width:720,height:1280,duration_sec:11,codec:'fake-h264'}, test_only:true};
    },
    async inspect(download) { return {status:'passed_test_stub', ...download.media, ffprobe_invoked:false, test_only:true}; },
    async visualQa() { return {status:'passed_test_stub', score:100, test_only:true}; }
  };
}

async function revalidateScriptN06Spec(n06, groupId) {
  const state = await readJsonFile(n06.statePath, {groups:{}});
  const stored = state.groups?.[groupId];
  if (!stored?.spec_path || !isInside(n06.review.jobRoot, stored.spec_path)) throw createCodeError('SCRIPT_N06_SPEC_NOT_READY', '当前视频组没有可执行的 N06 精确规格。');
  const spec = await readJsonFile(stored.spec_path);
  const evidence = await sha256File(stored.spec_path).catch(() => null);
  if (!spec || !evidence || evidence.sha256 !== stored.spec_sha256 || spec.project_id !== n06.projectId || spec.job_id !== n06.jobId || spec.group_id !== groupId || spec.provider !== 'mimo') throw createCodeError('SCRIPT_N06_SPEC_REVALIDATION_FAILED', 'N06 规格、项目或哈希不一致。');
  const source = await sha256File(n06.review.task.source_script.exact_path).catch(() => null);
  if (!source || source.sha256 !== n06.review.task.source_script.sha256) throw createCodeError('SCRIPT_N06_SOURCE_REVALIDATION_FAILED', '源文本哈希已变化，拒绝执行。');
  for (const reference of spec.references || []) {
    if (!reference.uploadEligible || !reference.path || !reference.sha256 || !isInside(n06.review.jobRoot, reference.path)) throw createCodeError('SCRIPT_N06_REFERENCE_REVALIDATION_FAILED', '参考职责或确认状态不完整。');
    const hash = await sha256File(reference.path).catch(() => null);
    if (!hash || hash.sha256 !== reference.sha256) throw createCodeError('SCRIPT_N06_REFERENCE_REVALIDATION_FAILED', '参考图哈希已变化，拒绝执行。');
  }
  return {state, stored, spec};
}

async function executeScriptN06Worker(project, groupId) {
  let n06;
  try {
    n06 = await loadScriptN06Review(project);
  } catch (error) {
    if (['SCRIPT_N05_CANDIDATE_HASH_MISMATCH','SCRIPT_N05_CANDIDATE_PATH_INVALID'].includes(error.code)) {
      throw createCodeError('SCRIPT_N06_REFERENCE_REVALIDATION_FAILED', 'N06 执行前参考资产的路径、哈希或版本已变化。');
    }
    throw error;
  }
  groupId = n06SafeGroupId(groupId);
  if (!['V001','V002'].includes(groupId)) throw createCodeError('SCRIPT_N06_GROUP_NOT_SUPPORTED', '本轮只支持 V001/V002 执行合同。');
  if (groupId === 'V002') {
    const state = await readJsonFile(n06.statePath, {groups:{}});
    if (!(await scriptN06RealReceiptReady(n06.review, 'V001', state.groups?.V001))) {
      throw createCodeError('SCRIPT_N06_V002_UPSTREAM_BLOCKED', 'V002 必须等待 V001 的真实非测试 receipt、真实媒体与 QA 通过。');
    }
  }
  const verified = await revalidateScriptN06Spec(n06, groupId);
  const transport = mimoN06ExecutionTransport(n06.review.jobRoot);
  if (!transport.executionEnabled) throw createCodeError('SCRIPT_N06_PROVIDER_EXECUTION_DISABLED', 'Mimo 真实执行仍被硬性关闭；没有读取凭据、上传、提交、轮询或下载。');
  const timestamp = new Date().toISOString();
  const upload = await transport.upload(verified.spec);
  const generated = await transport.generate(verified.spec, upload);
  const polled = await transport.poll(generated);
  const downloaded = await transport.download(polled);
  const probe = await transport.inspect(downloaded);
  const visualQa = await transport.visualQa(downloaded, verified.spec);
  const artifact = await sha256File(downloaded.exact_path);
  const receipt = {schema_version:'niannian_n06_provider_receipt_v1',project_id:project.id,job_id:n06.jobId,group_id:groupId,provider:'mimo',provider_task_id:polled.provider_task_id,status:'qa_passed',test_only:Boolean(transport.testOnly),employee_model_channel:{requested:false,used:false},media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,upload,download:{exact_path:downloaded.exact_path,sha256:artifact.sha256,bytes:artifact.bytes},ffprobe:probe,visual_qa:visualQa,created_at:timestamp};
  const receiptPath = path.join(n06.review.jobRoot, '06_N06_EXECUTION', groupId, 'employee_worker_receipt.json');
  await writeScriptJson(receiptPath, receipt);
  verified.state.groups[groupId] = {...verified.stored,status:'qa_passed',provider_task_id:polled.provider_task_id,receipt:{status:'qa_passed',test_only:Boolean(transport.testOnly),provider_task_id:polled.provider_task_id,receipt_path:receiptPath,updated_at:timestamp},qa:{status:'qa_passed',ffprobe:probe.status,visual:visualQa.status},updated_at:timestamp};
  const ledger = n06.review.ledger; ledger.artifacts = (ledger.artifacts || []).filter(item => item.artifact_id !== 'n06_' + groupId.toLowerCase() + '_provider_media'); ledger.artifacts.push({artifact_id:'n06_' + groupId.toLowerCase() + '_provider_media',node_id:'N06_' + groupId + '_execution',exact_path:downloaded.exact_path,sha256:artifact.sha256,bytes:artifact.bytes,status:'test_only_qa_passed',downstream_consumable_by:[]});
  const dashboard = n06.review.dashboard; dashboard.current_node='N06_' + groupId + '_qa_passed'; dashboard.overall_status='n06_test_transport_qa_passed'; dashboard.gates={...(dashboard.gates||{}),N06:{status:'test_transport_qa_passed'},provider_submit:{status:'test_only_fake_transport'},package_send:{status:'blocked'},accepted_registry_promotion:{status:'blocked'}};
  const checkpoint = {...(n06.review.checkpoint||{}),job_id:n06.jobId,status:'n06_test_transport_qa_passed',current_step:'N06_' + groupId + '_fake_transport_complete',completed:[...new Set([...(n06.review.checkpoint?.completed || []),'N06 exact reference SHA revalidated','N06 fake Mimo upload/generate/poll/download','N06 fake ffprobe and visual QA passed'])],blockers:['REAL_MIMO_PROVIDER_EXECUTION_DISABLED','PACKAGE_SEND_AND_REGISTRY_BLOCKED'],next_action:groupId === 'V001' ? 'V001 receipt 与 QA 已通过测试合同；V002 可进入独立 dry-run 规格确认。' : '测试合同完成；真实渠道仍关闭。',updated_at:timestamp};
  const result = {...(n06.review.result||{}),status:'N06_' + groupId + '_TEST_TRANSPORT_QA_PASSED',success:false,packaged:false,transport_success:false,user_visible_acceptance:false,test_only:true,employee_model_channel:{requested:false,used:false},media_provider_network_requested:false,media_provider_submit_requested:false,provider_task_id:polled.provider_task_id,updated_at:timestamp};
  await Promise.all([writeScriptJson(n06.statePath,verified.state),writeScriptJson(path.join(n06.review.jobRoot,'artifact_ledger.json'),ledger),writeScriptJson(path.join(n06.review.jobRoot,'checkpoint.json'),checkpoint),writeScriptJson(path.join(n06.review.jobRoot,'gate_dashboard.json'),dashboard),writeScriptJson(path.join(n06.review.jobRoot,'result_manifest.json'),result),writeScriptJson(path.join(n06.review.jobRoot,'status.json'),{...(n06.review.status||{}),status:'n06_test_transport_qa_passed',current_node:dashboard.current_node,updated_at:timestamp})]);
  return loadScriptN06Review(project);
}

function scriptN06ReferencePlan(review, group) {
  const candidates = new Map((review.n05CandidateManifest?.items || []).map(item => [String(item.id || ''), item]));
  const decisions = new Map((review.n05Decisions?.items || []).map(item => [String(item.id || ''), item]));
  const referenceKeys = [
    String(group.reference_plan?.primary_first_frame_ref_key || '').trim(),
    ...(Array.isArray(group.reference_plan?.later_required_refs) ? group.reference_plan.later_required_refs.map(value => String(value || '').trim()) : [])
  ].filter(Boolean);
  return referenceKeys.map(refKey => {
    const candidate = candidates.get(refKey);
    const decision = decisions.get(refKey);
    const confirmed = Boolean(candidate && decision?.decision === 'confirm' && decision.sha256 === candidate.sha256);
    return {
      refKey,
      duty:refKey === String(group.reference_plan?.primary_first_frame_ref_key || '') ? '首帧构图与开场镜头锚点' : '后续镜头的连续性参考',
      path:confirmed ? String(candidate.exact_path || '') : null,
      artifactName:confirmed ? path.basename(String(candidate.exact_path || '')) : null,
      sha256:confirmed ? String(candidate.sha256 || '') : null,
      confirmed,
      uploadEligible:confirmed,
      state:confirmed ? 'confirmed_exact_sha' : (candidate ? 'awaiting_exact_sha_confirmation' : 'missing_candidate')
    };
  });
}

async function loadScriptN06Review(project) {
  const review = await loadScriptN04Review(project);
  const persisted = await readJsonFile(scriptN06StatePath(review), {schema_version:'niannian_n06_video_generation_state_v1', groups:{}});
  const v001RealReceiptReady = await scriptN06RealReceiptReady(review, 'V001', persisted.groups?.V001);
  const groups = await Promise.all((review.videoGroups?.groups || []).map(async (group, index) => {
    const groupId = n06SafeGroupId(group.video_group_id);
    const references = scriptN06ReferencePlan(review, group);
    const stored = persisted.groups?.[groupId] || {};
    const upstreamReady = groupId !== 'V002' || v001RealReceiptReady;
    const durationSec = Number(group.duration_sec || 0);
    const durationReady = durationSec === 11;
    const ratioReady = project.aspectRatio === '9:16';
    const referencesReady = references.length > 0 && references.every(item => item.confirmed);
    const blockers = [];
    if (!durationReady) blockers.push('该组必须锁定为 11 秒，当前规格不满足。');
    if (!ratioReady) blockers.push('该项目必须锁定 9:16，当前项目规格不满足。');
    if (!referencesReady) blockers.push('人物、关键资产与场景参考尚未全部按 exact SHA 确认。');
    if (!upstreamReady) blockers.push('V002 必须等待 V001 的真实 receipt 与 QA 通过。');
    if (stored.status === 'dry_run_intent_recorded') blockers.push('此组执行规格已记录，等待网站执行条件与真实任务回执。');
    if (stored.status === 'employee_dispatch_prepared') blockers.push('Mac App 员工测试派发已准备，等待 test_only 回执。');
    if (stored.status === 'employee_synthetic_integrated_qa_passed') blockers.push('测试链路已通过，但 test_only 不能解锁 V002 或 real_delivery。');
    const receipt = scriptN06ReceiptSummary(stored.receipt);
    const media = await scriptN06MediaSummary(review, groupId, stored.receipt);
    return {
      groupId,
      order:index + 1,
      durationSec,
      aspectRatio:project.aspectRatio,
      lockedPrompt:String(group.channel_prompt_2part || ''),
      lockedPromptSha256:sha256Text(String(group.channel_prompt_2part || '')),
      references,
      expectedCredits:11,
      expectedCreditsLabel:'11 积分（1 积分/秒）',
      transactionId:stored.transaction_id || null,
      specSha256:stored.spec_sha256 || null,
      qualityDecision:stored.quality_decision || null,
      qualityPolicy:stored.quality_decision === 'keep_720p_hard_gate'
        ? '保持 720p 严格质量门：下载后的真实媒体若非 720p，必须阻塞 QA。'
        : (stored.quality_decision === 'accept_mimo_uncommitted_resolution'
          ? '接受 Mimo 未承诺分辨率：仍需回读真实媒体并显示实际分辨率，不得把它写成 720p。'
          : '尚未选择质量策略。720p 不能作为 Mimo provider 参数或默认承诺。'),
      status:String(stored.status || (blockers.length ? 'blocked_preconditions' : 'ready_for_explicit_dry_run')),
      receipt,
      qa:stored.qa || null,
      employeeDispatch:publicN06EmployeeDispatch(stored.employee_dispatch),
      media,
      canRecordDryRun:groupId === 'V001' && blockers.length === 0 && !stored.spec_path,
      blockers
    };
  }));
  return {
    projectId:project.id,
    jobId:review.localJobId,
    employeeModelChannel:{channelId:'krill_codex_custom_provider_v1',providerConfigId:'codex_local_access',credentialSource:'env_key',requiresOpenaiAuth:false,mediaProviderAuthorityGranted:false},
    provider:{name:'mimo', executionEnabled:false, mode:'dry_run_no_submit', credentialAccess:'forbidden', fallbackChannels:[]},
    credits:{balanceReadback:495, unit:'credits', ratePerSecond:1, v001V002Estimate:22, scope:'仅 V001/V002 的 11 秒 + 11 秒估算；dry-run 不会扣除积分。'},
    packageSend:{enabled:false, status:'blocked'},
    registry:{enabled:false, status:'blocked'},
    groups,
    statePath:scriptN06StatePath(review),
    adapterContractPath:scriptN06AdapterContractPath(review),
    review
  };
}

function scriptN06ReceiptSummary(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  return {
    status:String(receipt.status || 'not_created'),
    testOnly:receipt.test_only === true,
    updatedAt:receipt.updated_at ? String(receipt.updated_at) : null
  };
}

function scriptN06MediaType(filePath) {
  const extension = path.extname(String(filePath || '')).toLowerCase();
  return ({'.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime'})[extension] || null;
}

function scriptN06MediaState(receipt) {
  if (!receipt || typeof receipt !== 'object') return {state:'not_created', message:'尚未创建渠道任务，因此没有可审片的真实媒体。'};
  if (receipt.status === 'test_only_qa_passed') return {state:'test_only', message:'Mac 员工测试回执已通过，但没有真实媒体，不能预览或交付。'};
  if (receipt.status !== 'qa_passed') return {state:'awaiting_qa', message:'任务尚未通过媒体与视觉校验，暂不提供预览。'};
  if (!receipt.receipt_path) return {state:'receipt_pending', message:'收据尚未落盘，暂不提供预览。'};
  return null;
}

async function scriptN06MediaSummary(review, groupId, storedReceipt) {
  const initial = scriptN06MediaState(storedReceipt);
  if (initial) return initial;
  const receiptPath = String(storedReceipt.receipt_path || '');
  if (!isInside(review.jobRoot, receiptPath)) return {state:'invalid_receipt', message:'视频收据不在当前项目允许目录内，已阻断预览。'};
  const receipt = await readJsonFile(receiptPath);
  if (!receipt || receipt.schema_version !== 'niannian_n06_provider_receipt_v1' || receipt.job_id !== review.localJobId || receipt.group_id !== groupId) {
    return {state:'invalid_receipt', message:'视频收据与当前项目规格不匹配，已阻断预览。'};
  }
  if (receipt.test_only) return {state:'test_only', message:'这是测试回执，不是可交付媒体，审片器不会将其展示为成片。'};
  const download = receipt.download || {};
  const exactPath = String(download.exact_path || '');
  const contentType = scriptN06MediaType(exactPath);
  if (!exactPath || !contentType || !isInside(review.jobRoot, exactPath)) return {state:'invalid_media', message:'真实视频路径或格式未通过项目边界校验。'};
  const evidence = await sha256File(exactPath).catch(() => null);
  if (!evidence || evidence.sha256 !== String(download.sha256 || '').toLowerCase() || evidence.bytes !== Number(download.bytes || 0)) {
    return {state:'hash_mismatch', message:'真实视频的 SHA 或字节数已变化，已阻断预览与交付。'};
  }
  const ffprobe = receipt.ffprobe || {};
  const visualQa = receipt.visual_qa || {};
  if (!/^passed|qa_passed/i.test(String(ffprobe.status || '')) || !/^passed|qa_passed/i.test(String(visualQa.status || ''))) {
    return {state:'qa_incomplete', message:'视频尚未通过完整媒体与视觉校验，暂不提供预览。'};
  }
  return {
    state:'ready',
    exactPath,
    previewUrl:'/api/script-projects/' + encodeURIComponent(review.task.remote_job_id || '') + '/n06-video-groups/' + encodeURIComponent(groupId) + '/media?sha=' + encodeURIComponent(evidence.sha256),
    sha256:evidence.sha256,
    bytes:evidence.bytes,
    contentType,
    width:Number(ffprobe.width || 0) || null,
    height:Number(ffprobe.height || 0) || null,
    durationSec:Number(ffprobe.duration_sec || 0) || null,
    codec:String(ffprobe.codec || ''),
    taskId:receipt.provider_task_id ? String(receipt.provider_task_id) : null,
    receivedAt:receipt.created_at ? String(receipt.created_at) : null,
    qa:{media:String(ffprobe.status || ''), visual:String(visualQa.status || ''), score:Number(visualQa.score || 0) || null}
  };
}

function publicScriptN06Media(media) {
  if (!media || typeof media !== 'object') return {state:'not_created', message:'尚未创建渠道任务，因此没有可审片的真实媒体。'};
  return {
    state:String(media.state || 'not_created'),
    message:media.message || null,
    previewUrl:media.state === 'ready' ? media.previewUrl : null,
    contentType:media.state === 'ready' ? media.contentType : null,
    width:media.state === 'ready' ? media.width : null,
    height:media.state === 'ready' ? media.height : null,
    durationSec:media.state === 'ready' ? media.durationSec : null,
    qa:media.state === 'ready' ? media.qa : null,
    receivedAt:media.state === 'ready' ? media.receivedAt : null
  };
}

function publicScriptN06Review(n06) {
  return {
    projectId:n06.projectId,
    groups:n06.groups.map(group => ({
      groupId:group.groupId,
      order:group.order,
      durationSec:group.durationSec,
      aspectRatio:group.aspectRatio,
      references:group.references.map(reference => ({
        refKey:reference.refKey,
        duty:reference.duty,
        confirmed:reference.confirmed,
        uploadEligible:reference.uploadEligible,
        state:reference.state
      })),
      qualityDecision:group.qualityDecision,
      qualityPolicy:group.qualityPolicy,
      status:group.status,
      receipt:group.receipt,
      qa:group.qa,
      employeeDispatch:group.employeeDispatch,
      media:publicScriptN06Media(group.media),
      canRecordDryRun:group.canRecordDryRun,
      blockers:(group.blockers || []).map(publicWorkflowBlocker).filter(Boolean)
    }))
  };
}

async function recordScriptN06DryRun(project, user, groupId, body) {
  const n06 = await loadScriptN06Review(project);
  groupId = n06SafeGroupId(groupId);
  if (groupId !== 'V001') throw createCodeError('SCRIPT_N06_V001_ONLY', '本轮网站闭环只允许从 V001 显式开始；V002 必须等待 V001 receipt 与 QA 通过。');
  const group = n06.groups.find(item => item.groupId === groupId);
  if (!group) throw createCodeError('SCRIPT_N06_GROUP_NOT_FOUND', '当前项目没有该视频组');
  if (body?.confirmGenerate !== true) throw createCodeError('SCRIPT_N06_EXPLICIT_CONFIRMATION_REQUIRED', '请在网站中显式确认本次仅记录 V001 的 dry-run 生成意图。');
  const qualityDecision = scriptN06QualityDecision(body?.qualityDecision);
  if (!group.canRecordDryRun) throw createCodeError('SCRIPT_N06_PRECONDITION_BLOCKED', group.blockers.join(' ') || 'N06 前置条件尚未通过。');
  const adapter = mimoN06Adapter();
  const timestamp = new Date().toISOString();
  const intentId = 'N06INT-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const specPath = path.join(n06.review.jobRoot, '00_AUTHORITY', 'n06_' + groupId.toLowerCase() + '_spec_' + intentId.toLowerCase() + '.json');
  const spec = {
    schema_version:'niannian_n06_mimo_video_spec_v1',
    transaction_id:intentId,
    project_id:project.id,
    job_id:n06.jobId,
    group_id:groupId,
    provider:'mimo',
    execution_mode:'dry_run_no_submit',
    credential_access:'forbidden',
    prompt:{text:group.lockedPrompt,sha256:group.lockedPromptSha256},
    references:group.references,
    duration_sec:group.durationSec,
    aspect_ratio:group.aspectRatio,
    expected_credits:11,
    credit_rate_per_second:1,
    v001_v002_estimate_credits:22,
    quality_decision_token:qualityDecision,
    qa_contract:{ffprobe_required:true,visual_qa_required:true,required_resolution:qualityDecision === 'keep_720p_hard_gate' ? '720p_hard_gate_after_media_readback' : 'provider_readback_required_no_assumption'},
    forbidden_actions:['provider_upload','provider_submit','provider_poll','provider_download','package_send','accepted_registry_promotion'],
    created_by:user.id,
    created_at:timestamp
  };
  adapter.validateSpec(spec);
  const state = await readJsonFile(n06.statePath, {schema_version:'niannian_n06_video_generation_state_v1', groups:{}});
  state.groups = state.groups && typeof state.groups === 'object' ? state.groups : {};
  state.groups[groupId] = {
    status:'dry_run_intent_recorded',
    transaction_id:intentId,
    spec_path:specPath,
    spec_sha256:sha256Text(JSON.stringify(spec, null, 2) + '\n'),
    quality_decision:qualityDecision,
    provider_task_id:null,
    receipt:{status:'not_created_provider_disabled', provider_task_id:null, updated_at:timestamp},
    qa:{status:'not_started_no_media_downloaded', ffprobe:'not_started', visual:'not_started'},
    updated_at:timestamp
  };
  state.updated_at = timestamp;
  const adapterContract = {
    schema_version:'niannian_n06_mimo_adapter_contract_v1',
    provider:'mimo',
    execution_enabled:false,
    credential_access:'forbidden',
    allowed_operations:adapter.allowedOperations,
    blocked_operations:adapter.blockedOperations,
    created_at:timestamp
  };
  const transactionPath = path.join(n06.review.jobRoot, 'transaction_intent_' + intentId.toLowerCase() + '.json');
  const intent = {
    schema_version:'workspace_transaction_intent_v1',
    run_id:intentId,
    owner_thread:'niannian_ai_website_n06_dry_run',
    node_id:'N06_' + groupId + '_mimo_dry_run_intent',
    project_id:project.id,
    job_id:n06.jobId,
    allowed_write_paths:[transactionPath, specPath, n06.statePath, n06.adapterContractPath, path.join(n06.review.jobRoot, 'artifact_ledger.json'), path.join(n06.review.jobRoot, 'status.json'), path.join(n06.review.jobRoot, 'gate_dashboard.json'), path.join(n06.review.jobRoot, 'result_manifest.json')],
    expected_outputs:[path.basename(specPath), 'n06_video_generation_state.json', 'n06_mimo_adapter_contract.json'],
    cost_gate:'provider_disabled_dry_run_no_submit',
    forbidden_actions:spec.forbidden_actions,
    created_at:timestamp
  };
  const ledger = n06.review.ledger;
  ledger.artifacts = Array.isArray(ledger.artifacts) ? ledger.artifacts : [];
  ledger.artifacts = ledger.artifacts.filter(item => item.artifact_id !== 'n06_' + groupId.toLowerCase() + '_dry_run_spec');
  ledger.artifacts.push({artifact_id:'n06_' + groupId.toLowerCase() + '_dry_run_spec',node_id:'N06_' + groupId + '_mimo_dry_run_intent',exact_path:specPath,sha256:state.groups[groupId].spec_sha256,status:'recorded_not_submitted',downstream_consumable_by:[]});
  const dashboard = n06.review.dashboard;
  dashboard.current_node = 'N06_' + groupId + '_dry_run_intent_recorded';
  dashboard.earliest_incomplete_node = 'N06_' + groupId + '_provider_disabled';
  dashboard.overall_status = 'n06_dry_run_intent_recorded_provider_disabled';
  dashboard.next_action = 'Mimo 仍为 dry-run/no-submit。必须在渠道资格、预算、真实提交授权后才可创建 provider task；V002 继续等待 V001 receipt 与 QA。';
  dashboard.gates = {...(dashboard.gates || {}), N06:{status:'dry_run_intent_recorded_provider_disabled'}, provider_submit:{status:'blocked_mimo_dry_run_no_submit'}, package_send:{status:'blocked'}, accepted_registry_promotion:{status:'blocked'}};
  const status = {...(n06.review.status || {}), job_id:n06.jobId, status:'n06_dry_run_intent_recorded_provider_disabled', current_node:dashboard.current_node, earliest_incomplete_node:dashboard.earliest_incomplete_node, next_action:dashboard.next_action, blocker:'MIMO_PROVIDER_DRY_RUN_NO_SUBMIT'};
  const result = {...(n06.review.result || {}), job_id:n06.jobId, remote_job_id:project.id, status:'N06_V001_DRY_RUN_INTENT_RECORDED_NOT_SUBMITTED', success:false, packaged:false, transport_success:false, user_visible_acceptance:false, provider_task_id:null, quality_gates:{...(n06.review.result?.quality_gates || {}), n06_v001:'DRY_RUN_INTENT_RECORDED_NO_PROVIDER_TASK', package_send:'BLOCKED', registry:'BLOCKED'}, updated_at:timestamp};
  await Promise.all([
    writeScriptJson(transactionPath, intent),
    writeScriptJson(specPath, spec),
    writeScriptJson(n06.statePath, state),
    writeScriptJson(n06.adapterContractPath, adapterContract),
    writeScriptJson(path.join(n06.review.jobRoot, 'artifact_ledger.json'), ledger),
    writeScriptJson(path.join(n06.review.jobRoot, 'status.json'), status),
    writeScriptJson(path.join(n06.review.jobRoot, 'gate_dashboard.json'), dashboard),
    writeScriptJson(path.join(n06.review.jobRoot, 'result_manifest.json'), result)
  ]);
  return loadScriptN06Review(project);
}

async function prepareScriptN06RealSubmit(project, user, groupId, body) {
  const n06 = await loadScriptN06Review(project);
  groupId = n06SafeGroupId(groupId);
  if (groupId !== 'V001') throw createCodeError('SCRIPT_N06_V001_ONLY', '真实派发只能从 V001 开始；V002 必须等待 V001 的真实 receipt 与 QA。');
  const group = n06.groups.find(item => item.groupId === groupId);
  if (!group || body?.confirmRealSubmit !== true) throw createCodeError('SCRIPT_N06_REAL_SUBMIT_CONFIRMATION_REQUIRED', '请在网站中明确确认仅准备 V001 的真实派发事务。');
  const state = await readJsonFile(n06.statePath, {groups:{}});
  const stored = state.groups?.[groupId];
  if (!stored?.spec_path || stored.status !== 'dry_run_intent_recorded') throw createCodeError('SCRIPT_N06_DRY_RUN_REQUIRED', '必须先记录当前 V001 的 dry-run 事务，才能准备真实派发。');
  const drySpec = await readJsonFile(stored.spec_path);
  if (!drySpec || sha256Text(JSON.stringify(drySpec, null, 2) + '\n') !== stored.spec_sha256 || drySpec.prompt?.sha256 !== group.lockedPromptSha256) throw createCodeError('SCRIPT_N06_SPEC_REVALIDATION_FAILED', 'dry-run 规格或提示词哈希已变化。');
  const qualityDecision = scriptN06QualityDecision(body?.qualityDecision);
  if (qualityDecision !== stored.quality_decision || !Array.isArray(drySpec.references) || !drySpec.references.length || !drySpec.references.every(reference => reference.uploadEligible && reference.path && reference.sha256)) throw createCodeError('SCRIPT_N06_REAL_SUBMIT_PRECONDITION_BLOCKED', '质量策略、确认参考或 exact SHA 不完整。');
  const transactionId = 'N06REAL-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const timestamp = new Date().toISOString();
  const specPath = path.join(n06.review.jobRoot, '00_AUTHORITY', 'n06_v001_real_submit_spec.json');
  if (await fsp.stat(specPath).then(() => true, () => false)) throw createCodeError('SCRIPT_N06_REAL_SUBMIT_ALREADY_PREPARED', '当前 V001 已有待派发的真实事务；请先等待回执或显式处理失败。');
  const references = drySpec.references.map(reference => ({ref_key:reference.refKey, path:reference.path, sha256:reference.sha256, duty:reference.duty, uploadEligible:true}));
  const spec = {...drySpec, transaction_id:transactionId, execution_mode:'real_submit_candidate_v2', credential_access:'mac_keychain_only', references, employee_model_channel:{requested:false,used:false}, media_provider_network_requested:false, media_provider_submit_requested:false, media_provider_upload_requested:false, forbidden_actions:['media_provider_upload','media_provider_submit','package_send','accepted_registry_promotion'], prepared_by:user.id, prepared_at:timestamp};
  const specSha256 = sha256Text(JSON.stringify(spec, null, 2) + '\n');
  const task = await readJsonFile(path.join(n06.review.jobRoot, 'task.json'));
  task.n06_real_submit = {transaction_id:transactionId, spec_path:specPath, spec_sha256:specSha256, references:references.map(reference => ({ref_key:reference.ref_key,path:reference.path,sha256:reference.sha256,duty:reference.duty})), provider:'mimo', quality_decision_token:qualityDecision, status:'candidate_prepared_not_dispatched', employee_model_channel:{requested:false,used:false}, media_provider_network_requested:false, media_provider_submit_requested:false, prepared_at:timestamp};
  state.groups[groupId] = {...stored,status:'real_submit_candidate_prepared',transaction_id:transactionId,spec_path:specPath,spec_sha256:specSha256,receipt:{status:'not_created_awaiting_employee_dispatch',provider_task_id:null,updated_at:timestamp},updated_at:timestamp};
  state.updated_at = timestamp;
  const intentPath = path.join(n06.review.jobRoot, 'transaction_intent_' + transactionId.toLowerCase() + '.json');
  const intent = {schema_version:'workspace_transaction_intent_v1',run_id:transactionId,owner_thread:'niannian_ai_website_n06_real_submit_prepare',node_id:'N06_V001_real_submit_candidate_prepare',project_id:project.id,job_id:n06.jobId,cost_gate:'candidate_only_no_media_submit',employee_model_channel:{requested:false,used:false},media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,package_send_requested:false,created_at:timestamp};
  const dashboard = {...n06.review.dashboard,current_node:'N06_V001_real_submit_candidate_prepared',overall_status:'n06_real_submit_candidate_prepared_not_dispatched',next_action:'媒体 Provider 尚未调用。可将本精确事务派给一个现有 Mac App 员工运行 fake transport 测试链路。',gates:{...(n06.review.dashboard.gates || {}),N06:{status:'real_submit_candidate_prepared_not_dispatched'},employee_model_channel:{status:'awaiting_explicit_synthetic_dispatch'},media_provider_submit:{status:'blocked_no_authority'},package_send:{status:'blocked'}}};
  await Promise.all([writeScriptJson(specPath,spec),writeScriptJson(intentPath,intent),writeScriptJson(n06.statePath,state),writeScriptJson(path.join(n06.review.jobRoot,'task.json'),task),writeScriptJson(path.join(n06.review.jobRoot,'gate_dashboard.json'),dashboard),writeScriptJson(path.join(n06.review.jobRoot,'status.json'),{...(n06.review.status||{}),status:'n06_real_submit_candidate_prepared_not_dispatched',current_node:dashboard.current_node,updated_at:timestamp})]);
  await updateScriptProductionIndex({job_id:n06.jobId,entrypoint:'codex_direct',source_entrypoint:'niannian_ai_web_script',remote_job_id:project.id,job_dir:n06.review.jobRoot,status:'n06_real_submit_candidate_prepared',raw_status:'candidate_prepared_not_dispatched',current_step:'N06_V001',execution_phase:'candidate_prepared',transaction_id:transactionId,spec_sha256:state.groups[groupId].spec_sha256,media_provider_submit_requested:false,delivery_state:{packaged:false,transport_success:false,user_visible_acceptance:false},updated_at:timestamp});
  return loadScriptN06Review(project);
}

async function prepareScriptN06EmployeeSyntheticDispatch(project, groupId, body) {
  let n06;
  try {
    n06 = await loadScriptN06Review(project);
  } catch (error) {
    if (['SCRIPT_N05_CANDIDATE_HASH_MISMATCH','SCRIPT_N05_CANDIDATE_PATH_INVALID'].includes(error.code)) throw createCodeError('SCRIPT_N06_REFERENCE_REVALIDATION_FAILED', 'Mac 员工派发前参考资产路径、哈希或版本已变化。');
    throw error;
  }
  groupId = n06SafeGroupId(groupId);
  if (groupId !== 'V001') throw createCodeError('SCRIPT_N06_V001_ONLY', 'Mac 员工测试派发只能从 V001 开始。');
  if (body?.confirmSyntheticDispatch !== true) throw createCodeError('SCRIPT_N06_EMPLOYEE_DISPATCH_CONFIRMATION_REQUIRED', '请明确确认本次仅派发 fake transport 测试链路。');
  const state = await readJsonFile(n06.statePath, {groups:{}});
  const stored = state.groups?.[groupId];
  if (!stored?.spec_path || !['real_submit_candidate_prepared','employee_dispatch_prepared'].includes(stored.status)) throw createCodeError('SCRIPT_N06_REAL_SUBMIT_CANDIDATE_REQUIRED', '必须先准备当前 V001 的精确 real-submit candidate。');
  const existingPath = scriptN06EmployeeDispatchPath(n06.review, groupId);
  const existing = await readJsonFile(existingPath, null);
  if (existing) {
    if (existing.spec_sha256 !== stored.spec_sha256 || existing.transaction_id !== stored.transaction_id) throw createCodeError('SCRIPT_N06_EMPLOYEE_DISPATCH_CONFLICT', '已存在不同版本的 Mac 员工派发。');
    return loadScriptN06Review(project);
  }
  const spec = await readJsonFile(stored.spec_path);
  const specEvidence = await sha256File(stored.spec_path);
  if (!spec || specEvidence.sha256 !== stored.spec_sha256 || spec.execution_mode !== 'real_submit_candidate_v2' || spec.media_provider_submit_requested !== false) throw createCodeError('SCRIPT_N06_SPEC_REVALIDATION_FAILED', 'V001 candidate spec 不是当前无媒体提交合同。');
  const dispatchId = 'N06EMP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const employee = selectMacN06Employee(n06.jobId, stored.transaction_id);
  const employeeWorkspace = '/Users/lsb/.local/share/niannian-ai/employee-workspaces/' + employee.employee + '/' + dispatchId;
  const dispatchRoot = scriptN06EmployeeDispatchRoot(n06.review, groupId);
  const inputRoot = path.join(dispatchRoot, 'input');
  const referenceRoot = path.join(inputRoot, 'references');
  await fsp.mkdir(referenceRoot, {recursive:true});
  const portableSpecPath = path.join(inputRoot, 'video_task_spec.json');
  const portableReferences = [];
  for (const [index, reference] of (spec.references || []).entries()) {
    if (!reference.path || !reference.sha256 || !reference.uploadEligible || !isInside(n06.review.jobRoot, reference.path)) throw createCodeError('SCRIPT_N06_REFERENCE_REVALIDATION_FAILED', '派发前参考职责、路径或确认状态不完整。');
    const evidence = await sha256File(reference.path);
    if (evidence.sha256 !== reference.sha256) throw createCodeError('SCRIPT_N06_REFERENCE_REVALIDATION_FAILED', '派发前参考图 SHA 已变化。');
    const safeKey = String(reference.ref_key || reference.refKey || 'REF' + (index + 1)).replace(/[^A-Za-z0-9_.-]+/g, '_');
    const relativePath = path.join('input', 'references', String(index + 1).padStart(2, '0') + '-' + safeKey + path.extname(reference.path).toLowerCase());
    const portablePath = path.join(dispatchRoot, relativePath);
    await fsp.copyFile(reference.path, portablePath);
    portableReferences.push({ref_key:reference.ref_key || reference.refKey,duty:reference.duty,sha256:reference.sha256,confirmed:true,upload_eligible:true,local_edit_applied:false,relative_path:relativePath.split(path.sep).join('/')});
  }
  const portableSpec = {
    ...spec,
    authority_spec:{exact_path:stored.spec_path,sha256:stored.spec_sha256},
    references:(spec.references || []).map((reference,index) => ({
      ...reference,
      path:employeeWorkspace + '/' + portableReferences[index].relative_path,
      original_authority:{exact_path:reference.path,sha256:reference.sha256},
      portable_transport:{relative_path:portableReferences[index].relative_path,sha256:portableReferences[index].sha256}
    }))
  };
  await writeScriptJson(portableSpecPath, portableSpec);
  const portableSpecEvidence = await sha256File(portableSpecPath);
  const authority = await currentMacEmployeeAuthorityHashes();
  const timestamp = new Date().toISOString();
  const dispatch = {
    schema_version:'niannian_n06_mac_employee_dispatch_v1',dispatch_id:dispatchId,status:'prepared',execution_mode:'synthetic_fake_transport_only',
    phase:'prepared_for_transport',idempotency_key:sha256Text([n06.jobId,stored.transaction_id,stored.spec_sha256,employee.thread_id].join('|')),
    project_id:project.id,job_id:n06.jobId,group_id:groupId,transaction_id:stored.transaction_id,spec_sha256:stored.spec_sha256,portable_spec_sha256:portableSpecEvidence.sha256,prompt_sha256:spec.prompt?.sha256,
    portable_spec_relative_path:'input/video_task_spec.json',references:portableReferences,quality_decision_token:spec.quality_decision_token,duration_sec:11,aspect_ratio:'9:16',
    employee:{...employee,project_root:'/Users/lsb/AI-Brain/niannian-ai-canonical-local',workspace:employeeWorkspace},
    authority,employee_model_channel:{channel_id:'krill_codex_custom_provider_v1',provider_config_id:'codex_local_access',credential_source:'env_key',env_key_name:'KRILL_CODEX_API_KEY',requires_openai_auth:false,requested:true,used:false},
    lease:{status:'unclaimed',lease_id:null,owner_thread_id:employee.thread_id,claimed_at:null,completed_at:null},media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,production_data_write_requested:false,
    test_only:true,real_delivery:false,expected_return:['employee_dispatch.json','employee_worker_receipt.json','artifact_manifest.json','mac_employee_dispatch_control_receipt.json','fake-download.mp4','ffprobe.json','visual_qa.json','website_projection.json'],prepared_at:timestamp
  };
  await writeScriptJson(existingPath, dispatch);
  const exported = await n06PhaseTransport.exportWindowsDispatch({dispatchPath:existingPath,exportRoot:path.join(n06.review.jobRoot,'06_N06_EXECUTION',groupId,'phase_exports')});
  dispatch.phase_key = {job_id:exported.phase.job_id,group_id:exported.phase.group_id,transaction_id:exported.phase.transaction_id,spec_sha256:exported.phase.spec_sha256,dispatch_id:exported.phase.dispatch_id,key_id:exported.phase.key_id};
  dispatch.transport_export = {status:exported.status,package_root:exported.root,manifest_sha256:exported.manifestSha256,exported_at:timestamp};
  await writeScriptJson(existingPath, dispatch);
  const task = await readJsonFile(path.join(n06.review.jobRoot, 'task.json'));
  task.n06_employee_dispatch = {dispatch_id:dispatchId,dispatch_path:existingPath,employee:dispatch.employee,status:'prepared',phase_key:dispatch.phase_key,transport_export:dispatch.transport_export,employee_model_channel:dispatch.employee_model_channel,media_provider_network_requested:false,media_provider_submit_requested:false,prepared_at:timestamp};
  state.groups[groupId] = {...stored,status:'employee_dispatch_prepared',employee_dispatch_path:existingPath,employee_dispatch:{dispatch_id:dispatchId,status:'prepared',employee:dispatch.employee,phase_key:dispatch.phase_key,transport_export:dispatch.transport_export,employee_model_channel:dispatch.employee_model_channel,media_provider_network_requested:false,media_provider_submit_requested:false,test_only:true,real_delivery:false,prepared_at:timestamp},updated_at:timestamp};
  const dashboard = {...n06.review.dashboard,current_node:'N06_V001_employee_dispatch_prepared',overall_status:'n06_employee_dispatch_prepared_fake_only',next_action:'等待已选 Mac App 员工执行 fake transport，并回传 test_only receipt。',gates:{...(n06.review.dashboard.gates || {}),employee_model_channel:{status:'dispatch_prepared'},media_provider_submit:{status:'blocked_fake_only'},V002:{status:'blocked_until_v001_real_receipt_and_qa'},package_send:{status:'blocked'}}};
  await Promise.all([writeScriptJson(n06.statePath,state),writeScriptJson(path.join(n06.review.jobRoot,'task.json'),task),writeScriptJson(path.join(n06.review.jobRoot,'gate_dashboard.json'),dashboard),writeScriptJson(path.join(n06.review.jobRoot,'status.json'),{...(n06.review.status||{}),status:'n06_employee_dispatch_prepared_fake_only',current_node:dashboard.current_node,updated_at:timestamp})]);
  await updateScriptProductionIndex({job_id:n06.jobId,entrypoint:'codex_direct',source_entrypoint:'niannian_ai_web_script',remote_job_id:project.id,job_dir:n06.review.jobRoot,status:'n06_employee_dispatch_prepared',raw_status:'prepared_for_transport',current_step:'N06_V001_employee_dispatch',execution_phase:'dispatch_prepared',dispatch_id:dispatchId,idempotency_key:dispatch.idempotency_key,selected_employee_thread_id:employee.thread_id,lease:dispatch.lease,media_provider_submit_requested:false,delivery_state:{packaged:false,transport_success:false,user_visible_acceptance:false},updated_at:timestamp});
  return loadScriptN06Review(project);
}

async function reconcileScriptN06EmployeeSyntheticReturn(project, groupId) {
  const n06 = await loadScriptN06Review(project);
  groupId = n06SafeGroupId(groupId);
  if (groupId !== 'V001') throw createCodeError('SCRIPT_N06_V001_ONLY', '测试回执只能先归并 V001。');
  const state = await readJsonFile(n06.statePath, {groups:{}});
  const stored = state.groups?.[groupId];
  if (!stored?.employee_dispatch_path || !isInside(n06.review.jobRoot, stored.employee_dispatch_path)) throw createCodeError('SCRIPT_N06_EMPLOYEE_DISPATCH_REQUIRED', '当前没有可归并的 Mac 员工测试派发。');
  const dispatch = await readJsonFile(stored.employee_dispatch_path);
  const returnRoot = scriptN06EmployeeReturnRoot(n06.review, groupId);
  const receiptPath = path.join(returnRoot, 'employee_worker_receipt.json');
  const manifestPath = path.join(returnRoot, 'artifact_manifest.json');
  const [receipt, manifest] = await Promise.all([readJsonFile(receiptPath, null),readJsonFile(manifestPath, null)]);
  if (!receipt || !manifest) throw createCodeError('SCRIPT_N06_EMPLOYEE_RETURN_PENDING', 'Mac 员工测试回执尚未返回。');
  if (receipt.schema_version !== 'niannian_n06_mac_employee_synthetic_receipt_v1' || receipt.dispatch_id !== dispatch.dispatch_id || receipt.transaction_id !== dispatch.transaction_id || receipt.spec_sha256 !== dispatch.spec_sha256 || receipt.authority_spec_sha256 !== dispatch.spec_sha256 || receipt.portable_spec_sha256 !== dispatch.portable_spec_sha256 || receipt.prompt_sha256 !== dispatch.prompt_sha256) throw createCodeError('SCRIPT_N06_EMPLOYEE_RECEIPT_MISMATCH', 'Mac 员工回执与当前 transaction/authority spec/portable spec/prompt 不一致。');
  if (receipt.employee?.thread_id !== dispatch.employee.thread_id || receipt.completion_event?.method !== 'turn/completed' || receipt.completion_event?.status !== 'completed' || receipt.completion_event?.error !== null) throw createCodeError('SCRIPT_N06_EMPLOYEE_COMPLETION_INVALID', 'Mac 员工回执缺少 clean turn/completed 证据。');
  if (receipt.employee_model_channel?.channel_id !== 'krill_codex_custom_provider_v1' || receipt.employee_model_channel?.requested !== true || receipt.employee_model_channel?.used !== true || receipt.employee_model_channel?.media_provider_authority_granted !== false) throw createCodeError('SCRIPT_N06_EMPLOYEE_MODEL_CHANNEL_INVALID', '员工模型通道回执不完整或越权。');
  if (receipt.test_only !== true || receipt.real_delivery !== false || receipt.media_provider_network_requested !== false || receipt.media_provider_submit_requested !== false || receipt.media_provider_upload_requested !== false || receipt.spend_requested !== false || receipt.package_send_requested !== false || receipt.registry_promotion_requested !== false || receipt.deployment_requested !== false || receipt.production_data_write_requested !== false) throw createCodeError('SCRIPT_N06_EMPLOYEE_SIDE_EFFECT_CONTRACT_INVALID', '测试回执包含媒体 Provider、费用、部署、生产写入或交付越权。');
  if (!Array.isArray(receipt.references) || receipt.references.length !== dispatch.references.length || !dispatch.references.every(expected => receipt.references.some(actual => actual.ref_key === expected.ref_key && actual.sha256 === expected.sha256 && actual.duty === expected.duty && actual.confirmed === true && actual.upload_eligible === true && actual.local_edit_applied === false))) throw createCodeError('SCRIPT_N06_EMPLOYEE_REFERENCE_MISMATCH', 'Mac 员工回执未绑定全部参考职责与 SHA。');
  const requiredReturnFiles = new Set(['employee_dispatch.json','fake-download.mp4','ffprobe.json','visual_qa.json','website_projection.json','employee_worker_receipt.json','mac_employee_dispatch_control_receipt.json']);
  const manifestedNames = new Set(Array.isArray(manifest?.files) ? manifest.files.map(item => String(item.relative_path || '')) : []);
  if (manifest.schema_version !== 'niannian_n06_mac_employee_artifact_manifest_v1' || manifest.dispatch_id !== dispatch.dispatch_id || manifest.phase !== 'turn_completed_and_read_back' || !Array.isArray(manifest.files) || requiredReturnFiles.size !== manifest.files.length || manifestedNames.size !== requiredReturnFiles.size || [...requiredReturnFiles].some(name => !manifestedNames.has(name))) throw createCodeError('SCRIPT_N06_EMPLOYEE_MANIFEST_INVALID', 'Mac 员工最终返回清单无效、未完成 turn readback，或文件集合不精确。');
  for (const item of manifest.files) {
    const filePath = path.resolve(returnRoot, String(item.relative_path || ''));
    if (!isInside(returnRoot, filePath)) throw createCodeError('SCRIPT_N06_EMPLOYEE_RETURN_PATH_INVALID', 'Mac 员工返回路径越界。');
    const evidence = await sha256File(filePath).catch(() => null);
    if (!evidence || evidence.sha256 !== item.sha256 || evidence.bytes !== item.bytes) throw createCodeError('SCRIPT_N06_EMPLOYEE_RETURN_SHA_MISMATCH', 'Mac 员工返回文件 SHA 或字节数不一致。');
  }
  const fakeMediaPath = path.join(returnRoot, 'fake-download.mp4');
  const fakeEvidence = await sha256File(fakeMediaPath);
  const [probe, visualQa, controlReceipt, returnedDispatch] = await Promise.all([
    readJsonFile(path.join(returnRoot, 'ffprobe.json')),
    readJsonFile(path.join(returnRoot, 'visual_qa.json')),
    readJsonFile(path.join(returnRoot, 'mac_employee_dispatch_control_receipt.json')),
    readJsonFile(path.join(returnRoot, 'employee_dispatch.json'))
  ]);
  if (returnedDispatch?.dispatch_id !== dispatch.dispatch_id || returnedDispatch.idempotency_key !== dispatch.idempotency_key || returnedDispatch.phase !== 'employee_turn_completed' || returnedDispatch.status !== 'completed_test_only' || returnedDispatch.lease?.status !== 'completed' || returnedDispatch.lease?.lease_id !== receipt.completion_event.turn_id || returnedDispatch.lease?.owner_thread_id !== dispatch.employee.thread_id) throw createCodeError('SCRIPT_N06_EMPLOYEE_PHASE_RECEIPT_INVALID', 'Mac 返回的派发 phase、lease 或 idempotency 与当前任务不一致。');
  if (controlReceipt?.schema_version !== 'niannian_mac_codex_employee_job_dispatch_receipt_v1' || controlReceipt.dispatch_id !== dispatch.dispatch_id || controlReceipt.idempotency_key !== dispatch.idempotency_key || controlReceipt.employee?.thread_id !== dispatch.employee.thread_id || controlReceipt.lease?.lease_id !== receipt.completion_event.turn_id || controlReceipt.completion_event?.turn_id !== receipt.completion_event.turn_id || controlReceipt.completion_event?.status !== 'completed' || controlReceipt.completion_event?.error !== null || controlReceipt.test_only !== true || controlReceipt.real_delivery !== false) throw createCodeError('SCRIPT_N06_EMPLOYEE_CONTROL_RECEIPT_INVALID', 'Mac App dispatcher 控制回执与员工回执、phase lease 或线程不一致。');
  if (probe.status !== 'passed_test_stub' || probe.width !== 720 || probe.height !== 1280 || probe.duration_sec !== 11 || probe.synthetic !== true || visualQa.status !== 'passed_test_stub' || visualQa.qa_level !== 'integrated' || visualQa.synthetic !== true) throw createCodeError('SCRIPT_N06_EMPLOYEE_QA_INVALID', 'Mac 员工 fake ffprobe 或视觉 QA 未通过测试合同。');
  const timestamp = new Date().toISOString();
  stored.status = 'employee_synthetic_integrated_qa_passed';
  stored.receipt = {status:'test_only_qa_passed',test_only:true,provider_task_id:receipt.fake_provider_task_id,receipt_path:receiptPath,updated_at:timestamp};
  stored.qa = {status:'test_only_qa_passed',ffprobe:probe.status,visual:visualQa.status};
  stored.employee_dispatch = {...stored.employee_dispatch,status:'completed_test_only',employee_model_channel:receipt.employee_model_channel,media_provider_network_requested:false,media_provider_submit_requested:false,test_only:true,real_delivery:false,completed_at:timestamp};
  stored.updated_at = timestamp;
  state.updated_at = timestamp;
  const ledger = n06.review.ledger;
  ledger.artifacts = (ledger.artifacts || []).filter(item => item.artifact_id !== 'n06_v001_mac_employee_fake_media');
  ledger.artifacts.push({artifact_id:'n06_v001_mac_employee_fake_media',node_id:'N06_V001_employee_synthetic',exact_path:fakeMediaPath,sha256:fakeEvidence.sha256,bytes:fakeEvidence.bytes,status:'test_only_qa_passed',downstream_consumable_by:[]});
  const dashboard = {...n06.review.dashboard,current_node:'N06_V001_employee_synthetic_integrated',overall_status:'n06_employee_synthetic_integrated_not_delivered',next_action:'测试链路已回写。真实 Mimo submit、V002、交付仍关闭。',gates:{...(n06.review.dashboard.gates || {}),employee_model_channel:{status:'integrated_pass'},media_provider_submit:{status:'blocked_no_authority'},V002:{status:'SCRIPT_N06_V001_ONLY_test_only_cannot_unlock'},real_delivery:{status:'blocked_test_only'},package_send:{status:'blocked'}}};
  const checkpoint = {...(n06.review.checkpoint||{}),status:'n06_employee_synthetic_integrated_not_delivered',current_step:'N06_V001_employee_synthetic_complete',completed:[...new Set([...(n06.review.checkpoint?.completed || []),'N06 Mac App employee exact dispatch completed','N06 fake task poll download ffprobe visual QA returned','N06 website projection updated test_only'])],blockers:['REAL_MIMO_PROVIDER_EXECUTION_DISABLED','SCRIPT_N06_V001_ONLY','PACKAGE_SEND_AND_REGISTRY_BLOCKED'],next_action:'Only a separately authorized real Mimo V001 submit may advance beyond test_only.',updated_at:timestamp};
  const result = {...(n06.review.result||{}),status:'N06_V001_MAC_EMPLOYEE_SYNTHETIC_INTEGRATED_NOT_DELIVERED',success:false,packaged:false,transport_success:false,user_visible_acceptance:false,test_only:true,real_delivery:false,employee_model_channel:receipt.employee_model_channel,media_provider_network_requested:false,media_provider_submit_requested:false,provider_task_id:null,updated_at:timestamp};
  const projection = {schema_version:'niannian_website_projection_v1',project_id:project.id,job_id:n06.jobId,group_id:groupId,dispatch_id:dispatch.dispatch_id,status:'employee_synthetic_integrated_not_delivered',media_state:'test_only_no_real_mp4',employee:{title:dispatch.employee.title,thread_id:dispatch.employee.thread_id},employee_model_channel:{channel_id:'krill_codex_custom_provider_v1',used:true},media_provider_network_requested:false,media_provider_submit_requested:false,spend_requested:false,real_delivery:false,v002_gate:'SCRIPT_N06_V001_ONLY',receipt_sha256:(await sha256File(receiptPath)).sha256,updated_at:timestamp};
  await Promise.all([writeScriptJson(n06.statePath,state),writeScriptJson(path.join(n06.review.jobRoot,'artifact_ledger.json'),ledger),writeScriptJson(path.join(n06.review.jobRoot,'gate_dashboard.json'),dashboard),writeScriptJson(path.join(n06.review.jobRoot,'checkpoint.json'),checkpoint),writeScriptJson(path.join(n06.review.jobRoot,'result_manifest.json'),result),writeScriptJson(path.join(n06.review.jobRoot,'status.json'),{...(n06.review.status||{}),status:'n06_employee_synthetic_integrated_not_delivered',current_node:dashboard.current_node,updated_at:timestamp}),writeScriptJson(path.join(n06.review.jobRoot,'06_N06_EXECUTION',groupId,'website_projection.json'),projection)]);
  await updateScriptProductionIndex({job_id:n06.jobId,entrypoint:'codex_direct',source_entrypoint:'niannian_ai_web_script',remote_job_id:project.id,job_dir:n06.review.jobRoot,status:'n06_employee_synthetic_integrated',raw_status:'test_only_not_delivered',current_step:'N06_V001_employee_synthetic_complete',execution_phase:'return_reconciled',dispatch_id:dispatch.dispatch_id,idempotency_key:dispatch.idempotency_key,selected_employee_thread_id:dispatch.employee.thread_id,lease:{status:'completed',lease_id:receipt.completion_event.turn_id,owner_thread_id:dispatch.employee.thread_id,claimed_at:receipt.created_at || null,completed_at:receipt.completed_at || timestamp},media_provider_submit_requested:false,delivery_state:{packaged:false,transport_success:false,user_visible_acceptance:false},updated_at:timestamp});
  return loadScriptN06Review(project);
}

async function serveScriptN05CandidateImage(request, response, project, candidateId) {
  const review = await loadScriptN04Review(project);
  const candidate = (review.n05CandidateManifest?.items || []).find(item => String(item.id || '') === candidateId);
  if (!candidate) return json(response, 404, {code:'SCRIPT_N05_CANDIDATE_NOT_FOUND', error:'未找到该 N05 候选图'});
  const requestedSha = new URL(request.url, 'http://127.0.0.1').searchParams.get('sha');
  if (requestedSha && requestedSha !== candidate.sha256) return json(response, 409, {code:'SCRIPT_N05_CANDIDATE_STALE', error:'候选图版本已变化，请刷新页面'});
  const filePath = String(candidate.exact_path || '');
  const stats = await fsp.stat(filePath);
  const type = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, {'Content-Type':type, 'Content-Length':stats.size, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  return fs.createReadStream(filePath).pipe(response);
}

async function serveScriptN06Media(request, response, project, groupId) {
  const n06 = await loadScriptN06Review(project);
  const safeGroupId = n06SafeGroupId(groupId);
  const group = n06.groups.find(item => item.groupId === safeGroupId);
  if (!group) return json(response, 404, {code:'SCRIPT_N06_GROUP_NOT_FOUND', error:'未找到该视频组'});
  const media = group.media || {};
  if (media.state !== 'ready' || !media.exactPath) {
    return json(response, 404, {code:'SCRIPT_N06_MEDIA_NOT_READY', error:'该视频组尚未有通过完整校验的真实媒体可预览'});
  }
  const requestedSha = new URL(request.url, 'http://127.0.0.1').searchParams.get('sha');
  if (requestedSha && requestedSha !== media.sha256) return json(response, 409, {code:'SCRIPT_N06_MEDIA_STALE', error:'视频媒体版本已变化，请刷新页面'});
  const evidence = await sha256File(media.exactPath).catch(() => null);
  if (!evidence || evidence.sha256 !== media.sha256 || evidence.bytes !== media.bytes) {
    return json(response, 409, {code:'SCRIPT_N06_MEDIA_HASH_MISMATCH', error:'视频媒体版本校验失败，预览已阻断'});
  }
  const range = /^bytes=(\d*)-(\d*)$/i.exec(String(request.headers.range || '').trim());
  if (range) {
    const suffixLength = range[1] === '' ? Number(range[2]) : null;
    const start = suffixLength === null ? Number(range[1]) : Math.max(0, evidence.bytes - suffixLength);
    const end = suffixLength === null ? (range[2] === '' ? evidence.bytes - 1 : Number(range[2])) : evidence.bytes - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= evidence.bytes) {
      response.writeHead(416, {'Content-Range':'bytes */' + evidence.bytes, 'Cache-Control':'no-store'});
      return response.end();
    }
    const safeEnd = Math.min(end, evidence.bytes - 1);
    response.writeHead(206, {
      'Content-Type':media.contentType,
      'Content-Length':safeEnd - start + 1,
      'Content-Range':'bytes ' + start + '-' + safeEnd + '/' + evidence.bytes,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Accept-Ranges':'bytes'
    });
    return fs.createReadStream(media.exactPath, {start, end:safeEnd}).pipe(response);
  }
  response.writeHead(200, {
    'Content-Type':media.contentType,
    'Content-Length':evidence.bytes,
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Accept-Ranges':'bytes'
  });
  return fs.createReadStream(media.exactPath).pipe(response);
}

function startScriptN05RegenerationOrchestrator(jobRoot, requestId) {
  if (!n05RegenerationAutoStart) return {status:'autostart_disabled'};
  const resolvedJobRoot = path.resolve(jobRoot);
  if (!isInside(directJobsRoot, resolvedJobRoot)) throw createCodeError('SCRIPT_N05_REGENERATION_JOB_PATH_INVALID', '重做任务路径不在允许的任务根目录内');
  const authorityRoot = path.join(resolvedJobRoot, '00_AUTHORITY');
  const stdoutPath = path.join(authorityRoot, 'n05_regeneration_orchestrator.stdout.log');
  const stderrPath = path.join(authorityRoot, 'n05_regeneration_orchestrator.stderr.log');
  const stdout = fs.openSync(stdoutPath, 'a');
  const stderr = fs.openSync(stderrPath, 'a');
  try {
    const child = spawn(process.execPath, [n05RegenerationOrchestratorPath, '--job', resolvedJobRoot, '--request-id', requestId], {
      cwd:root,
      detached:true,
      windowsHide:true,
      stdio:['ignore', stdout, stderr],
      env:process.env
    });
    child.unref();
    return {status:'started', requestId};
  } finally {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
}

async function decideScriptN05Candidate(project, user, candidateId, body) {
  const review = await loadScriptN04Review(project);
  const candidate = (review.n05CandidateManifest?.items || []).find(item => String(item.id || '') === candidateId);
  if (!candidate) throw createCodeError('SCRIPT_N05_CANDIDATE_NOT_FOUND', '未找到该 N05 候选图');
  const decision = String(body?.decision || '');
  if (!['confirm', 'reject', 'regenerate'].includes(decision)) throw createCodeError('SCRIPT_N05_DECISION_INVALID', '候选操作必须是通过、否决或重做');
  const reason = String(body?.reason || '').trim().slice(0, 500);
  if (['reject', 'regenerate'].includes(decision) && !reason) throw createCodeError('SCRIPT_N05_DECISION_REASON_REQUIRED', '否决或重做必须写明具体问题');
  const timestamp = new Date().toISOString();
  const transactionId = 'N05DEC-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const transactionIntentPath = path.join(review.jobRoot, 'transaction_intent_' + transactionId.toLowerCase() + '.json');
  const regenerationQueuePath = review.n05RegenerationQueuePath;
  const allowedWritePaths = [review.n05DecisionPath];
  if (decision === 'regenerate') allowedWritePaths.push(regenerationQueuePath);
  await writeJson(transactionIntentPath, {
    schema_version:'workspace_transaction_intent_v1',
    run_id:transactionId,
    owner_thread:'niannian_ai_website_user_action',
    node_id:decision === 'regenerate' ? 'N05_EP001_candidate_regeneration_request' : 'N05_EP001_user_reference_decision',
    allowed_write_paths:allowedWritePaths,
    expected_outputs:decision === 'regenerate' ? ['n05_candidate_decisions.json', 'n05_candidate_regeneration_queue.json'] : ['n05_candidate_decisions.json'],
    cost_gate:'decision_record_only_no_provider_submit',
    promote_policy:'candidate_only_until_exact_sha_user_confirmation',
    forbidden_actions:['local_raster_editing', 'video_provider_submit', 'package_send', 'accepted_registry_promotion'],
    created_at:timestamp
  });
  const existing = Array.isArray(review.n05Decisions?.items) ? review.n05Decisions.items : [];
  const record = {
    id:candidateId,
    sha256:candidate.sha256,
    file_name:path.basename(candidate.exact_path),
    decision,
    reason,
    user_id:user.id,
    decided_at:timestamp,
    upload_eligible:decision === 'confirm',
    regenerate_requested:decision === 'regenerate',
    video_submit_allowed:false,
    package_send_allowed:false,
    registry_promotion_allowed:false
  };
  const nextItems = [...existing.filter(item => String(item.id || '') !== candidateId), record];
  await fsp.mkdir(path.dirname(review.n05DecisionPath), {recursive:true});
  await writeJson(review.n05DecisionPath, {
    schema_version:'niannian_n05_candidate_decisions_v1',
    job_id:review.localJobId,
    remote_job_id:project.id,
    items:nextItems,
    n06_video_submit_allowed:false,
    updated_at:timestamp
  });
  if (decision === 'regenerate') {
    const currentQueue = Array.isArray(review.n05RegenerationQueue?.items) ? review.n05RegenerationQueue.items : [];
    const requestId = 'N05REGEN-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const request = {
      request_id:requestId,
      job_id:review.localJobId,
      remote_job_id:project.id,
      episode_id:String(review.promptPackage?.episode_id || 'EP001'),
      candidate_id:candidateId,
      source_candidate_sha256:candidate.sha256,
      source_candidate_path:String(candidate.exact_path || ''),
      source_prompt_sha256:String(candidate.prompt_sha256 || ''),
      candidate_manifest_path:String(n04NamedArtifact(review.ledger, 'n05_ep001_candidate_review_manifest')?.exact_path || ''),
      reason,
      requested_by:user.id,
      requested_at:timestamp,
      status:'queued_for_approved_image2_worker',
      provider_policy:'krill_image2_primary_runninghub_fallback',
      whole_image_regeneration_only:true,
      local_raster_editing_allowed:false,
      video_submit_allowed:false,
      package_send_allowed:false,
      registry_promotion_allowed:false,
      next_action:'受控 Image2 worker 读取当前候选、原提示词哈希和用户问题，整图重做并回写新候选、exact path 与 SHA；新候选先进入独立视觉 QA 和用户确认门。'
    };
    const nextQueueItems = [
      ...currentQueue.filter(item => String(item.candidate_id || '') !== candidateId || !String(item.status || '').startsWith('queued_')),
      request
    ];
    await writeJson(regenerationQueuePath, {
      schema_version:'niannian_n05_candidate_regeneration_queue_v1',
      job_id:review.localJobId,
      remote_job_id:project.id,
      items:nextQueueItems,
      provider_submit_requested:false,
      video_submit_allowed:false,
      updated_at:timestamp
    });
  }
  return loadScriptN04Review(project);
}

async function authorizeScriptN04Review(project, user, body) {
  const review = await loadScriptN04Review(project);
  if (body?.authorizeN05 !== true) throw createCodeError('SCRIPT_N04_AUTHORIZATION_REQUIRED', '请在网站中明确确认后，才可授权 N05 候选图生成');
  if (review.authorization && review.authorization.user_id === user.id) return review;

  const timestamp = new Date().toISOString();
  const authorization = {
    schema_version:'niannian_n04_review_authorization_v1',
    authorization_id:'N04AUTH-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    authorized_at:timestamp,
    authorization_channel:'niannian_ai_website_workbench',
    user_id:user.id,
    job_id:review.localJobId,
    remote_job_id:project.id,
    episode_id:String(review.promptPackage.episode_id || 'EP001'),
    prompt_package_sha256:review.packageSha.sha256,
    authorization_scope:{
      n05_whole_image_candidate_generation:true,
      allowed_asset_classes:['character_identity_set','recurring_scene','key_prop_room_door','true_first_frame'],
      allowed_channel:'approved_Image2_or_user_approved_whole_image_channel',
      local_image_editing:false,
      reference_confirmation_required_after_generation:true
    },
    provider_submit:false,
    package_send:false,
    registry_promotion:false,
    note:'本授权仅允许严格按当前 N04 包生成 N05 整图候选。候选仍需用户逐项确认，视频提交、打包发送和 registry 提升保持关闭。'
  };

  const n05Node = 'N05_EP001_whole_image_candidate_generation';
  const status = {
    ...(review.status || {}),
    status:'n05_authorized_waiting_execution',
    current_node:n05Node,
    earliest_incomplete_node:n05Node,
    next_skill:'mx-shortdrama-script-only-production',
    blocker:null,
    next_action:'已获网站 N05 候选图授权。使用已批准的 Image2/整图渠道严格执行当前 N04 包；生成后必须回到网站逐项确认角色、场景、房门和五张真首帧。不得提交视频。',
    updated_at:timestamp
  };
  const checkpointBlockers = Array.isArray(review.checkpoint?.blockers) ? review.checkpoint.blockers.filter(item => String(item?.blocker_signature || '') !== 'n05_image2_generation_not_explicitly_authorized') : [];
  const checkpoint = {
    ...(review.checkpoint || {}),
    status:'N05_AUTHORIZED_WAITING_EXECUTION',
    current_step:n05Node,
    completed:appendOnce(review.checkpoint?.completed, 'N04 EP001 visual direction reviewed by website owner and N05 whole-image candidate authorization recorded'),
    blockers:checkpointBlockers,
    next_skill:'mx-shortdrama-script-only-production',
    next_action:status.next_action,
    updated_at:timestamp
  };
  const dashboard = {
    ...(review.dashboard || {}),
    overall_status:'n05_authorized_waiting_execution',
    current_node:n05Node,
    earliest_incomplete_node:n05Node,
    next_skill:'mx-shortdrama-script-only-production',
    blocker:null,
    gates:{
      ...(review.dashboard?.gates || {}),
      N04:{status:'user_visual_review_confirmed'},
      N05:{status:'authorized_waiting_approved_image_channel_execution'},
      provider_submit:{status:'blocked_explicit_submit_authorization'},
      package_send:{status:'blocked_controller_authorization'},
      accepted_registry_promotion:{status:'blocked_qa_acceptance'}
    },
    next_action:status.next_action,
    updated_at:timestamp
  };
  const n04ArtifactIds = new Set(['n04_ep001_prompt_package_json', 'n04_ep001_video_groups', 'n04_ep001_first_frame_plan']);
  const artifacts = (Array.isArray(review.ledger?.artifacts) ? review.ledger.artifacts : []).map(item => {
    if (!n04ArtifactIds.has(item?.artifact_id)) return item;
    return {
      ...item,
      status:'verified',
      downstream_consumable_by:appendOnce(item.downstream_consumable_by, n05Node),
      reason:'N04 package was visually reviewed and authorized by the website owner for N05 candidate generation only.'
    };
  });
  artifacts.push({
    artifact_id:'n04_ep001_user_visual_review_authorization',
    node_id:'N04_EP001_user_visual_review',
    exact_path:review.authorizationPath,
    sha256:sha256Text(JSON.stringify(authorization)),
    status:'verified',
    downstream_consumable_by:[n05Node],
    reason:'Website owner authorized N05 whole-image candidate generation only; provider submit remains blocked.'
  });
  const ledger = {...(review.ledger || {}), artifacts, updated_at:timestamp};
  const result = {
    ...(review.result || {}),
    node_completion:{
      ...(review.result?.node_completion || {}),
      node:'N04_EP001_user_visual_review',
      status:'PASS_USER_VISUAL_REVIEWED_N05_AUTHORIZED',
      completed:true,
      acceptance_scope:'N04 visual direction was explicitly reviewed in the website. This authorizes only N05 whole-image candidate generation; it is not reference confirmation, video execution, or delivery completion.',
      next_node:n05Node
    },
    overall_job_completion:false,
    status:'PASS_N04_USER_VISUAL_REVIEWED_N05_AUTHORIZED_WAITING_EXECUTION',
    quality_gates:{
      ...(review.result?.quality_gates || {}),
      n04_visual_review:'PASS_website_owner_confirmed',
      n05_image_execution:'AUTHORIZED_waiting_execution',
      provider_submit:'BLOCKED_explicit_submit_authorization'
    },
    delivery_state:{packaged:false,transport_success:false,user_visible_acceptance:false},
    next_action:status.next_action,
    updated_at:timestamp
  };
  await Promise.all([
    writeScriptJson(review.authorizationPath, authorization),
    writeScriptJson(path.join(review.jobRoot, 'status.json'), status),
    writeScriptJson(path.join(review.jobRoot, 'checkpoint.json'), checkpoint),
    writeScriptJson(path.join(review.jobRoot, 'gate_dashboard.json'), dashboard),
    writeScriptJson(path.join(review.jobRoot, 'artifact_ledger.json'), ledger),
    writeScriptJson(path.join(review.jobRoot, 'result_manifest.json'), result)
  ]);
  return loadScriptN04Review(project);
}

async function reconcileScriptProjectFromJob(project) {
  const localJobId = String(project.runtime?.workerJob?.localJobId || scriptDirectJobId(project.id)).trim();
  if (!/^web_ns-[a-z0-9-]+$/.test(localJobId)) return {changed:false, status:'not_available'};
  const jobRoot = path.join(directJobsRoot, localJobId);
  if (!isInside(directJobsRoot, jobRoot)) return {changed:false, status:'not_available'};
  const [task, status, checkpoint, dashboard, ledger, result] = await Promise.all([
    readJsonFile(path.join(jobRoot, 'task.json')),
    readJsonFile(path.join(jobRoot, 'status.json')),
    readJsonFile(path.join(jobRoot, 'checkpoint.json')),
    readJsonFile(path.join(jobRoot, 'gate_dashboard.json')),
    readJsonFile(path.join(jobRoot, 'artifact_ledger.json')),
    readJsonFile(path.join(jobRoot, 'result_manifest.json'))
  ]);
  if (!task || !status || !dashboard || !ledger || !task.source_script) return {changed:false, status:'not_available'};
  if (task.job_id !== localJobId || task.remote_job_id !== project.id) return {changed:false, status:'contract_mismatch'};
  const sourceEvidence = await sha256File(project.source.storedPath).catch(() => null);
  if (!sourceEvidence || sourceEvidence.sha256 !== task.source_script.sha256) return {changed:false, status:'source_mismatch'};

  const currentNodeDetail = String(dashboard.current_node || status.current_node || checkpoint?.current_step || 'N01').slice(0, 160);
  const currentNode = scriptNodeId(currentNodeDetail, scriptNodeId(status.earliest_incomplete_node || 'N01'));
  const artifacts = Array.isArray(ledger.artifacts) ? ledger.artifacts : [];
  const verifiedArtifactCount = artifacts.filter(item => ['verified', 'delivered'].includes(String(item?.status || '').toLowerCase())).length;
  const gates = dashboard.gates && typeof dashboard.gates === 'object' ? dashboard.gates : {};
  const blocker = scriptBlockerText(dashboard.blocker) || scriptBlockerText(status.blocker) || scriptBlockerText(checkpoint?.blockers);
  const nextAction = String(dashboard.next_action || status.next_action || checkpoint?.next_action || '等待当前质量门完成。').slice(0, 1000);
  const productionStatus = String(dashboard.overall_status || status.status || checkpoint?.status || 'queued').slice(0, 160);
  const nextSkill = String(dashboard.next_skill || status.next_skill || checkpoint?.next_skill || 'mx-shortdrama-script-only-production').slice(0, 160);
  const nextGates = {
    ...(project.gates || {}),
    rights:project.gates?.rights || 'confirmed',
    source_ingest:project.gates?.source_ingest || 'verified',
    canon_ledger:scriptGateStatus(gates, 'N01', project.gates?.canon_ledger || 'pending'),
    direction:dashboard.direction?.status || project.gates?.direction || 'pending_user_confirmation',
    image_assets:scriptGateStatus(gates, 'N05', project.gates?.image_assets || 'not_started'),
    video_provider:scriptGateStatus(gates, 'provider_submit', project.gates?.video_provider || 'blocked'),
    reference_confirmation:dashboard.reference_separation_summary?.reference_confirmation || project.gates?.reference_confirmation || 'pending'
  };
  const nextRuntime = {
    ...(project.runtime || {}),
    productionStatus,
    currentNode,
    currentNodeDetail,
    earliestIncompleteNode:String(dashboard.earliest_incomplete_node || status.earliest_incomplete_node || currentNode).slice(0, 160),
    nextSkill,
    nextAction,
    blocker,
    artifactCount:artifacts.length,
    verifiedArtifactCount,
    gateState:scriptGateStatus(gates, currentNode, blocker ? 'blocked' : 'synchronized'),
    gates,
    checkpointUpdatedAt:String(checkpoint?.updated_at || status.updated_at || dashboard.updated_at || '').slice(0, 80) || null,
    workerJob:{
      ...(project.runtime?.workerJob || {}),
      localJobId,
      status:productionStatus,
      sourceKind:'source_script',
      sourceSha256:task.source_script.sha256
    },
    sourceIntegrity:'verified_current_source_sha256',
    resultStatus:result?.status || null
  };
  const before = JSON.stringify({pipeline:project.pipeline, runtime:project.runtime, gates:project.gates, route:project.route});
  project.pipeline = scriptPipeline(currentNode);
  project.runtime = nextRuntime;
  project.gates = nextGates;
  project.route = {...(project.route || {}), rootSkill:'mx-shortdrama-00-router', productionSkill:'mx-shortdrama-script-only-production', currentNode, earliestNode:nextRuntime.earliestIncompleteNode, nextSkill};
  project.updatedAt = new Date().toISOString();
  const after = JSON.stringify({pipeline:project.pipeline, runtime:project.runtime, gates:project.gates, route:project.route});
  return {changed:before !== after, status:'synchronized', localJobId, currentNode};
}

async function reconcileOwnedScriptProjects(projects, userId) {
  let changed = false;
  const results = [];
  for (const project of projects) {
    if (project.ownerId !== userId) continue;
    const result = await reconcileScriptProjectFromJob(project);
    changed = changed || result.changed;
    results.push({projectId:project.id, ...result});
  }
  if (changed) await writeScriptProjects(projects);
  return results;
}

function defaultProductionIndex() {
  return {
    schema_version:1,
    index_type:'zhuanhui_production_jobs',
    workspace_root:zhuanhuiWorkspace,
    job_roots:{codex_direct:directJobsRoot},
    jobs:[]
  };
}

async function updateScriptProductionIndex(row) {
  const index = await readJsonFile(productionIndexPath, defaultProductionIndex());
  index.schema_version = index.schema_version || 1;
  index.index_type = index.index_type || 'zhuanhui_production_jobs';
  index.workspace_root = index.workspace_root || zhuanhuiWorkspace;
  index.job_roots = {...(index.job_roots || {}), codex_direct:directJobsRoot};
  index.jobs = Array.isArray(index.jobs) ? index.jobs : [];
  const existingIndex = index.jobs.findIndex(item => item && item.job_id === row.job_id);
  if (existingIndex >= 0) index.jobs[existingIndex] = {...index.jobs[existingIndex], ...row};
  else index.jobs.push(row);
  index.updated_at = new Date().toISOString();
  await writeScriptJson(productionIndexPath, index);
}

async function validateExistingScriptDirectJob(project, jobRoot, localJobId) {
  const task = await readJsonFile(path.join(jobRoot, 'task.json'));
  if (!task || task.job_id !== localJobId || task.remote_job_id !== project.id || !task.source_script) {
    throw createCodeError('SCRIPT_ADAPTATION_JOB_CONFLICT', 'AI 编剧任务目录已存在，但合同不属于当前小说项目');
  }
  const sourceEvidence = await sha256File(task.source_script.exact_path);
  if (sourceEvidence.sha256 !== task.source_script.sha256) {
    throw createCodeError('SCRIPT_ADAPTATION_SOURCE_MISMATCH', 'AI 编剧任务源文本哈希不一致');
  }
  return { sourceEvidence };
}

async function materializeScriptAdaptationJob(project) {
  const localJobId = scriptDirectJobId(project.id);
  const jobRoot = path.join(directJobsRoot, localJobId);
  if (!isInside(directJobsRoot, jobRoot)) throw createCodeError('SCRIPT_ADAPTATION_JOB_PATH_INVALID', 'AI 编剧任务路径不安全');
  const timestamp = new Date().toISOString();
  const existingTask = await readJsonFile(path.join(jobRoot, 'task.json'));
  if (existingTask) {
    const existing = await validateExistingScriptDirectJob(project, jobRoot, localJobId);
    await updateScriptProductionIndex({
      job_id:localJobId,
      entrypoint:'codex_direct',
      source_entrypoint:'niannian_ai_web_script',
      source_kind:'source_script',
      remote_job_id:project.id,
      job_dir:jobRoot,
      status:existingTask.status || 'queued',
      raw_status:existingTask.status || 'queued',
      current_step:'N01',
      blockers:[],
      next_action:'已准备 AI 编剧员工任务，等待本机或 Mac relay 执行 N01 事实账本。',
      delivery_state:{packaged:false,transport_success:false,user_visible_acceptance:false},
      updated_at:timestamp
    });
    project.runtime = {
      ...(project.runtime || {}),
      productionStatus:'adaptation_worker_prepared',
      currentNode:'N01',
      nextAction:'AI 编剧员工任务已准备，等待执行 N01 带引用的文本事实账本。',
      blocker:null,
      workerJob:{localJobId,status:'prepared',sourceKind:'source_script'}
    };
    project.gates = {...(project.gates || {}), canon_ledger:'worker_prepared', video_provider:'blocked'};
    return { localJobId, jobRoot, sourceEvidence:existing.sourceEvidence, reused:true };
  }
  if (await fsp.lstat(jobRoot).catch(() => null)) {
    throw createCodeError('SCRIPT_ADAPTATION_JOB_CONFLICT', 'AI 编剧任务目录已存在，但缺少可验证合同');
  }

  const sourceTextPath = project.ingest && project.ingest.sourceTextPath;
  if (!sourceTextPath || !isInside(scriptWorkspacesRoot, sourceTextPath)) {
    throw createCodeError('SCRIPT_SOURCE_INGEST_MISSING', '缺少已验证的小说正文提取产物');
  }
  await fsp.access(sourceTextPath);
  const stagingRoot = jobRoot + '.incoming-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  const sourceDir = path.join(stagingRoot, 'source');
  const sourceCopyPath = path.join(sourceDir, 'source_text.txt');
  const finalSourcePath = path.join(jobRoot, 'source', 'source_text.txt');
  await fsp.rm(stagingRoot, {recursive:true, force:true});
  await fsp.mkdir(sourceDir, {recursive:true});
  await fsp.copyFile(sourceTextPath, sourceCopyPath);
  const sourceEvidence = await sha256File(sourceCopyPath);
  const transactionIntent = {
    run_id:localJobId,
    owner_thread:'unassigned_script_only_worker',
    node_id:'N01_canon_ledger',
    allowed_write_paths:[jobRoot],
    expected_outputs:['canon_ledger.json','canon_ledger.md','viewer_hook_direction.md','checkpoint.json','worker_report.md','result_manifest.json','artifact_ledger.json','gate_dashboard.json','employee_worker_receipt.json'],
    cost_gate:'controller_authorization_required',
    promote_policy:'verified_only'
  };
  const allowedSkillRoutes = ['mx-shortdrama-00-router','mx-shortdrama-script-only-production'];
  const task = {
    schema_version:'niannian_script_only_worker_v1',
    contract:'niannian_script_only_worker_v1',
    job_id:localJobId,
    remote_job_id:project.id,
    created_at:timestamp,
    entrypoint:'niannian_web_script_project',
    required_router:'mx-shortdrama-00-router',
    selected_skill:'mx-shortdrama-script-only-production',
    allowed_skill_routes:allowedSkillRoutes,
    current_node:'N01',
    source_script:{
      exact_path:finalSourcePath,
      sha256:sourceEvidence.sha256,
      bytes:sourceEvidence.bytes,
      type:'extracted_novel_text',
      project_source_type:project.source.type,
      original_name:project.source.originalName || null
    },
    request:{
      name:project.name,
      genre:project.genre,
      audience:project.audience,
      episode_duration_sec:project.episodeDuration,
      aspect_ratio:project.aspectRatio,
      target_language:'zh-CN first, later video prompts can be localized after confirmation',
      route:'script_only_n00_to_n07'
    },
    transaction_intent:transactionIntent,
    constraints:{
      local_image_editing:false,
      codex_worker_requires_route_allowlist:true,
      provider_submit_requires_authorization:true,
      package_send_requires_authorization:true,
      accepted_registry_promotion_requires_qa:true
    }
  };
  const routeDecision = {
    schema_version:'niannian_route_decision_v1',
    job_id:localJobId,
    mode:'shadow',
    advisory_only:true,
    required_router:'mx-shortdrama-00-router',
    allowed_skill_routes:allowedSkillRoutes,
    source_kind:'source_script',
    source_sha256:sourceEvidence.sha256,
    earliest_incomplete_node:'N01',
    selected_skill:'mx-shortdrama-script-only-production',
    provider_submit:'blocked_cost_authorization',
    package_send:'blocked_controller_authorization',
    generated_at:timestamp
  };
  const sourceArtifact = {
    artifact_id:'source_script_text',
    node_id:'N00_source_intake',
    exact_path:finalSourcePath,
    sha256:sourceEvidence.sha256,
    bytes:sourceEvidence.bytes,
    status:'verified',
    downstream_consumable_by:['N01_canon_ledger']
  };
  const ledger = {schema_version:'artifact_ledger_v1',job_id:localJobId,artifacts:[sourceArtifact],updated_at:timestamp};
  const status = {
    job_id:localJobId,
    status:'queued',
    current_node:'N01',
    earliest_incomplete_node:'N01',
    next_skill:'mx-shortdrama-script-only-production',
    blocker:null,
    next_action:'执行 N01：基于源文本和段落引用建立人物、关系、世界观与时间线事实账本；不得发起图片或视频 provider。',
    updated_at:timestamp
  };
  const checkpoint = {
    schema_version:1,
    job_id:localJobId,
    status:'queued',
    current_step:'N01_waiting_ai_screenwriter_worker',
    completed:['N00 source intake verified', 'N01 source text copied into isolated job root', 'router selected script-only production'],
    blockers:[],
    next_skill:'mx-shortdrama-script-only-production',
    next_action:status.next_action,
    updated_at:timestamp
  };
  const gateDashboard = {
    schema_version:'niannian_script_gate_dashboard_v1',
    job_id:localJobId,
    overall_status:'queued',
    current_node:'N01',
    earliest_incomplete_node:'N01',
    next_skill:'mx-shortdrama-script-only-production',
    gates:{
      N00:{status:'completed'},
      N01:{status:'ready_for_ai_worker'},
      N02:{status:'blocked_upstream'},
      N03:{status:'blocked_upstream'},
      N04:{status:'blocked_upstream'},
      N05:{status:'blocked_reference_confirmation'},
      N06:{status:'blocked_provider_authorization'},
      N07:{status:'blocked_upstream'},
      source_script:{status:'verified'},
      provider_submit:{status:'blocked_cost_authorization'},
      package_send:{status:'blocked_controller_authorization'}
    },
    blocker:null,
    next_action:status.next_action,
    updated_at:timestamp
  };
  const resultManifest = {
    job_id:localJobId,
    remote_job_id:project.id,
    status:'queued',
    success:false,
    packaged:false,
    transport_success:false,
    user_visible_acceptance:false,
    artifacts:[sourceArtifact],
    updated_at:timestamp
  };
  await Promise.all([
    writeScriptJson(path.join(stagingRoot, 'transaction_intent.json'), transactionIntent),
    writeScriptJson(path.join(stagingRoot, 'task.json'), task),
    writeScriptJson(path.join(stagingRoot, 'route_decision.json'), routeDecision),
    writeScriptJson(path.join(stagingRoot, 'status.json'), status),
    writeScriptJson(path.join(stagingRoot, 'checkpoint.json'), checkpoint),
    writeScriptJson(path.join(stagingRoot, 'result_manifest.json'), resultManifest),
    writeScriptJson(path.join(stagingRoot, 'gate_dashboard.json'), gateDashboard),
    writeScriptJson(path.join(stagingRoot, 'artifact_ledger.json'), ledger),
    writeScriptJson(path.join(stagingRoot, 'assignments.json'), {
      job_id:localJobId,
      controller:'website_script_materializer',
      script_worker:'unassigned',
      dispatch_status:'awaiting_worker_dispatch',
      allowed_nodes:['N01'],
      forbidden_actions:['provider_submit','package_send','accepted_registry_promotion','local_image_editing']
    }),
    fsp.writeFile(path.join(stagingRoot, 'gate_dashboard.md'), '# 质量门\n\n- 当前节点：N01\n- 源文本：已验证\n- 下一技能：mx-shortdrama-script-only-production\n- 图片/视频 provider：授权阻塞\n- 打包/发送：授权阻塞\n- 下一动作：执行带段落引用的文本事实账本。\n', 'utf8'),
    fsp.writeFile(path.join(stagingRoot, 'codex_prompt.md'), '# 念念 AI 小说转短剧派单\n\n必须先使用 mx-shortdrama-00-router，再进入 mx-shortdrama-script-only-production。只执行 N01：从 task.source_script.exact_path 读取源文本，建立带段落引用的人物、关系、世界观与时间线事实账本，并写 viewer_hook_direction.md。不得伪造源视频 Step01/Step02，不得提交 Image2/视频 provider，不得打包、发送或提升 accepted registry。\n', 'utf8'),
    fsp.writeFile(path.join(stagingRoot, 'worker_report.md'), '# Worker Report\n\n- Status: QUEUED\n- Route: mx-shortdrama-00-router -> mx-shortdrama-script-only-production\n- Current node: N01\n- Source script: verified\n- Provider submit: blocked pending explicit authorization\n- Package/send: blocked pending controller authorization\n- Next action: AI screenwriter worker builds cited canon ledger from source text.\n', 'utf8'),
    fsp.writeFile(path.join(stagingRoot, 'conversation_log.md'), '# Conversation Log\n\n- ' + timestamp + ' Website script project materialized into isolated direct job.\n', 'utf8')
  ]);
  await fsp.mkdir(path.dirname(jobRoot), {recursive:true});
  await fsp.rename(stagingRoot, jobRoot);
  await updateScriptProductionIndex({
    job_id:localJobId,
    entrypoint:'codex_direct',
    source_entrypoint:'niannian_ai_web_script',
    source_kind:'source_script',
    remote_job_id:project.id,
    job_dir:jobRoot,
    status:'queued',
    raw_status:'queued',
    current_step:'N01',
    blockers:[],
    next_action:status.next_action,
    delivery_state:{packaged:false,transport_success:false,user_visible_acceptance:false},
    updated_at:timestamp
  });
  project.runtime = {
    ...(project.runtime || {}),
    productionStatus:'adaptation_worker_prepared',
    currentNode:'N01',
    nextAction:'AI 编剧员工任务已准备。下一步执行 N01 带引用的文本事实账本；图片/视频渠道仍保持授权阻塞。',
    blocker:null,
    workerJob:{localJobId,status:'queued',sourceKind:'source_script'}
  };
  project.gates = {...(project.gates || {}), canon_ledger:'worker_prepared', video_provider:'blocked'};
  return { localJobId, jobRoot, sourceEvidence, reused:false };
}

async function prepareScriptAdaptationJob(request, response, user, projectId) {
  try {
    const projects = await readScriptProjects();
    const index = projects.findIndex(item => item.id === projectId && item.ownerId === user.id);
    if (index < 0) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
    const job = await materializeScriptAdaptationJob(projects[index]);
    projects[index].updatedAt = new Date().toISOString();
    await writeScriptProjects(projects);
    return json(response, 200, {
      code:'SCRIPT_ADAPTATION_WORKER_PREPARED',
      project:publicScriptProject(projects[index]),
      job:{localJobId:job.localJobId,status:job.reused ? 'already_prepared' : 'prepared',sourceSha256:job.sourceEvidence.sha256}
    });
  } catch (error) {
    return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_ADAPTATION_JOB_FAILED', error:error.message || 'AI 编剧任务准备失败'});
  }
}

async function createScriptProject(request, response, user) {
  let sourcePath = null;
  let idempotencyClaimed = false;
  let idempotencyKey = null;
  let idempotencyFingerprint = null;
  try {
    const body = await readBodyJson(request);
    const input = scriptProjectInput(body);
    const sourceText = validateScriptSourceText(cleanScriptSourceText(body.sourceText));
    idempotencyKey = idempotencyKeyFromRequest(request);
    idempotencyFingerprint = sha256Text(JSON.stringify({scope:'script-project',input,sourceTextSha256:sha256Text(sourceText)}));
    const idem = await beginWebsiteIdempotency(user, 'script-project', idempotencyKey, idempotencyFingerprint);
    if (idem.status === 'completed' && idem.record?.projectId) {
      const existingProject = (await readScriptProjects()).find(item => item.id === idem.record.projectId && item.ownerId === user.id);
      if (existingProject) return json(response, 200, {code:'SCRIPT_PROJECT_REUSED', project:publicScriptProject(existingProject), idempotent:true});
    }
    if (idem.status === 'pending') throw createCodeError('IDEMPOTENCY_IN_PROGRESS', '相同请求正在处理中，请稍后读取项目状态');
    idempotencyClaimed = idem.status === 'claimed';
    const id = scriptProjectId();
    sourcePath = path.join(scriptSourcesRoot, id + '.txt');
    const sha256 = crypto.createHash('sha256').update(sourceText, 'utf8').digest('hex');
    await fsp.writeFile(sourcePath, sourceText + '\n', 'utf8');
    const project = await persistScriptProject(user, input, sourceText, {
      id,
      type:'pasted_text',
      storedPath:sourcePath,
      mimeType:'text/plain; charset=utf-8',
      bytes:Buffer.byteLength(sourceText, 'utf8'),
      sha256
    });
    await completeWebsiteIdempotency(user, 'script-project', idempotencyKey, idempotencyFingerprint, project.id);
    return json(response, 201, {project:publicScriptProject(project)});
  } catch (error) {
    if (sourcePath) await fsp.rm(sourcePath, {force:true}).catch(() => {});
    if (idempotencyClaimed) await failWebsiteIdempotency(user, 'script-project', idempotencyKey).catch(() => {});
    return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_PROJECT_CREATE_FAILED', error:error.message || '短剧项目创建失败'});
  }
}

async function createScriptProjectFromDocx(request, response, user) {
  const length = Number(request.headers['content-length'] || 0);
  if (length > maxScriptDocumentBytes + 128 * 1024) return json(response, 413, {code:'SCRIPT_DOCUMENT_TOO_LARGE', error:'Word 文档不能超过当前 25MB 限制'});
  await ensureData();
  const id = scriptProjectId();
  const fields = {};
  let source = null;
  let sourcePath = null;
  let uploadPromise = Promise.resolve();
  let uploadError = null;
  let responded = false;
  let idempotencyClaimed = false;
  let idempotencyKey = null;
  let idempotencyFingerprint = null;
  const reply = (status, payload) => {
    if (responded) return;
    responded = true;
    json(response, status, payload);
  };
  let busboy;
  try {
    busboy = Busboy({headers:request.headers, limits:{files:1, fileSize:maxScriptDocumentBytes, fields:12}});
  } catch {
    return reply(400, {code:'SCRIPT_DOCUMENT_MULTIPART_REQUIRED', error:'请使用 multipart/form-data 上传 Word 文档'});
  }
  busboy.on('field', (name, value) => { fields[name] = value; });
  busboy.on('file', (name, file, info) => {
    if (name !== 'sourceDocument' || sourcePath) {
      uploadError = '请只上传一个 Word 文档';
      file.resume();
      return;
    }
    const originalName = safeName(info.filename || 'novel.docx');
    if (path.extname(originalName).toLowerCase() !== '.docx') {
      uploadError = '仅支持 .docx Word 文档';
      file.resume();
      return;
    }
    sourcePath = path.join(scriptSourcesRoot, id + '.docx');
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    uploadPromise = new Promise((resolve, reject) => {
      const output = fs.createWriteStream(sourcePath, {flags:'wx'});
      file.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
      file.on('limit', () => { uploadError = 'Word 文档不能超过当前 25MB 限制'; });
      file.on('error', reject);
      output.on('error', reject);
      output.on('finish', () => {
        source = {id, type:'docx', originalName, storedPath:sourcePath, mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes, sha256:hash.digest('hex')};
        resolve();
      });
      file.pipe(output);
    });
  });
  busboy.on('error', async error => {
    if (sourcePath) await fsp.rm(sourcePath, {force:true}).catch(() => {});
    reply(400, {code:'SCRIPT_DOCUMENT_UPLOAD_FAILED', error:error.message || 'Word 文档上传失败'});
  });
  busboy.on('close', async () => {
    let created = false;
    try {
      await uploadPromise;
      if (uploadError) throw createCodeError(uploadError.includes('超过') ? 'SCRIPT_DOCUMENT_TOO_LARGE' : 'SCRIPT_DOCUMENT_INVALID', uploadError);
      if (!source) throw createCodeError('SCRIPT_DOCUMENT_REQUIRED', '请上传 .docx Word 文档');
      const input = scriptProjectInput(fields);
      idempotencyKey = idempotencyKeyFromRequest(request);
      idempotencyFingerprint = sha256Text(JSON.stringify({scope:'script-project-docx',input,sourceSha256:source.sha256,sourceBytes:source.bytes}));
      const idem = await beginWebsiteIdempotency(user, 'script-project-docx', idempotencyKey, idempotencyFingerprint);
      if (idem.status === 'completed' && idem.record?.projectId) {
        const existingProject = (await readScriptProjects()).find(item => item.id === idem.record.projectId && item.ownerId === user.id);
        if (existingProject) {
          await fsp.rm(sourcePath, {force:true});
          sourcePath = null;
          created = true;
          return reply(200, {code:'SCRIPT_PROJECT_REUSED', project:publicScriptProject(existingProject), idempotent:true});
        }
      }
      if (idem.status === 'pending') throw createCodeError('IDEMPOTENCY_IN_PROGRESS', '相同请求正在处理中，请稍后读取项目状态');
      idempotencyClaimed = idem.status === 'claimed';
      let extracted;
      try {
        extracted = await mammoth.extractRawText({path:source.storedPath});
      } catch {
        throw createCodeError('SCRIPT_DOCUMENT_PARSE_FAILED', '无法读取该 Word 文档，请确认它是未损坏的 .docx 文件');
      }
      const sourceText = validateScriptSourceText(cleanScriptSourceText(extracted.value));
      const project = await persistScriptProject(user, input, sourceText, {
        ...source,
        extraction:{engine:'mammoth@' + mammothVersion, warningCount:Array.isArray(extracted.messages) ? extracted.messages.length : 0}
      });
      await completeWebsiteIdempotency(user, 'script-project-docx', idempotencyKey, idempotencyFingerprint, project.id);
      created = true;
      return reply(201, {project:publicScriptProject(project)});
    } catch (error) {
      if (sourcePath && !created) await fsp.rm(sourcePath, {force:true}).catch(() => {});
      if (idempotencyClaimed) await failWebsiteIdempotency(user, 'script-project-docx', idempotencyKey).catch(() => {});
      return reply(scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_DOCUMENT_EXTRACT_FAILED', error:error.message || 'Word 文档解析失败'});
    }
  });
  request.pipe(busboy);
}

function bridgeAuthorized(request) {
  if (!bridgeTokenHash || !/^[a-f0-9]{64}$/.test(bridgeTokenHash)) return false;
  const authorization = String(request.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return false;
  return safeEqualHex(crypto.createHash('sha256').update(token).digest('hex'), bridgeTokenHash);
}

function bridgeProject(project) {
  const output = publicProject(project);
  output.source = { ...output.source, downloadUrl:'/api/bridge/jobs/' + project.id + '/source' };
  return output;
}

function controllerProject(project) {
  const output = publicProject(project);
  output.source = { ...output.source, sha256:project.source?.sha256 || null, downloadUrl:'/api/controller/jobs/' + project.id + '/source' };
  output.runtime = {...(project.runtime || {}),canonical:projectCanonicalTrace(project)};
  output.dispatch = publicDispatch(project.dispatch);
  output.authorityOwnerId=project.ownerId;
  output.rightsAuthority = {...project.rightsAuthority};
  output.rightsAuthorityReceipt = {...project.rightsAuthorityReceipt,downloadUrl:'/api/controller/jobs/' + project.id + '/rights-authority'};
  output.controller = {
      controllerId:(project.dispatch && project.dispatch.controllerId) || null,
      leaseId:(project.dispatch && project.dispatch.leaseId) || null,
      leaseUntil:(project.dispatch && project.dispatch.leaseUntil) || null
  };
  return output;
}

function publicStatus(controllerStatus) {
  if (['blocked_authorization','blocked_resource','blocked_contract','blocked_quality','blocked_transport','infra_failed','send_failed'].includes(controllerStatus) || controllerStatus.startsWith('step02_blocked_')) return 'blocked';
  if (controllerStatus === 'evidence_ready') return 'running';
  if (terminalControllerStatuses.has(controllerStatus) || ['accepted','packaged','sent'].includes(controllerStatus)) return 'completed';
  if (controllerStatus.startsWith('running_') || controllerStatus === 'qa_running') return 'running';
  return 'queued';
}

function pipelineForStatus(controllerStatus, gates = {}, canonicalTrace = null) {
  const trace = canonicalTrace && typeof canonicalTrace === 'object' ? canonicalTrace : null;
  const activeIndex = trace?.canonical_node_id ? redrawCanonicalDag.NODE_IDS.indexOf(trace.canonical_node_id) : -1;
  const resolved = trace?.resolution_status === 'resolved' && trace?.downstream_gate?.eligible === true;
  return redrawCanonicalDag.NODE_IDS.map((id,index)=>{
    let status='pending';
    if(activeIndex >= 0 && index < activeIndex)status='completed';
    if(activeIndex === index)status=resolved?'completed':'blocked';
    if(resolved && trace.downstream_gate.next_node_ids.includes(id))status='running';
    return {id,label:redrawCanonicalDag.stageForNode(id).label,status};
  });
}

function pipeline() {
  return [
    { id:'Step01', label:'证据与关键帧', status:'pending' },
    { id:'Step02', label:'源片事实账本', status:'pending' },
    { id:'Step04', label:'资产与视频提示词', status:'pending' },
    { id:'Step05', label:'资产与视频执行', status:'pending' }
  ];
}

async function writeJobContract(project) {
  const jobDir = path.join(jobsRoot, project.id);
  const existingRoot=await fsp.lstat(jobDir).catch(()=>null);
  if(existingRoot&&!project.jobContract)throw createCodeError('PROJECT_ID_COLLISION','项目 ID 已存在，拒绝覆盖旧任务目录');
  if(!existingRoot)await fsp.mkdir(jobDir,{recursive:false});
  await fsp.mkdir(path.join(jobDir, 'deliverables'), { recursive: true });
  const rightsPath=path.join(jobDir,'rights_authority.json');
  const rights=project.rightsAuthority;
  assertRightsAuthorityContract(rights,project,project.ownerId);
  const rightsBytes=rightsAuthorityBytes(rights);
  const rightsArtifact={artifact_id:'source_rights_authority',node_id:'source_intake',exact_path:rightsPath,sha256:crypto.createHash('sha256').update(rightsBytes).digest('hex'),bytes:rightsBytes.length,status:'verified',downstream_consumable_by:['source_preflight','Step01','controller_authorization']};
  project.rightsAuthorityReceipt={schema_version:'niannian_source_rights_authority_receipt_v1',event_id:rights.event_id,sha256:rightsArtifact.sha256,bytes:rightsArtifact.bytes,status:'verified'};
  const initialArtifact = {
    artifact_id:'source_video',
    node_id:'source_intake',
    exact_path:project.source.storedPath,
    sha256:project.source.sha256,
    bytes:project.source.bytes,
    status:'verified',
    downstream_consumable_by:['source_preflight', 'Step01']
  };
  const task = {
    schema_version:'niannian_redraw_job_v1',
    job_id:project.id,
    created_at:project.createdAt,
    entrypoint:'web_mvp',
    required_router:'mx-shortdrama-00-router',
    runtime_profile:serverStep01Executor.PROFILE,
    requested_by:{user_id:project.ownerId},
    rights_authority:{event_id:rights.event_id,exact_path:rightsPath,sha256:rightsArtifact.sha256,bytes:rightsArtifact.bytes,status:'confirmed',source_sha256:rights.source_sha256,source_bytes:rights.source_bytes,scope:rights.scope,confirmed_at:rights.confirmed_at,revoked:false},
    source_video:project.source,
    request:step01SourceFactRequest(project),
    transaction_intent:{run_id:project.id,owner_thread:'unassigned_worker',node_id:'redraw_fullchain_router',allowed_write_paths:[jobDir],expected_outputs:['media_probe.json','checkpoint.json','worker_report.md','result_manifest.json','artifact_ledger.json','gate_dashboard.json'],cost_gate:'controller_authorization_required',promote_policy:'verified_only'},
    constraints:{local_image_editing:false,provider_submit_requires_authorization:true,package_send_requires_authorization:true}
  };
  const status = {job_id:project.id,status:project.productionStatus,earliest_incomplete_node:'Step01',next_skill:'mx-shortdrama-01-frame-extract',blocker:null,next_action:project.runtime.nextAction};
  const gateDashboard = {
    schema_version:'niannian_web_preflight_v1',
    job_id:project.id,
    current_node:'source_preflight',
    earliest_incomplete_node:'Step01',
    next_skill:'mx-shortdrama-01-frame-extract',
    gates:{
      source_intake:{status:'verified'},
      source_preflight:{status:mediaPreflightEnabled ? 'running' : 'not_run'},
      Step01:{status:'blocked_preflight'},
      Step02:{status:'blocked_upstream'},
      Step04:{status:'blocked_upstream'},
      Step05:{status:'blocked_upstream'},
      provider_submit:{status:'blocked_reference_and_cost_authorization'}
    },
    blocker:null,
    next_action:project.runtime.nextAction,
    updated_at:project.createdAt
  };
  const ledger = {schema_version:'artifact_ledger_v1',job_id:project.id,artifacts:[initialArtifact,rightsArtifact],updated_at:project.createdAt};
  const prompt = '# 念念 AI 转绘任务\n\n先完成源视频预检，再使用 mx-shortdrama-00-router 判断最早未完成节点。按 Step01 -> Step02 -> Step04 -> Step05 推进；参考图、真实 provider submit、package/send 仍服从质量门和成本授权。\n';
  await Promise.all([
    fsp.writeFile(path.join(jobDir,'task.json'), JSON.stringify(task,null,2)+'\n'),
    fsp.writeFile(rightsPath,rightsBytes,{flag:'w'}),
    fsp.writeFile(path.join(jobDir,'status.json'), JSON.stringify(status,null,2)+'\n'),
    fsp.writeFile(path.join(jobDir,'codex_prompt.md'), prompt),
    fsp.writeFile(path.join(jobDir,'conversation_log.md'), '# Conversation Log\n\n- Web project created.\n'),
    fsp.writeFile(path.join(jobDir,'result_manifest.json'), JSON.stringify({job_id:project.id,status:project.productionStatus,success:false,packaged:false,transport_success:false,user_visible_acceptance:false,artifacts:[initialArtifact,rightsArtifact],updated_at:project.createdAt},null,2)+'\n'),
    fsp.writeFile(path.join(jobDir,'checkpoint.json'), JSON.stringify({job_id:project.id,status:project.productionStatus,current_node:'source_preflight',earliest_incomplete_node:'Step01',earliest_broken_contract:null,next_skill:'mx-shortdrama-01-frame-extract',next_action:project.runtime.nextAction,updated_at:project.createdAt},null,2)+'\n'),
    fsp.writeFile(path.join(jobDir,'worker_report.md'), '# Worker Report\n\n- Status: SOURCE PREFLIGHT\n- Router: mx-shortdrama-00-router\n- Earliest incomplete node: Step01\n- Next skill: mx-shortdrama-01-frame-extract\n- Provider submit: blocked pending reference confirmation and cost authorization\n- Next action: validate source media before formal Step01 evidence extraction.\n'),
    fsp.writeFile(path.join(jobDir,'artifact_ledger.json'), JSON.stringify(ledger,null,2)+'\n'),
    fsp.writeFile(path.join(jobDir,'gate_dashboard.json'), JSON.stringify(gateDashboard,null,2)+'\n')
  ]);
  return jobDir;
}

async function writeSourcePreflight(project) {
  const jobDir = path.join(jobsRoot, project.id);
  const inspectedAt = new Date().toISOString();
  const rightsPath=path.join(jobDir,'rights_authority.json');
  const rightsEvidence=await sha256StoredFile(rightsPath);
  const rightsArtifact={artifact_id:'source_rights_authority',node_id:'source_intake',exact_path:rightsPath,sha256:rightsEvidence.sha256,bytes:rightsEvidence.bytes,status:'verified',downstream_consumable_by:['source_preflight','Step01','controller_authorization']};
  const updateJobFiles = async (status, checkpoint, dashboard, ledger, resultManifest) => {
    await Promise.all([
      writeJson(path.join(jobDir, 'status.json'), status),
      writeJson(path.join(jobDir, 'checkpoint.json'), checkpoint),
      writeJson(path.join(jobDir, 'gate_dashboard.json'), dashboard),
      writeJson(path.join(jobDir, 'artifact_ledger.json'), ledger),
      writeJson(path.join(jobDir, 'result_manifest.json'), resultManifest),
      fsp.writeFile(path.join(jobDir, 'worker_report.md'), '# Worker Report\n\n- Status: ' + String(status.status || '').toUpperCase() + '\n- Router: mx-shortdrama-00-router\n- Earliest incomplete node: Step01\n- Next skill: mx-shortdrama-01-frame-extract\n- Provider submit: blocked pending reference confirmation and cost authorization\n- Next action: ' + status.next_action + '\n')
    ]);
  };

  if (!mediaPreflightEnabled) {
    project.preflight = {status:'not_run', inspectedAt, message:'当前环境关闭了本地源视频预检。'};
    project.analysis = {...(project.analysis || {}),status:'legacy_auto_queued',sourceSha256:project.source.sha256,updatedAt:inspectedAt};
    return project;
  }

  try {
    const preflight = await inspectSourceMedia(project.source);
    const probePath = path.join(jobDir, 'media_probe.json');
    await writeJson(probePath, preflight);
    const probeBytes = await fsp.readFile(probePath);
    const probeArtifact = {
      artifact_id:'source_media_probe',
      node_id:'source_preflight',
      exact_path:probePath,
      sha256:crypto.createHash('sha256').update(probeBytes).digest('hex'),
      bytes:probeBytes.length,
      status:'verified',
      downstream_consumable_by:['Step01']
    };
    const sourceArtifact = {
      artifact_id:'source_video',
      node_id:'source_intake',
      exact_path:project.source.storedPath,
      sha256:project.source.sha256,
      bytes:project.source.bytes,
      status:'verified',
      downstream_consumable_by:['source_preflight', 'Step01']
    };
    const ledger = {schema_version:'artifact_ledger_v1',job_id:project.id,artifacts:[sourceArtifact,rightsArtifact,probeArtifact],updated_at:inspectedAt};
    const nextAction = '源视频预检完成。请确认制作设置并点击“开始分析”；尚未启动 Codex worker 或任何外部生成渠道。';
    const status = {job_id:project.id,status:'preflight',current_node:'source_preflight',earliest_incomplete_node:'Step01',next_skill:'mx-shortdrama-01-frame-extract',blocker:null,next_action:nextAction,updated_at:inspectedAt};
    const checkpoint = {schema_version:1,job_id:project.id,status:'preflight',current_node:'source_preflight',earliest_incomplete_node:'Step01',completed:['source rights authority bound to user and source SHA','source video sha256 verified','source media probe verified'],blockers:[],next_skill:'mx-shortdrama-01-frame-extract',next_action:nextAction,updated_at:inspectedAt};
    const dashboard = {
      schema_version:'niannian_web_preflight_v1',job_id:project.id,current_node:'source_preflight',earliest_incomplete_node:'Step01',next_skill:'mx-shortdrama-01-frame-extract',
      gates:{source_rights:{status:'confirmed',event_id:project.rightsAuthority.event_id,source_sha256:project.source.sha256},source_intake:{status:'verified'},source_preflight:{status:'verified'},Step01:{status:'awaiting_user_start'},Step02:{status:'blocked_upstream'},Step04:{status:'blocked_upstream'},Step05:{status:'blocked_upstream'},provider_submit:{status:'blocked_reference_and_cost_authorization'},package_send:{status:'blocked_controller_authorization'}},
      blocker:null,next_action:nextAction,updated_at:inspectedAt
    };
    const resultManifest = {job_id:project.id,status:'preflight',success:false,packaged:false,transport_success:false,user_visible_acceptance:false,artifacts:ledger.artifacts,updated_at:inspectedAt};
    await updateJobFiles(status, checkpoint, dashboard, ledger, resultManifest);
    project.status = 'queued';
    project.productionStatus = 'preflight';
    project.preflight = preflight;
    project.analysis = {...(project.analysis || {}),status:'awaiting_user_start',sourceSha256:project.source.sha256,authorizationEventId:null,requestedAt:null,updatedAt:inspectedAt};
    project.pipeline = pipeline();
    project.runtime = {...project.runtime,productionStatus:'preflight',currentNode:'source_preflight',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:null,nextAction,artifactCount:3,verifiedArtifactCount:3,gateState:'awaiting_step01_user_start',gates:dashboard.gates,lastHeartbeat:null,checkpointUpdatedAt:inspectedAt};
    project.dispatch = {...project.dispatch,status:'awaiting_user_start',blocker:null};
  } catch (error) {
    const code = error.code || 'SOURCE_PREFLIGHT_FAILED';
    const message = mediaPreflightMessage(code);
    const blocker = code + ': ' + message;
    const failedAt = new Date().toISOString();
    const sourceArtifact = {artifact_id:'source_video',node_id:'source_intake',exact_path:project.source.storedPath,sha256:project.source.sha256,bytes:project.source.bytes,status:'verified',downstream_consumable_by:['source_preflight']};
    const ledger = {schema_version:'artifact_ledger_v1',job_id:project.id,artifacts:[sourceArtifact,rightsArtifact],updated_at:failedAt};
    const status = {job_id:project.id,status:'blocked_contract',current_node:'source_preflight',earliest_incomplete_node:'Step01',next_skill:'mx-shortdrama-01-frame-extract',blocker,next_action:'重新执行本地源视频预检，或上传可正常播放的视频文件。',updated_at:failedAt};
    const checkpoint = {schema_version:1,job_id:project.id,status:'blocked_contract',current_node:'source_preflight',earliest_incomplete_node:'Step01',completed:['source video sha256 verified'],blockers:[blocker],next_skill:'mx-shortdrama-01-frame-extract',next_action:status.next_action,updated_at:failedAt};
    const dashboard = {schema_version:'niannian_web_preflight_v1',job_id:project.id,current_node:'source_preflight',earliest_incomplete_node:'Step01',next_skill:'mx-shortdrama-01-frame-extract',gates:{source_intake:{status:'verified'},source_preflight:{status:'blocked',detail:blocker},Step01:{status:'blocked_preflight'},Step02:{status:'blocked_upstream'},Step04:{status:'blocked_upstream'},Step05:{status:'blocked_upstream'},provider_submit:{status:'blocked_preflight'}},blocker,next_action:status.next_action,updated_at:failedAt};
    const resultManifest = {job_id:project.id,status:'blocked_contract',success:false,packaged:false,transport_success:false,user_visible_acceptance:false,artifacts:ledger.artifacts,updated_at:failedAt};
    await updateJobFiles(status, checkpoint, dashboard, ledger, resultManifest);
    project.status = 'blocked';
    project.productionStatus = 'blocked_contract';
    project.preflight = {status:'failed',code,message,inspectedAt:failedAt};
    project.analysis = {...(project.analysis || {}),status:'blocked_preflight',sourceSha256:project.source.sha256,authorizationEventId:null,requestedAt:null,updatedAt:failedAt};
    project.pipeline = pipeline().map(step => step.id === 'Step01' ? {...step,status:'blocked'} : step);
    project.runtime = {...project.runtime,productionStatus:'blocked_contract',currentNode:'source_preflight',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker,nextAction:status.next_action,artifactCount:2,verifiedArtifactCount:2,gateState:'source_preflight_failed',gates:dashboard.gates,lastHeartbeat:null,checkpointUpdatedAt:failedAt};
    project.dispatch = {...project.dispatch,status:'blocked',blocker};
  }
  return project;
}

async function createProject(request, response, user) {
  const length = Number(request.headers['content-length'] || 0);
  if (length > maxUploadBytes) return json(response, 413, {code:'SOURCE_UPLOAD_TOO_LARGE',error:'源视频超过当前 300MB 上传限制'});
  let idempotencyKey;
  try {
    idempotencyKey = idempotencyKeyFromRequest(request);
  } catch (error) {
    return json(response, 400, {code:error.code || 'IDEMPOTENCY_KEY_INVALID',error:error.message || '幂等标识格式无效'});
  }
  let idempotencyFingerprint = null;
  let idempotencyClaimed = false;
  await ensureData();
  const uploadToken = crypto.randomBytes(12).toString('hex');
  const fields = Object.create(null);
  let source = null;
  let uploadPromise = Promise.resolve();
  let uploadError = null;
  const busboy = Busboy({ headers: request.headers, limits: { files: 1, fileSize: maxUploadBytes, fields: 30 } });
  busboy.on('field', (name, value) => { fields[name] = value; });
  busboy.on('file', (name, file, info) => {
    if (name !== 'sourceVideo' || source) {
      uploadError = {code:'SOURCE_UPLOAD_COUNT_INVALID',message:'请只上传一个源视频文件'};
      file.resume();
      return;
    }
    try {
      validateRedrawUpload(info);
    } catch (error) {
      uploadError = {code:error.code || 'SOURCE_FILE_TYPE_UNSUPPORTED',message:error.message};
      file.resume();
      return;
    }
    const filename = safeName(info.filename);
    const target = path.join(uploadsRoot, '.pending-redraw-' + uploadToken + '-' + filename);
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    uploadPromise = new Promise((resolve, reject) => {
      const output = fs.createWriteStream(target, { flags: 'wx' });
      file.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
      file.on('limit', () => { uploadError = {code:'SOURCE_UPLOAD_TOO_LARGE',message:'源视频超过当前 300MB 上传限制'}; });
      file.on('error', reject);
      output.on('error', reject);
      output.on('finish', () => { source = { originalName: info.filename, storedPath: target, mimeType: info.mimeType, bytes, sha256: hash.digest('hex') }; resolve(); });
      file.pipe(output);
    });
  });
  busboy.on('error', error => json(response, 400, {error:error.message}));
  busboy.on('close', async () => {
    try {
      await uploadPromise;
      if (uploadError) {
        if (source?.storedPath) await fsp.rm(source.storedPath, {force:true});
        return json(response, uploadError.code === 'SOURCE_UPLOAD_TOO_LARGE' ? 413 : 400, {code:uploadError.code,error:uploadError.message});
      }
      if (!source) return json(response, 400, {error:'请上传源视频'});
      const input = validateRedrawProjectFields(fields);
      idempotencyFingerprint = sha256Text(JSON.stringify({
        scope:'source-video-redraw-project',
        workspaceProjectId:input.workspaceProjectId || null,
        name:input.name,
        remakeMode:input.remakeMode,
        targetLanguage:input.targetLanguage,
        visualStyle:input.visualStyle,
        aspectRatio:input.aspectRatio,
        quality:input.quality,
        replacementBrief:input.replacementBrief,
        notes:input.notes,
        sourceSha256:source.sha256,
        sourceBytes:source.bytes
      }));
      const idempotency = await beginWebsiteIdempotency(user, 'source-video-redraw-project', idempotencyKey, idempotencyFingerprint);
      if (idempotency.status === 'completed' && idempotency.record?.projectId) {
        const existing = (await readProjects()).find(item => item.id === idempotency.record.projectId && item.ownerId === user.id);
        if (existing) {
          await fsp.rm(source.storedPath, {force:true}).catch(() => {});
          return json(response, 200, {code:'PROJECT_REUSED',project:publicProject(existing),idempotent:true});
        }
      }
      if (idempotency.status === 'pending') throw createCodeError('IDEMPOTENCY_IN_PROGRESS', '相同请求正在处理中，请稍后读取项目状态');
      idempotencyClaimed = idempotency.status === 'claimed';
      const project = await withRedrawProjectsWriteLock(async () => {
        const projects = await readProjects();
        const filename = safeName(source.originalName);
        const id = await allocateRedrawProjectId(projects, filename);
        const workspaceProjectId = await assertWorkspaceProjectOwned(user, input.workspaceProjectId, id);
        const finalSourcePath = path.join(uploadsRoot, id + '-' + filename);
        const pendingSourcePath = source.storedPath;
        await fsp.rename(pendingSourcePath, finalSourcePath);
        source.storedPath = finalSourcePath;
        source.storage_key = 'uploads/' + path.basename(finalSourcePath);
        const intendedJobDir=path.join(jobsRoot,id);
        try {
        const createdAt = new Date().toISOString();
        const rightsAuthority={schema_version:'niannian_source_rights_authority_v1',event_id:'rights-'+crypto.randomBytes(12).toString('hex'),status:'confirmed',confirmed_by_user_id:user.id,source_sha256:source.sha256,source_bytes:source.bytes,scope:'source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates',declaration:'user_confirmed_rights_to_use_and_adapt_uploaded_source',confirmed_at:createdAt,revoked:false};
        const createdProject = {
          id,ownerId:user.id,name:input.name,workspaceProjectId:workspaceProjectId || id,status:'queued',createdAt,
          remakeMode:input.remakeMode,targetLanguage:input.targetLanguage,visualStyle:input.visualStyle,aspectRatio:input.aspectRatio,quality:input.quality,replacementBrief:input.replacementBrief,notes:input.notes,
          source,sourceRevision:1,rightsAuthority,settingsVersion:1,
          route:{router:'mx-shortdrama-00-router',earliestNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract'},pipeline:pipeline(),
          productionStatus:mediaPreflightEnabled ? 'preflight' : 'queued',
          analysis:{status:mediaPreflightEnabled ? 'preflight_running' : 'legacy_auto_queued',sourceSha256:source.sha256,settingsVersion:1,authorizationEventId:null,requestedAt:null,updatedAt:createdAt},
          runtime:{productionStatus:mediaPreflightEnabled ? 'preflight' : 'queued',currentNode:mediaPreflightEnabled ? 'source_preflight' : 'router',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:null,nextAction:mediaPreflightEnabled ? '正在检查源视频编码、时长、画面与音轨。' : '等待本地控制器接管任务',artifactCount:1,verifiedArtifactCount:1,gateState:mediaPreflightEnabled ? 'source_preflight_running' : 'waiting_controller',lastHeartbeat:null,checkpointUpdatedAt:createdAt},
          dispatch:{status:mediaPreflightEnabled ? 'awaiting_preflight' : 'queued',controllerId:null,leaseId:null,claimedAt:null,leaseUntil:null,heartbeatAt:null,mirroredAt:null,localJobId:null,blocker:null}
        };
        const jobDir = await writeJobContract(createdProject);
        createdProject.jobContract = path.join(jobDir,'task.json');
        await writeSourcePreflight(createdProject);
        projects.unshift(createdProject);
        await writeProjects(projects);
        await ensureWorkspaceBinding(user, createdProject.workspaceProjectId, {name:createdProject.name, redrawProjectId:createdProject.id});
        return createdProject;
        } catch (error) {
          await fsp.rm(intendedJobDir,{recursive:true,force:true}).catch(()=>{});
          throw error;
        }
      });
      await completeWebsiteIdempotency(user, 'source-video-redraw-project', idempotencyKey, idempotencyFingerprint, project.id);
      json(response, 201, {project:publicProject(project)});
    } catch (error) {
      if (idempotencyClaimed) await failWebsiteIdempotency(user, 'source-video-redraw-project', idempotencyKey).catch(() => {});
      if (source?.storedPath) await fsp.rm(source.storedPath, {force:true}).catch(() => {});
      const statusCode = ['PROJECT_FIELD_INVALID','PROJECT_FIELD_NOT_ALLOWED','PROJECT_NAME_REQUIRED','PROJECT_NAME_TOO_SHORT','PROJECT_SETTING_INVALID','SOURCE_RIGHTS_REQUIRED','WORKSPACE_PROJECT_NOT_FOUND','IDEMPOTENCY_KEY_INVALID'].includes(error.code) ? 400 : ['PROJECT_ID_ALLOCATION_CONFLICT','PROJECT_ID_COLLISION','IDEMPOTENCY_KEY_CONFLICT','IDEMPOTENCY_IN_PROGRESS'].includes(error.code) ? 409 : 500;
      json(response, statusCode, {code:error.code || 'PROJECT_CREATE_FAILED',error:error.message});
    }
  });
  request.pipe(busboy);
}

async function replaceProjectSource(request, response, user, projectId) {
  const projects = await readProjects();
  const project = projects.find(item => item.id === projectId && item.ownerId === user.id);
  if (!project) return json(response, 404, {error:'项目不存在'});
  if (!project.runtime || project.runtime.gateState !== 'source_preflight_failed') {
    return json(response, 409, {code:'SOURCE_REPLACEMENT_NOT_ALLOWED',error:'只有源视频预检失败的项目可以替换源视频'});
  }

  const length = Number(request.headers['content-length'] || 0);
  if (length > maxUploadBytes) return json(response, 413, {code:'SOURCE_UPLOAD_TOO_LARGE',error:'源视频超过当前 300MB 上传限制'});
  let source = null;
  let target = null;
  const fields = {};
  let uploadPromise = Promise.resolve();
  let uploadError = null;
  let responded = false;
  const reply = (status, payload) => {
    if (responded) return;
    responded = true;
    json(response, status, payload);
  };

  let busboy;
  try {
    busboy = Busboy({ headers:request.headers, limits:{files:1,fileSize:maxUploadBytes,fields:4} });
  } catch {
    return reply(400, {error:'请使用 multipart/form-data 上传源视频'});
  }
  busboy.on('field',(name,value)=>{fields[name]=value;});
  busboy.on('file', (name, file, info) => {
    if (name !== 'sourceVideo' || source || target) {
      file.resume();
      uploadError = {code:'SOURCE_UPLOAD_COUNT_INVALID',message:'请只上传一个源视频文件'};
      return;
    }
    try {
      validateRedrawUpload(info);
    } catch (error) {
      file.resume();
      uploadError = {code:error.code || 'SOURCE_FILE_TYPE_UNSUPPORTED',message:error.message};
      return;
    }
    const filename = safeName(info.filename);
    target = path.join(uploadsRoot, project.id + '-replacement-' + crypto.randomBytes(6).toString('hex') + '-' + filename);
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    uploadPromise = new Promise((resolve, reject) => {
      const output = fs.createWriteStream(target, { flags:'wx' });
      file.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
      file.on('limit', () => { uploadError = {code:'SOURCE_UPLOAD_TOO_LARGE',message:'源视频超过当前 300MB 上传限制'}; });
      file.on('error', reject);
      output.on('error', reject);
      output.on('finish', () => {
        source = {originalName:info.filename,storedPath:target,mimeType:info.mimeType,bytes,sha256:hash.digest('hex')};
        resolve();
      });
      file.pipe(output);
    });
  });
  busboy.on('error', async error => {
    if (target) await fsp.rm(target, {force:true}).catch(() => {});
    reply(400, {error:error.message || '源视频上传失败'});
  });
  busboy.on('close', async () => {
    try {
      await uploadPromise;
      if (uploadError) {
        if (target) await fsp.rm(target, {force:true});
        return reply(uploadError.code === 'SOURCE_UPLOAD_TOO_LARGE' ? 413 : 400, {code:uploadError.code,error:uploadError.message});
      }
      if (!source) return reply(400, {error:'请上传源视频'});
      if(fields.rightsConfirmed!=='on'){if(target)await fsp.rm(target,{force:true});return reply(400,{code:'SOURCE_RIGHTS_REQUIRED',error:'替换源视频前必须重新确认该文件的使用与改编权限'});}

      const previousSource = project.source;
      const previousRights=project.rightsAuthority;
      const replacedAt = new Date().toISOString();
      source.storage_key = 'uploads/' + path.basename(source.storedPath);
      project.source = source;
      project.sourceRevision = Number(project.sourceRevision || 1) + 1;
      project.rightsAuthorityHistory=[...(project.rightsAuthorityHistory||[]),...(previousRights?[previousRights]:[])];
      project.rightsAuthority={schema_version:'niannian_source_rights_authority_v1',event_id:'rights-'+crypto.randomBytes(12).toString('hex'),status:'confirmed',confirmed_by_user_id:user.id,source_sha256:source.sha256,source_bytes:source.bytes,scope:'source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates',declaration:'user_confirmed_rights_to_use_and_adapt_uploaded_source',confirmed_at:replacedAt,revoked:false,supersedes_event_id:previousRights?.event_id||null};
      project.sourceReplacedAt = replacedAt;
      project.status = 'queued';
      project.productionStatus = mediaPreflightEnabled ? 'preflight' : 'queued';
      project.analysis = {status:mediaPreflightEnabled ? 'preflight_running' : 'legacy_auto_queued',sourceSha256:source.sha256,authorizationEventId:null,requestedAt:null,updatedAt:replacedAt};
      project.preflight = {status:'running',inspectedAt:replacedAt,message:'正在检查新上传的源视频。'};
      project.pipeline = pipeline();
      project.runtime = {
        productionStatus:project.productionStatus,
        currentNode:mediaPreflightEnabled ? 'source_preflight' : 'router',
        earliestIncompleteNode:'Step01',
        nextSkill:'mx-shortdrama-01-frame-extract',
        blocker:null,
        nextAction:mediaPreflightEnabled ? '正在检查新上传的源视频编码、时长、画面与音轨。' : '等待本地控制器接管任务',
        artifactCount:1,
        verifiedArtifactCount:1,
        gateState:mediaPreflightEnabled ? 'source_preflight_running' : 'waiting_controller',
        lastHeartbeat:null,
        checkpointUpdatedAt:replacedAt
      };
      project.dispatch = {status:mediaPreflightEnabled ? 'awaiting_preflight' : 'queued',controllerId:null,leaseId:null,claimedAt:null,leaseUntil:null,heartbeatAt:null,mirroredAt:null,localJobId:null,blocker:null};
      const jobDir = path.join(jobsRoot, project.id);
      await fsp.rm(path.join(jobDir, 'media_probe.json'), {force:true});
      await writeJobContract(project);
      project.jobContract = path.join(jobDir, 'task.json');
      await writeSourcePreflight(project);
      await writeProjects(projects);
      if (previousSource && previousSource.storedPath && previousSource.storedPath !== target) {
        const uploadsDirectory = path.resolve(uploadsRoot) + path.sep;
        const previousPath = path.resolve(previousSource.storedPath);
        if (previousPath.startsWith(uploadsDirectory)) await fsp.rm(previousPath, {force:true});
      }
      return reply(200, {project:publicProject(project)});
    } catch (error) {
      if (target) await fsp.rm(target, {force:true}).catch(() => {});
      return reply(500, {error:error.message || '替换源视频失败'});
    }
  });
  request.pipe(busboy);
}

async function serveProjectSource(request, response, project) {
  let resolved;
  try{resolved=await resolveProjectSource(project,{verify:true});}
  catch(error){const status=error.code==='PROJECT_SOURCE_NOT_FOUND'?404:error.code==='PROJECT_SOURCE_INTEGRITY_FAILED'?503:409;return json(response,status,{code:error.code||'PROJECT_SOURCE_PATH_INVALID',error:error.message||'项目源视频不可用'});}
  if (await redirectProjectMediaToCos(response, {project, category:'source-video', filePath:resolved.path, mime:resolved.mime, revision:'source-' + String(project.sourceRevision || 1), video:true})) return;
  const stats=resolved.stats;
  const commonHeaders = {
    'Content-Type':resolved.mime,
    'Accept-Ranges':'bytes',
    'Cache-Control':'private, no-store',
    'X-Content-SHA256':resolved.sha256,
    'Content-Disposition':'inline; filename="' + safeName(project.source.originalName || 'source.mp4') + '"'
  };
  if(request.method==='HEAD'){response.writeHead(200,{...commonHeaders,'Content-Length':stats.size});return response.end();}
  const range = String(request.headers.range || '');
  if (!range) {
    response.writeHead(200, {...commonHeaders,'Content-Length':stats.size});
    return fs.createReadStream(resolved.path).pipe(response);
  }
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    response.writeHead(416, {...commonHeaders,'Content-Range':'bytes */' + stats.size});
    return response.end();
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : stats.size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= stats.size) {
    response.writeHead(416, {...commonHeaders,'Content-Range':'bytes */' + stats.size});
    return response.end();
  }
  const boundedEnd = Math.min(end, stats.size - 1);
  response.writeHead(206, {
    ...commonHeaders,
    'Content-Length':boundedEnd - start + 1,
    'Content-Range':'bytes ' + start + '-' + boundedEnd + '/' + stats.size
  });
  return fs.createReadStream(resolved.path, {start,end:boundedEnd}).pipe(response);
}

function publicStep01Evidence(evidence, projectId) {
  const index = evidence.index;
  const analysis = evidence.analysisDetails || null;
  const segments = new Map((analysis?.visualFacts?.segments || []).map(segment => [String(segment.source_segment_id || ''), segment]));
  return {
    package:{sha256:evidence.bundle.sha256,bytes:evidence.bundle.bytes,status:index.status,analysisRunId:index.analysis_run_id,sourceRevision:index.source_revision,sourceSha256:index.source_sha256,downloadUrl:'/api/projects/' + encodeURIComponent(projectId) + '/step01-evidence/download'},
    sourceMedia:index.source_media,
    counts:index.counts,
    timeline:{durationMs:index.source_media.duration_ms,shots:index.timeline.map(shot => {
      const visual = segments.get('S' + String(shot.shot_id).replace(/^S/i, '').padStart(4, '0'));
      return {
      shotId:shot.shot_id,startMs:shot.start_ms,endMs:shot.end_ms,evidence:{
        keyframes:(shot.evidence?.keyframes || []).map(frame => ({point:frame.point,sha256:frame.sha256,bytes:frame.bytes,url:'/api/projects/' + encodeURIComponent(projectId) + '/step01-evidence/frames/' + encodeURIComponent(shot.shot_id) + '/' + encodeURIComponent(frame.point)}))
      },
      visual:visual ? {observedFacts:visual.observed_facts || [],visibleText:visual.visible_text || [],uncertainty:visual.uncertainty || []} : null
    }; })},
    analysis:analysis ? {qualityProfile:analysis.qualityProfile || null,model:analysis.visualFacts.model,visualFactStatus:'completed',visibleTextCount:Number(analysis.ocrReceipt?.ledger_count || analysis.ocrReceipt?.row_count || 0),ocrStatus:analysis.ocrReceipt?.status || 'not_available',ocrSource:analysis.ocrReceipt?.backend || 'paddle_ocr',asrStatus:analysis.asrReceipt?.status || 'not_available',asrReason:null} : null,
    validation:index.validation,
    delivery:{step01EvidenceDelivered:evidence.reducer?.delivered===true,finalVideoDelivered:false}
  };
}

function isExactStep01PilotProject(project) {
  return project?.id === exactStep01ProjectId
    && project?.source?.sha256 === exactStep01SourceSha256
    && Number(project?.source?.bytes) === exactStep01SourceBytes
    && String(project?.analysis?.runId || '') === exactStep01AnalysisRunId;
}

function publicReferenceStep01Evidence(evidence, projectId) {
  const durationMs = Math.round(referenceNumber(evidence?.source?.durationSec) * 1000);
  return {
    package:{
      sha256:evidence?.source?.sha256 || null,
      bytes:Number(evidence?.source?.bytes || 0),
      status:'evidence_ready',
      analysisRunId:evidence?.analysisRunId || null,
      sourceRevision:1,
      sourceSha256:evidence?.source?.sha256 || null,
      downloadUrl:null
    },
    sourceMedia:{
      duration_ms:durationMs,
      width:Number(String(evidence?.source?.resolution || '').split('x')[0]) || null,
      height:Number(String(evidence?.source?.resolution || '').split('x')[1]) || null,
      fps:Number(evidence?.source?.fps || 0) || null
    },
    counts:evidence?.counts || {},
    timeline:{
      durationMs,
      shots:(evidence?.shots || []).map(shot => ({
        shotId:shot.id,
        startMs:Math.round(referenceNumber(shot.startSec) * 1000),
        endMs:Math.round(referenceNumber(shot.endSec) * 1000),
        startTimecode:shot.startTimecode,
        midTimecode:shot.midTimecode,
        endTimecode:shot.endTimecode,
        probability:Number(shot.probability || 0),
        sourceDetector:shot.sourceDetector || 'transnetv2',
        dialogue:(shot.dialogue || []).map(row => ({
          eventId:row.eventId,
          startMs:Math.round(referenceNumber(row.startSec) * 1000),
          endMs:Math.round(referenceNumber(row.endSec) * 1000),
          timecode:row.timecode,
          speaker:row.speaker,
          text:row.text,
          sourceTool:row.sourceTool,
          notes:row.notes
        })),
        ocr:(shot.ocr || []).map(row => ({
          order:row.order,
          timeMs:Math.round(referenceNumber(row.timeSec) * 1000),
          timecode:row.timecode,
          region:row.region,
          text:row.text,
          model:row.model,
          selectionReason:row.selectionReason
        })),
        evidence:{
          keyframes:['start','mid','end'].map(point => {
            const frame = shot.frames?.[point] || {};
            return {point, sha256:null, bytes:null, url:frame.url, timecode:frame.timecode, frameIndex:frame.frameIndex};
          })
        }
      }))
    },
    validation:evidence?.validation || {ok:true},
    delivery:{step01EvidenceDelivered:true,finalVideoDelivered:false}
  };
}

async function serveProjectStep01EvidenceFrame(response, project, shotId, point) {
  const evidencePackage = await readVerifiedStep01Evidence(project);
  const shot = evidencePackage.index.timeline.find(item => String(item.shot_id) === String(shotId));
  const frame = shot?.evidence?.keyframes?.find(item => String(item.point) === String(point));
  const authority = await currentStep01Authority(project).catch(error => {
    if (error?.code === 'STEP01_CURRENT_AUTHORITY_MISSING') return {kind:'legacy'};
    throw error;
  });
  if (authority.kind === 'revision') {
    const framePath = path.resolve(authority.evidence_root, String(frame?.relative_path || ''));
    if (!frame || !isInside(authority.evidence_root, framePath)) throw createCodeError('STEP01_SOURCE_FACT_FRAME_NOT_FOUND', '未找到当前原片事实帧');
    const evidence = await step01Evidence.fileEvidence(framePath);
    if (evidence.sha256 !== frame.sha256 || evidence.bytes !== Number(frame.bytes)) throw createCodeError('STEP01_SOURCE_FACT_FRAME_HASH_MISMATCH', '原片事实帧校验失败');
    const extension = path.extname(framePath).toLowerCase();
    const mime = extension === '.webp' ? 'image/webp' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
    if (await redirectProjectMediaToCos(response, {project, category:'step01-evidence-frame', filePath:framePath, mime, revision:authority.revision_id})) return;
    response.writeHead(200, {'Content-Type':mime,'Content-Length':evidence.bytes,'Cache-Control':'private, no-store','X-Content-SHA256':evidence.sha256});
    return fs.createReadStream(framePath).pipe(response);
  }
  const isDirectServerRun = project.analysis?.runtimeProfile === serverStep01Executor.PROFILE;
  const status = await readJsonFile(path.join(jobsRoot, project.id, 'status.json'), {});
  const evidenceRoot = isDirectServerRun
    ? path.join(jobsRoot, project.id, 'analysis_runs', String(project.analysis?.runId || ''), 'server_evidence')
    : String(status.fixed_app_return?.archive_root || '');
  if (!frame || !evidenceRoot || !isInside(path.join(jobsRoot, project.id), evidenceRoot)) throw createCodeError('STEP01_SOURCE_FACT_FRAME_NOT_FOUND', '未找到当前原片事实帧');
  const framePath = path.resolve(evidenceRoot, String(frame.relative_path || ''));
  if (!isInside(evidenceRoot, framePath)) throw createCodeError('STEP01_SOURCE_FACT_FRAME_PATH_INVALID', '原片事实帧路径无效');
  const evidence = await step01Evidence.fileEvidence(framePath);
  if (evidence.sha256 !== frame.sha256 || evidence.bytes !== Number(frame.bytes)) throw createCodeError('STEP01_SOURCE_FACT_FRAME_HASH_MISMATCH', '原片事实帧校验失败');
  const extension = path.extname(framePath).toLowerCase();
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : 'image/png';
  if (await redirectProjectMediaToCos(response, {project, category:'step01-evidence-frame', filePath:framePath, mime, revision:String(project.analysis?.runId || 'legacy')})) return;
  response.writeHead(200, {'Content-Type':mime,'Content-Length':evidence.bytes,'Cache-Control':'private, no-store','X-Content-SHA256':evidence.sha256});
  fs.createReadStream(framePath).pipe(response);
}

async function serveProjectStep01LedgerFrame(response, project, shotId, point) {
  const evidenceRoot = await currentStep01EvidenceRoot(project);
  const ledger = await step01SourceLedger.readLedger({evidenceRoot, overlayRoot:step01SourceLedgerOverlayRoot, project});
  const shot = (ledger.shots || []).find(item => String(item.shot_id) === String(shotId));
  const frame = (shot?.frame_evidence || []).find(item => String(item.point) === String(point));
  const artifactRoot = path.resolve(evidenceRoot, 'artifacts');
  const relative = String(frame?.relative_path || '').replace(/\\/g, '/');
  if (!frame || !relative || path.posix.isAbsolute(relative) || relative.includes('..')) throw createCodeError('STEP01_LEDGER_FRAME_NOT_FOUND', '未找到当前原片人物证据帧');
  const framePath = path.resolve(artifactRoot, ...relative.split('/'));
  if (!isInside(artifactRoot, framePath)) throw createCodeError('STEP01_LEDGER_FRAME_PATH_INVALID', '原片人物证据帧路径无效');
  const evidence = await step01Evidence.fileEvidence(framePath);
  if (evidence.sha256 !== frame.sha256 || evidence.bytes !== Number(frame.bytes)) throw createCodeError('STEP01_LEDGER_FRAME_HASH_MISMATCH', '原片人物证据帧完整性校验失败');
  const extension = path.extname(framePath).toLowerCase();
  const mime = extension === '.webp' ? 'image/webp' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
  const authority = await currentStep01Authority(project).catch(error => error?.code === 'STEP01_CURRENT_AUTHORITY_MISSING' ? {kind:'legacy'} : Promise.reject(error));
  if (await redirectProjectMediaToCos(response, {project, category:'step01-ledger-frame', filePath:framePath, mime, revision:authority.revision_id || 'legacy'})) return;
  response.writeHead(200, {'Content-Type':mime,'Content-Length':evidence.bytes,'Cache-Control':'private, no-store','X-Content-SHA256':evidence.sha256});
  fs.createReadStream(framePath).pipe(response);
}

async function serveProjectStep01EvidenceDownload(response, project) {
  const evidencePackage=await readVerifiedStep01Evidence(project);
  const bundle=evidencePackage.bundle;
  const verified=await step01Evidence.fileEvidence(bundle.exact_path);
  if(verified.sha256!==bundle.sha256||verified.bytes!==bundle.bytes)throw createCodeError('STEP01_EVIDENCE_BUNDLE_HASH_MISMATCH','原片事实证据包校验失败');
  response.writeHead(200,{'Content-Type':'application/zip','Content-Length':verified.bytes,'Content-Disposition':'attachment; filename="'+bundle.file_name.replace(/[^A-Za-z0-9._-]/g,'_')+'"','ETag':'"'+verified.sha256+'"','Cache-Control':'private, no-store'});
  await streamPipeline(fs.createReadStream(bundle.exact_path),response);
  if(!response.writableFinished)throw createCodeError('STEP01_EVIDENCE_DOWNLOAD_INCOMPLETE','原片事实证据包下载未完整结束');
  if(!evidencePackage.reducer.delivered){
    const accepted=evidencePackage.reducer.acceptedEvent;
    if(!accepted?.dispatch_id||!accepted?.phase_key)throw createCodeError('STEP01_EVIDENCE_ACCEPTANCE_BINDING_MISSING','原片事实证据验收缺少派发绑定');
    const eventPath=path.join(jobsRoot,project.id,'evidence_events.jsonl');
    await step01EvidenceEvents.appendEvidenceEvent(eventPath,{type:'step01_evidence_delivered',project_id:project.id,analysis_run_id:project.analysis.runId,source_revision:Number(project.analysis.sourceRevision),source_sha256:project.source.sha256,dispatch_id:accepted.dispatch_id,phase_key:accepted.phase_key,status:'delivered',evidence_sha256:bundle.sha256});
  }
}

async function appendProjectJobEvent(projectId, event) {
  const jobDir = path.join(jobsRoot, projectId);
  await fsp.mkdir(jobDir, {recursive:true});
  await fsp.appendFile(path.join(jobDir, 'job_events.jsonl'), JSON.stringify({at:new Date().toISOString(),...event}) + '\n', 'utf8');
}

async function updateProjectSettings(request, response, user, projectId) {
  const projects = await readProjects();
  const project = projects.find(item => item.id === projectId && item.ownerId === user.id);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  const step02Started = ['prepared','dispatch_prepared','carrier_running','candidate_return_ready','accepted'].includes(String(project.step02?.status || ''));
  if (String(project.analysis?.status || '') !== 'evidence_ready' || step02Started) {
    return json(response, 409, {code:'PROJECT_SETTINGS_LOCKED',error:'原片事实包完成后、Step02 派发前才能配置制作规格'});
  }
  try { await readVerifiedStep01Evidence(project); }
  catch { return json(response, 409, {code:'PROJECT_SETTINGS_LOCKED',error:'原片事实证据尚未通过事件重放与 SHA 验证'}); }
  const body = await readBodyJson(request);
  for (const [key, values] of Object.entries(redrawProjectEnums)) {
    if (body[key] !== undefined) {
      const value = String(body[key]);
      if (!values.has(value)) return json(response, 400, {code:'PROJECT_SETTING_INVALID',error:'制作设置无效：' + key});
      project[key] = value;
    }
  }
  if (body.replacementBrief !== undefined) {
    const replacementBrief = String(body.replacementBrief || '').trim();
    if (replacementBrief.length > 1200 || /[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(replacementBrief)) return json(response, 400, {code:'PROJECT_BRIEF_INVALID',error:'特殊要求最多 1200 个字符，且不能包含控制字符'});
    project.replacementBrief = replacementBrief;
  }
  const updatedAt = new Date().toISOString();
  project.settingsVersion = Number(project.settingsVersion || 1) + 1;
  project.settingsUpdatedAt = updatedAt;
  project.analysis = {...project.analysis,settingsVersion:project.settingsVersion,updatedAt};
  const taskPath = path.join(jobsRoot, project.id, 'task.json');
  const task = await readJsonFile(taskPath, {});
  task.request = step01SourceFactRequest(project);
  task.production_settings = redrawProductionSettings(project);
  task.settings_version = project.settingsVersion;
  task.updated_at = updatedAt;
  await Promise.all([
    writeJson(taskPath, task),
    appendProjectJobEvent(project.id, {type:'project_settings_updated',settings_version:project.settingsVersion,source_sha256:project.source.sha256})
  ]);
  await writeProjects(projects);
  return json(response, 200, {code:'PROJECT_SETTINGS_UPDATED',project:publicProject(project)});
}

async function queueStep01Analysis(request, response, user, projectId) {
  let startLease;
  try {
    startLease = await acquireStep01StartLease(projectId);
  } catch (error) {
    return json(response, 409, {code:error.code || 'STEP01_START_LEASE_CONFLICT',error:error.message || 'Step01 启动请求正在收敛'});
  }
  try {
  const projects = await readProjects();
  const project = projects.find(item => item.id === projectId && item.ownerId === user.id);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  const requestBody=await readBodyJson(request);const forbiddenFields=['target_language','targetLanguage','visual_style','visualStyle','aspect_ratio','aspectRatio','quality','replacement_brief','replacementBrief','production_settings','productionSettings','notes'];const presentForbidden=forbiddenFields.filter(key=>Object.prototype.hasOwnProperty.call(requestBody,key));if(presentForbidden.length)return json(response,400,{code:'STEP01_SOURCE_ONLY_FIELDS_FORBIDDEN',error:'Step01 只接收原片事实范围，不接收创作参数',fields:presentForbidden});const unsupported=Object.keys(requestBody);if(unsupported.length)return json(response,400,{code:'STEP01_REQUEST_FIELDS_UNSUPPORTED',error:'Step01 开始分析请求体必须为空',fields:unsupported});
  if (project.preflight?.status !== 'passed') return json(response, 409, {code:'STEP01_PREFLIGHT_REQUIRED',error:'源视频预检通过后才能开始分析'});
  const priorAnalysisStatus=String(project.analysis?.status||'');
  const legacyRuntime = /^mac-/.test(String(project.analysis?.runtimeProfile || '')) || project.runtime?.worker?.mode === 'fixed_mac_app_phase';
  // A historical frame-only Haika result is audit evidence, not an hq_full handoff.
  const incompleteDirectRuntime = project.analysis?.runtimeProfile === 'haika-step01-direct-v1';
  const recoveryEligible=['infra_failed','blocked_contract','blocked_resource','blocked_quality','blocked_authorization','blocked_transport'].includes(priorAnalysisStatus)
    || ((legacyRuntime || incompleteDirectRuntime) && ['queued','capability_preflight','codex_dispatched','codex_running','return_received','reducer_verifying','running','prepared','evidence_ready'].includes(priorAnalysisStatus));
  if (project.analysis && !recoveryEligible && ['queued','capability_preflight','codex_dispatched','codex_running','return_received','reducer_verifying','running','prepared'].includes(project.analysis.status)) {
    return json(response, 200, {code:'STEP01_ANALYSIS_ALREADY_ACTIVE',project:publicProject(project),analysisRun:{id:project.analysis.runId,sourceRevision:project.analysis.sourceRevision,sourceSha256:project.analysis.sourceSha256}});
  }
  if (project.analysis?.status === 'evidence_ready' && !incompleteDirectRuntime) {
    return json(response, 200, {code:'STEP01_EVIDENCE_ALREADY_READY',project:publicProject(project),analysisRun:{id:project.analysis.runId,sourceRevision:project.analysis.sourceRevision,sourceSha256:project.analysis.sourceSha256},evidencePackage:project.analysis.evidencePackage || null});
  }
  if (project.analysis?.status !== 'awaiting_user_start' && !recoveryEligible) {
    return json(response, 409, {code:'STEP01_START_NOT_ALLOWED',error:'当前项目状态不允许启动 Step01'});
  }
  if (recoveryEligible && dispatchLeaseActive(project)) {
    return json(response, 409, {code:'STEP01_RECOVERY_ACTIVE_LEASE',error:'当前 Step01 仍有活动派发 lease，不能重置或重派'});
  }
  let resolvedSource;
  try { resolvedSource=await resolveProjectSource(project,{verify:true}); }
  catch (error) { return json(response,409,{code:error.code||'STEP01_SOURCE_PATH_INVALID',error:error.message||'源视频路径或完整性无效'}); }
  let rightsEvidence;
  let rightsLease;
  try {
    rightsLease = await acquireRightsReadbackLease(project.id);
    rightsEvidence = await verifyProjectRightsAuthority(project, user.id);
  } catch (error) {
    return json(response, 409, {code:error.code || 'STEP01_RIGHTS_AUTHORITY_INVALID',error:error.message || '源片权利声明校验失败'});
  } finally {
    if (rightsLease) await rightsLease.release().catch(() => {});
  }
  const sourceEvidence = {sha256:resolvedSource.sha256,bytes:resolvedSource.stats.size};
  if (sourceEvidence.sha256 !== project.source.sha256 || sourceEvidence.bytes !== project.source.bytes) {
    return json(response, 409, {code:'STEP01_SOURCE_SHA256_MISMATCH',error:'源视频已经变化，已拒绝启动分析'});
  }
  const requestedAt = new Date().toISOString();
  const settingsBinding = step01SettingsBinding(project);
  // A blocked run is historical evidence, not an execution authority. Recovery starts a new exact source-only run.
  let analysisRun = {
    schema_version:'niannian_step01_source_analysis_run_v1',
    id:'analysis-' + Number(project.sourceRevision || 1) + '-' + crypto.randomBytes(12).toString('hex'),
    source_revision:Number(project.sourceRevision || 1),
    source_sha256:project.source.sha256,
    source_bytes:project.source.bytes,
    rights_authority:{event_id:rightsEvidence.rights.event_id,sha256:rightsEvidence.sha256,bytes:rightsEvidence.bytes},
    settings_binding:settingsBinding,
    analysis_scope:'source_evidence_only',
    required_router:'mx-shortdrama-00-router',
    required_evidence:['media_probe','native_frames','shots','asr','audio_alignment','ocr'],
    quality_profile:serverStep01Executor.PROFILE,
    idempotency_key:crypto.createHash('sha256').update([project.id,Number(project.sourceRevision||1),project.source.sha256,serverStep01Executor.PROFILE].join('|')).digest('hex'),
    created_at:requestedAt,
    recovered_from_run_id:recoveryEligible && /^analysis-[a-zA-Z0-9-]{8,100}$/.test(String(project.analysis?.runId || '')) ? project.analysis.runId : null,
    recovered_from_status:recoveryEligible ? priorAnalysisStatus : null
  };
  const authorizationEventId = 'step01-' + crypto.randomBytes(12).toString('hex');
  const analysisNetworkEventId = 'analysisnet-' + crypto.randomBytes(12).toString('hex');
  const policyDecision = lowRiskPolicy.assertLowRiskAnalysis({
    source_sha256:project.source.sha256,
    allowed_scope:'step01_evidence_only',
    allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'],
    provider_submission_requested:false,
    package_send_requested:false,
    deploy_requested:false,
    account_change_requested:false,
    local_image_editing_requested:false
  });
  const authorization = {
    schema_version:'niannian_step01_authorization_v1',
    event_id:authorizationEventId,
    job_id:project.id,
    initiated_by:{user_id:user.id},
    approved_by:{type:'policy',policy_id:policyDecision.policy_id},
    approval_mode:policyDecision.approval_mode,
    approval_policy_id:policyDecision.policy_id,
    risk_class:policyDecision.risk_class,
    auto_approved:true,
    source_sha256:project.source.sha256,
    settings_version:settingsBinding.settings_version,
    settings_binding:settingsBinding,
    rights_authority:{event_id:rightsEvidence.rights.event_id,sha256:rightsEvidence.sha256,bytes:rightsEvidence.bytes,confirmed_by_user_id:user.id,source_sha256:rightsEvidence.rights.source_sha256,source_bytes:rightsEvidence.rights.source_bytes,scope:rightsEvidence.rights.scope,status:rightsEvidence.rights.status,revoked:false},
    allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'],
    allowed_scope:'step01_evidence_only',
    analysis_service_network_authority:{
      schema_version:'niannian_step01_analysis_service_network_authority_v1',
      event_id:analysisNetworkEventId,
      status:'authorized',
      authorization_event_id:authorizationEventId,
      authorized_by:{type:'authenticated_user_action',user_id:user.id},
      source_sha256:project.source.sha256,
      settings_version:settingsBinding.settings_version,
      settings_binding:settingsBinding,
      allowed_services:[
        {service_id:'mimo_asr',purpose:'Step01 Chinese transcript text only',adapter_identity:'mimo_asr_official_auto_v1'},
        {service_id:'paddle_ocr',purpose:'Step01 subtitle/text evidence QA only',adapter_identity:'paddle_ocr_async_jobs_v2'}
      ],
      media_provider_authority_granted:false,
      media_provider_network_requested:false,
      media_provider_submit_requested:false,
      media_provider_upload_requested:false,
      spend_requested:false,
      authorization_policy:'D-022_persistent_source_bound_analysis_only',
      authorization_mode:'persistent_until_source_rights_or_settings_change',
      created_at:requestedAt,
      expires_at:null
    },
    provider_submission_requested:false,
    package_send_requested:false,
    created_at:requestedAt
  };
  const jobDir = path.join(jobsRoot, project.id);
  analysisRun = await recoverSingleSourceOnlyRun(jobDir, project, analysisRun, recoveryEligible);
  const [legacyTask, checkpoint, dashboard, ledger] = await Promise.all([
    readJsonFile(path.join(jobDir, 'task.json'), {}),
    readJsonFile(path.join(jobDir, 'checkpoint.json'), {}),
    readJsonFile(path.join(jobDir, 'gate_dashboard.json'), {}),
    readJsonFile(path.join(jobDir, 'artifact_ledger.json'), {schema_version:'artifact_ledger_v1',job_id:project.id,artifacts:[]})
  ]);
  if (recoveryEligible && (Array.isArray(ledger.artifacts)?ledger.artifacts:[]).some(item=>item.artifact_id==='step01_evidence_manifest'&&['verified','accepted','completed','delivered'].includes(String(item.status||'')))) {
    return json(response, 409, {code:'STEP01_RECOVERY_ALREADY_VERIFIED',error:'当前项目已存在已验证 Step01 evidence manifest，不能重新启动 Step01'});
  }
  const rightsLedgerArtifact=(Array.isArray(ledger.artifacts)?ledger.artifacts:[]).find(item=>item.artifact_id==='source_rights_authority');
  if(!rightsLedgerArtifact||rightsLedgerArtifact.sha256!==rightsEvidence.sha256||Number(rightsLedgerArtifact.bytes)!==rightsEvidence.bytes||rightsLedgerArtifact.status!=='verified')return json(response,409,{code:'STEP01_RIGHTS_AUTHORITY_LEDGER_MISMATCH',error:'权利声明事实账本与当前权威文件不一致'});
  let archivedOrchestratorResult=null;
  if (recoveryEligible) {
    const resultPath=path.join(jobDir,'step01_orchestrator_result.json');
    try {
      const resultBytes=await fsp.readFile(resultPath);
      const resultSha256=crypto.createHash('sha256').update(resultBytes).digest('hex');
      const historyPath=path.join(jobDir,'step01_orchestrator_history',resultSha256+'.json');
      await fsp.mkdir(path.dirname(historyPath),{recursive:true});
      await fsp.writeFile(historyPath,resultBytes,{flag:'wx'});
      archivedOrchestratorResult={exact_path:historyPath,sha256:resultSha256,bytes:resultBytes.length};
    } catch(error) {
      if(error.code!=='ENOENT'&&error.code!=='EEXIST') throw error;
      if(error.code==='EEXIST') {
        const existing=await fsp.readFile(path.join(jobDir,'step01_orchestrator_result.json'));
        archivedOrchestratorResult={exact_path:path.join(jobDir,'step01_orchestrator_history',crypto.createHash('sha256').update(existing).digest('hex')+'.json'),sha256:crypto.createHash('sha256').update(existing).digest('hex'),bytes:existing.length};
      }
    }
    await writeJson(resultPath,{schema_version:'niannian_step01_fixed_app_orchestrator_recovery_v1',remote_project_id:project.id,status:'recovery_authorized',prior_analysis_status:priorAnalysisStatus,prior_result:archivedOrchestratorResult,provider_submission_requested:false,package_send_requested:false,created_at:requestedAt});
  }
  const task = sourceOnlyStep01Task({project,analysisRun,authorization,rightsEvidence,requestedAt});
  checkpoint.status = 'queued';
  checkpoint.current_node = 'Step01';
  checkpoint.earliest_incomplete_node = 'Step01';
  checkpoint.next_skill = 'mx-shortdrama-01-frame-extract';
  checkpoint.next_action = '原片证据正在由分析服务准备，完成后会自动更新进度。';
  checkpoint.authorization_event_id = authorizationEventId;
  checkpoint.updated_at = requestedAt;
  dashboard.current_node = 'Step01';
  dashboard.earliest_incomplete_node = 'Step01';
  dashboard.next_skill = 'mx-shortdrama-01-frame-extract';
  dashboard.gates = {...(dashboard.gates || {}),Step01:{status:'preparing_server_analysis',authorization_event_id:authorizationEventId,analysis_run_id:analysisRun.id},analysis_service:{status:'preparing'},Step02:{status:'blocked_upstream'},Step04:{status:'blocked_upstream'},Step05:{status:'blocked_upstream'},provider_submit:{status:'blocked_cost_authorization'},package_send:{status:'blocked_controller_authorization'}};
  delete dashboard.gates.mac_bridge_release;
  delete dashboard.gates.hq_health;
  dashboard.gates.source_rights={status:'confirmed',event_id:rightsEvidence.rights.event_id,sha256:rightsEvidence.sha256,source_sha256:project.source.sha256};
  dashboard.next_action = checkpoint.next_action;
  dashboard.updated_at = requestedAt;
  const status = {job_id:project.id,status:'queued',current_node:'Step01',earliest_incomplete_node:'Step01',next_skill:'mx-shortdrama-01-frame-extract',blocker:null,next_action:checkpoint.next_action,authorization_event_id:authorizationEventId,updated_at:requestedAt};
  const resultManifest = {job_id:project.id,status:'queued',success:false,packaged:false,transport_success:false,user_visible_acceptance:false,artifacts:Array.isArray(ledger.artifacts) ? ledger.artifacts : [],updated_at:requestedAt};
  await fsp.mkdir(path.join(jobDir, 'analysis_runs', analysisRun.id), {recursive:true});
  await Promise.all([
    writeJson(path.join(jobDir, 'analysis_runs', analysisRun.id, 'analysis_run.json'), analysisRun),
    ...(recoveryEligible ? [writeJson(path.join(jobDir, 'analysis_runs', analysisRun.id, 'recovery_state.json'), {schema_version:'niannian_step01_analysis_run_recovery_state_v1',status:'current_authority_bound_recovery',project_id:project.id,analysis_run_id:analysisRun.id,recovered_from_run_id:analysisRun.recovered_from_run_id,source_sha256:analysisRun.source_sha256,source_revision:analysisRun.source_revision,recorded_at:requestedAt})] : []),
    writeJson(path.join(jobDir, 'current_run.json'), {schema_version:'niannian_step01_current_run_v1',project_id:project.id,analysis_run_id:analysisRun.id,source_sha256:analysisRun.source_sha256,source_bytes:analysisRun.source_bytes,source_revision:analysisRun.source_revision,settings_version:analysisRun.settings_binding.settings_version,settings_binding:analysisRun.settings_binding,authorization_event_id:authorizationEventId,updated_at:requestedAt}),
    writeJson(path.join(jobDir, 'analysis_runs', analysisRun.id, 'task_snapshot.json'), task),
    writeJson(path.join(jobDir, 'analysis_runs', analysisRun.id, 'legacy_task_before_source_only.json'), legacyTask),
    writeJson(path.join(jobDir, 'step01_authorization.json'), authorization),
    writeJson(path.join(jobDir, 'task.json'), task),
    writeJson(path.join(jobDir, 'status.json'), status),
    writeJson(path.join(jobDir, 'checkpoint.json'), checkpoint),
    writeJson(path.join(jobDir, 'gate_dashboard.json'), dashboard),
    writeJson(path.join(jobDir, 'result_manifest.json'), resultManifest),
    appendProjectJobEvent(project.id, {type:recoveryEligible?'step01_analysis_recovery_reauthorized':'step01_analysis_policy_auto_approved',event_id:authorizationEventId,prior_analysis_status:recoveryEligible?priorAnalysisStatus:null,prior_orchestrator_result:archivedOrchestratorResult,rights_authority_event_id:rightsEvidence.rights.event_id,rights_authority_sha256:rightsEvidence.sha256,analysis_service_network_authority_event_id:analysisNetworkEventId,analysis_services:['mimo_asr','paddle_ocr'],media_provider_authority_granted:false,policy_id:authorization.approval_policy_id,risk_class:authorization.risk_class,source_sha256:project.source.sha256,settings_version:authorization.settings_version}),
    step01EvidenceEvents.appendEvidenceEvent(path.join(jobDir,'evidence_events.jsonl'),{type:'analysis_run_created',project_id:project.id,analysis_run_id:analysisRun.id,source_revision:analysisRun.source_revision,source_sha256:analysisRun.source_sha256,status:'queued',evidence_sha256:analysisRun.idempotency_key})
  ]);
  project.status = 'queued';
  project.productionStatus = 'queued';
  project.analysis = {status:'queued',runId:analysisRun.id,sourceRevision:analysisRun.source_revision,sourceSha256:project.source.sha256,settingsVersion:authorization.settings_version,settingsBinding,authorizationEventId,rightsAuthorityEventId:rightsEvidence.rights.event_id,rightsAuthoritySha256:rightsEvidence.sha256,analysisServiceNetworkAuthorityEventId:analysisNetworkEventId,analysisServiceNetworkAuthority:authorization.analysis_service_network_authority,recoveryFromStatus:recoveryEligible?priorAnalysisStatus:null,recoveryFromRunId:analysisRun.recovered_from_run_id,createdAt:analysisRun.created_at,requestedAt,updatedAt:requestedAt,autoExecuteRequested:step01AutoExecute,approvalMode:'policy_auto',approvalPolicyId:authorization.approval_policy_id,riskClass:'low',autoApproved:true,runtimeProfile:serverStep01Executor.PROFILE};
  project.pipeline = pipelineForStatus('queued', dashboard.gates);
  project.runtime = {...(project.runtime || {}),productionStatus:'queued',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:null,nextAction:checkpoint.next_action,gateState:'step01_server_preparing',gates:dashboard.gates,worker:{status:'preparing',router:'mx-shortdrama-00-router',mode:'haika_server_responses',cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt:requestedAt},checkpointUpdatedAt:requestedAt};
  project.dispatch = {status:'queued',controllerId:null,leaseId:null,claimedAt:null,leaseUntil:null,heartbeatAt:null,mirroredAt:null,localJobId:null,blocker:null};
  await writeProjects(projects);

  if (step01AutoExecute) {
    const stdoutPath = path.join(jobDir, 'step01_server_executor.stdout.log');
    const stderrPath = path.join(jobDir, 'step01_server_executor.stderr.log');
    const stdout = fs.openSync(stdoutPath, 'a');
    const stderr = fs.openSync(stderrPath, 'a');
    const child = spawn(process.execPath, [step01ServerExecutorPath, project.id], {
      cwd:root,
      detached:true,
      windowsHide:true,
      stdio:['ignore',stdout,stderr],
      env:{...process.env,NIANNIAN_DATA_DIR:dataRoot}
    });
    child.unref();
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
  return json(response, 202, {code:'STEP01_ANALYSIS_QUEUED',project:publicProject(project),analysisRun:{id:analysisRun.id,sourceRevision:analysisRun.source_revision,sourceSha256:analysisRun.source_sha256,scope:analysisRun.analysis_scope,settingsBinding:analysisRun.settings_binding},authorization:{eventId:authorizationEventId,scope:'step01_evidence_only',approvalMode:'policy_auto',approvalPolicyId:authorization.approval_policy_id,riskClass:'low',autoApproved:true,analysisServiceNetworkAuthority:{eventId:analysisNetworkEventId,allowedServices:['mimo_asr','paddle_ocr'],mediaProviderAuthorityGranted:false,expiresAt:authorization.analysis_service_network_authority.expires_at},providerSubmissionRequested:false,packageSendRequested:false}});
  } finally {
    await startLease.release().catch(() => {});
  }
}

function fixedStep01DispatchHttpStatus(error) {
  const code=String(error?.code || error?.message || '');
  if (code.includes('PROJECT_NOT_FOUND')) return 404;
  if (code.startsWith('step01_fixed_dispatch_') || code.startsWith('STEP01_') || code.startsWith('MAC_')) return 409;
  return 500;
}

function step01TransportLayers(brokerState = step01ArtifactBroker.brokerReadiness(), overrides = {}) {
  return {
    credential_configured:{mimo_asr:null,paddle_ocr:null},
    health_refresh_required:false,
    mac_control_ready:overrides.mac_control_ready === true,
    artifact_broker_ready:brokerState.ready === true,
    artifact_broker:{ready:brokerState.ready === true,transport:brokerState.transport || 'cos',provider:brokerState.provider || null,code:brokerState.code || null,reason:brokerState.reason || null,checked_at:brokerState.checked_at || new Date().toISOString()},
    artifact_transport_state:overrides.artifact_transport_state || (brokerState.ready === true ? 'ready_for_phase_grants' : 'waiting_broker_configuration'),
    fixed_app_turn_state:overrides.fixed_app_turn_state || 'not_started',
    reducer_state:overrides.reducer_state || 'not_started',
    step01_state:overrides.step01_state || (brokerState.ready === true ? 'ready_for_fixed_app_dispatch' : 'blocked_transport')
  };
}

function applyStep01ArtifactBrokerBlocked(project, brokerState, updatedAt = new Date().toISOString()) {
  const code=brokerState.code || 'ARTIFACT_BROKER_NOT_CONFIGURED';
  project.status='blocked';
  project.productionStatus='blocked_transport';
  project.analysis={...(project.analysis||{}),status:'blocked_transport',blocker:code,updatedAt};
  project.runtime={...(project.runtime||{}),productionStatus:'blocked_transport',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:code,nextAction:'等待腾讯云 COS 私有 artifact broker 完成配置；不会回退到 Mac 与 Windows 之间的 SCP。',gateState:'step01_artifact_broker_not_configured',step01Transport:step01TransportLayers(brokerState,{artifact_transport_state:'waiting_broker_configuration',fixed_app_turn_state:'not_started',reducer_state:'not_started',step01_state:'blocked_transport'}),worker:{status:'blocked_transport',mode:'fixed_mac_app_phase',cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt},checkpointUpdatedAt:updatedAt};
  project.dispatch={...(project.dispatch||{}),status:'blocked',blocker:code,leaseUntil:null};
}

async function reconcileFixedStep01DispatchProjection(projectId) {
  await withRedrawProjectsWriteLock(async () => {
    const projects=await readProjects();
    const project=projects.find(item=>item.id===projectId);
    if (project && await reconcileStep01Orchestrator(project)) await writeProjects(projects);
  });
}

// A prepared SHA-bound phase is executable work, not a user-visible stopping
// point. The durable started result is written before the relay is invoked,
// so concurrent reads and retries cannot duplicate the fixed Mac App turn.
const fixedStep01AutoDispatching = new Set();
function scheduleFixedStep01Dispatch(projectId) {
  if (fixedStep01AutoDispatching.has(projectId)) return;
  fixedStep01AutoDispatching.add(projectId);
  setImmediate(async () => {
    let prepared=null;
    let startLease=null;
    try {
      startLease=await acquireStep01StartLease(projectId);
      await withRedrawProjectsWriteLock(async () => {
        const projects=await readProjects();
        const project=projects.find(item=>item.id===projectId);
        const analysis=project?.analysis||{};
        if(!project||analysis.status!=='prepared'||project.runtime?.gateState!=='step01_fixed_app_dispatch_ready'||project.runtime?.blocker!=='STEP01_FIXED_APP_PHASE_EXECUTOR_READY_FOR_DISPATCH') return;
        const brokerState=step01ArtifactBroker.brokerReadiness();
        if(brokerState.ready!==true){applyStep01ArtifactBrokerBlocked(project,brokerState);await writeProjects(projects);return;}
        const localJobId=String(analysis.localJobId||'');
        if(!/^web_nn-[a-z0-9-]{10,100}$/.test(localJobId)) throw createCodeError('STEP01_FIXED_DISPATCH_LOCAL_JOB_INVALID','当前 fixed phase 的 job 绑定无效');
        const directJobRoot=path.resolve(directJobsRoot,localJobId);
        if(!isInside(directJobsRoot,directJobRoot)) throw createCodeError('STEP01_FIXED_DISPATCH_DIRECT_ROOT_INVALID','当前 fixed phase 的 direct job 路径无效');
        prepared=await fixedStep01Dispatch.prepareDispatch({canonicalJobRoot:path.join(jobsRoot,project.id),directJobRoot,...fixedStep01BrokerOptions(brokerState)});
        const startedAt=prepared.start.started_at;
        project.status='running';
        project.productionStatus='running_step01';
        project.analysis={...analysis,status:'codex_dispatched',dispatchedAt:startedAt,updatedAt:startedAt,blocker:null};
        project.runtime={...(project.runtime||{}),productionStatus:'running_step01',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:null,nextAction:'已自动派发 exact fixed Mac App phase；等待 Employee 01 的 turn/readback 与回传验收。',gateState:'step01_fixed_app_dispatch_started',step01Transport:step01TransportLayers(brokerState,{mac_control_ready:true,artifact_transport_state:'package_grants_issued',fixed_app_turn_state:'dispatching',reducer_state:'waiting_return',step01_state:'running'}),worker:{status:'dispatching',mode:'fixed_mac_app_phase',threadId:prepared.current.dispatch.employee_thread_id,requestId:prepared.requestId,cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt:startedAt},checkpointUpdatedAt:startedAt};
        project.dispatch={...(project.dispatch||{}),status:'dispatching',leaseId:prepared.requestId,claimedAt:startedAt,leaseUntil:new Date(Date.now()+bridgeLeaseMs).toISOString(),localJobId,blocker:null};
        await writeProjects(projects);
      });
    } catch (_) {
      // A later reducer pass projects the authoritative typed result.
    } finally {
      await startLease?.release?.().catch(()=>{});
    }
    try {
      if(prepared) await fixedStep01Dispatch.executePrepared(prepared);
    } catch (_) {
      // executePrepared persists its exact blocked result and safe diagnostic.
    } finally {
      fixedStep01AutoDispatching.delete(projectId);
      await reconcileFixedStep01DispatchProjection(projectId).catch(()=>{});
    }
  });
}

async function resumeExistingFixedStep01Phase(request, response, user, projectId) {
  let startLease;
  try { startLease=await acquireStep01StartLease(projectId); }
  catch(error) { return json(response,409,{code:error.code||'STEP01_START_LEASE_CONFLICT',error:error.message||'Step01 派发正在收敛'}); }
  try {
    const body=await readBodyJson(request);
    if (Object.keys(body).length) return json(response,400,{code:'STEP01_FIXED_DISPATCH_REQUEST_FIELDS_UNSUPPORTED',error:'恢复既有 Step01 phase 的请求体必须为空'});
    return await withRedrawProjectsWriteLock(async () => {
      const projects=await readProjects();
      const project=projects.find(item=>item.id===projectId&&item.ownerId===user.id);
      if(!project)return json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'});
      const analysis=project.analysis||{};
      if(analysis.status!=='prepared'||project.runtime?.gateState!=='step01_fixed_app_dispatch_ready'||project.runtime?.blocker!=='STEP01_FIXED_APP_PHASE_EXECUTOR_READY_FOR_DISPATCH') {
        return json(response,409,{code:'STEP01_FIXED_DISPATCH_NOT_READY',error:'当前项目没有可恢复的既有 fixed Mac App phase'});
      }
      const localJobId=String(analysis.localJobId||'');
      if(!/^web_nn-[a-z0-9-]{10,100}$/.test(localJobId))return json(response,409,{code:'STEP01_FIXED_DISPATCH_LOCAL_JOB_INVALID',error:'当前 fixed phase 的 job 绑定无效'});
      const directJobRoot=path.resolve(directJobsRoot,localJobId);
      if(!isInside(directJobsRoot,directJobRoot))return json(response,409,{code:'STEP01_FIXED_DISPATCH_DIRECT_ROOT_INVALID',error:'当前 fixed phase 的 direct job 路径无效'});
      const brokerState=step01ArtifactBroker.brokerReadiness();
      if(brokerState.ready!==true){applyStep01ArtifactBrokerBlocked(project,brokerState);await writeProjects(projects);return json(response,409,{code:brokerState.code||'ARTIFACT_BROKER_NOT_CONFIGURED',error:'当前 Step01 等待私有 COS artifact broker 配置；不会回退到 SCP',project:publicProject(project)});}
      let prepared;
      try {
        prepared=await fixedStep01Dispatch.prepareDispatch({canonicalJobRoot:path.join(jobsRoot,project.id),directJobRoot,...fixedStep01BrokerOptions(brokerState)});
      } catch(error) {
        return json(response,fixedStep01DispatchHttpStatus(error),{code:error.code||error.message||'STEP01_FIXED_DISPATCH_PREPARE_FAILED',error:'当前 fixed phase 绑定或受控回执校验失败'});
      }
      const startedAt=prepared.start.started_at;
      project.status='running';
      project.productionStatus='running_step01';
      project.analysis={...analysis,status:'codex_dispatched',dispatchedAt:startedAt,updatedAt:startedAt,blocker:null};
      project.runtime={...(project.runtime||{}),productionStatus:'running_step01',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:null,nextAction:'已记录 exact fixed Mac App phase 派发；等待 Employee 01 的 turn/readback 与回传验收。',gateState:'step01_fixed_app_dispatch_started',step01Transport:step01TransportLayers(brokerState,{mac_control_ready:true,artifact_transport_state:'package_grants_issued',fixed_app_turn_state:'dispatching',reducer_state:'waiting_return',step01_state:'running'}),worker:{status:'dispatching',mode:'fixed_mac_app_phase',threadId:prepared.current.dispatch.employee_thread_id,requestId:prepared.requestId,cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt:startedAt},checkpointUpdatedAt:startedAt};
      project.dispatch={...(project.dispatch||{}),status:'dispatching',leaseId:prepared.requestId,claimedAt:startedAt,leaseUntil:new Date(Date.now()+bridgeLeaseMs).toISOString(),localJobId,blocker:null};
      await writeProjects(projects);
      setImmediate(() => {
        fixedStep01Dispatch.executePrepared(prepared)
          .catch(() => {})
          .finally(() => reconcileFixedStep01DispatchProjection(project.id).catch(() => {}));
      });
      return json(response,202,{code:'STEP01_FIXED_APP_DISPATCH_STARTED',project:publicProject(project),analysisRun:{id:analysis.runId,phaseKey:prepared.current.phaseKey,manifestSha256:prepared.current.manifestSha256,employeeThreadId:prepared.current.dispatch.employee_thread_id,requestId:prepared.requestId},mediaProviderNetworkRequested:false,mediaProviderSubmitted:false,spendRequested:false,realDelivery:false});
    });
  } finally { await startLease.release().catch(()=>{}); }
}

async function readVerifiedStep01Evidence(project) {
  const authority = await currentStep01Authority(project).catch(error => {
    if (error?.code === 'STEP01_CURRENT_AUTHORITY_MISSING') return {kind:'legacy'};
    throw error;
  });
  if (authority.kind === 'revision') {
    const validated = await step01Evidence.validateStep01EvidencePackage({
      outputRoot:authority.evidence_root,
      expected:{projectId:project.id,analysisRunId:authority.revision_id,sourceSha256:project.source?.sha256,sourceRevision:Number(authority.revision.source_revision)}
    });
    return {...validated, authority, outputRoot:authority.evidence_root};
  }
  const analysis = project.analysis || {};
  const runId = String(analysis.runId || '');
  const sourceRevision = Number(analysis.sourceRevision || project.sourceRevision || 0);
  if (!/^analysis-[a-zA-Z0-9-]{8,100}$/.test(runId) || !Number.isInteger(sourceRevision) || sourceRevision < 1) {
    throw createCodeError('STEP01_EVIDENCE_RUN_BINDING_MISSING', 'Step01 缺少可验证的分析 run 绑定');
  }
  const outputRoot = path.join(jobsRoot, project.id, 'analysis_runs', runId, 'evidence');
  const validated = await step01Evidence.validateStep01EvidencePackage({
    outputRoot,
    expected:{projectId:project.id,analysisRunId:runId,sourceSha256:project.source?.sha256,sourceRevision}
  });
  const eventPath=path.join(jobsRoot,project.id,'evidence_events.jsonl');
  const reducer=step01EvidenceEvents.reduceEvidenceEvents(await step01EvidenceEvents.readEvidenceEvents(eventPath),{projectId:project.id,analysisRunId:runId,sourceSha256:project.source?.sha256,sourceRevision});
  if(!reducer.accepted||reducer.status!=='evidence_ready')throw createCodeError('STEP01_EVIDENCE_REDUCER_NOT_READY','Step01 证据事件尚未重放为 evidence_ready');
  let analysisDetails = null;
  if (analysis.runtimeProfile === serverStep01Executor.PROFILE) {
    const runRoot = path.join(jobsRoot, project.id, 'analysis_runs', runId);
    const evidenceRoot = path.join(runRoot, 'server_evidence');
    const manifest = await readJsonFile(path.join(evidenceRoot, 'step01_evidence_manifest.json'), null);
    const visualFacts = await readJsonFile(path.join(evidenceRoot, 'artifacts', 'visual_facts.json'), null);
    const readManifestPointer = async pointer => {
      const relative = String(pointer?.relative_path || '').replace(/\\/g, '/');
      const target = path.resolve(evidenceRoot, relative);
      if (!relative || !isInside(evidenceRoot, target)) return null;
      const pointerEvidence = await sha256File(target).catch(() => null);
      if (!pointerEvidence || pointerEvidence.sha256 !== pointer.sha256 || pointerEvidence.bytes !== Number(pointer.bytes)) return null;
      return readJsonFile(target, null);
    };
    const ocrReceipt = await readManifestPointer(manifest?.ocr?.receipt);
    const asrReceipt = await readManifestPointer(manifest?.audio?.mimo_transcript_receipt);
    const expected = manifest?.visual_facts;
    const visualPath = path.join(evidenceRoot, String(expected?.relative_path || '').replace(/\\/g, '/'));
    const evidence = expected?.relative_path && isInside(evidenceRoot, visualPath) ? await sha256File(visualPath).catch(() => null) : null;
    const segmentCount = Array.isArray(visualFacts?.segments) ? visualFacts.segments.length : 0;
    if (!evidence || evidence.sha256 !== expected?.sha256 || evidence.bytes !== Number(expected?.bytes) || visualFacts?.project_id !== project.id || visualFacts?.analysis_run_id !== runId || segmentCount !== validated.index.timeline.length) {
      throw createCodeError('STEP01_ANALYSIS_DETAILS_INVALID', '原片视觉分析明细缺失或与已验证证据包不一致');
    }
    analysisDetails = {visualFacts,ocrReceipt,asrReceipt,qualityProfile:manifest.profile};
  }
  return {...validated,reducer,outputRoot,analysisDetails};
}

function visualFactsReconcileReceiptPath(projectId) {
  return path.join(step01StoryAuthorityRoot, String(projectId), 'visual-facts-reconcile.json');
}

async function reconcileStep01VisualFacts({project, actor, idempotencyKey, revisionId = null}) {
  const key = String(idempotencyKey || '').trim();
  if (!key) throw createCodeError('STEP01_VISUAL_FACTS_IDEMPOTENCY_REQUIRED', '缺少 Idempotency-Key');
  const receiptPath = visualFactsReconcileReceiptPath(project.id);
  const writerLock = receiptPath + '.writer-lock';
  await fsp.mkdir(path.dirname(writerLock), {recursive:true});
  try { await fsp.mkdir(writerLock); }
  catch (error) { if (error.code === 'EEXIST') throw createCodeError('STEP01_VISUAL_FACTS_ALREADY_RUNNING', '原片事实正在整理，请勿重复提交'); throw error; }
  try {
  const previous = await readJsonFile(receiptPath, null);
  if (previous?.idempotency_key === key && previous.status === 'completed') return {...previous, idempotent:true};
  if (previous?.status === 'running') throw createCodeError('STEP01_VISUAL_FACTS_ALREADY_RUNNING', '原片事实正在整理，请勿重复提交');
  const startedAt = new Date().toISOString();
  await writeJson(receiptPath, {schema_version:'niannian.step01_visual_facts_reconcile.v1',project_id:project.id,idempotency_key:key,status:'running',started_at:startedAt});
  try {
    const authority = await step01EvidenceForRevision(project, revisionId);
    const authorityProject = projectBoundToStep01Authority(project, authority);
    const evidenceRoot = authority.evidence_root;
    const initialLedger = await step01SourceLedger.readLedger({evidenceRoot, overlayRoot:step01SourceLedgerOverlayRoot, project:authorityProject});
    const fullEvidenceIndex = await step01FullEvidenceIndex.readVerified({evidenceRoot, project:authorityProject});
    const sourceKey = String(project.source?.storage_key || '').replace(/\\/g, '/');
    const sourceVideoPath = sourceKey.startsWith('uploads/') && !sourceKey.includes('..') ? path.resolve(dataRoot, ...sourceKey.split('/')) : null;
    const story = await step01StoryAuthority.generate({
      root:step01StoryAuthorityRoot,
      project:authorityProject,
      ledger:initialLedger,
      roleCards:null,
      scriptText:'',
      requestGemini:true,
      reviewAllShots:true,
      sourceVideoPath,
      evidenceRoot,
      fullEvidenceIndex,
      receiptNamespace:authority.revision_id || 'legacy'
    });
    const analyses = new Map((story.gemini_sidecar?.analyses || []).map(item => [String(item?.shot_id || ''), String(item?.observed || '').trim()]).filter(([shotId, observed]) => /^S\d{3}$/.test(shotId) && observed));
    const expectedShotIds = initialLedger.shots.map(shot => shot.shot_id);
    const missing = expectedShotIds.filter(shotId => !analyses.has(shotId));
    if (story.gemini_sidecar?.status !== 'completed' || story.gemini_sidecar?.full_evidence_coverage?.complete !== true || missing.length) throw createCodeError('STEP01_VISUAL_FACTS_INCOMPLETE', '原片视觉复核未覆盖完整证据');
    let ledger = initialLedger;
    let changed = 0;
    for (const shotId of expectedShotIds) {
      const shot = ledger.shots.find(item => item.shot_id === shotId);
      const observed = analyses.get(shotId).slice(0, 600);
      if (!shot || shot.source_visual_facts === observed) continue;
      ledger = await step01SourceLedger.appendRevision({
        evidenceRoot,
        overlayRoot:step01SourceLedgerOverlayRoot,
        project:authorityProject,
        ifMatch:'"step01-ledger-' + ledger.snapshot_sha256 + '"',
        body:{shot_id:shotId,reason:'Gemini 视觉理解与原片证据自动整理；姓名、关系和不可见因果未写入事实字段。',changes:[{field:'source_visual_facts',before:shot.source_visual_facts || '',after:observed}]},
        actor:'step01_visual_facts:' + actor
      });
      changed += 1;
    }
    const roleCards = await step01RoleCardAuthority.generate({root:step01RoleCardAuthorityRoot, project:authorityProject, ledger, story, fullEvidenceIndex});
    const rebuiltStory = await step01StoryAuthority.generate({root:step01StoryAuthorityRoot, project:authorityProject, ledger, roleCards, scriptText:'', requestGemini:false, reuseGeminiSidecar:true, evidenceRoot, fullEvidenceIndex});
    if (authority.kind === 'revision') {
      const binding = {revision_id:authority.revision_id,source_sha256:authority.revision.source_sha256,full_evidence_index_sha256:fullEvidenceIndex.index_sha256};
      await step01AuthorityRevision.updateRevision({root:step01AuthorityRevisionRoot, project, revisionId:authority.revision_id, update:{status:'visual_review_completed_pending_ocr', visual_review:{status:'completed',complete:true,reviewed_frames:fullEvidenceIndex.frames.length,expected_frames:fullEvidenceIndex.frames.length,completed_at:new Date().toISOString()},gemini_review:{...binding,status:'completed',model:'gemini-3.1-pro-preview',reviewed_frames:story.gemini_sidecar.reviewed_frame_ids.length,unique_frame_ids:new Set(story.gemini_sidecar.reviewed_frame_ids).size,receipt_set_sha256:step01AuthorityRevision.sha256(step01AuthorityRevision.canonical(story.gemini_sidecar.telemetry || [])),observations_sha256:step01AuthorityRevision.sha256(step01AuthorityRevision.canonical(story.gemini_sidecar.frame_observations || []))},source_authority:{...binding,status:'completed',shots:ledger.shots.length,observed_frames:story.gemini_sidecar.reviewed_frame_ids.length,ledger_snapshot_sha256:ledger.snapshot_sha256,role_card_snapshot_sha256:roleCards.snapshot_sha256,story_snapshot_sha256:rebuiltStory.snapshot_sha256},ledger_snapshot_id:ledger.snapshot_id,ledger_snapshot_sha256:ledger.snapshot_sha256,story_snapshot_id:rebuiltStory.snapshot_id,role_card_snapshot_id:roleCards.snapshot_id}});
      const observations=new Map((story.gemini_sidecar.frame_observations||[]).map(item=>[item.frame_id,item]));
      const batchForFrame=new Map();for(const batch of story.gemini_sidecar.telemetry||[])for(const frameId of batch.frame_ids||[])batchForFrame.set(frameId,step01PromotionGate.sha256(step01PromotionGate.canonical(batch)));
      const gateFrames=fullEvidenceIndex.frames.map(frame=>({frame_id:frame.frame_id,input_sha256:frame.sha256,observation_sha256:step01PromotionGate.sha256(step01PromotionGate.canonical(observations.get(frame.frame_id))),batch_receipt_sha256:batchForFrame.get(frame.frame_id)}));
      const observationIndex=await step01PromotionGate.recordEvidence({root:step01AuthorityRevisionRoot,project,revisionId:authority.revision_id,relativePath:'evidence/gemini-observation-index.json',value:{frames:gateFrames}});
      await step01PromotionGate.recordReceipt({root:step01AuthorityRevisionRoot,project,revisionId:authority.revision_id,kind:'gemini',value:{schema_version:'niannian.step01.gemini_gate.v1',project_id:project.id,...binding,status:'completed',model:'gemini-3.1-pro-preview',frames:gateFrames,observation_index:observationIndex}});
      const ledgerPointer=await step01PromotionGate.recordEvidence({root:step01AuthorityRevisionRoot,project,revisionId:authority.revision_id,relativePath:'evidence/source-ledger.json',value:ledger});const rolePointer=await step01PromotionGate.recordEvidence({root:step01AuthorityRevisionRoot,project,revisionId:authority.revision_id,relativePath:'evidence/role-cards.json',value:roleCards});const storyPointer=await step01PromotionGate.recordEvidence({root:step01AuthorityRevisionRoot,project,revisionId:authority.revision_id,relativePath:'evidence/story-authority.json',value:rebuiltStory});
      await step01PromotionGate.recordReceipt({root:step01AuthorityRevisionRoot,project,revisionId:authority.revision_id,kind:'source',value:{schema_version:'niannian.step01.source_authority_gate.v1',project_id:project.id,...binding,status:'completed',shots:ledger.shots.map(shot=>({shot_id:shot.shot_id,observed_frame_ids:fullEvidenceIndex.frames.filter(frame=>frame.shot_id===shot.shot_id).map(frame=>frame.frame_id)})),ledger_snapshot_sha256:ledgerPointer.sha256,role_card_snapshot_sha256:rolePointer.sha256,story_snapshot_sha256:storyPointer.sha256,ledger:ledgerPointer,role_cards:rolePointer,story:storyPointer}});
      try { await step01PromotionGate.assembleAndMarkReady({root:step01AuthorityRevisionRoot,project,revisionId:authority.revision_id}); }
      catch(error){if(error.code!=='STEP01_PROMOTION_GATE_RECEIPT_MISSING')throw error;}
    }
    const receipt = {schema_version:'niannian.step01_visual_facts_reconcile.v3',project_id:project.id,idempotency_key:key,status:'completed',started_at:startedAt,completed_at:new Date().toISOString(),analysis_run_id:initialLedger.analysis_run_id,authority_revision_id:authority.revision_id || null,story_snapshot_id:rebuiltStory.snapshot_id,role_card_snapshot_id:roleCards.snapshot_id,reviewed_shots:expectedShotIds,reviewed_frame_count:fullEvidenceIndex.frames.length,full_evidence_index_sha256:fullEvidenceIndex.index_sha256,changed_shots:changed,ledger_snapshot_id:ledger.snapshot_id,ledger_snapshot_sha256:ledger.snapshot_sha256};
    await writeJson(receiptPath, receipt);
    return {...receipt, idempotent:false};
  } catch (error) {
    await writeJson(receiptPath, {schema_version:'niannian.step01_visual_facts_reconcile.v1',project_id:project.id,idempotency_key:key,status:'failed',started_at:startedAt,failed_at:new Date().toISOString(),error_code:error.code || 'STEP01_VISUAL_FACTS_FAILED'}).catch(() => {});
    throw error;
  }
  } finally { await fsp.rmdir(writerLock).catch(() => {}); }
}

async function reconcileServerStep01Execution(project) {
  if (!project.analysis || project.analysis.runtimeProfile !== serverStep01Executor.PROFILE) return false;
  const result = await readJsonFile(path.join(jobsRoot, project.id, 'server_step01_result.json'), null);
  if (!result || result.remote_project_id !== project.id || result.analysis_run_id !== project.analysis.runId) return false;
  const updatedAt = String(result.completed_at || result.failed_at || new Date().toISOString());
  if (result.status === 'evidence_ready') {
    let verified;
    try { verified = await readVerifiedStep01Evidence(project); }
    catch (error) {
      const blocker = error.code || 'STEP01_SERVER_EVIDENCE_INVALID';
      const alreadyBlocked = project.analysis.status === 'blocked_contract' && project.analysis.blocker === blocker;
      if (alreadyBlocked) return false;
      project.status = 'blocked';
      project.productionStatus = 'blocked_contract';
      project.analysis = {...project.analysis,status:'blocked_contract',blocker,updatedAt};
      project.runtime = {...(project.runtime || {}),productionStatus:'blocked_contract',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker,nextAction:'分析结果未通过核对，正在保留原片和已完成证据以便安全重试。',gateState:'step01_server_evidence_invalid',worker:{status:'blocked',mode:'haika_server_responses',updatedAt},checkpointUpdatedAt:updatedAt};
      project.dispatch = {...(project.dispatch || {}),status:'blocked',controllerId:null,leaseId:null,leaseUntil:null,blocker};
      return true;
    }
    const alreadyReady = project.analysis.status === 'evidence_ready' && project.analysis.evidencePackage?.bundleSha256 === verified.bundle.sha256 && project.runtime?.gateState === 'step01_evidence_ready';
    if (alreadyReady) return false;
    project.status = 'running';
    project.productionStatus = 'evidence_ready';
    project.analysis = {...project.analysis,status:'evidence_ready',evidencePackage:{indexSha256:verified.indexEvidence.sha256,bundleSha256:verified.bundle.sha256,bundleBytes:verified.bundle.bytes},blocker:null,updatedAt};
    project.canonical=canonicalStep01Evidence(project);
    project.pipeline = pipelineForStatus('evidence_ready',{},project.canonical);
    project.runtime = {...(project.runtime || {}),productionStatus:'evidence_ready',currentNode:'Step01',earliestIncompleteNode:'Step02',nextSkill:'mx-shortdrama-02-source-timeline',blocker:null,nextAction:'原片分析已完成，结果正在等待进入下一步整理。',gateState:'step01_evidence_ready',step01Evidence:{indexSha256:verified.indexEvidence.sha256,bundleSha256:verified.bundle.sha256},worker:{status:'completed',router:'mx-shortdrama-00-router',mode:'haika_server_responses',model:String(result.worker?.model || 'gpt-5.6-sol'),updatedAt},checkpointUpdatedAt:updatedAt};
    project.dispatch = {...(project.dispatch || {}),status:'completed',controllerId:null,leaseId:null,leaseUntil:null,blocker:null};
    return true;
  }
  if (result.status !== 'failed') return false;
  const blocker = String(result.blocker_code || 'STEP01_SERVER_FAILED').slice(0, 160);
  const productionStatus = ['blocked_resource','blocked_contract','blocked_quality','infra_failed'].includes(result.production_status) ? result.production_status : 'infra_failed';
  const alreadyBlocked = project.analysis.status === productionStatus && project.analysis.blocker === blocker;
  if (alreadyBlocked) return false;
  project.status = 'blocked';
  project.productionStatus = productionStatus;
  project.analysis = {...project.analysis,status:productionStatus,blocker,updatedAt};
  project.runtime = {...(project.runtime || {}),productionStatus,currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker,nextAction:'分析服务暂时不可用，原片已保留，恢复后可从当前进度继续。',gateState:'step01_server_' + productionStatus,worker:{status:'blocked',router:'mx-shortdrama-00-router',mode:'haika_server_responses',updatedAt},checkpointUpdatedAt:updatedAt};
  project.dispatch = {...(project.dispatch || {}),status:'blocked',controllerId:null,leaseId:null,leaseUntil:null,blocker};
  return true;
}

async function reconcileStep01Orchestrator(project) {
  if (await reconcileServerStep01Execution(project)) return true;
  if (!project.analysis || project.analysis.status === 'evidence_ready') return false;
  const result = await readJsonFile(path.join(jobsRoot, project.id, 'step01_orchestrator_result.json'), null);
  if (!result || result.remote_project_id !== project.id) return false;
  const resourceBlocker = result.status === 'fixed_app_dispatch_blocked_resource' ? (result.blocker || {}) : null;
  const matchesCurrentResourceBlock = resourceBlocker
    && resourceBlocker.authorization_event_id === project.analysis.authorizationEventId
    && resourceBlocker.source_sha256 === project.source?.sha256
    && Number(resourceBlocker.settings_version) === Number(project.analysis.settingsVersion);
  if (result.status === 'failed' && ['queued','preflight','prepared'].includes(project.productionStatus)) {
    await step01FailureReducer.reduceStep01OrchestratorFailure({dataRoot,project,pipelineForStatus});
    return true;
  }
  if (result.status === 'relay_complete') {
    const updatedAt = String(result.completed_at || new Date().toISOString());
    project.analysis = {...project.analysis,status:'blocked_contract',blocker:'STEP01_LEGACY_RELAY_RECEIPT_REJECTED',updatedAt};
    project.runtime = {...(project.runtime||{}),productionStatus:'blocked_contract',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:'STEP01_LEGACY_RELAY_RECEIPT_REJECTED',nextAction:'旧 relay receipt 已拒绝；只允许 fixed Mac Codex App phase。',gateState:'step01_legacy_relay_rejected',worker:{status:'blocked',cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt},checkpointUpdatedAt:updatedAt};
    project.dispatch={...(project.dispatch||{}),status:'blocked',blocker:'STEP01_LEGACY_RELAY_RECEIPT_REJECTED',leaseUntil:null};
    return true;
  }
  if (matchesCurrentResourceBlock) {
    const updatedAt=String(result.completed_at||new Date().toISOString());
    const alreadyProjected = project.analysis.status === 'blocked_resource'
      && project.analysis.localJobId === (String(result.local_job_id || '').slice(0,120)||null)
      && project.analysis.blocker === 'STEP01_HQ_FULL_CAPABILITY_GATE_NOT_READY'
      && project.runtime?.productionStatus === 'blocked_resource'
      && project.runtime?.gateState === 'step01_hq_full_blocked_no_dispatch'
      && project.runtime?.worker?.status === 'blocked_resource'
      && project.dispatch?.status === 'blocked'
      && project.dispatch?.blocker === 'STEP01_HQ_FULL_CAPABILITY_GATE_NOT_READY';
    if (alreadyProjected) return false;
    project.analysis={...project.analysis,status:'blocked_resource',localJobId:String(result.local_job_id||'').slice(0,120)||null,blocker:'STEP01_HQ_FULL_CAPABILITY_GATE_NOT_READY',updatedAt};
    project.runtime={...(project.runtime||{}),productionStatus:'blocked_resource',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:'STEP01_HQ_FULL_CAPABILITY_GATE_NOT_READY',nextAction:'补齐并刷新 hq_full 五能力、Mac host 与 settings 绑定；未生成派发 package。',gateState:'step01_hq_full_blocked_no_dispatch',worker:{status:'blocked_resource',mode:'fixed_mac_app_phase',cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt},checkpointUpdatedAt:updatedAt};
    project.dispatch={...(project.dispatch||{}),status:'blocked',blocker:'STEP01_HQ_FULL_CAPABILITY_GATE_NOT_READY',leaseUntil:null};
    return true;
  }
  if (['fixed_app_dispatch_blocked_authorization','fixed_app_dispatch_blocked_contract'].includes(result.status)) {
    const updatedAt=String(result.completed_at||new Date().toISOString());const blockerCode=String(result.blocker?.code||result.blocker?.blocker_signature||result.blocker?.status||result.status).slice(0,200);
    project.analysis={...project.analysis,status:result.status.endsWith('authorization')?'blocked_authorization':'blocked_contract',localJobId:String(result.local_job_id||'').slice(0,120)||null,blocker:blockerCode,updatedAt};
    project.runtime={...(project.runtime||{}),productionStatus:result.status.endsWith('authorization')?'blocked_contract':'blocked_contract',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:blockerCode,nextAction:'补齐 exact analysis-service authority/toolchain/runtime-import/source-media prerequisite；未生成 App package，禁止 fallback。',gateState:'step01_prerequisite_blocked_no_dispatch',worker:{status:'blocked',mode:'fixed_mac_app_phase',cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt},checkpointUpdatedAt:updatedAt};
    project.dispatch={...(project.dispatch||{}),status:'blocked',blocker:blockerCode,leaseUntil:null};return true;
  }
  if (result.status === 'fixed_app_dispatch_started') {
    const updatedAt=String(result.started_at||new Date().toISOString());
    const exactCurrent=project.analysis?.runId===result.analysis_run_id || (!result.analysis_run_id && project.analysis?.fixedAppPhaseKey===result.phase_key);
    if (!exactCurrent || result.employee_thread_id!=='019f6201-c013-7cf3-b155-61d2789085f4') return false;
    const alreadyProjected=project.analysis?.status==='codex_dispatched'&&project.runtime?.gateState==='step01_fixed_app_dispatch_started'&&project.dispatch?.leaseId===result.request_id;
    if(alreadyProjected)return false;
    const brokerState=result.artifact_transport?.broker||step01ArtifactBroker.brokerReadiness();
    project.status='running';project.productionStatus='running_step01';project.analysis={...(project.analysis||{}),status:'codex_dispatched',dispatchedAt:updatedAt,updatedAt,blocker:null};project.runtime={...(project.runtime||{}),productionStatus:'running_step01',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:null,nextAction:'已记录 exact fixed Mac App phase 派发；等待 Employee 01 的 turn/readback 与回传验收。',gateState:'step01_fixed_app_dispatch_started',step01Transport:step01TransportLayers(brokerState,{mac_control_ready:true,artifact_transport_state:'package_grants_issued',fixed_app_turn_state:'dispatching',reducer_state:'waiting_return',step01_state:'running'}),worker:{status:'dispatching',mode:'fixed_mac_app_phase',threadId:result.employee_thread_id,requestId:result.request_id||null,cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt},checkpointUpdatedAt:updatedAt};project.dispatch={...(project.dispatch||{}),status:'dispatching',leaseId:result.request_id||null,claimedAt:updatedAt,leaseUntil:new Date(Date.now()+bridgeLeaseMs).toISOString(),localJobId:String(result.local_job_id||'').slice(0,120)||null,blocker:null};return true;
  }
  if (result.status === 'fixed_app_dispatch_prepared' && !['completed','receipt_pending_sync'].includes(project.analysis.status)) {
    const updatedAt = String(result.completed_at || new Date().toISOString());
    const executorReady = result.blocker === 'STEP01_FIXED_APP_PHASE_EXECUTOR_READY_FOR_DISPATCH';
    const blocker = executorReady ? 'STEP01_FIXED_APP_PHASE_EXECUTOR_READY_FOR_DISPATCH' : 'STEP01_FIXED_APP_PHASE_EXECUTOR_NOT_INSTALLED';
    project.analysis = {...project.analysis,status:'prepared',localJobId:String(result.local_job_id || '').slice(0,120)||null,fixedAppPhaseKey:String(result.phase_key || '').slice(0,160)||null,fixedAppManifestSha256:String(result.dispatch_manifest_sha256 || '').slice(0,64)||null,selectedEmployeeThreadId:String(result.employee_thread_id || '').slice(0,80)||null,blocker,updatedAt};
    const brokerState=step01ArtifactBroker.brokerReadiness();
    project.runtime = {...(project.runtime || {}),productionStatus:'prepared',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker,nextAction:executorReady?'fixed Mac App phase 与受控 executor 已就绪；等待一次精确 Desktop App 派发。':'fixed Mac App phase 已锁定；正在等待受控 Desktop App phase executor，禁止 CLI、Terminal 或普通 SSH fallback。',gateState:executorReady?'step01_fixed_app_dispatch_ready':'step01_fixed_app_dispatch_prepared',step01Transport:step01TransportLayers(brokerState,{mac_control_ready:executorReady,artifact_transport_state:brokerState.ready?'ready_for_phase_grants':'waiting_broker_configuration',fixed_app_turn_state:'not_started',reducer_state:'not_started',step01_state:brokerState.ready&&executorReady?'ready_for_fixed_app_dispatch':'blocked_transport'}),worker:{status:'prepared',mode:'fixed_mac_app_phase',threadId:result.employee_thread_id||null,cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt},checkpointUpdatedAt:updatedAt};
    project.dispatch = {...(project.dispatch||{}),status:'prepared',blocker,leaseUntil:null};
    if (executorReady) scheduleFixedStep01Dispatch(project.id);
    return true;
  }
  if (result.status === 'fixed_app_step01_verified') {
    const updatedAt=String(result.completed_at||new Date().toISOString());
    let evidencePackage;
    try { evidencePackage=await readVerifiedStep01Evidence(project); }
    catch (error) {
      const blocker=error.code || 'STEP01_EVIDENCE_PACKAGE_MISSING_OR_INVALID';
      project.status='blocked';project.productionStatus='blocked_contract';project.analysis={...project.analysis,status:'blocked_contract',blocker,updatedAt};project.runtime={...(project.runtime||{}),productionStatus:'blocked_contract',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker,nextAction:'fixed App 回传缺少可验证原片证据包；不得把 receipt 或环境证据提升为 Step01 完成。',gateState:'step01_evidence_package_invalid',checkpointUpdatedAt:updatedAt};project.dispatch={...(project.dispatch||{}),status:'blocked',blocker,leaseUntil:null};return true;
    }
    project.canonical=canonicalStep01Evidence(project);
    project.status='running';project.productionStatus='evidence_ready';project.analysis={...project.analysis,status:'evidence_ready',evidencePackage:{indexSha256:evidencePackage.indexEvidence.sha256,bundleSha256:evidencePackage.bundle.sha256,bundleBytes:evidencePackage.bundle.bytes},localJobId:String(result.local_job_id||'').slice(0,120)||null,fixedAppPhaseKey:String(result.phase_key||'').slice(0,160)||null,fixedAppManifestSha256:String(result.dispatch_manifest_sha256||'').slice(0,64)||null,fixedAppReturnManifestSha256:String(result.return_manifest_sha256||'').slice(0,64)||null,selectedEmployeeThreadId:String(result.employee_thread_id||'').slice(0,80)||null,blocker:null,updatedAt};project.pipeline=pipelineForStatus('evidence_ready',{Step01:{status:'evidence_ready'},Step02:{status:'ready'}});project.runtime={...(project.runtime||{}),productionStatus:'evidence_ready',currentNode:'Step01',earliestIncompleteNode:'Step02',nextSkill:'mx-shortdrama-02-source-timeline',blocker:null,nextAction:'原片事实证据包已验证并可下载；Step02 只能消费 exact evidence manifest。',gateState:'step01_evidence_ready',step01Evidence:{indexSha256:evidencePackage.indexEvidence.sha256,bundleSha256:evidencePackage.bundle.sha256},worker:{status:'completed',mode:'fixed_mac_app_phase',threadId:result.employee_thread_id||null,turnId:result.completion_event?.turn_id||null,cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt},checkpointUpdatedAt:updatedAt};project.dispatch={...(project.dispatch||{}),status:'completed',blocker:null,leaseUntil:null};return true;
  }
  if (result.status === 'fixed_app_step01_blocked') {
    const updatedAt=String(result.completed_at||new Date().toISOString());const rawBlocker=String(result.blocker?.code||'STEP01_FIXED_APP_TYPED_BLOCKER_RETURNED');const typedBlocker=fixedStep01Dispatch.classifiedDispatchFailure({code:rawBlocker});const brokerState=result.artifact_transport?.broker||step01ArtifactBroker.brokerReadiness();project.status='blocked';project.productionStatus=String(result.production_status||'blocked_contract');project.analysis={...project.analysis,status:'blocked_transport',localJobId:String(result.local_job_id||'').slice(0,120)||null,fixedAppPhaseKey:String(result.phase_key||'').slice(0,160)||null,fixedAppReturnManifestSha256:String(result.return_manifest_sha256||'').slice(0,64)||null,selectedEmployeeThreadId:String(result.employee_thread_id||'').slice(0,80)||null,blocker:typedBlocker,updatedAt};project.runtime={...(project.runtime||{}),productionStatus:'blocked_transport',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:typedBlocker,nextAction:typedBlocker==='ARTIFACT_BROKER_NOT_CONFIGURED'?'等待腾讯云 COS 私有 artifact broker 完成配置；不会回退到 SCP。':'Step01 artifact transport 已失败；按 typed blocker 修复，不会重复 Mimo/Paddle 或 Provider 工作。',gateState:'step01_fixed_app_blocked_transport',step01Transport:step01TransportLayers(brokerState,{mac_control_ready:typedBlocker!=='MAC_CONTROL_GATEWAY_UNREACHABLE',artifact_transport_state:typedBlocker,fixed_app_turn_state:result.completion_event?.status==='completed'?'completed':'not_started',reducer_state:'blocked',step01_state:'blocked_transport'}),worker:{status:'blocked',mode:'fixed_mac_app_phase',threadId:result.employee_thread_id||null,turnId:result.completion_event?.turn_id||null,cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt},checkpointUpdatedAt:updatedAt};project.dispatch={...(project.dispatch||{}),status:'blocked',blocker:typedBlocker,leaseUntil:null};return true;
  }
  return false;
}

async function readOwnedProjects(userId) {
  const projects = await readProjects();
  let changed = false;
  for (const project of projects) {
    if (project.ownerId === userId && await reconcileStep01Orchestrator(project)) changed = true;
    if(project.ownerId===userId&&project.analysis?.runId&&project.analysis?.status==='evidence_ready'){
      const reduced=step01EvidenceEvents.reduceEvidenceEvents(await step01EvidenceEvents.readEvidenceEvents(path.join(jobsRoot,project.id,'evidence_events.jsonl')),{projectId:project.id,analysisRunId:project.analysis.runId,sourceSha256:project.source?.sha256,sourceRevision:Number(project.analysis.sourceRevision)});
      if(project.analysis.step01EvidenceDelivered!==reduced.delivered){project.analysis={...project.analysis,step01EvidenceDelivered:reduced.delivered};project.runtime={...(project.runtime||{}),step01EvidenceDelivered:reduced.delivered,finalVideoDelivered:false};changed=true;}
    }
  }
  if (changed) await writeProjects(projects);
  return projects.filter(project => project.ownerId === userId);
}

function safeControllerId(value) {
  const controllerId = String(value || '').trim();
  return /^[a-zA-Z0-9._-]{3,80}$/.test(controllerId) ? controllerId : null;
}

function dispatchLeaseActive(project, now = Date.now()) {
  return Boolean(project.dispatch && project.dispatch.leaseId && new Date(project.dispatch.leaseUntil || 0).getTime() > now);
}

function canControllerClaim(project, controllerId, now = Date.now(), allowOwnedActive = false) {
  if (terminalControllerStatuses.has(project.productionStatus)) return false;
  if (project.runtime?.gateState === 'source_preflight_failed') return false;
  if (project.analysis && ['preflight_running','awaiting_user_start','blocked_preflight'].includes(project.analysis.status)) return false;
  if (!project.dispatch || project.dispatch.status === 'queued') return true;
  if (allowOwnedActive && project.dispatch.controllerId === controllerId) return true;
  return !dispatchLeaseActive(project, now);
}

function claimForController(project, controllerId) {
  const timestamp = new Date().toISOString();
  const leaseId = crypto.randomBytes(24).toString('hex');
  project.dispatch = {
    ...(project.dispatch || {}),
      status:project.dispatch && project.dispatch.localJobId ? 'mirrored' : 'claimed',
    controllerId,
    leaseId,
    claimedAt:timestamp,
    heartbeatAt:timestamp,
    leaseUntil:new Date(Date.now() + bridgeLeaseMs).toISOString(),
    blocker:null
  };
  project.runtime = {
    ...(project.runtime || {}),
    lastHeartbeat:timestamp,
    gateState:project.dispatch.localJobId ? 'controller_connected' : 'controller_claimed'
  };
  return project;
}

function leaseError(project, controllerId, leaseId) {
  if (!project.dispatch || !project.dispatch.leaseId || project.dispatch.leaseId !== leaseId) return {status:409,code:'CONTROLLER_LEASE_MISMATCH',error:'任务租约不匹配'};
  if (project.dispatch.controllerId !== controllerId) return {status:409,code:'CONTROLLER_OWNER_MISMATCH',error:'任务已由其他控制器接管'};
  if (!dispatchLeaseActive(project)) return {status:409,code:'CONTROLLER_LEASE_EXPIRED',error:'任务租约已过期，请重新领取'};
  return null;
}

function sanitizeGates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, gate]) => {
    if (typeof gate === 'string') return [String(key).slice(0, 80), gate.slice(0, 120)];
    if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return [String(key).slice(0, 80), {}];
    return [String(key).slice(0, 80), {
      status:String(gate.status || '').slice(0, 120),
      detail:String(gate.detail || '').slice(0, 500)
    }];
  }));
}

function sanitizeWorker(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    dispatchId:String(value.dispatchId || '').trim().slice(0, 120) || null,
    threadId:String(value.threadId || '').trim().slice(0, 160) || null,
    status:String(value.status || 'queued').trim().slice(0, 80),
    router:String(value.router || '').trim().slice(0, 120) || null,
    mode:String(value.mode || 'queue').trim().slice(0, 30),
    updatedAt:String(value.updatedAt || '').trim().slice(0, 80) || null,
    blocker:String(value.blocker || '').trim().slice(0, 500) || null
  };
}

function sanitizeStep01Projection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowedTierStatuses = new Set(['blocked','pending','ready','partial','running','completed']);
  const tiers = {};
  for (const key of ['basic','enhanced','strict']) {
    const tier = value.tiers && value.tiers[key];
    const status = String(tier && tier.status || 'pending');
    tiers[key] = {status:allowedTierStatuses.has(status) ? status : 'pending',label:String(tier && tier.label || '').slice(0,80)};
  }
  return {
    schemaVersion:'niannian_step01_projection_v1',
    eventLogPresent:value.event_log_present === true,
    strictPassReproducible:value.strict_pass_reproducible === true,
    step02Unlocked:value.step02_unlocked === true,
    tiers
  };
}

function sanitizeStrictRuntime(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    ready:value.ready === true,
    runtimeProfile:String(value.runtimeProfile || '').slice(0,120),
    missing:Array.isArray(value.missing) ? value.missing.slice(0,30).map(item => String(item).slice(0,160)) : [],
    checkedAt:String(value.checkedAt || '').slice(0,80) || null
  };
}

function sanitizeAutoRecovery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    allowed:value.allowed === true,
    reasons:Array.isArray(value.reasons) ? value.reasons.slice(0,20).map(item => String(item).slice(0,160)) : [],
    maxAttempts:1
  };
}

function assertControllerCanonicalTransition(project,controllerStatus) {
  const expected={running_step02:['S02_SOURCE_TIMELINE'],running_step04:['S04_LOCALIZATION_COMPILE'],running_step05:['S05A_SUPPORT_ASSETS','S05B_FIRST_FRAMES'],qa_running:['FINAL_QA'],accepted:['DELIVERY'],packaged:['DELIVERY'],sent:['DELIVERY'],user_visible_acceptance:['DELIVERY']}[controllerStatus];
  if(!expected)return true;
  const trace=projectCanonicalTrace(project),authorityRevision=String(project.canonical?.authority_revision||project.analysis?.authorityRevisionId||project.analysis?.runId||'').trim();
  let lastError=null;
  for(const nodeId of expected){try{return redrawCanonicalDag.assertDownstreamGate(trace,nodeId,authorityRevision);}catch(error){lastError=error;}}
  const error=new Error(lastError?.code||'CANONICAL_CONTRACT_BLOCKED');error.code=lastError?.code||'CANONICAL_CONTRACT_BLOCKED';error.httpStatus=409;throw error;
}

function applyControllerStatus(project, body, controllerId) {
  // The current migration scope is server-authoritative. Historical desktop
  // heartbeats must remain audit-only and cannot overwrite an hq_full run.
  const serverAuthoritative = project?.analysis?.runtimeProfile === serverStep01Executor.PROFILE
    || (project?.id === 'NN-20260726145913-D0C007' && project?.analysis?.runtimeProfile === 'haika-step01-direct-v1');
  if (serverAuthoritative) {
    const error = new Error('STEP01_SERVER_AUTHORITY_ONLY');
    error.code = 'STEP01_SERVER_AUTHORITY_ONLY';
    throw error;
  }
  const controllerStatus = String(body.productionStatus || body.status || '').trim();
  // Step01 becomes facts-ready only through the return reducer, which validates the
  // exact source-bound facts package before changing the project projection.
  if (controllerStatus === 'step01_verified' || controllerStatus === 'evidence_ready') {
    const error = new Error('STEP01_REDUCER_FACTS_PACKAGE_REQUIRED');
    error.code = 'STEP01_REDUCER_FACTS_PACKAGE_REQUIRED';
    throw error;
  }
  if (controllerStatus === 'step02_accepted') {
    const error = new Error('STEP02_REDUCER_ACCEPTANCE_REQUIRED');
    error.code = 'STEP02_REDUCER_ACCEPTANCE_REQUIRED';
    throw error;
  }
  if (!controllerStatuses.has(controllerStatus)) throw new Error('CONTROLLER_STATUS_INVALID');
  const timestamp = new Date().toISOString();
  const gates = sanitizeGates(body.gates);
  const earliestIncompleteNode = ['Step01','Step02','Step04','Step05'].includes(body.earliestIncompleteNode) ? body.earliestIncompleteNode : null;
  const localJobId = String(body.localJobId || project.dispatch.localJobId || '').trim().slice(0, 120) || null;
  const blocker = body.blocker ? String(body.blocker).slice(0, 1000) : null;
  const nextAction = String(body.nextAction || '').trim().slice(0, 1000) || '等待控制器更新下一动作';
  const nextSkill = String(body.nextSkill || '').trim().slice(0, 160) || null;
  const worker = sanitizeWorker(body.worker) || (project.runtime && project.runtime.worker) || null;
  const step01 = sanitizeStep01Projection(body.step01) || (project.runtime && project.runtime.step01) || null;
  const strictRuntime = sanitizeStrictRuntime(body.strictRuntime) || (project.runtime && project.runtime.strictRuntime) || null;
  const autoRecovery = sanitizeAutoRecovery(body.autoRecovery) || (project.runtime && project.runtime.autoRecovery) || null;
  const canonicalTrace=projectCanonicalTrace(project);
  const artifactValue = Number(body.artifactCount || 0);
  const verifiedArtifactValue = Number(body.verifiedArtifactCount || 0);
  const artifactCount = Number.isFinite(artifactValue) ? Math.max(0, Math.min(100000, artifactValue)) : 0;
  const verifiedArtifactCount = Number.isFinite(verifiedArtifactValue) ? Math.max(0, Math.min(artifactCount, verifiedArtifactValue)) : 0;
  project.productionStatus = controllerStatus;
  project.status = publicStatus(controllerStatus);
  project.route = {
    ...(project.route || {}),
    earliestNode:earliestIncompleteNode,
    nextSkill
  };
  project.pipeline = pipelineForStatus(controllerStatus, gates, canonicalTrace);
  project.runtime = {
    productionStatus:controllerStatus,
    currentNode:String(body.currentNode || '').trim().slice(0, 160) || earliestIncompleteNode || 'controller',
    earliestIncompleteNode,
    nextSkill,
    blocker,
    nextAction,
    artifactCount,
    verifiedArtifactCount,
    gateState:String(body.gateState || '').trim().slice(0, 160) || (blocker ? 'blocked' : 'controller_connected'),
    gates,
    worker,
    step01,
    strictRuntime,
    autoRecovery,
    lastHeartbeat:timestamp,
    checkpointUpdatedAt:String(body.checkpointUpdatedAt || timestamp).slice(0, 80),
    controllerId
  };
  if (controllerStatus === 'step01_verified' || controllerStatus === 'evidence_ready') {
    project.analysis = {...(project.analysis || {}),status:'completed',completedAt:timestamp,updatedAt:timestamp};
  } else if (controllerStatus === 'running_step01') {
    project.analysis = {...(project.analysis || {}),status:'running',updatedAt:timestamp};
  } else if (['blocked_resource','blocked_contract','blocked_quality','infra_failed'].includes(controllerStatus)) {
    project.analysis = {...(project.analysis || {}),status:controllerStatus,blocker,updatedAt:timestamp};
  }
  project.dispatch = {
    ...(project.dispatch || {}),
    status:blocker || project.status === 'blocked' ? 'blocked' : 'mirrored',
    controllerId,
    heartbeatAt:timestamp,
    leaseUntil:terminalControllerStatuses.has(controllerStatus) ? null : new Date(Date.now() + bridgeLeaseMs).toISOString(),
    mirroredAt:localJobId ? (project.dispatch.mirroredAt || timestamp) : project.dispatch.mirroredAt || null,
    localJobId,
    blocker
  };
}

function step02ApiStatus(error) {
  if (['STEP02_OWNER_SCOPE_INVALID'].includes(error.code)) return 403;
  if (String(error.code || '').includes('MISSING')) return 409;
  if (String(error.code || '').startsWith('STEP02_')) return 409;
  return 500;
}

function syncProjectStep02Projection(project, review) {
  const now = new Date().toISOString();
  const authorityRevision=String(review.authority?.sha256 || project.canonical?.authority_revision || project.analysis?.authorityRevisionId || project.analysis?.runId || '').trim() || null;
  project.step02 = {
    status:review.status,
    transactionId:review.transaction?.transaction_id || null,
    sourceSha256:review.authority?.source?.sha256 || null,
    step01ManifestSha256:review.authority?.step01?.manifest?.sha256 || null,
    rightsAuthoritySha256:review.authority?.rights_authority?.sha256 || null,
    settingsVersion:review.authority?.settings_version || null,
    candidate:review.candidate ? {
      sourceRows:review.candidate.sourceRows || [],
      dialogueBindings:review.candidate.dialogueBindings || [],
      visualFactCards:review.candidate.visualFactCards || [],
      textEvidence:review.candidate.textEvidence || [],
      assetCandidates:review.candidate.assetCandidates || [],
      hardSceneCandidates:review.candidate.hardSceneCandidates || [],
      blockers:review.candidate.blockers || [],
      downstreamConsumable:false
    } : null,
    acceptance:review.acceptance ? {sha256:review.acceptance.sha256,acceptedAt:review.acceptance.accepted_at,semanticSha256:review.acceptance.candidate?.semantic_sha256 || null,step04Ready:review.acceptance.step04_ready === true} : null,
    step04Ready:review.step04_ready === true,
    updatedAt:now
  };
  if (review.status === 'step02_accepted') {
    const canonicalTrace=redrawCanonicalDag.resolveCanonicalState({
      legacy:{legacy_step_name:'Step02'},
      authority_revision:authorityRevision,
      current_authority_revision:authorityRevision,
      input_contract:{S01_EVIDENCE:true},
      output_contract:{accepted:review.acceptance?.status==='accepted',artifact_ledger_verified:review.acceptance?.downstream_consumable===true&&Boolean(review.acceptance?.sha256)}
    });
    if(canonicalTrace.resolution_status!=='resolved')throw Object.assign(new Error('STEP02_CANONICAL_CONTRACT_BLOCKED'),{code:'STEP02_CANONICAL_CONTRACT_BLOCKED',httpStatus:409});
    project.canonical=canonicalTrace;
    project.productionStatus = 'step02_accepted';
    project.status = 'running';
    project.route = {...(project.route || {}),earliestNode:'Step04',nextSkill:'mx-shortdrama-04-asset-prompts'};
    project.pipeline = pipelineForStatus('step02_accepted', {}, canonicalTrace);
    project.runtime = {...(project.runtime || {}),productionStatus:'step02_accepted',currentNode:'Step04',earliestIncompleteNode:'Step04',nextSkill:'mx-shortdrama-04-asset-prompts',blocker:null,nextAction:'Step04 只可消费当前 Step02 acceptance manifest exact SHA。',gateState:'step02_server_reducer_accepted',checkpointUpdatedAt:now};
  } else {
    const candidateReady = review.status === 'candidate_return_ready';
    project.productionStatus = candidateReady ? 'step02_return_ready' : 'running_step02';
    project.status = 'running';
    project.route = {...(project.route || {}),earliestNode:'Step02',nextSkill:'mx-shortdrama-02-source-timeline'};
    project.canonical=redrawCanonicalDag.resolveCanonicalState({legacy:{legacy_step_name:'Step02'},authority_revision:authorityRevision,current_authority_revision:authorityRevision,input_contract:{S01_EVIDENCE:true},output_contract:{accepted:false,artifact_ledger_verified:false}});
    project.pipeline = pipelineForStatus(project.productionStatus, {}, project.canonical);
    project.runtime = {...(project.runtime || {}),productionStatus:project.productionStatus,currentNode:'Step02',earliestIncompleteNode:'Step02',nextSkill:'mx-shortdrama-02-source-timeline',blocker:null,nextAction:candidateReady?'核对并由项目 owner 接受 exact Step02 candidate；员工回执本身不可下游消费。':'等待固定 Mac App Step02 candidate return。',gateState:candidateReady?'step02_candidate_review':'step02_transaction_active',checkpointUpdatedAt:now};
  }
}

async function handleStep02ProjectApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/step02\/(prepare|dispatch|reconcile|accept|review)$/);
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  const action = match[2];
  const projects = await readProjects();
  const project = projects.find(item => item.id === projectId && item.ownerId === user.id);
  if (!project) { json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'}); return true; }
  const jobRoot = path.join(jobsRoot, project.id);
  try {
    let review;
    if (request.method === 'GET' && action === 'review') {
      review = await step02Vertical.loadReview({project,jobRoot});
      json(response, 200, {code:'STEP02_REVIEW_READY',project:publicProject(project),review});
      return true;
    }
    if (request.method !== 'POST') { json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'}); return true; }
    const body = await readBodyJson(request);
    if (action === 'prepare') review = await step02Vertical.prepareStep02({project,jobRoot});
    if (action === 'dispatch') {
      const prepared = await step02Vertical.prepareDispatch({project,jobRoot,ownerId:user.id});
      if (body.fakeTransport === true) {
        if (String(process.env.NIANNIAN_STEP02_FAKE_TRANSPORT || '').toLowerCase() !== 'on') throw step02Vertical.codeError('STEP02_FAKE_TRANSPORT_DISABLED');
        const returned = await step02Vertical.writeFakeReturn({project,jobRoot,candidate:body.candidate});
        review = await step02Vertical.reconcileReturn({project,jobRoot,returnRoot:returned.returnRoot});
      } else if (body.signedFixture === true) {
        if (String(process.env.NIANNIAN_STEP02_SIGNED_FIXTURE || '').toLowerCase() !== 'on') throw step02Vertical.codeError('STEP02_SIGNED_FIXTURE_DISABLED');
        const returned = await step02Vertical.writeSignedFixtureReturn({project,jobRoot,candidate:body.candidate});
        review = await step02Vertical.reconcileReturn({project,jobRoot,returnRoot:returned.returnRoot});
      } else if (body.executeCarrier === true) {
        if (String(process.env.NIANNIAN_STEP02_CARRIER_ENABLED || '').toLowerCase() !== 'on') throw step02Vertical.codeError('STEP02_CARRIER_PRODUCTION_DISABLED');
        review = await step02Vertical.markCarrierRunning({project,jobRoot,dispatchId:prepared.dispatch.dispatch_id,ownerActionEventId:prepared.dispatch.owner_action_event_id});
        syncProjectStep02Projection(project, review);
        await writeProjects(projects);
        const abortController = new AbortController();
        const onAborted = () => abortController.abort();
        request.once('aborted', onAborted);
        let carried;
        try { carried = await step02Carrier.runCarrier({project,jobRoot,ownerId:user.id,ownerActionEventId:prepared.dispatch.owner_action_event_id,signal:abortController.signal,carrierAlreadyMarked:true}); }
        finally { request.removeListener('aborted', onAborted); }
        review = carried.review;
      } else review = await step02Vertical.loadReview({project,jobRoot});
      review.employeeDispatch = prepared.dispatch;
    }
    if (action === 'reconcile') {
      const dispatch = await readJsonFile(path.join(jobRoot, 'step02', 'step02_employee_dispatch.json'), null);
      if (!dispatch?.phase_key) throw step02Vertical.codeError('STEP02_DISPATCH_REQUIRED');
      review = await step02Vertical.reconcileReturn({project,jobRoot,returnRoot:path.join(jobRoot, 'step02', 'returns', dispatch.phase_key)});
    }
    if (action === 'accept') review = await step02Vertical.acceptCandidate({project,jobRoot,ownerId:user.id,decision:body.decision});
    syncProjectStep02Projection(project, review);
    await writeProjects(projects);
    const code = action === 'prepare' ? 'STEP02_TRANSACTION_PREPARED' : action === 'dispatch' ? (review.status === 'candidate_return_ready' ? 'STEP02_CANDIDATE_RETURN_READY' : 'STEP02_DISPATCH_PREPARED') : action === 'reconcile' ? 'STEP02_CANDIDATE_RECONCILED' : 'STEP02_ACCEPTED_BY_SERVER_REDUCER';
    json(response, 200, {code,project:publicProject(project),review,mediaProviderNetworkRequested:false,mediaProviderSubmitted:false,spendRequested:false,localImageEditingRequested:false,realDelivery:false});
    return true;
  } catch (error) {
    json(response, step02ApiStatus(error), {code:error.code || 'STEP02_API_FAILED',error:error.message});
    return true;
  }
}

function sourceVideoExecutionHttpStatus(error) {
  if (Number.isInteger(error?.httpStatus)) return error.httpStatus;
  const code = String(error?.code || error?.message || '');
  if (code === 'SOURCE_VIDEO_OWNER_SCOPE_INVALID') return 403;
  if (code.includes('NOT_PREPARED')) return 404;
  if (code.startsWith('SOURCE_VIDEO_') || code.startsWith('SOURCE_MIMO_')) return 409;
  return 500;
}

function publicSourceVideoExecutionReview(review) {
  const projection = review?.projection || {};
  const checkpoint = review?.checkpoint || {};
  const media = projection.media || {};
  return {
    state:String(review?.state || projection.status || 'unknown'),
    checkpoint:{
      status:String(checkpoint.status || review?.state || 'unknown'),
      state:String(checkpoint.state || review?.state || 'unknown'),
      blocker:publicWorkflowBlocker(checkpoint.blocker),
      test_only:checkpoint.test_only === true
    },
    projection:{
      status:String(projection.status || review?.state || 'unknown'),
      test_only:projection.test_only === true,
      verified:projection.verified === true,
      downstream_consumable:projection.downstream_consumable === true,
      real_submit_enabled:false,
      media:projection.status === 'projected' ? {
        state:'verified',
        contentType:media.content_type || media.mime || null,
        durationSec:Number(media.duration_sec || 0) || null,
        width:Number(media.width || 0) || null,
        height:Number(media.height || 0) || null
      } : null,
      blocker:publicWorkflowBlocker(projection.blocker)
    }
  };
}

function syncSourceVideoExecutionProjection(project, review) {
  project.videoExecution = {
    schemaVersion:'source_video_media_projection_v1',
    status:review.state,
    groupId:review.projection?.group_id || null,
    transactionId:review.projection?.transaction_id || null,
    provider:review.projection?.provider || 'mimo',
    providerTaskId:review.projection?.provider_task_id || null,
    testOnly:review.projection?.test_only === true,
    verified:review.projection?.verified === true,
    downstreamConsumable:review.projection?.downstream_consumable === true,
    realSubmitEnabled:false,
    historicalChannelEvidenceIsExecutionAuthority:false,
    blocker:review.checkpoint?.blocker || null,
    mediaProviderNetworkRequested:false,
    mediaProviderUploadRequested:false,
    mediaProviderSubmitRequested:false,
    spendRequested:false,
    localImageEditingRequested:false,
    updatedAt:review.checkpoint?.updated_at || new Date().toISOString()
  };
}

async function handleSourceVideoExecutionApi(request,response,pathname,user) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/source-video-execution\/([^/]+)\/(prepare|prepare-fake|resume-fake|submit-real|status)$/);
  if(!match)return false;
  const projectId=decodeURIComponent(match[1]), groupId=decodeURIComponent(match[2]).toUpperCase(), action=match[3];
  const projects=await readProjects();
  const project=projects.find(item=>item.id===projectId&&item.ownerId===user.id);
  if(!project){json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'});return true;}
  const jobRoot=path.join(jobsRoot,project.id);
  try{
    if(action==='status'){
      if(request.method!=='GET'){json(response,405,{code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});return true;}
      const mode=new URL(request.url,'http://127.0.0.1').searchParams.get('mode');
      const review=await sourceVideoExecution.reviewFromJob({project,jobRoot,groupId,testOnly:mode==='fake'?true:mode==='prepared'?false:undefined});
      return json(response,200,{code:'SOURCE_VIDEO_EXECUTION_STATUS_READY',review:publicSourceVideoExecutionReview(review),realSubmitEnabled:false,mediaProviderNetworkRequested:false,mediaProviderSubmitted:false,spendRequested:false,localImageEditingRequested:false});
    }
    if(request.method!=='POST'){json(response,405,{code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});return true;}
    if(action==='submit-real')sourceVideoHttpGuard.validatePaidMutationRequest(request);
    if(action==='prepare'||action==='submit-real'){
      try{
        const localizationRevision=String(request.headers['x-localization-revision']||'').trim(),referenceContext=await loadStep05ReferenceContext({project,user,localizationRevision,consumer:action==='submit-real'?'video_task_spec_locked':'S05B_FIRST_FRAMES'});
        referenceContext.service.assertDownstreamAllowed(action==='submit-real'?'provider_submit':'provider_preflight');
      }catch(error){step05ReferenceFailure(response,error);return true;}
    }
    if(action==='submit-real'){
      if(String(process.env.NIANNIAN_SOURCE_VIDEO_REAL_PROVIDER_ENABLED||'').toLowerCase()!=='on')throw Object.assign(new Error('SOURCE_VIDEO_REAL_PROVIDER_FEATURE_DISABLED'),{code:'SOURCE_VIDEO_REAL_PROVIDER_FEATURE_DISABLED'});
      throw Object.assign(new Error('SOURCE_VIDEO_REAL_PROVIDER_WORKER_NOT_INTEGRATED'),{code:'SOURCE_VIDEO_REAL_PROVIDER_WORKER_NOT_INTEGRATED'});
    }
    if(action==='prepare'){
      const prepared=await sourceVideoExecution.prepareFromJob({project,jobRoot,groupId,testOnly:false,trustedSourceRoot:uploadsRoot});
      syncSourceVideoExecutionProjection(project,prepared.review);await writeProjects(projects);
      return json(response,200,{code:'SOURCE_VIDEO_EXECUTION_PREPARED_NO_SUBMIT_AUTHORITY',project:publicProject(project),review:publicSourceVideoExecutionReview(prepared.review),realSubmitEnabled:false,mediaProviderNetworkRequested:false,mediaProviderSubmitted:false,spendRequested:false,localImageEditingRequested:false});
    }
    if(String(process.env.NIANNIAN_SOURCE_VIDEO_FAKE_TRANSPORT||'').toLowerCase()!=='on')throw Object.assign(new Error('SOURCE_VIDEO_FAKE_TRANSPORT_DISABLED'),{code:'SOURCE_VIDEO_FAKE_TRANSPORT_DISABLED'});
    if(action==='prepare-fake'){
      const prepared=await sourceVideoExecution.prepareFromJob({project,jobRoot,groupId,testOnly:true,trustedSourceRoot:uploadsRoot});
      syncSourceVideoExecutionProjection(project,prepared.review);await writeProjects(projects);
      return json(response,200,{code:'SOURCE_VIDEO_EXECUTION_FAKE_PREPARED',project:publicProject(project),review:publicSourceVideoExecutionReview(prepared.review),testOnly:true,realSubmitEnabled:false,mediaProviderNetworkRequested:false,mediaProviderSubmitted:false,spendRequested:false,localImageEditingRequested:false});
    }
    const transport=sourceVideoExecution.createDeterministicFakeTransport();
    const review=await sourceVideoExecution.runFakeFromJob({project,jobRoot,groupId,transport,trustedSourceRoot:uploadsRoot});
    syncSourceVideoExecutionProjection(project,review);await writeProjects(projects);
    return json(response,200,{code:'SOURCE_VIDEO_EXECUTION_FAKE_PROJECTED_NON_PROMOTABLE',project:publicProject(project),review:publicSourceVideoExecutionReview(review),testOnly:true,transportCalls:transport.calls.map(item=>item.method),realSubmitEnabled:false,mediaProviderNetworkRequested:false,mediaProviderSubmitted:false,spendRequested:false,localImageEditingRequested:false});
  }catch(error){return json(response,sourceVideoExecutionHttpStatus(error),{code:error.code||'SOURCE_VIDEO_EXECUTION_FAILED',error:String(error.message||error),realSubmitEnabled:false,mediaProviderNetworkRequested:false,mediaProviderSubmitted:false,spendRequested:false,localImageEditingRequested:false});}
}

async function handleControllerApi(request, response, pathname) {
  if (!bridgeAuthorized(request)) return json(response, 401, {code:'CONTROLLER_AUTH_REQUIRED',error:'控制器凭据无效'});
  const projects = await readProjects();
  const controllerIdHeader = safeControllerId(request.headers['x-niannian-controller-id']);

  if (request.method === 'GET' && pathname === '/api/controller/jobs') {
    const rows = projects
      .filter(project => !terminalControllerStatuses.has(project.productionStatus))
      .map(project => {
        const output = controllerProject(project);
    if (!controllerIdHeader || !project.dispatch || project.dispatch.controllerId !== controllerIdHeader) {
          output.controller.leaseId = null;
        }
        return output;
      });
    return json(response, 200, {jobs:rows});
  }

  if (request.method === 'POST' && pathname === '/api/controller/jobs/claim') {
    const body = await readBodyJson(request);
    const controllerId = safeControllerId(body.controllerId || controllerIdHeader);
    if (!controllerId) return json(response, 400, {code:'CONTROLLER_ID_INVALID',error:'控制器 ID 无效'});
    const now = Date.now();
      const project = projects.find(item => item.dispatch && item.dispatch.status === 'queued' && canControllerClaim(item, controllerId, now))
      || projects.find(item => canControllerClaim(item, controllerId, now));
    if (!project) return json(response, 200, {job:null});
    claimForController(project, controllerId);
    await writeProjects(projects);
    return json(response, 200, {job:controllerProject(project)});
  }

  const match = pathname.match(/^\/api\/controller\/jobs\/([^/]+)\/(claim|source|rights-authority|heartbeat|status)$/);
  if (!match) return json(response, 404, {code:'CONTROLLER_ROUTE_NOT_FOUND',error:'控制器接口不存在'});
  const projectId = match[1];
  const action = match[2];
  const project = projects.find(item => item.id === projectId);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});

  if (request.method === 'POST' && action === 'claim') {
    const body = await readBodyJson(request);
    const controllerId = safeControllerId(body.controllerId || controllerIdHeader);
    if (!controllerId) return json(response, 400, {code:'CONTROLLER_ID_INVALID',error:'控制器 ID 无效'});
    if (!canControllerClaim(project, controllerId, Date.now(), true)) return json(response, 409, {code:'PROJECT_ALREADY_CLAIMED',error:'任务正在由其他控制器处理'});
    claimForController(project, controllerId);
    await writeProjects(projects);
    return json(response, 200, {job:controllerProject(project)});
  }

  if (request.method === 'GET' && action === 'source') {
    const controllerId = controllerIdHeader;
    const leaseId = String(request.headers['x-niannian-lease-id'] || '');
    const error = leaseError(project, controllerId, leaseId);
    if (error) return json(response, error.status, error);
    let resolved;
    try { resolved=await resolveProjectSource(project,{verify:true}); }
    catch (sourceError) { return json(response,409,{code:sourceError.code||'PROJECT_SOURCE_PATH_INVALID',error:sourceError.message||'项目源视频不可用'}); }
    response.writeHead(200, {'Content-Type':resolved.mime,'Content-Length':resolved.stats.size,'Cache-Control':'no-store','X-Content-SHA256':resolved.sha256,'Content-Disposition':'attachment; filename="source-video"'});
    return fs.createReadStream(resolved.path).pipe(response);
  }

  if (request.method === 'GET' && action === 'rights-authority') {
    const controllerId = controllerIdHeader;
    const leaseId = String(request.headers['x-niannian-lease-id'] || '');
    const error = leaseError(project, controllerId, leaseId);
    if (error) return json(response, error.status, error);
    let evidence;
    try { evidence=await verifyProjectRightsAuthority(project,project.ownerId); }
    catch (rightsError) { return json(response,409,{code:rightsError.code||'STEP01_RIGHTS_AUTHORITY_INVALID',error:rightsError.message}); }
    response.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Content-Length':evidence.bytes,'Cache-Control':'no-store','X-Content-SHA256':evidence.sha256});
    return fs.createReadStream(evidence.path).pipe(response);
  }

  if (request.method === 'POST' && ['heartbeat','status'].includes(action)) {
    const body = await readBodyJson(request);
    const controllerId = safeControllerId(body.controllerId || controllerIdHeader);
    const leaseId = String(body.leaseId || request.headers['x-niannian-lease-id'] || '');
    if (!controllerId) return json(response, 400, {code:'CONTROLLER_ID_INVALID',error:'控制器 ID 无效'});
    const error = leaseError(project, controllerId, leaseId);
    if (error) return json(response, error.status, error);
    const timestamp = new Date().toISOString();
    if (action === 'status') {
      try {
        const proposedStatus = String(body.productionStatus || body.status || '').trim();
        if (proposedStatus !== 'step02_accepted' && step02Vertical.statusRequiresStep02Acceptance(proposedStatus)) await step02Vertical.verifyAcceptedForProject({project,jobRoot:path.join(jobsRoot, project.id)});
        assertControllerCanonicalTransition(project,proposedStatus);
        applyControllerStatus(project, body, controllerId);
      } catch (statusError) {
        if (statusError.code === 'STEP01_REDUCER_FACTS_PACKAGE_REQUIRED' || statusError.message === 'STEP01_REDUCER_FACTS_PACKAGE_REQUIRED') return json(response, 409, {code:'STEP01_REDUCER_FACTS_PACKAGE_REQUIRED',error:'Step01 必须由服务端 return reducer 验证原片事实包后才能完成'});
        if (statusError.code === 'STEP02_REDUCER_ACCEPTANCE_REQUIRED' || statusError.message === 'STEP02_REDUCER_ACCEPTANCE_REQUIRED' || step02Vertical.statusRequiresStep02Acceptance(String(body.productionStatus || body.status || '').trim())) return json(response, 409, {code:'STEP02_REDUCER_ACCEPTANCE_REQUIRED',error:'Step02 必须由服务端 reducer 验证回执与 acceptance manifest 后接受'});
        if (String(statusError.code||'').startsWith('CANONICAL_')) return json(response,409,{code:statusError.code,error:'当前阶段的权威输入或验收条件尚未满足'});
        if (statusError.message === 'CONTROLLER_STATUS_INVALID') return json(response, 400, {code:statusError.message,error:'生产状态无效'});
        throw statusError;
      }
    } else {
      project.dispatch.heartbeatAt = timestamp;
      project.dispatch.leaseUntil = new Date(Date.now() + bridgeLeaseMs).toISOString();
      project.runtime = {...(project.runtime || {}),lastHeartbeat:timestamp};
    }
    await writeProjects(projects);
    return json(response, 200, {ok:true,project:publicProject(project),leaseUntil:project.dispatch.leaseUntil});
  }

  return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
}

async function handleBridgeApi(request, response, pathname) {
  if (!bridgeAuthorized(request)) return json(response, 401, {code:'BRIDGE_AUTH_REQUIRED',error:'桥接凭据无效'});
  const nextPath = '/api/bridge/jobs/next';
  if (request.method === 'GET' && pathname === nextPath) {
    const projects = await readProjects();
    const now = Date.now();
    const project = projects.find(item => item.dispatch && (item.dispatch.status === 'queued' || (item.dispatch.status === 'claimed' && new Date(item.dispatch.leaseUntil || 0).getTime() <= now)));
    if (!project) return json(response, 200, {job:null});
    project.dispatch.status = 'claimed';
    project.dispatch.claimedAt = new Date().toISOString();
    project.dispatch.leaseUntil = new Date(now + bridgeLeaseMs).toISOString();
    project.dispatch.blocker = null;
    await writeProjects(projects);
    return json(response, 200, {job:bridgeProject(project)});
  }
  const match = pathname.match(/^\/api\/bridge\/jobs\/([^/]+)\/(source|ack)$/);
  if (!match) return json(response, 404, {code:'BRIDGE_ROUTE_NOT_FOUND',error:'桥接接口不存在'});
  const projectId = match[1];
  const action = match[2];
  const projects = await readProjects();
  const project = projects.find(item => item.id === projectId);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  if (request.method === 'GET' && action === 'source') {
    let resolved;
    try { resolved=await resolveProjectSource(project,{verify:true}); }
    catch (sourceError) { return json(response,409,{code:sourceError.code||'PROJECT_SOURCE_PATH_INVALID',error:sourceError.message||'项目源视频不可用'}); }
    response.writeHead(200, {'Content-Type':resolved.mime,'Content-Length':resolved.stats.size,'Cache-Control':'no-store','X-Content-SHA256':resolved.sha256,'Content-Disposition':'attachment; filename="source-video"'});
    return fs.createReadStream(resolved.path).pipe(response);
  }
  if (request.method === 'POST' && action === 'ack') {
    const body = await readBodyJson(request);
    const accepted = ['mirrored','blocked'].includes(body.status) ? body.status : 'blocked';
    project.dispatch.status = accepted;
    project.dispatch.mirroredAt = accepted === 'mirrored' ? new Date().toISOString() : null;
    project.dispatch.localJobId = String(body.localJobId || '').slice(0, 120) || null;
    project.dispatch.blocker = accepted === 'blocked' ? String(body.blocker || 'bridge_failed').slice(0, 500) : null;
    project.dispatch.leaseUntil = null;
    await writeProjects(projects);
    return json(response, 200, {ok:true,dispatch:project.dispatch});
  }
  return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
}

function canvasText(value, limit = 2000) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, limit);
}

function canvasNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function normalizeDirectorPlan(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    narrativePurpose:canvasText(raw.narrativePurpose || raw.narrative_purpose, 1000),
    audienceFocus:canvasText(raw.audienceFocus || raw.audience_focus, 1000),
    blockingPlan:canvasText(raw.blockingPlan || raw.blocking_plan, 1200),
    compositionGoal:canvasText(raw.compositionGoal || raw.composition_goal, 1000),
    expressionPlan:canvasText(raw.expressionPlan || raw.expression_plan, 1000),
    movementMotivation:canvasText(raw.movementMotivation || raw.movement_motivation, 1000),
    tempo:canvasText(raw.tempo, 400),
    focusShift:canvasText(raw.focusShift || raw.focus_shift, 600),
    transitionReason:canvasText(raw.transitionReason || raw.transition_reason, 600),
    objectStateControl:canvasText(raw.objectStateControl || raw.object_state_control, 1200),
    actionTimingValidation:canvasText(raw.actionTimingValidation || raw.action_timing_validation, 1200)
  };
}

function normalizeCanvasDocument(value, project) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const allowedTypes = new Set(['intent','source_input','analysis','timeline','adaptation','character','scene','shot','reference','image','video','smart_cut','director','delivery','note','text','skill']);
  const allowedStatuses = new Set(['draft','blocked','ready','awaiting_authorization','queued','running','succeeded','failed','needs_review','review']);
  const ids = new Set();
  const normalizedNodes = Array.isArray(raw.nodes) ? raw.nodes.slice(0, 300).flatMap((node, index) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
    const id = canvasText(node.id || node.nodeId, 80);
    const type = canvasText(node.type || node.kind, 40);
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(id) || ids.has(id) || !allowedTypes.has(type)) return [];
    ids.add(id);
    const sourceData = node.data && typeof node.data === 'object' && !Array.isArray(node.data) ? node.data : {};
    const skillNode = canvasSkillNodes.normalizeSkillNode(node, {projectId:project.id, index});
    const assetIds = Array.isArray(sourceData.assetIds) ? [...new Set(sourceData.assetIds.map(item => canvasText(item, 120)).filter(Boolean))].slice(0, 24) : [];
    const inputAssetIds = Array.isArray(sourceData.inputAssetIds) ? [...new Set(sourceData.inputAssetIds.map(item => canvasText(item, 120)).filter(Boolean))].slice(0, 24) : [];
    const status = allowedStatuses.has(canvasText(sourceData.status, 24)) ? canvasText(sourceData.status, 24) : 'draft';
    return [{
      id,
      nodeId:skillNode?.nodeId || id,
      type,
      kind:skillNode?.kind || type,
      status:skillNode?.status || status,
      skillKey:skillNode?.skillKey || null,
      skillVersion:skillNode?.skillVersion || null,
      description:skillNode?.description || null,
      inputPorts:skillNode?.inputPorts || [],
      outputPorts:skillNode?.outputPorts || [],
      parameters:skillNode?.parameters || {},
      assetRefs:skillNode?.assetRefs || [],
      taskRef:skillNode?.taskRef || null,
      preview:skillNode?.preview || null,
      recovery:skillNode?.recovery || {actions:['retry'],lastAction:null},
      executionMode:skillNode?.executionMode || null,
      position:{x:canvasNumber(node.position?.x, 120 + index * 36, -20000, 20000),y:canvasNumber(node.position?.y, 120 + index * 28, -20000, 20000)},
      data:{
        projectId:project.id,
        entityType:canvasText(sourceData.entityType || type, 80) || type,
        entityId:canvasText(sourceData.entityId, 160) || null,
        taskId:canvasText(sourceData.taskId, 160) || null,
        assetIds,
        inputAssetIds,
        status,
        title:canvasText(sourceData.title || type, 120) || type,
        prompt:canvasText(sourceData.prompt, 4000),
        note:canvasText(sourceData.note, 2000),
        resolution:['1k','2k','4k'].includes(canvasText(sourceData.resolution || '2k', 8).toLowerCase()) ? canvasText(sourceData.resolution || '2k', 8).toLowerCase() : '2k',
        aspectRatio:/^\d{1,2}:\d{1,2}$/.test(canvasText(sourceData.aspectRatio || '1:1', 16)) ? canvasText(sourceData.aspectRatio || '1:1', 16) : '1:1',
        durationSeconds:Number.isFinite(Number(sourceData.durationSeconds)) ? Math.max(4, Math.min(15, Number(sourceData.durationSeconds))) : 5,
        shotId:canvasText(sourceData.shotId, 120) || null,
        directorPlan:type === 'director' ? normalizeDirectorPlan(sourceData.directorPlan) : null,
        skillKey:skillNode?.skillKey || null,
        skillVersion:skillNode?.skillVersion || null,
        description:skillNode?.description || null,
        inputPorts:skillNode?.inputPorts || [],
        outputPorts:skillNode?.outputPorts || [],
        parameters:skillNode?.parameters || {},
        assetRefs:skillNode?.assetRefs || [],
        taskRef:skillNode?.taskRef || null,
        preview:skillNode?.preview || null,
        recovery:skillNode?.recovery || {actions:['retry'],lastAction:null},
        executionMode:skillNode?.executionMode || null
      }
    }];
  }) : [];
  const nodes = canvasS1Chain.reconcileChainNodes(normalizedNodes, project.id);
  const nodeIds = new Set(nodes.map(node => node.id));
  const edgeIds = new Set();
  const allowedKinds = new Set(['depends_on','derived_from','reference','approved_to','variant_of']);
  const edges = Array.isArray(raw.edges) ? raw.edges.slice(0, 600).flatMap(edge => {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) return [];
    const id = canvasText(edge.id, 80);
    const source = canvasText(edge.source, 80);
    const target = canvasText(edge.target, 80);
    const kind = canvasText(edge.kind || 'depends_on', 40);
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(id) || edgeIds.has(id) || source === target || !nodeIds.has(source) || !nodeIds.has(target) || !allowedKinds.has(kind)) return [];
    edgeIds.add(id);
    const sourcePort = canvasText(edge.sourcePort || edge.source_port, 64) || null;
    const targetPort = canvasText(edge.targetPort || edge.target_port, 64) || null;
    if ((sourcePort && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(sourcePort)) || (targetPort && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(targetPort))) return [];
    return [{id,source,target,kind,...(sourcePort ? {sourcePort} : {}),...(targetPort ? {targetPort} : {})}];
  }) : [];
  canvasSkillNodes.validateSkillConnections(nodes, edges);
  return {version:1,nodes,edges,viewport:{x:canvasNumber(raw.viewport?.x, 0, -20000, 20000),y:canvasNumber(raw.viewport?.y, 0, -20000, 20000),zoom:canvasNumber(raw.viewport?.zoom, 1, 0.35, 2.4)}};
}

async function canvasOwnedProject(user, projectKind, projectId) {
  if (!['redraw','script'].includes(projectKind)) return null;
  const projects = projectKind === 'redraw' ? await readProjects() : await readScriptProjects();
  const owned = projects.find(project => project.id === projectId && project.ownerId === user.id) || null;
  if (owned) return owned;
  const canvasProjects = await readCanvasProjects();
  return canvasProjects.find(project => project.id === projectId && project.ownerId === user.id && project.projectKind === projectKind) || null;
}

function isWebCanvasProjectId(projectId) {
  return /^NN-web-[A-Za-z0-9-]{4,100}$/.test(String(projectId || '').trim());
}

async function ensureWebCanvasProject(user, projectId, name = null) {
  const id = String(projectId || '').trim();
  if (!isWebCanvasProjectId(id)) return null;
  return withCanvasProjectsWriteLock(async () => {
    const projects = await readCanvasProjects();
    const existing = projects.find(project => project.id === id);
    if (existing) return existing.ownerId === user.id ? existing : null;
    const now = new Date().toISOString();
    const project = {
      id,
      ownerId:user.id,
      canvasOnly:true,
      name:canvasText(name, 160) || '未命名项目',
      projectKind:'redraw',
      status:'ready',
      createdAt:now,
      updatedAt:now,
      runtime:{productionStatus:'ready',currentNode:'canvas',earliestIncompleteNode:null,nextSkill:null,blocker:null,nextAction:null,gateState:'canvas_ready'}
    };
    projects.unshift(project);
    await writeCanvasProjects(projects);
    return project;
  });
}

function canvasDocumentKey(projectKind, projectId) {
  return projectKind + ':' + projectId;
}

function canvasAssetDownloadUrl(projectId, assetId) {
  return '/api/projects/' + encodeURIComponent(projectId) + '/assets/' + encodeURIComponent(assetId) + '/download';
}

function publicCanvasAsset(asset) {
  const {sha256,...publicAsset} = canvasAssetService.publicAsset(asset);
  return {...publicAsset,downloadUrl:canvasAssetDownloadUrl(asset.projectId, asset.id)};
}

const canvasAssetMimeAliases = Object.freeze({
  png: Object.freeze(['image/png']),
  jpeg: Object.freeze(['image/jpeg','image/jpg']),
  webp: Object.freeze(['image/webp']),
  mp3: Object.freeze(['audio/mpeg','audio/mp3']),
  wav: Object.freeze(['audio/wav','audio/x-wav','audio/wave']),
  ogg: Object.freeze(['audio/ogg']),
  m4a: Object.freeze(['audio/mp4','audio/x-m4a']),
  mp4: Object.freeze(['video/mp4']),
  mov: Object.freeze(['video/quicktime']),
  webm: Object.freeze(['video/webm'])
});

function canvasAssetUploadKind(fieldName, fields) {
  const requested = canvasText(fields.kind || fields.assetKind, 40);
  const byField = {referenceImage:'reference_image',referenceAudio:'reference_audio',referenceVideo:'reference_video'};
  const kind = requested || byField[fieldName] || '';
  if (!['reference_image','reference_audio','reference_video'].includes(kind)) throw Object.assign(new Error('素材类型无效'), {code:'CANVAS_ASSET_KIND_INVALID',httpStatus:422});
  return kind;
}

function canvasAssetFormatFromHeader(bytes, kind) {
  const header = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const starts = (offset, value) => header.length >= offset + value.length && header.subarray(offset, offset + value.length).equals(Buffer.from(value));
  const isFtyp = starts(4, 'ftyp');
  const brands = isFtyp ? header.subarray(8, Math.min(header.length, 64)).toString('ascii') : '';
  if (kind === 'reference_image') return null;
  if (kind === 'reference_audio') {
    if (starts(0, 'ID3') || (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) return 'mp3';
    if (starts(0, 'RIFF') && starts(8, 'WAVE')) return 'wav';
    if (starts(0, 'OggS')) return 'ogg';
    if (isFtyp && /M4A |M4B |M4P /.test(brands)) return 'm4a';
    return null;
  }
  if (kind === 'reference_video' || kind === 'generated_video') {
    if (header.length >= 4 && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return 'webm';
    if (isFtyp && /qt  /.test(brands)) return 'mov';
    if (isFtyp && !/M4A |M4B |M4P /.test(brands)) return 'mp4';
  }
  return null;
}

async function inspectCanvasAssetUpload(pendingPath, source, kind) {
  if (kind === 'reference_image') {
    const metadata = await sharp(pendingPath, {failOn:'error'}).metadata();
    const format = String(metadata.format || '').toLowerCase();
    if (!['png','jpeg','webp'].includes(format)) throw Object.assign(new Error('参考图仅支持 PNG、JPEG 或 WebP'), {code:'CANVAS_ASSET_TYPE_UNSUPPORTED',httpStatus:415});
    return format;
  }
  const handle = await fsp.open(pendingPath, 'r');
  try {
    const header = Buffer.alloc(64);
    const {bytesRead} = await handle.read(header, 0, header.length, 0);
    const format = canvasAssetFormatFromHeader(header.subarray(0, bytesRead), kind);
    if (!format) throw Object.assign(new Error(kind === 'reference_audio' ? '参考音频格式无效或不受支持' : '参考视频格式无效或不受支持'), {code:'CANVAS_ASSET_CONTENT_INVALID',httpStatus:415});
    return format;
  } finally {
    await handle.close();
  }
}

function canvasAssetDeclaredMimeMatches(format, incomingMime) {
  const normalized = String(incomingMime || '').toLowerCase();
  return !normalized || normalized === 'application/octet-stream' || (canvasAssetMimeAliases[format] || []).includes(normalized);
}

async function handleCanvasAssetsApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/assets(?:\/([^/]+))?(?:\/(download))?$/);
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  const assetId = match[2] ? decodeURIComponent(match[2]) : null;
  const action = match[3] || null;
  const projectKind = String(request.headers['x-niannian-project-kind'] || '').trim() || null;
  const owned = await ownedCanvasProjectById(user, projectId, projectKind);
  if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  if (!assetId && !action && request.method === 'GET') {
    const assets = await canvasAssetService.listOwned(user.id, projectId, owned.projectKind);
    const publicAssets = assets.map(publicCanvasAsset);
    const source = owned.project && owned.project.source;
    if (source && String(source.mimeType || '').startsWith('video/')) {
      publicAssets.unshift({id:canvasS1Chain.legacySourceAssetId(projectId),projectId,projectKind:owned.projectKind,kind:'reference_video',originalName:source.originalName || '原片视频',mimeType:source.mimeType,format:path.extname(source.originalName || '').slice(1).toLowerCase() || 'mp4',bytes:Number(source.bytes || 0),status:'ready',source:'project_source',downloadUrl:'/api/projects/' + encodeURIComponent(projectId) + '/source'});
    }
    return json(response, 200, {projectId,projectKind:owned.projectKind,assets:publicAssets});
  }
  if (!assetId && !action && request.method === 'POST') {
    await fsp.mkdir(canvasAssetsRoot, {recursive:true});
    const token = crypto.randomBytes(12).toString('hex');
    const pendingPath = path.join(canvasAssetsRoot, '.pending-' + token);
    const fields = Object.create(null);
    let source = null;
    let uploadError = null;
    let uploadPromise = Promise.resolve();
    let busboy;
    try { busboy = Busboy({headers:request.headers,limits:{files:1,fileSize:canvasAssetService.maxBytes,fields:8}}); }
    catch { return json(response, 400, {code:'CANVAS_ASSET_MULTIPART_REQUIRED',error:'请使用 multipart/form-data 上传项目素材'}); }
    busboy.on('field', (name, value) => { fields[name] = value; });
    busboy.on('file', (name, file, info) => {
      if (!['asset','referenceImage','referenceAudio','referenceVideo'].includes(name) || source) {
        uploadError = {code:'CANVAS_ASSET_COUNT_INVALID',message:'请一次只上传一个项目素材'};
        file.resume();
        return;
      }
      const originalName = safeName(info.filename || 'reference-image');
      const incomingMime = String(info.mimeType || '').toLowerCase();
      uploadPromise = new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        let bytes = 0;
        const output = fs.createWriteStream(pendingPath, {flags:'wx'});
        file.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
        file.on('limit', () => { uploadError = {code:'CANVAS_ASSET_TOO_LARGE',message:'项目素材超过允许大小'}; });
        file.on('error', reject);
        output.on('error', reject);
        output.on('finish', () => { source = {fieldName:name,originalName,incomingMime,bytes,sha256:hash.digest('hex')}; resolve(); });
        file.pipe(output);
      });
    });
    busboy.on('error', error => { uploadError = {code:'CANVAS_ASSET_UPLOAD_INVALID',message:error.message || '参考图上传失败'}; });
    busboy.on('close', async () => {
      try {
        await uploadPromise;
        if (uploadError) throw Object.assign(new Error(uploadError.message), uploadError);
        if (!source) throw Object.assign(new Error('请上传一个项目素材'), {code:'CANVAS_ASSET_REQUIRED',httpStatus:400});
        const kind = canvasAssetUploadKind(source.fieldName, fields);
        const format = await inspectCanvasAssetUpload(pendingPath, source, kind);
        const expectedMime = canvasAssets.FORMATS[format].mimeType;
        if (!canvasAssetDeclaredMimeMatches(format, source.incomingMime)) throw Object.assign(new Error('素材文件类型与内容不一致'), {code:'CANVAS_ASSET_CONTENT_TYPE_MISMATCH',httpStatus:415});
        const assetId = 'CAS-' + crypto.randomBytes(12).toString('hex');
        const extension = canvasAssets.FORMATS[format].extension;
        const storedPath = path.join(canvasAssetsRoot, assetId + extension);
        await fsp.rename(pendingPath, storedPath);
        let registered;
        try {
          registered = await canvasAssetService.register({ownerId:user.id,projectId,projectKind:owned.projectKind,kind,assetId,originalName:source.originalName,mimeType:expectedMime,format,bytes:source.bytes,sha256:source.sha256});
        } catch (error) {
          await fsp.rm(storedPath, {force:true});
          throw error;
        }
        if (!registered.created) await fsp.rm(storedPath, {force:true});
        return json(response, registered.created ? 201 : 200, {code:registered.created ? 'CANVAS_ASSET_CREATED' : 'CANVAS_ASSET_REUSED',idempotent:!registered.created,asset:publicCanvasAsset(registered.asset)});
      } catch (error) {
        await fsp.rm(pendingPath, {force:true}).catch(() => {});
        return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_ASSET_UPLOAD_FAILED',error:error.message || '参考图上传失败'});
      }
    });
    request.pipe(busboy);
    return true;
  }
  if (assetId && action === 'download' && ['GET','HEAD'].includes(request.method)) {
    const asset = await canvasAssetService.getOwned(user.id, projectId, assetId);
    if (!asset) return json(response, 404, {code:'CANVAS_ASSET_NOT_FOUND',error:'素材不存在'});
    const stat = await fsp.stat(asset.storedPath).catch(() => null);
    if (!stat || stat.size !== Number(asset.bytes)) return json(response, 409, {code:'CANVAS_ASSET_INTEGRITY_FAILED',error:'素材暂时无法读取'});
    const download = new URL(request.url, 'http://127.0.0.1').searchParams.get('download') === '1';
    const headers = {'Content-Type':asset.mimeType,'Content-Length':stat.size,'Cache-Control':'private, no-store','ETag':'"' + asset.sha256 + '"','X-Content-SHA256':asset.sha256,'X-Content-Type-Options':'nosniff','Content-Disposition':(download ? 'attachment' : 'inline') + '; filename="' + safeName(asset.originalName) + '"'};
    response.writeHead(200, headers);
    if (request.method === 'HEAD') return response.end();
    return fs.createReadStream(asset.storedPath).pipe(response);
  }
  return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
}

function canvasEtag(revision) {
  return '"canvas-rev-' + Number(revision || 0) + '"';
}

async function handleCanvasDocumentApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/canvas\/documents\/(redraw|script)\/([^/]+)$/);
  if (!match) return false;
  const projectKind = match[1];
  const projectId = decodeURIComponent(match[2]);
  const project = await canvasOwnedProject(user, projectKind, projectId);
  if (!project) { json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'}); return true; }
  const key = canvasDocumentKey(projectKind, projectId);
  if (request.method === 'GET') {
    const record = (await readCanvasDocuments())[key];
    const revision = Number(record?.revision || 0);
    const document = normalizeCanvasDocument(record?.document, project);
    json(response, 200, {project:{id:project.id,name:canvasText(project.name, 160),kind:projectKind,status:canvasText(project.status, 80),runtime:project.runtime || {}},revision,document,updatedAt:record?.updatedAt || null}, {ETag:canvasEtag(revision), 'Cache-Control':'no-store'});
    return true;
  }
  if (request.method !== 'PUT') { json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'}); return true; }
  try {
    const body = await readBodyJson(request);
    const saved = await withCanvasDocumentsWriteLock(async () => {
      const documents = await readCanvasDocuments();
      const current = documents[key] || null;
      const currentRevision = Number(current?.revision || 0);
      if (request.headers['if-match'] !== canvasEtag(currentRevision)) throw Object.assign(new Error('画布已在其他页面更新，请先重新载入。'), {code:'CANVAS_REVISION_CONFLICT',httpStatus:412});
      const document = normalizeCanvasDocument(body.document, project);
      const revision = currentRevision + 1;
      const record = {schemaVersion:'niannian.canvas-document.v1',projectId:project.id,projectKind,ownerId:user.id,revision,document,updatedAt:new Date().toISOString()};
      documents[key] = record;
      await writeCanvasDocuments(documents);
      return record;
    });
    return json(response, 200, {revision:saved.revision,document:saved.document,updatedAt:saved.updatedAt}, {ETag:canvasEtag(saved.revision), 'Cache-Control':'no-store'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_DOCUMENT_INVALID',error:error.message || '画布保存失败'});
  }
}

async function handleCanvasS1ChainApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/canvas\/documents\/(redraw|script)\/([^/]+)\/s1-chain$/);
  if (!match) return false;
  const projectKind = match[1];
  const projectId = decodeURIComponent(match[2]);
  const project = await canvasOwnedProject(user, projectKind, projectId);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  if (request.method !== 'POST') return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  try {
    const body = await readBodyJson(request);
    const sourceAssetIds = canvasS1Chain.uniqueIds(body.sourceAssetIds);
    for (const assetId of sourceAssetIds) {
      if (canvasS1Chain.isLegacySourceAssetId(assetId, projectId)) {
        if (!project.source || !String(project.source.mimeType || '').startsWith('video/')) throw Object.assign(new Error('项目没有可用的原片视频'), {code:'CANVAS_S1_SOURCE_ASSET_INVALID',httpStatus:422});
        continue;
      }
      const asset = await canvasAssetService.getOwned(user.id, projectId, assetId);
      if (!asset || asset.projectKind !== projectKind || asset.kind !== 'reference_video') throw Object.assign(new Error('原片素材不存在或不是当前项目的视频素材'), {code:'CANVAS_S1_SOURCE_ASSET_INVALID',httpStatus:422});
    }
    const key = canvasDocumentKey(projectKind, projectId);
    const saved = await withCanvasDocumentsWriteLock(async () => {
      const documents = await readCanvasDocuments();
      const current = documents[key] || null;
      const currentRevision = Number(current?.revision || 0);
      if (request.headers['if-match'] !== canvasEtag(currentRevision)) throw Object.assign(new Error('画布已在其他页面更新，请先重新载入。'), {code:'CANVAS_REVISION_CONFLICT',httpStatus:412});
      const currentDocument = normalizeCanvasDocument(current?.document, project);
      const chain = canvasS1Chain.createChain({projectId,sourceAssetIds,rightsConfirmed:body.rightsConfirmed === true,preflightStatus:body.preflightStatus,existingNodes:currentDocument.nodes});
      const document = normalizeCanvasDocument(canvasS1Chain.mergeChain(currentDocument, chain), project);
      const revision = currentRevision + 1;
      const record = {schemaVersion:'niannian.canvas-document.v1',projectId:project.id,projectKind,ownerId:user.id,revision,document,updatedAt:new Date().toISOString()};
      documents[key] = record;
      await syncSkillDocumentToNomiCanvas({documents,project,projectKind,skillDocument:document});
      await writeCanvasDocuments(documents);
      return {record,chain};
    });
    return json(response, 201, {code:'CANVAS_S1_CHAIN_READY',revision:saved.record.revision,document:saved.record.document,chain:{nodeIds:canvasS1Chain.CHAIN_NODE_IDS,sourceReady:saved.chain.sourceReady},updatedAt:saved.record.updatedAt}, {ETag:canvasEtag(saved.record.revision),'Cache-Control':'no-store'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_S1_CHAIN_FAILED',error:error.message || 'S1 节点链创建失败'});
  }
}

async function handleCanvasSkillNodeLayoutApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/canvas\/documents\/(redraw|script)\/([^/]+)\/skill-node-layout$/);
  if (!match) return false;
  const projectKind = match[1];
  const projectId = decodeURIComponent(match[2]);
  const project = await canvasOwnedProject(user, projectKind, projectId);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  if (request.method !== 'POST') return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  try {
    const body = await readBodyJson(request);
    const requested = body.positions && typeof body.positions === 'object' && !Array.isArray(body.positions) ? body.positions : {};
    const requestedPositions = Object.fromEntries(Object.entries(requested).flatMap(([id, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const x = Number(value.x); const y = Number(value.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      return [[id, {x:Math.max(-20000,Math.min(20000,Math.round(x))),y:Math.max(-20000,Math.min(20000,Math.round(y)))}]];
    }));
    const key = canvasDocumentKey(projectKind, projectId);
    const saved = await withCanvasDocumentsWriteLock(async () => {
      const documents = await readCanvasDocuments();
      const current = documents[key] || null;
      const currentRevision = Number(current?.revision || 0);
      if (request.headers['if-match'] !== canvasEtag(currentRevision)) throw Object.assign(new Error('画布已在其他页面更新，请先重新载入。'), {code:'CANVAS_REVISION_CONFLICT',httpStatus:412});
      const currentDocument = normalizeCanvasDocument(current?.document, project);
      const allowed = new Set(currentDocument.nodes.map(node => node.id));
      const positions = Object.fromEntries(Object.entries(requestedPositions).filter(([id]) => allowed.has(id)));
      const nodes = currentDocument.nodes.map(node => positions[node.id] ? {...node,position:positions[node.id]} : node);
      const document = normalizeCanvasDocument({...currentDocument,nodes}, project);
      const revision = currentRevision + 1;
      const record = {schemaVersion:'niannian.canvas-document.v1',projectId:project.id,projectKind,ownerId:user.id,revision,document,updatedAt:new Date().toISOString()};
      documents[key] = record;
      await syncSkillDocumentToNomiCanvas({documents,project,projectKind,skillDocument:document});
      await writeCanvasDocuments(documents);
      return record;
    });
    return json(response, 200, {code:'CANVAS_SKILL_NODE_LAYOUT_SAVED',revision:saved.revision,document:saved.document,updatedAt:saved.updatedAt}, {ETag:canvasEtag(saved.revision),'Cache-Control':'no-store'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_SKILL_NODE_LAYOUT_FAILED',error:error.message || '节点位置保存失败'});
  }
}

async function handleCanvasImage2NodeApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/canvas\/documents\/(redraw|script)\/([^/]+)\/s2-image2$/);
  if (!match) return false;
  const projectKind = match[1];
  const projectId = decodeURIComponent(match[2]);
  const project = await canvasOwnedProject(user, projectKind, projectId);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  if (request.method !== 'POST') return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  try {
    const body = await readBodyJson(request);
    const referenceAssetIds = canvasImage2Node.ids(body.referenceAssetIds || body.inputAssetIds);
    for (const assetId of referenceAssetIds) {
      const asset = await canvasAssetService.getOwned(user.id, projectId, assetId);
      if (!asset || asset.projectKind !== projectKind || asset.kind !== 'reference_image') {
        throw Object.assign(new Error('参考素材不存在或不是当前项目的图片资产'), {code:'CANVAS_S2_REFERENCE_ASSET_INVALID',httpStatus:422});
      }
    }
    const key = canvasDocumentKey(projectKind, projectId);
    const saved = await withCanvasDocumentsWriteLock(async () => {
      const documents = await readCanvasDocuments();
      const current = documents[key] || null;
      const currentRevision = Number(current?.revision || 0);
      if (request.headers['if-match'] !== canvasEtag(currentRevision)) throw Object.assign(new Error('画布已在其他页面更新，请先重新载入。'), {code:'CANVAS_REVISION_CONFLICT',httpStatus:412});
      const currentDocument = normalizeCanvasDocument(current?.document, project);
      const prior = currentDocument.nodes.find(node => node.id === canvasImage2Node.IMAGE2_NODE_ID) || null;
      const node = canvasImage2Node.createImage2Node({projectId, referenceAssetIds, existingNode:{...prior, data:{...(prior?.data || {}), prompt:body.prompt, imageChannel:body.imageChannel, resolution:body.resolution, aspectRatio:body.aspectRatio, outputSize:body.outputSize}}});
      const document = normalizeCanvasDocument({...currentDocument, nodes:[...currentDocument.nodes.filter(item => item.id !== node.id), node]}, project);
      const revision = currentRevision + 1;
      const record = {schemaVersion:'niannian.canvas-document.v1',projectId:project.id,projectKind,ownerId:user.id,revision,document,updatedAt:new Date().toISOString()};
      documents[key] = record;
      await syncSkillDocumentToNomiCanvas({documents,project,projectKind,skillDocument:document});
      await writeCanvasDocuments(documents);
      return record;
    });
    return json(response, 201, {code:'CANVAS_S2_IMAGE2_NODE_READY',revision:saved.revision,node:saved.document.nodes.find(item => item.id === canvasImage2Node.IMAGE2_NODE_ID),imageChannels:canvasProviderConfig.publicCanvasProviderStatus().imageChannels,updatedAt:saved.updatedAt}, {ETag:canvasEtag(saved.revision),'Cache-Control':'no-store'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_S2_IMAGE2_NODE_FAILED',error:error.message || 'Image2 节点创建失败'});
  }
}

async function handleCanvasH3NodeApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/canvas\/documents\/(redraw|script)\/([^/]+)\/s3-h3$/);
  if (!match) return false;
  const projectKind = match[1];
  const projectId = decodeURIComponent(match[2]);
  const project = await canvasOwnedProject(user, projectKind, projectId);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  if (request.method !== 'POST') return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  try {
    const body = await readBodyJson(request);
    const referenceAssetIds = canvasH3Node.ids(body.referenceAssetIds || body.inputAssetIds);
    for (const assetId of referenceAssetIds) {
      const asset = await canvasAssetService.getOwned(user.id, projectId, assetId);
      if (!asset || asset.projectKind !== projectKind || !['reference_image','generated_image'].includes(asset.kind)) {
        throw Object.assign(new Error('H3 参考素材不存在或不是当前项目的图片资产'), {code:'CANVAS_S3_REFERENCE_ASSET_INVALID',httpStatus:422});
      }
    }
    const key = canvasDocumentKey(projectKind, projectId);
    const saved = await withCanvasDocumentsWriteLock(async () => {
      const documents = await readCanvasDocuments();
      const current = documents[key] || null;
      const currentRevision = Number(current?.revision || 0);
      if (request.headers['if-match'] !== canvasEtag(currentRevision)) throw Object.assign(new Error('画布已在其他页面更新，请先重新载入。'), {code:'CANVAS_REVISION_CONFLICT',httpStatus:412});
      const currentDocument = normalizeCanvasDocument(current?.document, project);
      const prior = currentDocument.nodes.find(node => node.id === canvasH3Node.H3_NODE_ID) || null;
      const node = canvasH3Node.createH3Node({projectId, referenceAssetIds, existingNode:{...prior, data:{...(prior?.data || {}), prompt:body.prompt, aspectRatio:body.aspectRatio, durationSeconds:body.durationSeconds}}});
      const document = normalizeCanvasDocument({...currentDocument,nodes:[...currentDocument.nodes.filter(item => item.id !== node.id),node]}, project);
      const revision = currentRevision + 1;
      const record = {schemaVersion:'niannian.canvas-document.v1',projectId:project.id,projectKind,ownerId:user.id,revision,document,updatedAt:new Date().toISOString()};
      documents[key] = record;
      await syncSkillDocumentToNomiCanvas({documents,project,projectKind,skillDocument:document});
      await writeCanvasDocuments(documents);
      return record;
    });
    return json(response, 201, {code:'CANVAS_S3_H3_NODE_READY',revision:saved.revision,node:saved.document.nodes.find(item => item.id === canvasH3Node.H3_NODE_ID),updatedAt:saved.updatedAt}, {ETag:canvasEtag(saved.revision),'Cache-Control':'no-store'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_S3_H3_NODE_FAILED',error:error.message || 'H3 节点创建失败'});
  }
}

async function handleCanvasSkillReadinessApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/canvas\/skill-nodes\/([^/]+)\/readiness$/);
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  const nodeId = decodeURIComponent(match[2]);
  if (request.method !== 'GET') return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  try {
    const projectKind = canvasText(new URL(request.url, 'http://127.0.0.1').searchParams.get('projectKind'), 20) || null;
    const owned = await ownedCanvasProjectById(user, projectId, projectKind);
    if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    const record = (await readCanvasDocuments())[canvasDocumentKey(owned.projectKind, projectId)];
    const document = normalizeCanvasDocument(record?.document, owned.project);
    const readiness = canvasSkillNodes.orchestrationReadiness(document, nodeId);
    return json(response, 200, {code:'CANVAS_SKILL_NODE_READINESS',projectId,projectKind:owned.projectKind,readiness,providerSubmitEnabled:false,spendRequested:false}, {'Cache-Control':'no-store'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_SKILL_NODE_READINESS_FAILED',error:error.message || '编排输入检查失败'});
  }
}

function decodeDirectorDeskCapture(value) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || '').trim());
  if (!match) throw Object.assign(new Error('导演台截图格式无效'), {code:'DIRECTOR_CAPTURE_INVALID',httpStatus:422});
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > canvasAssetService.maxBytes) throw Object.assign(new Error('导演台截图大小无效'), {code:'DIRECTOR_CAPTURE_SIZE_INVALID',httpStatus:422});
  return {declaredMimeType:match[1],bytes};
}

async function importDirectorDeskCapture(user, owned, capture, directorPlan) {
  const decoded = decodeDirectorDeskCapture(capture?.dataUrl);
  return importDirectorDeskCaptureBuffer(user, owned, {...decoded,fileName:capture?.fileName}, directorPlan);
}

async function importDirectorDeskCaptureBuffer(user, owned, capture, directorPlan) {
  const metadata = await sharp(capture.bytes, {failOn:'error'}).metadata();
  const format = String(metadata.format || '').toLowerCase();
  const expectedMimeType = canvasAssets.FORMATS[format]?.mimeType;
  if (!['png','jpeg','webp'].includes(format) || expectedMimeType !== capture.declaredMimeType) throw Object.assign(new Error('导演台截图内容无效'), {code:'DIRECTOR_CAPTURE_CONTENT_INVALID',httpStatus:415});
  const registered = await canvasAssetService.registerBuffer({
    ownerId:user.id,
    projectId:owned.project.id,
    projectKind:owned.projectKind,
    kind:'reference_image',
    format,
    bytes:capture.bytes,
    originalName:canvasText(capture?.fileName, 160) || `director-desk-capture.${canvasAssets.FORMATS[format].extension.slice(1)}`
  });
  const key = canvasDocumentKey(owned.projectKind, owned.project.id);
  const saved = await withCanvasDocumentsWriteLock(async () => {
    const documents = await readCanvasDocuments();
    const current = documents[key] || null;
    const currentRevision = Number(current?.revision || 0);
    const document = normalizeCanvasDocument(current?.document, owned.project);
    const existing = document.nodes.find(node => node.type === 'director' && node.data?.entityId === `director-desk:${registered.asset.id}`);
    if (existing) return {document,revision:currentRevision,node:existing,created:false,updatedAt:current?.updatedAt || null};
    const index = document.nodes.length;
    const node = {
      id:`director-${crypto.randomBytes(9).toString('hex')}`,
      type:'director',
      position:{x:120 + (index % 3) * 260,y:130 + Math.floor(index / 3) * 180},
      data:{
        projectId:owned.project.id,
        entityType:'director_plan',
        entityId:`director-desk:${registered.asset.id}`,
        taskId:null,
        assetIds:[registered.asset.id],
        inputAssetIds:[],
        status:'ready',
        title:'导演计划',
        prompt:'',
        note:'从导演台导入的镜头与机位参考。',
        resolution:'2k',
        aspectRatio:'16:9',
        durationSeconds:5,
        shotId:null,
        directorPlan:normalizeDirectorPlan(directorPlan)
      }
    };
    document.nodes.push(node);
    const revision = currentRevision + 1;
    const record = {schemaVersion:'niannian.canvas-document.v1',projectId:owned.project.id,projectKind:owned.projectKind,ownerId:user.id,revision,document,updatedAt:new Date().toISOString()};
    documents[key] = record;
    await writeCanvasDocuments(documents);
    return {document,revision,node,created:true,updatedAt:record.updatedAt};
  });
  return {asset:registered.asset,node:saved.node,revision:saved.revision,documentCreated:saved.created,assetCreated:registered.created,updatedAt:saved.updatedAt};
}

async function readDirectorDeskCaptureMultipart(request) {
  return new Promise((resolve, reject) => {
    let busboy;
    try { busboy = Busboy({headers:request.headers,limits:{files:1,fileSize:canvasAssetService.maxBytes,fields:8}}); }
    catch { reject(Object.assign(new Error('请使用 multipart/form-data 上传导演台截图'), {code:'DIRECTOR_CAPTURE_MULTIPART_REQUIRED',httpStatus:400})); return; }
    let source = null;
    let uploadError = null;
    busboy.on('file', (name, file, info) => {
      if (name !== 'capture' || source) {
        uploadError = Object.assign(new Error('请只上传一张导演台截图'), {code:'DIRECTOR_CAPTURE_COUNT_INVALID',httpStatus:422});
        file.resume();
        return;
      }
      const chunks = [];
      let bytes = 0;
      file.on('data', chunk => { bytes += chunk.length; if (bytes <= canvasAssetService.maxBytes) chunks.push(chunk); });
      file.on('limit', () => { uploadError = Object.assign(new Error('导演台截图不能超过允许大小'), {code:'DIRECTOR_CAPTURE_SIZE_INVALID',httpStatus:422}); });
      file.on('error', reject);
      file.on('end', () => {
        if (!uploadError) source = {bytes:Buffer.concat(chunks),declaredMimeType:String(info.mimeType || '').toLowerCase(),fileName:info.filename || 'director-desk-capture.png'};
      });
    });
    busboy.on('error', reject);
    busboy.on('close', () => {
      if (uploadError) return reject(uploadError);
      if (!source?.bytes?.length) return reject(Object.assign(new Error('请先从导演台选择截图'), {code:'DIRECTOR_CAPTURE_REQUIRED',httpStatus:422}));
      resolve(source);
    });
    request.pipe(busboy);
  });
}

async function handleDirectorDeskApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/canvas\/director-desk\/(redraw|script)\/([^/]+)(?:\/(captures)|\/bindings\/(storyboard|video-task|delivery))?$/);
  if (!match) return false;
  const projectKind = match[1];
  const projectId = decodeURIComponent(match[2]);
  const action = match[3] || null;
  const bindingType = match[4] || null;
  const project = await canvasOwnedProject(user, projectKind, projectId);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  const key = directorDeskDocumentKey(projectKind, projectId);
  if (!action && !bindingType && request.method === 'GET') {
    const record = (await readDirectorDeskDocuments())[key];
    const revision = Number(record?.revision || 0);
    return json(response, 200, {document:normalizeDirectorDeskDocument(record?.document),revision,updatedAt:record?.updatedAt || null}, {ETag:directorDeskEtag(revision),'Cache-Control':'no-store'});
  }
  if (!action && !bindingType && request.method === 'PUT') {
    try {
      const body = await readBodyJson(request);
      const saved = await withDirectorDeskDocumentsWriteLock(async () => {
        const documents = await readDirectorDeskDocuments();
        const current = documents[key] || null;
        const revision = Number(current?.revision || 0);
        if (request.headers['if-match'] !== directorDeskEtag(revision)) throw Object.assign(new Error('导演台已在其他页面更新，请重新读取。'), {code:'DIRECTOR_REVISION_CONFLICT',httpStatus:412});
        const nextRevision = revision + 1;
        const record = {schemaVersion:'niannian.director-desk-document.v1',projectId,projectKind,ownerId:user.id,revision:nextRevision,document:normalizeDirectorDeskDocument(body.document),updatedAt:new Date().toISOString()};
        documents[key] = record;
        await writeDirectorDeskDocuments(documents);
        return record;
      });
      return json(response, 200, {document:saved.document,revision:saved.revision,updatedAt:saved.updatedAt}, {ETag:directorDeskEtag(saved.revision),'Cache-Control':'no-store'});
    } catch (error) {
      return json(response, error.httpStatus || 400, {code:error.code || 'DIRECTOR_DOCUMENT_INVALID',error:error.message || '导演台保存失败'});
    }
  }
  if (action === 'captures' && request.method === 'POST') {
    try {
      const capture = await readDirectorDeskCaptureMultipart(request);
      const current = (await readDirectorDeskDocuments())[key] || null;
      const revision = Number(current?.revision || 0);
      if (request.headers['if-match'] && request.headers['if-match'] !== directorDeskEtag(revision)) return json(response, 412, {code:'DIRECTOR_REVISION_CONFLICT',error:'导演台已在其他页面更新，请重新读取。'});
      const imported = await importDirectorDeskCaptureBuffer(user, {project,projectKind}, capture, {});
      const asset = publicCanvasAsset(imported.asset);
      return json(response, imported.documentCreated || imported.assetCreated ? 201 : 200, {code:imported.documentCreated || imported.assetCreated ? 'DIRECTOR_CAPTURE_IMPORTED' : 'DIRECTOR_CAPTURE_REUSED',revision,asset:{...asset,previewUrl:asset.downloadUrl},capture:{assetUrl:asset.downloadUrl}}, {ETag:directorDeskEtag(revision),'Cache-Control':'no-store'});
    } catch (error) {
      return json(response, error.httpStatus || 400, {code:error.code || 'DIRECTOR_CAPTURE_IMPORT_FAILED',error:error.message || '导演台截图导入失败'});
    }
  }
  if (bindingType && request.method === 'POST') {
    try {
      const body = await readBodyJson(request);
      const saved = await withDirectorDeskDocumentsWriteLock(async () => {
        const documents = await readDirectorDeskDocuments();
        const current = documents[key] || {revision:0,document:{objects:[],cameras:[],bindings:{}}};
        const document = normalizeDirectorDeskDocument(current.document);
        const bindings = document.bindings && typeof document.bindings === 'object' ? document.bindings : {};
        const collection = bindingType === 'storyboard' ? 'storyboards' : bindingType === 'video-task' ? 'videoTasks' : 'deliveries';
        const binding = {...directorDeskSafeValue(body),id:canvasText(body.id, 160) || `director-${bindingType}-${crypto.randomBytes(8).toString('hex')}`,type:bindingType};
        const existing = Array.isArray(bindings[collection]) ? bindings[collection] : [];
        document.bindings = {...bindings,[collection]:[...existing.filter(item => item?.id !== binding.id),binding].slice(-100)};
        const revision = Number(current.revision || 0) + 1;
        const record = {schemaVersion:'niannian.director-desk-document.v1',projectId,projectKind,ownerId:user.id,revision,document,updatedAt:new Date().toISOString()};
        documents[key] = record;
        await writeDirectorDeskDocuments(documents);
        return {record,binding};
      });
      return json(response, 200, {binding:saved.binding,revision:saved.record.revision,updatedAt:saved.record.updatedAt}, {ETag:directorDeskEtag(saved.record.revision),'Cache-Control':'no-store'});
    } catch (error) {
      return json(response, error.httpStatus || 400, {code:error.code || 'DIRECTOR_BINDING_INVALID',error:error.message || '导演台关联保存失败'});
    }
  }
  return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
}

async function handleDirectorDeskImportApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/canvas\/director-import$/);
  if (!match) return false;
  if (request.method !== 'POST') return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  try {
    const projectId = decodeURIComponent(match[1]);
    const body = await readBodyJson(request, Math.min(5 * 1024 * 1024, canvasAssetService.maxBytes + 1024 * 1024));
    const requestedKind = canvasText(body.projectKind || request.headers['x-niannian-project-kind'] || '', 20) || null;
    const owned = await ownedCanvasProjectById(user, projectId, requestedKind);
    if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    const captures = Array.isArray(body.captures) ? body.captures.slice(0, 8) : [];
    if (!captures.length) return json(response, 422, {code:'DIRECTOR_CAPTURE_REQUIRED',error:'请先从导演台选择至少一张截图'});
    const imported = [];
    for (const capture of captures) imported.push(await importDirectorDeskCapture(user, owned, capture, body.directorPlan));
    return json(response, imported.some(item => item.documentCreated || item.assetCreated) ? 201 : 200, {
      code:imported.every(item => !item.documentCreated && !item.assetCreated) ? 'DIRECTOR_CAPTURES_REUSED' : 'DIRECTOR_CAPTURES_IMPORTED',
      idempotent:imported.every(item => !item.documentCreated && !item.assetCreated),
      projectId,
      imports:imported.map(item => ({asset:publicCanvasAsset(item.asset),node:item.node,revision:item.revision,updatedAt:item.updatedAt}))
    }, {'Cache-Control':'no-store'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'DIRECTOR_CAPTURE_IMPORT_FAILED',error:error.message || '导演台截图导入失败'});
  }
}

async function ownedCanvasProjectById(user, projectId, preferredKind) {
  const kinds = preferredKind ? [preferredKind] : ['redraw', 'script'];
  for (const projectKind of kinds) {
    const project = await canvasOwnedProject(user, projectKind, projectId);
    if (project) return {project, projectKind};
  }
  return null;
}

async function canvasGenerationContext(project, projectKind, nodeId) {
  const record = (await readCanvasDocuments())[canvasDocumentKey(projectKind, project.id)];
  const document = normalizeCanvasDocument(record?.document, project);
  const node = document.nodes.find(node => node.id === nodeId) || null;
  return node ? {node, document} : null;
}

async function canvasGenerationNode(project, projectKind, nodeId) {
  return (await canvasGenerationContext(project, projectKind, nodeId))?.node || null;
}

async function generationNodeContextForProject(project, projectKind, nodeId) {
  // Web Studio persists the Nomi document; the fallback keeps legacy redraw
  // projects readable during the migration window. Only the canonical canvas
  // document carries typed Skill-port connections.
  const nomiNode = await nomiGenerationNode(project, projectKind, nodeId);
  if (nomiNode) return {node:nomiNode, document:null};
  return canvasGenerationContext(project, projectKind, nodeId);
}

async function generationNodeForProject(project, projectKind, nodeId) {
  return (await generationNodeContextForProject(project, projectKind, nodeId))?.node || null;
}

function canvasGenerationSubmitEnabled(jobOrNodeType) {
  const nodeType = typeof jobOrNodeType === 'string' ? jobOrNodeType : jobOrNodeType?.nodeType;
  if (nodeType === 'video') return typeof jobOrNodeType === 'object' && canvasVideoChannels.isAnimateVideoChannel(jobOrNodeType.videoChannel)
    ? canvasAnimateRuntime.enabled
    : canvasH3Runtime.enabled;
  const imageChannel = typeof jobOrNodeType === 'object' ? jobOrNodeType.imageChannel : null;
  return imageChannel
    ? canvasProviderStatus.imageChannelEnabled[imageChannel] === true
    : canvasImage2Runtime.enabled;
}

function publicCanvasTextResponse(job) {
  return {
    job:canvasTextJobService.publicJob(job),
    providerStatus:canvasTextRuntimeModule.publicCanvasTextStatus(),
    spendRequested:job.status === 'succeeded'
  };
}

function scheduleCanvasTextJob({ownerId, projectId, job}) {
  const jobId = String(job?.id || '').trim();
  if (!jobId || activeCanvasTextJobs.has(jobId)) return;
  activeCanvasTextJobs.add(jobId);
  setImmediate(async () => {
    try {
      const result = await canvasTextRuntime.submit({model:job.model, prompt:job.prompt});
      await canvasTextJobService.updateOwned(ownerId, projectId, jobId, {
        status:'succeeded',
        text:result.text,
        error:null,
        completedAt:new Date().toISOString()
      });
    } catch (error) {
      console.error('canvas_text_provider_failure', JSON.stringify({
        job_id: jobId,
        provider: 'asxs',
        model: canvasTextRuntime.config.model || null,
        code: typeof error?.code === 'string' ? error.code.slice(0, 80) : 'CANVAS_TEXT_GENERATION_FAILED',
        http_status: Number.isInteger(error?.providerHttpStatus) ? error.providerHttpStatus : null,
        duration_ms: Number.isFinite(error?.durationMs) ? Math.max(0, Math.round(error.durationMs)) : null
      }));
      await canvasTextJobService.updateOwned(ownerId, projectId, jobId, {
        status:'recoverable',
        error:'文本生成暂未完成，请稍后重试或重新读取当前项目。'
      });
    } finally {
      activeCanvasTextJobs.delete(jobId);
    }
  });
}

async function handleCanvasTextApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/text\/jobs(?:\/([^/]+))?$/);
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  const jobId = match[2] ? decodeURIComponent(match[2]) : null;
  try {
    const body = request.method === 'POST' ? await readBodyJson(request) : {};
    const requestedKind = canvasText(body.projectKind || request.headers['x-niannian-project-kind'] || '', 20) || null;
    const owned = await ownedCanvasProjectById(user, projectId, requestedKind);
    if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (!jobId && request.method === 'POST') {
      const nodeId = canvasText(body.nodeId, 160);
      const node = await generationNodeForProject(owned.project, owned.projectKind, nodeId);
      if (!node) return json(response, 404, {code:'CANVAS_TEXT_NODE_NOT_FOUND',error:'文本节点不存在或尚未保存'});
      const nodeType = canvasText(node.type || node.kind, 40);
      if (nodeType !== 'text') return json(response, 422, {code:'CANVAS_TEXT_NODE_REQUIRED',error:'当前节点不是文本节点'});
      const requestedModel = canvasText(body.model || node.meta?.modelKey || node.data?.modelKey || canvasTextRuntime.config.model, 200);
      const prompt = canvasText(body.prompt || node.prompt || node.data?.prompt, 12000);
      if (!canvasTextRuntime.config.submitEnabled) return json(response, 409, {code:'CANVAS_TEXT_PROVIDER_NOT_READY',error:'文本模型尚未完成服务端配置',providerStatus:canvasTextRuntimeModule.publicCanvasTextStatus()});
      if (!prompt) return json(response, 422, {code:'CANVAS_TEXT_PROMPT_REQUIRED',error:'文本节点需要填写提示词'});
      if (!requestedModel || requestedModel !== canvasTextRuntime.config.model) return json(response, 422, {code:'CANVAS_TEXT_MODEL_INVALID',error:'文本模型与服务器配置不匹配'});
      const idempotencyKey = request.headers['idempotency-key'];
      const created = await canvasTextJobService.create({ownerId:user.id,projectId,projectKind:owned.projectKind,nodeId,model:requestedModel,prompt,idempotencyKey});
      if (!created.created) {
        if (created.job.status === 'running') scheduleCanvasTextJob({ownerId:user.id, projectId, job:created.job});
        return json(response, 200, {code:'CANVAS_TEXT_JOB_REUSED',idempotent:true,...publicCanvasTextResponse(created.job)});
      }
      scheduleCanvasTextJob({ownerId:user.id, projectId, job:created.job});
      return json(response, 202, {code:'CANVAS_TEXT_JOB_ACCEPTED',...publicCanvasTextResponse(created.job)});
    }
    if (jobId && request.method === 'GET') {
      const job = await canvasTextJobService.getOwned(user.id, projectId, jobId);
      if (!job) return json(response, 404, {code:'CANVAS_TEXT_JOB_NOT_FOUND',error:'任务不存在'});
      return json(response, 200, publicCanvasTextResponse(job));
    }
    return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_TEXT_JOB_INVALID',error:error.message || '文本任务无效'});
  }
}

function publicCanvasGenerationResponse(job) {
  const providerSubmitEnabled = canvasGenerationSubmitEnabled(job);
  return {
    job:canvasGenerationJobService.publicJob(job, {providerSubmitEnabled}),
    providerSubmitEnabled,
    providerStatus:canvasProviderConfig.publicCanvasProviderStatus(),
    spendRequested:false
  };
}

async function handleCanvasGenerationApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/canvas\/jobs(?:\/([^/]+))?(?:\/(dry-run|authorize))?$/);
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  const jobId = match[2] ? decodeURIComponent(match[2]) : null;
  const action = match[3] || null;
  let body = null;
  try {
    body = request.method === 'POST' ? await readBodyJson(request) : {};
    const requestedKind = canvasText(body.projectKind || request.headers['x-niannian-project-kind'] || '', 20) || null;
    const owned = await ownedCanvasProjectById(user, projectId, requestedKind);
    if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (!jobId && !action && request.method === 'GET') {
      const jobs = await canvasGenerationJobService.listOwned(user.id, projectId);
      return json(response, 200, {
        jobs:jobs.map(job => canvasGenerationJobService.publicJob(job, {providerSubmitEnabled:canvasGenerationSubmitEnabled(job)})),
        providerSubmitEnabled:canvasImage2Runtime.enabled || canvasH3Runtime.enabled || canvasAnimateRuntime.enabled,
        providerStatus:canvasProviderConfig.publicCanvasProviderStatus()
      });
    }
    if (!jobId && !action && request.method === 'POST') {
      const nodeId = canvasText(body.nodeId, 80);
      const generationContext = await generationNodeContextForProject(owned.project, owned.projectKind, nodeId);
      const node = generationContext?.node || null;
      if (!node) return json(response, 404, {code:'CANVAS_NODE_NOT_FOUND',error:'画布节点不存在或尚未保存'});
      const nodeType = canvasText(node.type || node.kind, 40);
      if (!['image','video'].includes(nodeType)) return json(response, 422, {code:'CANVAS_NODE_NOT_GENERATABLE',error:'该节点不能创建生成任务'});
      const compiledPrompt = generationContext?.document ? canvasSkillNodes.resolveCompiledPrompt(generationContext.document, nodeId) : null;
      const requestedModel = canvasText(body.model, 80);
      if (nodeType === 'video' && requestedModel && !canvasVideoChannels.resolveVideoChannel(requestedModel)) return json(response, 422, {code:'CANVAS_JOB_MODEL_INVALID',error:'模型与当前节点类型不匹配'});
      if (nodeType === 'image' && requestedModel && !canvasImage2Channels.resolveImage2Channel(requestedModel)) {
        return json(response, 422, {code:'CANVAS_JOB_MODEL_INVALID',error:'请选择已接入的 Image2 作图渠道'});
      }
      const inputAssetIds = [...new Set((Array.isArray(body.inputAssetIds) ? body.inputAssetIds : (node.data?.assetIds || [])).map(value => canvasText(value, 120)).filter(Boolean))].slice(0, 24);
      for (const assetId of inputAssetIds) {
        // Historical canvas documents may contain pre-CAS asset references. Keep those readable;
        // every new project asset created by this API uses CAS IDs and is ownership-checked.
        if (/^CAS-/.test(assetId) && !await canvasAssetService.getOwned(user.id, projectId, assetId)) return json(response, 404, {code:'CANVAS_ASSET_NOT_FOUND',error:'画布引用的素材不存在'});
      }
      const created = await canvasGenerationJobService.create({
        ownerId:user.id,
        projectId,
        projectKind:owned.projectKind,
        nodeId,
        nodeType,
        model:requestedModel || (nodeType === 'image' ? 'runninghub-gpt-image-2' : 'h3'),
        prompt:canvasText(compiledPrompt?.prompt || body.prompt || node.data?.prompt, 4000),
        inputAssetIds,
        resolution:canvasText(body.resolution || node.data?.resolution || '2k', 8),
        aspectRatio:canvasText(
          body.aspectRatio
            || (nodeType === 'video'
              ? (node.data?.aspectRatio && node.data.aspectRatio !== '1:1' ? node.data.aspectRatio : '9:16')
              : node.data?.aspectRatio || '1:1'),
          16
        ),
        durationSeconds:body.durationSeconds || body.duration_seconds || node.data?.durationSeconds || node.data?.duration_seconds || (nodeType === 'video' ? 5 : 0),
        idempotencyKey:request.headers['idempotency-key']
      });
      return json(response, created.created ? 201 : 200, {code:created.created ? 'CANVAS_GENERATION_JOB_PREPARED' : 'CANVAS_GENERATION_JOB_REUSED',idempotent:!created.created,...publicCanvasGenerationResponse(created.job)});
    }
    if (jobId && !action && request.method === 'GET') {
      let job = await canvasGenerationJobService.getOwned(user.id, projectId, jobId);
      if (!job) return json(response, 404, {code:'CANVAS_JOB_NOT_FOUND',error:'任务不存在'});
      if (job.nodeType === 'image' && canvasImage2Runtime.enabled && ['queued','running'].includes(job.status)) job = await canvasImage2Runtime.reconcile(user.id, projectId, jobId);
      if (job.nodeType === 'video' && ['queued','running'].includes(job.status)) {
        if (canvasVideoChannels.isAnimateVideoChannel(job.videoChannel) && canvasAnimateRuntime.enabled) job = await canvasAnimateRuntime.reconcile(user.id, projectId, jobId);
        else if (canvasH3Runtime.enabled) job = await canvasH3Runtime.reconcile(user.id, projectId, jobId);
      }
      return json(response, 200, publicCanvasGenerationResponse(job));
    }
    if (jobId && action === 'dry-run' && request.method === 'POST') {
      const job = await canvasGenerationJobService.getOwned(user.id, projectId, jobId);
      if (!job) return json(response, 404, {code:'CANVAS_JOB_NOT_FOUND',error:'任务不存在'});
      const providerSubmitEnabled = canvasGenerationSubmitEnabled(job);
      const providerDryRun = canvasVideoChannels.isAnimateVideoChannel(job.videoChannel) ? await canvasAnimateRuntime.dryRun(job) : null;
      return json(response, 200, {
        code:'CANVAS_GENERATION_DRY_RUN_READY',
        job:canvasGenerationJobService.publicJob(job, {providerSubmitEnabled}),
        dryRun:canvasGenerationJobService.dryRunContract(job, {providerSubmitEnabled}),
        ...(providerDryRun ? {providerDryRun} : {}),
        providerSubmitEnabled,
        providerStatus:canvasProviderConfig.publicCanvasProviderStatus(),
        spendRequested:false
      });
    }
    if (jobId && action === 'authorize' && request.method === 'POST') {
      const job = await canvasGenerationJobService.getOwned(user.id, projectId, jobId);
      if (!job) return json(response, 404, {code:'CANVAS_JOB_NOT_FOUND',error:'任务不存在'});
      if (body.confirmProviderSpend !== true) return json(response, 422, {code:'CANVAS_PROVIDER_AUTHORIZATION_REQUIRED',error:'请明确确认本次生成会调用已配置的图像渠道'});
      if (job.nodeType === 'image') {
        if (!canvasGenerationSubmitEnabled(job)) return json(response, 409, {code:'CANVAS_PROVIDER_SUBMIT_DISABLED',error:'所选图像渠道尚未启用，当前任务仅完成准备'});
        const submitted = await canvasImage2Runtime.submit(user.id, projectId, jobId);
        return json(response, 202, {code:'CANVAS_GENERATION_SUBMITTED',job:canvasGenerationJobService.publicJob(submitted, {providerSubmitEnabled:true}),providerSubmitEnabled:true,providerStatus:canvasProviderConfig.publicCanvasProviderStatus(),spendRequested:true});
      }
      if (job.nodeType === 'video') {
        const runtime = canvasVideoChannels.isAnimateVideoChannel(job.videoChannel) ? canvasAnimateRuntime : canvasH3Runtime;
        if (!runtime.enabled) return json(response, 409, {code:'CANVAS_PROVIDER_SUBMIT_DISABLED',error:'视频生成尚未启用，当前任务仅完成准备'});
        const submitted = await runtime.submit(user.id, projectId, jobId);
        return json(response, 202, {code:'CANVAS_GENERATION_SUBMITTED',job:canvasGenerationJobService.publicJob(submitted, {providerSubmitEnabled:true}),providerSubmitEnabled:true,providerStatus:canvasProviderConfig.publicCanvasProviderStatus(),spendRequested:true});
      }
      return json(response, 409, {code:'CANVAS_PROVIDER_MODEL_UNAVAILABLE',error:'当前节点尚未接入可提交的服务端执行器'});
    }
    return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_GENERATION_JOB_INVALID',error:error.message || '画布生成任务无效'});
  }
}

function studioTaskResult(record) {
  return {
    id:record.id,
    kind:'text_to_video',
    status:record.status,
    assets:record.assets || [],
    ...(record.error ? {error:record.error} : {})
  };
}

// Nomi 网页画布与历史自建 #canvas 使用同一个物理 JSON 文件，但必须使用
// 不可混淆的命名空间。视频生成只从该 Nomi 记录的 generationCanvas 读取节点；
// 绝不能向旧的 canvasDocumentKey() 回退，否则浏览器所见节点和服务端执行节点会脱节。
function nomiDocumentKey(projectKind, projectId) {
  return 'nomi:' + projectKind + ':' + projectId;
}

async function syncSkillDocumentToNomiCanvas({documents, project, projectKind, skillDocument}) {
  const key = nomiDocumentKey(projectKind, project.id);
  const current = nomiRecordForProject(documents[key], project, projectKind);
  const currentDocument = current?.document || {generationCanvas:{nodes:[],edges:[]}};
  const document = normalizeNomiProjectDocument(nomiSkillChain.mergeIntoGenerationCanvas(currentDocument, skillDocument));
  if (current && JSON.stringify(current.document) === JSON.stringify(document)) return current;
  const record = {
    schemaVersion:'niannian.nomi-project-document.v1',
    projectId:project.id,
    projectKind,
    ownerId:project.ownerId,
    revision:Number(current?.revision || 0) + 1,
    document,
    updatedAt:new Date().toISOString()
  };
  documents[key] = record;
  return record;
}

function skillDocumentForProject(documents, project, projectKind) {
  const record = documents[canvasDocumentKey(projectKind, project.id)];
  return normalizeCanvasDocument(record?.document, project);
}

async function ensureNomiSkillProjection(project, projectKind) {
  return withCanvasDocumentsWriteLock(async () => {
    const documents = await readCanvasDocuments();
    const skillDocument = skillDocumentForProject(documents, project, projectKind);
    const current = nomiRecordForProject(documents[nomiDocumentKey(projectKind, project.id)], project, projectKind);
    const hasSkillNodes = skillDocument.nodes.some(node => node.skillKey || node.data?.skillKey);
    if (!current && !hasSkillNodes) return null;
    const before = current ? JSON.stringify(current.document) : null;
    const synced = await syncSkillDocumentToNomiCanvas({documents,project,projectKind,skillDocument});
    if (!current || before !== JSON.stringify(synced.document)) await writeCanvasDocuments(documents);
    return synced;
  });
}

function nomiRecordForProject(record, project, projectKind) {
  if (!record || typeof record !== 'object') return null;
  if (record.ownerId !== project.ownerId || record.projectId !== project.id || record.projectKind !== projectKind) return null;
  const document = record.document;
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null;
  const canvas = document.generationCanvas;
  if (!canvas || typeof canvas !== 'object' || !Array.isArray(canvas.nodes)) return null;
  return record;
}

async function nomiGenerationNode(project, projectKind, nodeId) {
  const id = canvasText(nodeId, 160);
  if (!id) return null;
  const documents = await readCanvasDocuments();
  const record = nomiRecordForProject(documents[nomiDocumentKey(projectKind, project.id)], project, projectKind);
  if (!record) return null;
  const node = record.document.generationCanvas.nodes.find(item => item && typeof item === 'object' && canvasText(item.id, 160) === id);
  return node || null;
}

function isNomiH3Node(node) {
  if (!node || typeof node !== 'object' || canvasText(node.kind, 80) !== 'video') return false;
  const meta = node.meta && typeof node.meta === 'object' && !Array.isArray(node.meta) ? node.meta : {};
  const modelKey = canvasText(meta.modelKey || meta.modelAlias, 160).toLowerCase();
  const archetypeId = canvasText(meta.archetype?.id, 80).toLowerCase();
  return ['niannian/minimax-h3','minimax-h3','minimax-h3-fl2va','minimax_h3_fl2va'].includes(modelKey) || archetypeId === 'minimax-h3';
}

function requestedNomiH3Model(request) {
  const value = canvasText(request?.extras?.modelKey || request?.extras?.modelAlias, 160).toLowerCase();
  return ['niannian/minimax-h3','minimax-h3','minimax-h3-fl2va','minimax_h3_fl2va'].includes(value);
}

function nomiEtag(revision) {
  return '"nomi-rev-' + Number(revision || 0) + '"';
}

function canvasDocumentEnvelope(project, record) {
  const revision = Number(record?.revision || 0);
  return {
    schema_version:'niannian.canvas_document.v1',
    project_id:project.id,
    revision,
    document:record?.document || {generationCanvas:{nodes:[],edges:[]}},
    updated_at:record?.updatedAt || null
  };
}

async function handleWorkbenchCanvasProjectApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/canvas$/);
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  let project = await canvasOwnedProject(user, 'redraw', projectId);
  if (!project) project = await ensureWebCanvasProject(user, projectId);
  if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'}), true;
  const key = nomiDocumentKey('redraw', project.id);
  if (request.method === 'GET') {
    let record = await ensureNomiSkillProjection(project, 'redraw');
    if (!record) {
      record = await withCanvasDocumentsWriteLock(async () => {
        const documents = await readCanvasDocuments();
        const current = nomiRecordForProject(documents[key], project, 'redraw');
        if (current) return current;
        const created = {schemaVersion:'niannian.nomi-project-document.v1',projectId:project.id,projectKind:'redraw',ownerId:user.id,revision:0,document:{generationCanvas:{nodes:[],edges:[]}},updatedAt:new Date().toISOString()};
        documents[key] = created;
        await writeCanvasDocuments(documents);
        return created;
      });
    }
    return json(response, 200, {canvas:canvasDocumentEnvelope(project, record),project:{id:project.id,name:project.name,status:project.status}}, {'Cache-Control':'no-store'}), true;
  }
  if (request.method !== 'PUT') return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'}), true;
  try {
    const body = await readBodyJson(request, 8 * 1024 * 1024);
    const saved = await withCanvasDocumentsWriteLock(async () => {
      const documents = await readCanvasDocuments();
      const current = nomiRecordForProject(documents[key], project, 'redraw');
      const currentRevision = Number(current?.revision || 0);
      const document = normalizeNomiProjectDocument(body.document);
      if (Number(body.revision) !== currentRevision) {
        if (current && JSON.stringify(current.document) === JSON.stringify(document)) return current;
        throw Object.assign(new Error('画布已在其他页面更新，请先重新载入。'), {code:'CANVAS_REVISION_CONFLICT',httpStatus:409});
      }
      const record = {schemaVersion:'niannian.nomi-project-document.v1',projectId:project.id,projectKind:'redraw',ownerId:user.id,revision:currentRevision + 1,document,updatedAt:new Date().toISOString()};
      documents[key] = record;
      await writeCanvasDocuments(documents);
      return record;
    });
    return json(response, 200, {canvas:canvasDocumentEnvelope(project, saved),project:{id:project.id,name:project.name,status:project.status}}, {'Cache-Control':'no-store'}), true;
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'CANVAS_DOCUMENT_SAVE_FAILED',error:error.message || '画布保存失败'}), true;
  }
}

function nomiSafeDocumentValue(value, depth = 0) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const text = value.slice(0, 16000);
    // 网页 Nomi 的正式来源是服务端项目资产，不能把浏览器临时地址或内联媒体
    // 带入项目文档；否则刷新后会恢复一个不可读、不可授权的假引用。
    return /^(?:blob:|data:|nomi-local:)/i.test(text) ? '' : text;
  }
  if (depth >= 16) return null;
  if (Array.isArray(value)) return value.slice(0, 1000).map(item => nomiSafeDocumentValue(item, depth + 1));
  if (typeof value !== 'object') return null;
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 300)) {
    if (/^(?:__proto__|prototype|constructor)$/.test(key)) continue;
    result[String(key).slice(0, 120)] = nomiSafeDocumentValue(item, depth + 1);
  }
  return result;
}

function normalizeNomiProjectDocument(value) {
  const document = nomiSafeDocumentValue(value);
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw Object.assign(new Error('Nomi 项目文档无效'), {code:'NOMI_DOCUMENT_INVALID',httpStatus:422});
  const canvas = document.generationCanvas;
  if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas) || !Array.isArray(canvas.nodes) || !Array.isArray(canvas.edges)) {
    throw Object.assign(new Error('Nomi 生成画布无效'), {code:'NOMI_GENERATION_CANVAS_INVALID',httpStatus:422});
  }
  return document;
}

async function handleNomiProjectApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/studio\/projects\/([^/]+)$/);
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  const requestedKind = canvasText(request.headers['x-niannian-project-kind'], 20) || null;
  const owned = await ownedCanvasProjectById(user, projectId, requestedKind);
  if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  const key = nomiDocumentKey(owned.projectKind, owned.project.id);
  if (request.method === 'GET') {
    await ensureWorkspaceBinding(user, owned.project.id, {name:owned.project.name});
    let record = await ensureNomiSkillProjection(owned.project, owned.projectKind);
    // 首次从有效项目深链进入时立即建立 Nomi 绑定记录。前端随后会保存完整
    // Workbench payload；此处的空 generationCanvas 只用于让服务端拥有唯一、可校验的项目来源。
    if (!record) {
      record = await withCanvasDocumentsWriteLock(async () => {
        const documents = await readCanvasDocuments();
        const current = nomiRecordForProject(documents[key], owned.project, owned.projectKind);
        if (current) return current;
        const created = {
          schemaVersion:'niannian.nomi-project-document.v1',
          projectId:owned.project.id,
          projectKind:owned.projectKind,
          ownerId:user.id,
          revision:0,
          document:{generationCanvas:{nodes:[],edges:[]}},
          updatedAt:new Date().toISOString()
        };
        documents[key] = created;
        await writeCanvasDocuments(documents);
        return created;
      });
    }
    const revision = Number(record?.revision || 0);
    return json(response, 200, {
      project:{id:owned.project.id,name:canvasText(owned.project.name, 160),kind:owned.projectKind,status:canvasText(owned.project.status, 80)},
      revision,
      document:record?.document || null,
      updatedAt:record?.updatedAt || null
    }, {ETag:nomiEtag(revision),'Cache-Control':'no-store'});
  }
  if (request.method !== 'PUT') return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  try {
    const body = await readBodyJson(request, 8 * 1024 * 1024);
    const saved = await withCanvasDocumentsWriteLock(async () => {
      const documents = await readCanvasDocuments();
      const current = nomiRecordForProject(documents[key], owned.project, owned.projectKind);
      const currentRevision = Number(current?.revision || 0);
      const document = normalizeNomiProjectDocument(body.document);
      if (request.headers['if-match'] !== nomiEtag(currentRevision)) {
        if (current && JSON.stringify(current.document) === JSON.stringify(document)) return current;
        throw Object.assign(new Error('Nomi 项目已在其他页面更新，请重新载入后再保存。'), {code:'CANVAS_REVISION_CONFLICT',httpStatus:409});
      }
      const revision = currentRevision + 1;
      const record = {schemaVersion:'niannian.nomi-project-document.v1',projectId:owned.project.id,projectKind:owned.projectKind,ownerId:user.id,revision,document,updatedAt:new Date().toISOString()};
      documents[key] = record;
      await writeCanvasDocuments(documents);
      return record;
    });
    return json(response, 200, {revision:saved.revision,document:saved.document,updatedAt:saved.updatedAt}, {ETag:nomiEtag(saved.revision),'Cache-Control':'no-store'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'NOMI_DOCUMENT_SAVE_FAILED',error:error.message || 'Nomi 项目保存失败'});
  }
}

function studioAssetIdFromReference(value) {
  const raw = canvasText(value, 600);
  if (/^CAS-[a-f0-9]{24}$/.test(raw)) return raw;
  const match = /^\/api\/projects\/[^/]+\/assets\/(CAS-[a-f0-9]{24})\/download(?:\?.*)?$/.exec(raw);
  return match ? match[1] : null;
}

async function resolveStudioProjectAssets(user, owned, values, kind) {
  if (!Array.isArray(values)) return [];
  const resolved = [];
  for (const value of values) {
    const assetId = studioAssetIdFromReference(value);
    if (!assetId) throw Object.assign(new Error('请先将参考素材保存到当前项目'), {code:'STUDIO_ASSET_REFERENCE_INVALID',httpStatus:422});
    const asset = await canvasAssetService.getOwned(user.id, owned.project.id, assetId);
    if (!asset || asset.projectKind !== owned.projectKind || asset.kind !== kind) throw Object.assign(new Error('参考素材不存在、类型不匹配或不属于当前项目'), {code:'STUDIO_ASSET_REFERENCE_FORBIDDEN',httpStatus:422});
    resolved.push(asset);
  }
  return resolved;
}

async function downloadStudioGeneratedVideo(user, owned, providerUrl, taskId, expected) {
  let source;
  try { source = new URL(String(providerUrl || '')); }
  catch { throw Object.assign(new Error('视频渠道返回了无效结果'), {code:'STUDIO_RESULT_URL_INVALID',httpStatus:502}); }
  const testOnlyLocalProvider = process.env.NODE_ENV === 'test' && source.protocol === 'http:' && /^(?:127\.0\.0\.1|localhost)$/i.test(source.hostname);
  if (source.protocol !== 'https:' && !testOnlyLocalProvider) throw Object.assign(new Error('视频渠道返回了不安全的结果地址'), {code:'STUDIO_RESULT_URL_INVALID',httpStatus:502});
  const response = await fetch(source, {redirect:'follow',signal:AbortSignal.timeout(120000)});
  if (!response.ok) throw Object.assign(new Error('视频结果暂时无法下载'), {code:'STUDIO_RESULT_DOWNLOAD_FAILED',httpStatus:502});
  const declaredMime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (declaredMime && declaredMime !== 'application/octet-stream' && !declaredMime.startsWith('video/')) throw Object.assign(new Error('视频渠道返回的不是视频文件'), {code:'STUDIO_RESULT_CONTENT_INVALID',httpStatus:502});
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > canvasAssetService.maxOutputBytes) throw Object.assign(new Error('视频结果大小无效'), {code:'STUDIO_RESULT_SIZE_INVALID',httpStatus:502});
  const format = canvasAssetFormatFromHeader(bytes.subarray(0, 64), 'generated_video');
  if (!format) throw Object.assign(new Error('视频结果格式无效'), {code:'STUDIO_RESULT_CONTENT_INVALID',httpStatus:502});
  await h3MediaValidation.inspectH3Media(bytes, expected, {
    extension:format,
    ffprobePath,
    timeoutMs:mediaPreflightTimeoutMs,
    ...(process.env.NODE_ENV === 'test' ? {testMetadata:{width:Number(expected?.width || 832),height:Number(expected?.height || 480),durationSeconds:Number(expected?.durationSeconds || 5),codec:'test'}} : {})
  });
  const registered = await canvasAssetService.registerBuffer({
    ownerId:user.id,
    projectId:owned.project.id,
    projectKind:owned.projectKind,
    kind:'generated_video',
    originalName:'nomi-h3-' + canvasText(taskId, 160) + canvasAssets.FORMATS[format].extension,
    mimeType:canvasAssets.FORMATS[format].mimeType,
    format,
    bytes
  });
  return publicCanvasAsset(registered.asset);
}

async function writeNomiGeneratedVideoResult(user, owned, nodeId, asset) {
  const key = nomiDocumentKey(owned.projectKind, owned.project.id);
  return withCanvasDocumentsWriteLock(async () => {
    const documents = await readCanvasDocuments();
    const record = nomiRecordForProject(documents[key], owned.project, owned.projectKind);
    if (!record) return false;
    const node = record.document.generationCanvas.nodes.find(item => item && typeof item === 'object' && canvasText(item.id, 160) === nodeId);
    if (!isNomiH3Node(node)) return false;
    const result = {
      id:'asset-' + asset.id,
      type:'video',
      url:asset.downloadUrl,
      assetId:asset.id,
      createdAt:Date.now()
    };
    node.result = result;
    node.history = [result, ...(Array.isArray(node.history) ? node.history.filter(item => item && item.assetId !== asset.id).slice(0, 19) : [])];
    node.status = 'success';
    delete node.error;
    record.revision = Number(record.revision || 0) + 1;
    record.updatedAt = new Date().toISOString();
    documents[key] = record;
    await writeCanvasDocuments(documents);
    return true;
  });
}

function nomiSmartCutNode(value, nodeId) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!raw || canvasText(raw.id, 160) !== nodeId || canvasText(raw.kind || raw.type, 80) !== 'smart_cut') return null;
  const meta = raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta) ? raw.meta : {};
  const smartCut = meta.smartCut && typeof meta.smartCut === 'object' && !Array.isArray(meta.smartCut) ? meta.smartCut : {};
  return {
    id: nodeId,
    sourceVideoAssetId: canvasText(smartCut.sourceVideoAssetId || raw.sourceVideoAssetId, 120),
    scriptAssetId: canvasText(smartCut.scriptAssetId || raw.scriptAssetId, 120) || null,
    sourceAudioAssetId: canvasText(smartCut.sourceAudioAssetId || raw.sourceAudioAssetId, 120) || null,
    scriptText: canvasText(smartCut.scriptText || raw.prompt, 12000) || null,
    preset: canvasText(smartCut.preset, 40) || 'talking_head',
    aspectRatio: canvasText(smartCut.aspectRatio || meta.aspectRatio, 16) || '9:16',
    captionStyle: canvasText(smartCut.captionStyle, 80) || 'bold-outline',
    narration: smartCut.narration === true
  };
}

function smartCutNodeData(job) {
  return {
    nodeId: job.nodeId,
    sourceVideoAssetId: job.sourceVideoAssetId,
    scriptAssetId: job.scriptAssetId || null,
    sourceAudioAssetId: job.sourceAudioAssetId || null,
    preset: job.preset,
    aspectRatio: job.aspectRatio,
    captionStyle: job.captionStyle,
    narration: job.narration === true,
    smartCutJobId: job.id,
    editorProjectId: job.editorProjectId || null,
    status: job.status,
    finalVideoAssetId: job.finalVideoAssetId || null,
    captionAssetId: job.captionAssetId || null,
    durationSeconds: Number.isFinite(job.durationSeconds) ? job.durationSeconds : null,
    updatedAt: job.updatedAt
  };
}

async function persistNomiSmartCutJob(job) {
  return withCanvasDocumentsWriteLock(async () => {
    const key = nomiDocumentKey(job.projectKind, job.projectId);
    const documents = await readCanvasDocuments();
    const record = nomiRecordForProject(documents[key], {id:job.projectId, ownerId:job.ownerId}, job.projectKind);
    if (!record) throw Object.assign(new Error('智能剪辑节点所属项目尚未保存'), {code:'SMART_CUT_NODE_NOT_FOUND',httpStatus:404});
    const node = record.document.generationCanvas.nodes.find((item) => nomiSmartCutNode(item, job.nodeId));
    if (!node) throw Object.assign(new Error('智能剪辑节点不存在或尚未保存'), {code:'SMART_CUT_NODE_NOT_FOUND',httpStatus:404});
    const meta = node.meta && typeof node.meta === 'object' && !Array.isArray(node.meta) ? node.meta : {};
    node.meta = {...meta, smartCut:smartCutNodeData(job)};
    if (job.finalVideoAssetId) {
      const asset = await canvasAssetService.getOwned(job.ownerId, job.projectId, job.finalVideoAssetId);
      if (!asset) throw Object.assign(new Error('智能剪辑成片素材不存在'), {code:'SMART_CUT_RESULT_ASSET_NOT_FOUND',httpStatus:409});
      const result = {id:'asset-' + asset.id, type:'video', url:canvasAssetDownloadUrl(job.projectId, asset.id), assetId:asset.id, createdAt:Date.now()};
      node.result = result;
      node.history = [result, ...(Array.isArray(node.history) ? node.history.filter((item) => item && item.assetId !== asset.id).slice(0, 19) : [])];
      node.status = 'success';
      delete node.error;
    } else if (job.status === 'failed') {
      node.status = 'error';
      node.error = job.publicError || '智能剪辑未完成';
    } else {
      node.status = job.status;
      delete node.error;
    }
    record.revision = Number(record.revision || 0) + 1;
    record.updatedAt = new Date().toISOString();
    documents[key] = record;
    await writeCanvasDocuments(documents);
    return record;
  });
}

function smartCutHmac(value) {
  return smartCutBridgeSecret ? crypto.createHmac('sha256', smartCutBridgeSecret).update(value).digest('hex') : null;
}

function smartCutUrlAllowed(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return process.env.NODE_ENV === 'test' && url.protocol === 'http:' && /^(?:127\.0\.0\.1|localhost)$/i.test(url.hostname);
  } catch { return false; }
}

function smartCutBridgeConfigured() {
  return Boolean(smartCutBridgeSecret && smartCutUrlAllowed(smartCutEditorBaseUrl) && smartCutUrlAllowed(smartCutPublicBaseUrl));
}

function smartCutToken(job, assetId = null, ttlMs = 10 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({v:1, jobId:job.id, ...(assetId ? {assetId} : {editorProjectId:job.editorProjectId}), exp:Date.now() + ttlMs, nonce:crypto.randomBytes(12).toString('hex')})).toString('base64url');
  const signature = smartCutHmac(payload);
  if (!signature) throw Object.assign(new Error('智能剪辑服务桥尚未配置'), {code:'SMART_CUT_BRIDGE_UNCONFIGURED',httpStatus:409});
  return payload + '.' + signature;
}

function verifySmartCutAssetTicket(ticket, jobId, assetId) {
  const [payload, signature] = String(ticket || '').split('.');
  const expected = smartCutHmac(payload || '');
  if (!payload || !signature || !expected || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const actualBytes = Buffer.from(signature, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) return false;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return value?.v === 1 && value.jobId === jobId && value.assetId === assetId && Number(value.exp) > Date.now();
  } catch { return false; }
}

async function launchSmartCutEditorJob(job, sourceAsset) {
  if (!smartCutBridgeConfigured()) throw Object.assign(new Error('智能剪辑服务桥尚未配置'), {code:'SMART_CUT_BRIDGE_UNCONFIGURED',httpStatus:409});
  const ticket = smartCutToken(job, sourceAsset.id);
  const sourceUrl = smartCutPublicBaseUrl + '/api/internal/smart-cut/assets/' + encodeURIComponent(job.id) + '/' + encodeURIComponent(sourceAsset.id) + '?ticket=' + encodeURIComponent(ticket);
  const payload = JSON.stringify({
    jobId:job.id,
    projectName:'念念智能粗剪',
    source:{url:sourceUrl,assetId:sourceAsset.id,originalName:sourceAsset.originalName},
    preset:job.preset,
    aspectRatio:job.aspectRatio,
    captionStyle:job.captionStyle,
    scriptText:job.scriptText || null
  });
  const signature = smartCutHmac(payload);
  let response;
  try {
    response = await fetch(smartCutEditorBaseUrl + '/api/niannian-smart-cut/import', {
      method:'POST',
      headers:{'Content-Type':'application/json','X-Niannian-Smart-Cut-Signature':signature},
      body:payload,
      signal:AbortSignal.timeout(15 * 60 * 1000)
    });
  } catch (cause) {
    const failed = await smartCutJobService.updateOwned(job.ownerId, job.projectId, job.id, {status:'failed',publicError:'念念智剪工程创建失败'});
    if (failed) await persistNomiSmartCutJob(failed).catch(() => {});
    throw Object.assign(new Error('念念智剪工程创建失败'), {code:'SMART_CUT_EDITOR_IMPORT_FAILED',httpStatus:502,cause});
  }
  let result = null;
  try { result = await response.json(); } catch {}
  if (!response.ok || !result?.editorProjectId) {
    const failed = await smartCutJobService.updateOwned(job.ownerId, job.projectId, job.id, {status:'failed',publicError:'念念智剪工程创建失败'});
    if (failed) await persistNomiSmartCutJob(failed).catch(() => {});
    throw Object.assign(new Error('念念智剪工程创建失败'), {code:'SMART_CUT_EDITOR_IMPORT_FAILED',httpStatus:502});
  }
  const ready = await smartCutJobService.updateOwned(job.ownerId, job.projectId, job.id, {
    status:'ready_for_review',
    editorProjectId:canvasText(result.editorProjectId, 160),
    durationSeconds:Number.isFinite(result.roughCutDurationSeconds) ? Number(result.roughCutDurationSeconds) : null,
    publicError:null
  });
  if (!ready) throw Object.assign(new Error('智能剪辑任务不存在'), {code:'SMART_CUT_JOB_NOT_FOUND',httpStatus:404});
  await persistNomiSmartCutJob(ready);
  return ready;
}

async function handleSmartCutApi(request, response, pathname, user) {
  const sessionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/smart-cut\/sessions$/);
  const jobMatch = pathname.match(/^\/api\/projects\/([^/]+)\/smart-cut\/jobs(?:\/([^/]+))?(?:\/(dry-run))?$/);
  const match = sessionMatch || jobMatch;
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]);
  const jobId = sessionMatch ? null : (match[2] ? decodeURIComponent(match[2]) : null);
  const action = sessionMatch ? 'session' : (match[3] || null);
  try {
    const body = request.method === 'POST' ? await readBodyJson(request, 256 * 1024) : {};
    const requestedKind = canvasText(body.projectKind || request.headers['x-niannian-project-kind'] || '', 20) || null;
    const owned = await ownedCanvasProjectById(user, projectId, requestedKind);
    if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (!jobId && !action && request.method === 'GET') {
      const jobs = await smartCutJobService.listOwned(user.id, projectId);
      return json(response, 200, {jobs:jobs.map(smartCutJobService.publicJob),providerSubmitEnabled:smartCutBridgeConfigured()}, {'Cache-Control':'no-store'});
    }
    if (!jobId && !action && request.method === 'POST') {
      const nodeId = canvasText(body.nodeId, 160);
      if (!nodeId) return json(response, 400, {code:'SMART_CUT_NODE_ID_REQUIRED',error:'请先选择一个智能剪辑节点'});
      const node = nomiSmartCutNode(await nomiGenerationNode(owned.project, owned.projectKind, nodeId), nodeId);
      if (!node) return json(response, 404, {code:'SMART_CUT_NODE_NOT_FOUND',error:'智能剪辑节点不存在或尚未保存'});
      const sourceVideoAssetId = canvasText(body.sourceVideoAssetId || node.sourceVideoAssetId, 120);
      if (!sourceVideoAssetId || (node.sourceVideoAssetId && sourceVideoAssetId !== node.sourceVideoAssetId)) return json(response, 422, {code:'SMART_CUT_SOURCE_MISMATCH',error:'请选择节点关联的主视频素材'});
      const sourceAsset = await canvasAssetService.getOwned(user.id, projectId, sourceVideoAssetId);
      if (!sourceAsset || sourceAsset.projectKind !== owned.projectKind || !sourceAsset.mimeType.startsWith('video/')) return json(response, 422, {code:'SMART_CUT_SOURCE_VIDEO_REQUIRED',error:'请选择当前项目内的正式视频素材'});
      const scriptAssetId = canvasText(body.scriptAssetId || node.scriptAssetId, 120) || null;
      const sourceAudioAssetId = canvasText(body.sourceAudioAssetId || node.sourceAudioAssetId, 120) || null;
      for (const assetId of [scriptAssetId, sourceAudioAssetId].filter(Boolean)) {
        const asset = await canvasAssetService.getOwned(user.id, projectId, assetId);
        if (!asset || asset.projectKind !== owned.projectKind) return json(response, 404, {code:'SMART_CUT_AUXILIARY_ASSET_NOT_FOUND',error:'智能剪辑引用的文案或声音素材不存在'});
      }
      const created = await smartCutJobService.create({
        ownerId:user.id, projectId, projectKind:owned.projectKind, nodeId, sourceVideoAssetId, scriptAssetId, sourceAudioAssetId,
        scriptText:canvasText(body.scriptText || node.scriptText, 12000) || null,
        preset:canvasText(body.preset || node.preset, 40) || 'talking_head',
        aspectRatio:canvasText(body.aspectRatio || node.aspectRatio, 16) || '9:16',
        captionStyle:canvasText(body.captionStyle || node.captionStyle, 80) || 'bold-outline',
        narration:body.narration === true || node.narration === true,
        idempotencyKey:request.headers['idempotency-key']
      });
      await persistNomiSmartCutJob(created.job);
      const job = body.execute === true && !created.job.editorProjectId && created.job.status === 'preparing'
        ? await launchSmartCutEditorJob(created.job, sourceAsset)
        : created.job;
      return json(response, created.created ? 201 : 200, {code:created.created ? 'SMART_CUT_JOB_PREPARED' : 'SMART_CUT_JOB_REUSED',idempotent:!created.created,job:smartCutJobService.publicJob(job),dryRun:smartCutJobService.dryRunContract(job),providerSubmitEnabled:smartCutBridgeConfigured()}, {'Cache-Control':'no-store'});
    }
    if (jobId && !action && request.method === 'GET') {
      const job = await smartCutJobService.getOwned(user.id, projectId, jobId);
      if (!job) return json(response, 404, {code:'SMART_CUT_JOB_NOT_FOUND',error:'智能剪辑任务不存在'});
      return json(response, 200, {job:smartCutJobService.publicJob(job),providerSubmitEnabled:smartCutBridgeConfigured()}, {'Cache-Control':'no-store'});
    }
    if (jobId && action === 'dry-run' && request.method === 'POST') {
      const job = await smartCutJobService.getOwned(user.id, projectId, jobId);
      if (!job) return json(response, 404, {code:'SMART_CUT_JOB_NOT_FOUND',error:'智能剪辑任务不存在'});
      return json(response, 200, {code:'SMART_CUT_DRY_RUN_READY',job:smartCutJobService.publicJob(job),dryRun:smartCutJobService.dryRunContract(job),providerSubmitEnabled:smartCutBridgeConfigured()}, {'Cache-Control':'no-store'});
    }
    if (action === 'session' && request.method === 'POST') {
      const job = await smartCutJobService.getOwned(user.id, projectId, canvasText(body.jobId, 120));
      if (!job) return json(response, 404, {code:'SMART_CUT_JOB_NOT_FOUND',error:'智能剪辑任务不存在'});
      if (!job.editorProjectId) return json(response, 409, {code:'SMART_CUT_EDITOR_NOT_READY',error:'智能剪辑工程尚未准备完成'});
      const editorUrl = smartCutEditorBaseUrl + '/#/editor/' + encodeURIComponent(job.editorProjectId) + '?niannianSmartCutSession=' + encodeURIComponent(smartCutToken(job, null, 15 * 60 * 1000));
      return json(response, 200, {editorUrl,expiresAt:new Date(Date.now() + 15 * 60 * 1000).toISOString()}, {'Cache-Control':'no-store'});
    }
    return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  } catch (error) {
    return json(response, error.httpStatus || 400, {code:error.code || 'SMART_CUT_REQUEST_FAILED',error:error.message || '智能剪辑请求无效'});
  }
}

async function handleSmartCutInternalApi(request, response, pathname) {
  const assetMatch = pathname.match(/^\/api\/internal\/smart-cut\/assets\/(SCJ-[a-f0-9]{24})\/(CAS-[a-f0-9]{24})$/);
  if (assetMatch) {
    if (!['GET','HEAD'].includes(request.method)) return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
    const job = await smartCutJobService.getById(assetMatch[1]);
    const ticket = new URL(request.url || '/', 'http://localhost').searchParams.get('ticket');
    if (!job || job.sourceVideoAssetId !== assetMatch[2] || !verifySmartCutAssetTicket(ticket, assetMatch[1], assetMatch[2])) return json(response, 401, {code:'SMART_CUT_ASSET_TICKET_INVALID',error:'智能剪辑素材授权已失效'});
    const asset = await canvasAssetService.getOwned(job.ownerId, job.projectId, assetMatch[2]);
    const info = asset && await fsp.stat(asset.storedPath).catch(() => null);
    if (!asset || !asset.mimeType.startsWith('video/') || !info || !info.isFile() || info.size !== Number(asset.bytes)) return json(response, 404, {code:'SMART_CUT_SOURCE_NOT_FOUND',error:'智能剪辑源素材不存在'});
    response.writeHead(200, {'Content-Type':asset.mimeType,'Content-Length':String(info.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="' + safeName(asset.originalName) + '"'});
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(asset.storedPath).pipe(response);
    return true;
  }
  const completeMatch = pathname.match(/^\/api\/internal\/smart-cut\/jobs\/(SCJ-[a-f0-9]{24})\/complete$/);
  if (!completeMatch) return false;
  if (request.method !== 'POST') return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 128 * 1024) throw Object.assign(new Error('回写请求过大'), {code:'SMART_CUT_CALLBACK_INVALID',httpStatus:413}); chunks.push(chunk); }
    const raw = Buffer.concat(chunks);
    const provided = String(request.headers['x-niannian-smart-cut-signature'] || '');
    const expected = smartCutHmac(raw);
    const actual = /^[a-f0-9]{64}$/i.test(provided) ? Buffer.from(provided, 'hex') : null;
    const wanted = expected ? Buffer.from(expected, 'hex') : null;
    if (!actual || !wanted || actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) return json(response, 401, {code:'SMART_CUT_CALLBACK_UNAUTHORIZED',error:'智能剪辑回写签名无效'});
    const job = await smartCutJobService.getById(completeMatch[1]);
    if (!job) return json(response, 404, {code:'SMART_CUT_JOB_NOT_FOUND',error:'智能剪辑任务不存在'});
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const outputUrl = new URL(String(body.output?.url || ''));
    if (outputUrl.origin !== new URL(smartCutEditorBaseUrl).origin || !outputUrl.pathname.startsWith('/media/uploads/')) return json(response, 422, {code:'SMART_CUT_OUTPUT_URL_INVALID',error:'智能剪辑导出地址无效'});
    const upstream = await fetch(outputUrl, {redirect:'error',signal:AbortSignal.timeout(15 * 60 * 1000)});
    const mimeType = String(upstream.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const format = mimeType === 'video/mp4' ? 'mp4' : mimeType === 'video/webm' ? 'webm' : null;
    const declared = Number(upstream.headers.get('content-length') || '');
    if (!upstream.ok || !upstream.body || !format || (Number.isFinite(declared) && declared > canvasAssetService.maxOutputBytes)) return json(response, 422, {code:'SMART_CUT_OUTPUT_INVALID',error:'智能剪辑导出文件格式或大小无效'});
    const bytes = [];
    let total = 0;
    for await (const chunk of upstream.body) { total += chunk.length; if (total > canvasAssetService.maxOutputBytes) throw Object.assign(new Error('智能剪辑导出文件过大'), {code:'SMART_CUT_OUTPUT_TOO_LARGE',httpStatus:422}); bytes.push(Buffer.from(chunk)); }
    const registered = await canvasAssetService.registerBuffer({ownerId:job.ownerId,projectId:job.projectId,projectKind:job.projectKind,kind:'generated_video',format,originalName:canvasText(body.output?.originalName, 160) || '念念智能剪辑成片.' + format,bytes:Buffer.concat(bytes)});
    const completed = await smartCutJobService.updateOwned(job.ownerId, job.projectId, job.id, {status:'succeeded',finalVideoAssetId:registered.asset.id,durationSeconds:Number.isFinite(Number(body.output?.durationSeconds)) ? Number(body.output.durationSeconds) : job.durationSeconds,publicError:null});
    if (!completed) throw Object.assign(new Error('智能剪辑任务不存在'), {code:'SMART_CUT_JOB_NOT_FOUND',httpStatus:404});
    await persistNomiSmartCutJob(completed);
    return json(response, 201, {code:'SMART_CUT_COMPLETED',job:smartCutJobService.publicJob(completed),asset:publicCanvasAsset(registered.asset)});
  } catch (error) {
    return json(response, error.httpStatus || 502, {code:error.code || 'SMART_CUT_CALLBACK_FAILED',error:error.message || '智能剪辑回写失败'});
  }
}

function nomiVideoBusinessState(status) {
  const value = canvasText(status, 40).toLowerCase();
  if (value === 'succeeded') return '已完成';
  if (value === 'running') return '生产中';
  if (value === 'queued') return '等待处理';
  if (value === 'submitting') return '准备提交';
  if (value === 'needs_input') return '需要补充素材';
  if (value === 'recoverable') return '需要处理';
  if (value === 'failed') return '失败';
  return '等待确认';
}

function nomiVideoUserBlocker(task) {
  if (!task || !['recoverable','needs_input','failed'].includes(canvasText(task.status, 40))) return null;
  return canvasText(task.error, 500) || (task.status === 'needs_input' ? '请补充当前视频节点所需的素材。' : '当前视频任务需要处理后才能继续。');
}

async function ownedNomiVideoDeliveries(user, owned) {
  const tasks = await nomiWebTaskStore.listOwnedTasks(user.id, owned.project.id, owned.projectKind);
  const deliveries = [];
  for (const task of tasks) {
    for (const assetId of Array.isArray(task.outputAssetIds) ? task.outputAssetIds : []) {
      const asset = await canvasAssetService.getOwned(user.id, owned.project.id, assetId);
      if (!asset || asset.projectKind !== owned.projectKind || asset.kind !== 'generated_video') continue;
      const openUrl = canvasAssetDownloadUrl(owned.project.id, asset.id);
      deliveries.push({
        id:'nomi-h3-' + task.id + '-' + asset.id,
        type:'video',
        status:'ready',
        label:'MiniMax H3 视频',
        assetId:asset.id,
        createdAt:task.completedAt || asset.createdAt || null,
        openUrl,
        downloadUrl:openUrl + '?download=1'
      });
    }
  }
  const newest = tasks[0] || null;
  return {
    projectId:owned.project.id,
    projectKind:owned.projectKind,
    currentStage:newest ? nomiVideoBusinessState(newest.status) : null,
    blocker:nomiVideoUserBlocker(newest),
    tasks:newest ? [{id:newest.id,status:nomiVideoBusinessState(newest.status),createdAt:newest.createdAt,updatedAt:newest.updatedAt}] : [],
    deliveries
  };
}

async function workspaceNomiVideoDeliveries(user, workspaceId, sources) {
  const candidates = new Map();
  for (const project of [...(sources?.redraw || []), ...(sources?.script || [])]) {
    const kind = (sources?.redraw || []).includes(project) ? 'redraw' : 'script';
    candidates.set(kind + ':' + project.id, {project,projectKind:kind});
  }
  for (const kind of ['redraw','script']) {
    const direct = await canvasOwnedProject(user, kind, workspaceId);
    if (direct) candidates.set(kind + ':' + direct.id, {project:direct,projectKind:kind});
  }
  const projected = await Promise.all(Array.from(candidates.values()).map(owned => ownedNomiVideoDeliveries(user, owned)));
  const newest = projected.flatMap(item => item.tasks).sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')))[0] || null;
  return {
    currentStage:newest?.status || null,
    blocker:projected.map(item => item.blocker).find(Boolean) || null,
    deliveries:projected.flatMap(item => item.deliveries).sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
  };
}

async function handleProjectDeliveriesApi(request, response, pathname, user) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/deliveries$/);
  if (!match || request.method !== 'GET') return false;
  const projectId = decodeURIComponent(match[1]);
  const requestedKind = canvasText(request.headers['x-niannian-project-kind'], 20) || null;
  const owned = await ownedCanvasProjectById(user, projectId, requestedKind);
  if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  const nomi = await ownedNomiVideoDeliveries(user, owned);
  return json(response, 200, {
    project:{id:owned.project.id,name:canvasText(owned.project.name, 160),kind:owned.projectKind},
    status:nomi.currentStage || '暂无任务',
    blocker:nomi.blocker,
    deliveries:nomi.deliveries,
    note:nomi.deliveries.length ? '仅列出已通过项目权限与完整性校验的真实交付物。' : '当前项目尚无可通过网站打开或下载的真实交付物。'
  });
}

async function handleStudioTaskApi(request, response, pathname, user) {
  if (pathname === '/api/studio/spend-grants' && request.method === 'POST') {
    const body = await readBodyJson(request);
    const projectId = canvasText(body.projectId, 160);
    const owned = await ownedCanvasProjectById(user, projectId, canvasText(body.projectKind, 20) || null);
    if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      const grant = await nomiWebTaskStore.createGrant({ownerId:user.id,projectId,projectKind:owned.projectKind,nodeIds:body.nodeIds});
      return json(response, 201, {grantId:grant.id,expiresAt:grant.expiresAt});
    } catch (error) {
      return json(response, error.httpStatus || 400, {code:error.code || 'STUDIO_GRANT_CREATE_FAILED',error:error.message || '生成确认失败'});
    }
  }
  const taskMatch = pathname.match(/^\/api\/studio\/tasks(?:\/([^/]+))?$/);
  if (!taskMatch) return false;
  const taskId = taskMatch[1] ? decodeURIComponent(taskMatch[1]) : null;
  if (!taskId && request.method === 'POST') {
    try {
      const body = await readBodyJson(request);
      const projectId = canvasText(body.projectId, 160);
      const owned = await ownedCanvasProjectById(user, projectId, canvasText(body.projectKind, 20) || null);
      if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
       const grantId = canvasText(body.request?.extras?.grantId, 160);
       if (canvasText(body.request?.kind, 40) !== 'text_to_video') return json(response, 422, {code:'STUDIO_TASK_KIND_UNSUPPORTED',error:'当前网页端仅支持视频任务'});
      const nodeId = canvasText(body.request?.extras?.nodeId, 160);
      const node = await nomiGenerationNode(owned.project, owned.projectKind, nodeId);
      if (!node) return json(response, 404, {code:'NOMI_GENERATION_NODE_NOT_FOUND',error:'Nomi 画布节点不存在或尚未保存，请保存当前项目后再生成'});
      if (!isNomiH3Node(node) || !requestedNomiH3Model(body.request)) return json(response, 422, {code:'NOMI_H3_NODE_REQUIRED',error:'当前节点不是已启用的 MiniMax H3 视频节点'});
      const input = body.request?.extras?.archetypeInput || {};
      // 新版 Nomi 网页端传 assetId；仅在同项目受保护下载路径的迁移窗口内兼容 URL。
      // 任何 blob:/data:/外链/Provider 临时地址都会由 resolveStudioProjectAssets 拒绝。
      const images = await resolveStudioProjectAssets(user, owned, input.reference_image_asset_ids || input.reference_image_urls || [], 'reference_image');
      const audio = await resolveStudioProjectAssets(user, owned, input.reference_audio_asset_ids || input.reference_audio_urls || [], 'reference_audio');
      const videos = await resolveStudioProjectAssets(user, owned, input.reference_video_asset_ids || input.reference_video_urls || [], 'reference_video');
      const h3Input = {
        prompt:canvasText(body.request?.prompt, 4000),
        aspectRatio:canvasText(input.aspect_ratio || body.request?.extras?.aspectRatio || '16:9', 16),
        durationSeconds:Number(input.duration_seconds || body.request?.extras?.durationSeconds || 5),
        width:Number(input.width || body.request?.width) || undefined,
        height:Number(input.height || body.request?.height) || undefined,
        images, audio, videos
      };
      const draft = nomiWebH3.dryRun(h3Input);
      const idempotencyKey = canvasText(body.request?.extras?.idempotencyKey, 200);
      const claimed = await nomiWebTaskStore.claimTask({
        ownerId:user.id, projectId, projectKind:owned.projectKind, grantId, nodeId, idempotencyKey,
        submitted:{
          mode:draft.mode,
          modelKey:canvasText(body.request?.extras?.modelKey, 160),
          prompt:h3Input.prompt,
          inputAssetIds:{images:images.map(asset => asset.id),audio:audio.map(asset => asset.id),videos:videos.map(asset => asset.id)},
          parameters:{aspectRatio:draft.target.aspectRatio,durationSeconds:draft.target.durationSeconds,width:draft.target.width,height:draft.target.height}
        }
      });
      if (!claimed.created) return json(response, 202, {result:studioTaskResult(claimed.task),idempotent:true});
      try {
        const submitted = await nomiWebH3.submit(h3Input);
        const record = await nomiWebTaskStore.updateOwnedTask(user.id, projectId, claimed.task.id, {status:'queued',workflowId:submitted.workflowId,providerTaskId:submitted.taskId,submittedAt:new Date().toISOString()});
        return json(response, 202, {result:studioTaskResult(record)});
      } catch (error) {
        const publicError = error?.code === 'RUNNINGHUB_PROVIDER_REJECTED'
          ? '视频渠道拒绝了当前工作流请求，请检查 H3 工作流参数。'
          : '视频提交状态尚未确认，请稍后在当前项目中重新读取。';
        const record = await nomiWebTaskStore.updateOwnedTask(user.id, projectId, claimed.task.id, {status:'recoverable',providerErrorCode:error.providerCode || null,error:publicError});
        return json(response, error.httpStatus || 502, {code:error.code || 'STUDIO_TASK_SUBMIT_FAILED',error:error.message || '视频提交失败',result:studioTaskResult(record)});
      }
    } catch (error) {
      return json(response, error.httpStatus || 400, {code:error.code || 'STUDIO_TASK_SUBMIT_FAILED',error:error.message || '视频任务提交失败'});
    }
  }
  if (taskId && request.method === 'GET') {
    const projectId = canvasText(new URL(request.url, 'http://localhost').searchParams.get('projectId'), 160);
    const owned = await ownedCanvasProjectById(user, projectId, null);
    if (!owned) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    let record = await nomiWebTaskStore.getOwnedTask(user.id, projectId, taskId);
    if (!record) return json(response, 404, {code:'STUDIO_TASK_NOT_FOUND',error:'任务不存在'});
    if (['queued','running'].includes(record.status)) {
      try {
        const current = await nomiWebH3.query(record.providerTaskId);
        if (current.status === 'succeeded') {
          nomiRunningHubH3.verifyConsumerUsage(current.usage);
          const asset = await downloadStudioGeneratedVideo(user, owned, current.videoUrls[0], record.id, record.parameters);
          await writeNomiGeneratedVideoResult(user, owned, record.nodeId, asset);
          record = await nomiWebTaskStore.updateOwnedTask(user.id, projectId, record.id, {status:'succeeded',outputAssetIds:[asset.id],assets:[{type:'video',assetId:asset.id,url:asset.downloadUrl}],completedAt:new Date().toISOString(),error:null});
        } else {
          record = await nomiWebTaskStore.updateOwnedTask(user.id, projectId, record.id, {status:current.status,error:current.status === 'failed' ? '视频生成失败，请检查提示词或稍后重试。' : null});
        }
      } catch (error) {
        const publicError = error?.code === 'RUNNINGHUB_PROVIDER_REJECTED'
          ? '视频渠道拒绝了当前工作流请求，请检查 H3 工作流参数。'
          : '视频状态读取失败，请稍后重新打开当前项目。';
        record = await nomiWebTaskStore.updateOwnedTask(user.id, projectId, record.id, {status:'recoverable',providerErrorCode:error.providerCode || null,error:publicError});
      }
    }
    return json(response, 200, {vendor:'runninghub',result:studioTaskResult(record)});
  }
  return json(response, 405, {code:'METHOD_NOT_ALLOWED',error:'请求方法不允许'});
}

async function handleApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/health') {
    return json(response, 200, {
      ok:true,
      service:'niannian-ai',
      router:'mx-shortdrama-00-router',
      release:releaseIdentity
    }, {'Cache-Control':'no-store'});
  }
  if (request.method === 'GET' && pathname === '/api/canvas/provider-status') {
    return json(response, 200, {
      providerStatus:{
        ...canvasProviderConfig.publicCanvasProviderStatus(),
        text:canvasTextRuntimeModule.publicCanvasTextStatus()
      }
    }, {'Cache-Control':'no-store'});
  }
  if (pathname.startsWith('/api/internal/smart-cut/')) {
    const handled = await handleSmartCutInternalApi(request, response, pathname);
    if (handled) return;
  }
  if (pathname.startsWith('/api/internal/step01-artifact-broker/')) return handleStep01ArtifactBrokerSession(request,response,pathname);
  if (pathname.startsWith('/api/controller/')) return handleControllerApi(request, response, pathname);
  if (pathname.startsWith('/api/bridge/')) return handleBridgeApi(request, response, pathname);
  if (request.method === 'POST' && pathname === '/api/auth/register') return handleRegister(request, response);
  if (request.method === 'POST' && pathname === '/api/auth/login') return handleLogin(request, response);
  if (request.method === 'POST' && pathname === '/api/auth/logout') return handleLogout(request, response);
  if (request.method === 'GET' && pathname === '/api/auth/session') {
    const user = await currentUser(request);
    return json(response, 200, {user});
  }
  const user = await currentUser(request);
  if (!user) return json(response, 401, {code:'AUTH_REQUIRED',error:'请先登录'});
  if (pathname.startsWith('/api/studio/')) {
    const nomiProjectHandled = await handleNomiProjectApi(request, response, pathname, user);
    if (nomiProjectHandled) return;
    const handled = await handleStudioTaskApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.startsWith('/api/canvas/director-desk/')) {
    const handled = await handleDirectorDeskApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/canvas\/documents\/(redraw|script)\/[^/]+\/s2-image2$/)) {
    const handled = await handleCanvasImage2NodeApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/canvas\/documents\/(redraw|script)\/[^/]+\/s3-h3$/)) {
    const handled = await handleCanvasH3NodeApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/canvas\/documents\/(redraw|script)\/[^/]+\/skill-node-layout$/)) {
    const handled = await handleCanvasSkillNodeLayoutApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/canvas\/director-import$/)) {
    const handled = await handleDirectorDeskImportApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/canvas\/jobs/)) {
    const handled = await handleCanvasGenerationApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/canvas\/skill-nodes\/[^/]+\/readiness$/)) {
    const handled = await handleCanvasSkillReadinessApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/text\/jobs/)) {
    const handled = await handleCanvasTextApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/smart-cut\/(?:jobs|sessions)/)) {
    const handled = await handleSmartCutApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/assets(?:\/[^/]+)?(?:\/download)?$/)) {
    const handled = await handleCanvasAssetsApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/deliveries$/)) {
    const handled = await handleProjectDeliveriesApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.startsWith('/api/canvas/documents/')) {
    const s1ChainHandled = await handleCanvasS1ChainApi(request, response, pathname, user);
    if (s1ChainHandled) return;
    const handled = await handleCanvasDocumentApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/canvas$/)) {
    const handled = await handleWorkbenchCanvasProjectApi(request, response, pathname, user);
    if (handled) return;
  }
  if (request.method === 'GET' && pathname === '/api/video-channels') {
    try {
      let registry;
      let evidenceStatus = 'verified';
      try {
        registry = await videoChannelRegistry.loadVideoChannelEvidenceRegistry();
      } catch (error) {
        if (!String(error?.code || '').startsWith('video_channel_evidence_')) throw error;
        registry = await videoChannelRegistry.loadVideoChannelEvidenceRegistry(undefined, {verifyEvidence:false});
        evidenceStatus = 'unverified';
      }
      return json(response, 200, {code:'VIDEO_CHANNEL_REGISTRY_READY',evidenceStatus,registry:videoChannelRegistry.apiSafeProjection(registry)});
    } catch (error) {
      return json(response, 503, {code:'VIDEO_CHANNEL_REGISTRY_UNAVAILABLE',error:'视频渠道配置暂不可读'});
    }
  }
  if (request.method === 'GET' && pathname === '/api/video-channels/dola/preflight') {
    try {
      const adapter = dolaSkillAdapter.createDolaSkillAdapter();
      const routed = await adapter.route({
        action:'preflight',
        projectId:'workspace-preflight-' + user.id,
        taskKind:'source_video',
        projectPolicy:{allowed_channels:['dola'],allowed_actions:['display','preflight'],nonbillable_preflight_enabled:true,prepare_enabled:false,provider_submit_enabled:false},
        transaction:null
      });
      return json(response, 200, {code:'DOLA_SKILL_ROUTE_PREFLIGHT_PASSED',...routed});
    } catch (error) {
      return json(response, 409, {code:error.code || 'DOLA_SKILL_ROUTE_PREFLIGHT_FAILED',error:String(error.message || error),providerSubmitEnabled:false,spendRequested:false,realDelivery:false});
    }
  }
  const dolaPrepareMatch = pathname.match(/^\/api\/projects\/([^/]+)\/video-channel-route\/dola\/prepare$/);
  if (request.method === 'POST' && dolaPrepareMatch) {
    try {
      const projectId = decodeURIComponent(dolaPrepareMatch[1]);
      const project = (await readProjects()).find(item => item.id === projectId && item.ownerId === user.id);
      if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
      const body = await readBodyJson(request);
      const transactionId = String(body.transactionId || '');
      const adapter = dolaSkillAdapter.createDolaSkillAdapter();
      const routed = await adapter.route({
        action:'prepare',
        projectId,
        taskKind:String(body.taskKind || 'source_video'),
        projectPolicy:{allowed_channels:['dola'],allowed_actions:['display','preflight','prepare'],nonbillable_preflight_enabled:true,prepare_enabled:true,provider_submit_enabled:false},
        transaction:{id:transactionId,confirmed_id:String(body.confirmedTransactionId || ''),channel_id:'dola',project_id:projectId,status:String(body.transactionStatus || '')},
        taskSpec:body.taskSpec,
        trustedRoot:path.join(jobsRoot, projectId)
      });
      return json(response, 200, {code:'DOLA_PREPARE_DISPATCH_READY_NO_SUBMIT_AUTHORITY',...routed});
    } catch (error) {
      return json(response, 409, {code:error.code || 'DOLA_PREPARE_ROUTE_FAILED',error:String(error.message || error),providerSubmitEnabled:false,mediaProviderSubmitted:false,spendRequested:false,realDelivery:false});
    }
  }
  if (request.method === 'GET' && pathname === '/api/events/projects') return openProjectEventStream(request, response, user);
  if (pathname.includes('/shot-review')) {
    const handled = await handleShotReviewApi(request,response,pathname,user);
    if (handled) return;
  }
  if (pathname.includes('/step01/confirm') || pathname.includes('/step01/snapshots/') || pathname.includes('/step02/variants')) {
    const handled = await handleStep02RuntimeApi(request,response,pathname,user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/localization-confirmation(?:\/(?:candidate|confirm))?$/)) {
    const handled=await handleLocalizationConfirmationApi(request,response,pathname,user);
    if(handled)return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/video-batches\/current(?:\/confirm)?$/)) {
    const handled=await handleVideoBatchApi(request,response,pathname,user);
    if(handled)return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/step05\/(?:references(?:\/[^/]+\/(?:reject|reroll|action|candidate)|\/confirm-batch)?|video-gate\/[^/]+)$/)) {
    const handled=await handleStep05ReferenceApi(request,response,pathname,user);
    if(handled)return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/step04\/(?:contract|compile|word)$/)) {
    const handled=await handleStep04AbcdApi(request,response,pathname,user);
    if(handled)return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/step03\//)) {
    const handled=await handleStep03RuntimeApi(request,response,pathname,user);
    if(handled)return;
  }
  if (pathname.startsWith('/api/reference-evidence/')) return handleWebsiteReferenceEvidence(request, response, pathname);
  if (request.method === 'GET' && pathname === '/api/workspace-projects') {
    return json(response, 200, {projects:(await readOwnedWorkspaceRows(user.id)).map(publicWorkspaceRow),revision:projectEventRevisionForUser(user.id)});
  }
  const workspaceWordMatch = pathname.match(/^\/api\/workspace-projects\/([^/]+)\/deliveries\/word$/);
  if (['GET','HEAD'].includes(request.method) && workspaceWordMatch) {
    return serveWorkspaceWord(request, response, user, decodeURIComponent(workspaceWordMatch[1]));
  }
  const workspaceOverviewMatch = pathname.match(/^\/api\/workspace-projects\/([^/]+)\/(overview|deliveries)$/);
  if (workspaceOverviewMatch) {
    const workspaceId = decodeURIComponent(workspaceOverviewMatch[1]);
    const overview = workspaceOverviewMatch[2] === 'overview'
      ? await readOwnedWorkspaceOverview(user, workspaceId)
      : await workspaceDeliveries(user, workspaceId);
    if (!overview) return json(response, 404, {error:'项目不存在'});
    return json(response, 200, overview);
  }
  if (request.method === 'GET' && pathname === '/api/projects') return json(response, 200, {projects:(await readOwnedProjects(user.id)).map(publicProject),revision:projectEventRevisionForUser(user.id)});
  if (request.method === 'POST' && pathname === '/api/projects') return createProject(request, response, user);
  if (pathname.match(/^\/api\/projects\/[^/]+\/step02\//)) {
    const handled = await handleStep02ProjectApi(request, response, pathname, user);
    if (handled) return;
  }
  if (pathname.match(/^\/api\/projects\/[^/]+\/source-video-execution\/[^/]+\/(prepare|prepare-fake|resume-fake|submit-real|status)$/)) {
    await handleSourceVideoExecutionApi(request,response,pathname,user);
    return;
  }
  if (request.method === 'GET' && pathname === '/api/script-projects') {
    const projects = await readScriptProjects();
    await reconcileOwnedScriptProjects(projects, user.id);
    return json(response, 200, {projects:projects.filter(item => item.ownerId === user.id).map(publicScriptProject),revision:projectEventRevisionForUser(user.id)});
  }
  if (request.method === 'POST' && pathname === '/api/script-uploads') return createScriptUploadSession(request, response, user);
  const scriptUploadSessionMatch = pathname.match(/^\/api\/script-uploads\/([^/]+)$/);
  if (request.method === 'GET' && scriptUploadSessionMatch) return readScriptUploadSession(request, response, user, decodeURIComponent(scriptUploadSessionMatch[1]));
  const scriptUploadChunkMatch = pathname.match(/^\/api\/script-uploads\/([^/]+)\/chunks\/(\d+)$/);
  if (request.method === 'PUT' && scriptUploadChunkMatch) return appendScriptUploadChunk(request, response, user, decodeURIComponent(scriptUploadChunkMatch[1]), scriptUploadChunkMatch[2]);
  const scriptUploadCompleteMatch = pathname.match(/^\/api\/script-uploads\/([^/]+)\/complete$/);
  if (request.method === 'POST' && scriptUploadCompleteMatch) return completeScriptUploadSession(request, response, user, decodeURIComponent(scriptUploadCompleteMatch[1]));
  if (request.method === 'POST' && pathname === '/api/script-projects/docx') return createScriptProjectFromDocx(request, response, user);
  if (request.method === 'POST' && pathname === '/api/script-projects/from-upload') return createScriptProjectFromUpload(request, response, user);
  if (request.method === 'POST' && pathname === '/api/script-projects') return createScriptProject(request, response, user);
  const scriptAdaptationMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/adaptation-jobs$/);
  if (request.method === 'POST' && scriptAdaptationMatch) return prepareScriptAdaptationJob(request, response, user, decodeURIComponent(scriptAdaptationMatch[1]));
  const scriptReconcileMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/reconcile$/);
  if (request.method === 'POST' && scriptReconcileMatch) {
    const projects = await readScriptProjects();
    const project = projects.find(item => item.id === decodeURIComponent(scriptReconcileMatch[1]) && item.ownerId === user.id);
    if (!project) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
    const synchronization = await reconcileScriptProjectFromJob(project);
    if (synchronization.changed) await writeScriptProjects(projects);
    if (synchronization.status === 'source_mismatch' || synchronization.status === 'contract_mismatch') {
      return json(response, 409, {code:'SCRIPT_PROJECT_SYNC_BLOCKED', error:'网站项目与本地短剧任务合同或源文本哈希不一致，已拒绝覆盖网站状态。', synchronization});
    }
    return json(response, 200, {code:'SCRIPT_PROJECT_SYNC_COMPLETE', project:publicScriptProject(project), synchronization});
  }
  const scriptActivityMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/activity$/);
  if (request.method === 'GET' && scriptActivityMatch) {
    try {
      const project = (await readScriptProjects()).find(item => item.id === decodeURIComponent(scriptActivityMatch[1]) && item.ownerId === user.id);
      if (!project) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      return json(response, 200, {code:'SCRIPT_PROJECT_ACTIVITY_READY', activity:await loadPublicScriptProjectActivity(project)});
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_PROJECT_ACTIVITY_FAILED', error:error.message || '无法读取项目动态'});
    }
  }
  const scriptN04ReviewMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n04-review$/);
  if (request.method === 'GET' && scriptN04ReviewMatch) {
    try {
      const projects = await readScriptProjects();
      const project = projects.find(item => item.id === decodeURIComponent(scriptN04ReviewMatch[1]) && item.ownerId === user.id);
      if (!project) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      const review = await loadScriptN04Review(project);
      return json(response, 200, {code:'SCRIPT_N04_REVIEW_READY', project:publicScriptProject(project), review:publicScriptN04Review(review)});
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N04_REVIEW_FAILED', error:error.message || '无法读取 N04 审核包'});
    }
  }
  const scriptN04AuthorizeMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n04-review\/authorize-n05$/);
  if (request.method === 'POST' && scriptN04AuthorizeMatch) {
    try {
      const body = await readBodyJson(request);
      const projects = await readScriptProjects();
      const index = projects.findIndex(item => item.id === decodeURIComponent(scriptN04AuthorizeMatch[1]) && item.ownerId === user.id);
      if (index < 0) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      const review = await authorizeScriptN04Review(projects[index], user, body);
      const synchronization = await reconcileScriptProjectFromJob(projects[index]);
      if (synchronization.changed) await writeScriptProjects(projects);
      return json(response, 200, {
        code:'SCRIPT_N05_AUTHORIZATION_RECORDED',
        project:publicScriptProject(projects[index]),
        review:publicScriptN04Review(review),
        authorization:{
          scope:'仅 N05 整图候选生成；视频提交、打包发送和 registry 提升保持关闭。',
          providerSubmit:false,
          packageSend:false,
          registryPromotion:false
        }
      });
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N05_AUTHORIZATION_FAILED', error:error.message || 'N05 授权记录失败'});
    }
  }
  const scriptN05CandidateImageMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n05-candidates\/([^/]+)\/image$/);
  if (request.method === 'GET' && scriptN05CandidateImageMatch) {
    try {
      const projectId = decodeURIComponent(scriptN05CandidateImageMatch[1]);
      const candidateId = decodeURIComponent(scriptN05CandidateImageMatch[2]);
      const project = (await readScriptProjects()).find(item => item.id === projectId && item.ownerId === user.id);
      if (!project) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      return serveScriptN05CandidateImage(request, response, project, candidateId);
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N05_CANDIDATE_IMAGE_FAILED', error:error.message || '无法读取 N05 候选图'});
    }
  }
  const scriptN05CandidateDecisionMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n05-candidates\/([^/]+)\/decision$/);
  if (request.method === 'POST' && scriptN05CandidateDecisionMatch) {
    try {
      const projectId = decodeURIComponent(scriptN05CandidateDecisionMatch[1]);
      const candidateId = decodeURIComponent(scriptN05CandidateDecisionMatch[2]);
      const projects = await readScriptProjects();
      const project = projects.find(item => item.id === projectId && item.ownerId === user.id);
      if (!project) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      const body = await readBodyJson(request);
      const review = await decideScriptN05Candidate(project, user, candidateId, body);
      const regeneration = body?.decision === 'regenerate'
        ? (review.n05RegenerationQueue?.items || []).find(item => String(item.candidate_id || '') === candidateId && String(item.status || '') === 'queued_for_approved_image2_worker')
        : null;
      const regenerationDispatch = regeneration ? startScriptN05RegenerationOrchestrator(review.jobRoot, String(regeneration.request_id || '')) : null;
      return json(response, 200, {
        code:body?.decision === 'regenerate' ? 'SCRIPT_N05_REGENERATION_QUEUED' : 'SCRIPT_N05_CANDIDATE_DECISION_RECORDED',
        project:publicScriptProject(project),
        review:publicScriptN04Review(review),
        videoSubmitAllowed:false,
        regenerationDispatch
      });
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N05_CANDIDATE_DECISION_FAILED', error:error.message || '无法记录 N05 候选决定'});
    }
  }
  const scriptN06MediaMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n06-video-groups\/([^/]+)\/media$/);
  if (request.method === 'GET' && scriptN06MediaMatch) {
    try {
      const projectId = decodeURIComponent(scriptN06MediaMatch[1]);
      const project = (await readScriptProjects()).find(item => item.id === projectId && item.ownerId === user.id);
      if (!project) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      return serveScriptN06Media(request, response, project, decodeURIComponent(scriptN06MediaMatch[2]));
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N06_MEDIA_FAILED', error:error.message || '无法读取视频媒体'});
    }
  }
  const scriptN06ReviewMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n06-review$/);
  if (request.method === 'GET' && scriptN06ReviewMatch) {
    try {
      const projects = await readScriptProjects();
      const project = projects.find(item => item.id === decodeURIComponent(scriptN06ReviewMatch[1]) && item.ownerId === user.id);
      if (!project) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      const n06 = await loadScriptN06Review(project);
      const synchronization = await reconcileScriptProjectFromJob(project);
      if (synchronization.changed) await writeScriptProjects(projects);
      return json(response, 200, {code:'SCRIPT_N06_REVIEW_READY', project:publicScriptProject(project), review:publicScriptN06Review(n06)});
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N06_REVIEW_FAILED', error:error.message || '无法读取 N06 视频规格'});
    }
  }
  const scriptN06GenerateMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n06-video-groups\/([^/]+)\/generate$/);
  if (request.method === 'POST' && scriptN06GenerateMatch) {
    try {
      const projectId = decodeURIComponent(scriptN06GenerateMatch[1]);
      const projects = await readScriptProjects();
      const index = projects.findIndex(item => item.id === projectId && item.ownerId === user.id);
      if (index < 0) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      const body = await readBodyJson(request);
      const n06 = await recordScriptN06DryRun(projects[index], user, decodeURIComponent(scriptN06GenerateMatch[2]), body);
      const synchronization = await reconcileScriptProjectFromJob(projects[index]);
      if (synchronization.changed) await writeScriptProjects(projects);
      return json(response, 200, {
        code:'SCRIPT_N06_DRY_RUN_INTENT_RECORDED',
        project:publicScriptProject(projects[index]),
        review:publicScriptN06Review(n06)
      });
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N06_DRY_RUN_RECORD_FAILED', error:error.message || '无法记录 N06 dry-run 生成意图'});
    }
  }
  const scriptN06RealPrepareMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n06-video-groups\/([^/]+)\/prepare-real-submit$/);
  if (request.method === 'POST' && scriptN06RealPrepareMatch) {
    try {
      const projectId = decodeURIComponent(scriptN06RealPrepareMatch[1]);
      const projects = await readScriptProjects();
      const index = projects.findIndex(item => item.id === projectId && item.ownerId === user.id);
      if (index < 0) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      const n06 = await prepareScriptN06RealSubmit(projects[index], user, decodeURIComponent(scriptN06RealPrepareMatch[2]), await readBodyJson(request));
      const synchronization = await reconcileScriptProjectFromJob(projects[index]);
      if (synchronization.changed) await writeScriptProjects(projects);
      return json(response, 200, {code:'SCRIPT_N06_REAL_SUBMIT_CANDIDATE_PREPARED',project:publicScriptProject(projects[index]),review:publicScriptN06Review(n06)});
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N06_REAL_SUBMIT_PREPARE_FAILED', error:error.message || '无法准备 N06 真实派发事务'});
    }
  }
  const scriptN06EmployeeDispatchMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n06-video-groups\/([^/]+)\/dispatch-synthetic$/);
  if (request.method === 'POST' && scriptN06EmployeeDispatchMatch) {
    try {
      const projectId = decodeURIComponent(scriptN06EmployeeDispatchMatch[1]);
      const projects = await readScriptProjects();
      const index = projects.findIndex(item => item.id === projectId && item.ownerId === user.id);
      if (index < 0) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      let n06 = await prepareScriptN06EmployeeSyntheticDispatch(projects[index], decodeURIComponent(scriptN06EmployeeDispatchMatch[2]), await readBodyJson(request));
      let carrier = {status:'disabled',dispatched:false};
      if (n06MacAppCarrierEnabled()) {
        const groupId = decodeURIComponent(scriptN06EmployeeDispatchMatch[2]).toUpperCase();
        const phaseState = await readJsonFile(n06.statePath,{groups:{}});
        const dispatchPath = phaseState.groups?.[groupId]?.employee_dispatch_path;
        const dispatch = dispatchPath ? await readJsonFile(dispatchPath,null) : null;
        if (!dispatch?.transport_export?.package_root || !dispatch?.transport_export?.manifest_sha256) throw createCodeError('SCRIPT_N06_PHASE_EXPORT_REQUIRED','Mac phase carrier 缺少 exact export package。');
        carrier = await runN06MacAppCarrier(dispatch,scriptN06EmployeeReturnRoot(n06.review,groupId),response);
        n06 = await reconcileScriptN06EmployeeSyntheticReturn(projects[index],groupId);
      }
      const synchronization = await reconcileScriptProjectFromJob(projects[index]);
      if (synchronization.changed) await writeScriptProjects(projects);
      const group = publicScriptN06Review(n06).groups.find(item => item.groupId === decodeURIComponent(scriptN06EmployeeDispatchMatch[2]).toUpperCase());
      const integrated = carrier.status === 'cross_device_return_imported';
       return json(response, 200, {code:integrated?'SCRIPT_N06_EMPLOYEE_SYNTHETIC_INTEGRATED':'SCRIPT_N06_EMPLOYEE_SYNTHETIC_DISPATCH_PREPARED',project:publicScriptProject(projects[index]),review:publicScriptN06Review(n06),employeeDispatch:group?.employeeDispatch || null,carrier:{status:carrier.status,dispatched:integrated},testOnly:true,realDelivery:false,v002Unlocked:false});
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N06_EMPLOYEE_DISPATCH_FAILED', error:error.message || '无法准备 Mac 员工测试派发'});
    }
  }
  const scriptN06EmployeeReconcileMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n06-video-groups\/([^/]+)\/reconcile-synthetic$/);
  if (request.method === 'POST' && scriptN06EmployeeReconcileMatch) {
    try {
      const projects = await readScriptProjects();
      const index = projects.findIndex(item => item.id === decodeURIComponent(scriptN06EmployeeReconcileMatch[1]) && item.ownerId === user.id);
      if (index < 0) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      const n06 = await reconcileScriptN06EmployeeSyntheticReturn(projects[index], decodeURIComponent(scriptN06EmployeeReconcileMatch[2]));
      const synchronization = await reconcileScriptProjectFromJob(projects[index]);
      if (synchronization.changed) await writeScriptProjects(projects);
       return json(response, 200, {code:'SCRIPT_N06_EMPLOYEE_SYNTHETIC_INTEGRATED',project:publicScriptProject(projects[index]),review:publicScriptN06Review(n06),testOnly:true,realDelivery:false,v002Unlocked:false});
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N06_EMPLOYEE_RECONCILE_FAILED', error:error.message || '无法归并 Mac 员工测试回执'});
    }
  }
  const scriptN06ExecuteMatch = pathname.match(/^\/api\/script-projects\/([^/]+)\/n06-video-groups\/([^/]+)\/execute$/);
  if (request.method === 'POST' && scriptN06ExecuteMatch) {
    try {
      const projects = await readScriptProjects();
      const index = projects.findIndex(item => item.id === decodeURIComponent(scriptN06ExecuteMatch[1]) && item.ownerId === user.id);
      if (index < 0) return json(response, 404, {code:'SCRIPT_PROJECT_NOT_FOUND', error:'未找到该小说短剧项目'});
      const n06 = await executeScriptN06Worker(projects[index], decodeURIComponent(scriptN06ExecuteMatch[2]));
      const synchronization = await reconcileScriptProjectFromJob(projects[index]);
      if (synchronization.changed) await writeScriptProjects(projects);
       return json(response, 200, {code:'SCRIPT_N06_LEGACY_LOCAL_TEST_WORKER_COMPLETE',project:publicScriptProject(projects[index]),review:publicScriptN06Review(n06),testOnly:true,realDelivery:false});
    } catch (error) {
      return json(response, scriptProjectErrorStatus(error), {code:error.code || 'SCRIPT_N06_EXECUTION_FAILED', error:error.message || 'N06 受控 worker 未能完成'});
    }
  }
  const preflightMatch = pathname.match(/^\/api\/projects\/([^/]+)\/preflight$/);
  if (request.method === 'POST' && preflightMatch) {
    const projects = await readProjects();
    const project = projects.find(item => item.id === preflightMatch[1] && item.ownerId === user.id);
    if (!project) return json(response, 404, {error:'项目不存在'});
    if (!project.runtime || project.runtime.gateState !== 'source_preflight_failed') {
      return json(response, 409, {code:'PREFLIGHT_RERUN_NOT_ALLOWED',error:'只有源视频预检失败的项目可以重新预检'});
    }
    await writeSourcePreflight(project);
    await writeProjects(projects);
    return json(response, 200, {project:publicProject(project)});
  }
  const replaceSourceMatch = pathname.match(/^\/api\/projects\/([^/]+)\/source$/);
  if (request.method === 'POST' && replaceSourceMatch) return replaceProjectSource(request, response, user, replaceSourceMatch[1]);
  if (['GET','HEAD'].includes(request.method) && replaceSourceMatch) {
    const project = (await readProjects()).find(item => item.id === replaceSourceMatch[1] && item.ownerId === user.id);
    return project ? serveProjectSource(request, response, project) : json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
  }
  const mediaDeliveryMigrationMatch = pathname.match(/^\/api\/projects\/([^/]+)\/media-delivery\/migrate$/);
  if (request.method === 'POST' && mediaDeliveryMigrationMatch) {
    const project = (await readProjects()).find(item => item.id === mediaDeliveryMigrationMatch[1] && item.ownerId === user.id);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    const idempotencyKey = String(request.headers['idempotency-key'] || '');
    if (!/^[A-Za-z0-9._-]{16,160}$/.test(idempotencyKey)) return json(response, 400, {code:'MEDIA_DELIVERY_IDEMPOTENCY_REQUIRED',error:'媒体加速迁移需要有效的幂等标识'});
    try {
      const readiness = webMediaDelivery.configuredCosDelivery();
      if (!readiness.ready) return json(response, 409, {code:'MEDIA_DELIVERY_NOT_READY',error:'媒体加速存储尚未配置完成'});
      const lockKey = project.id + ':' + idempotencyKey;
      const running = webMediaMigrationLocks.get(lockKey);
      const migrate = async () => {
        const entries = await listProjectMediaForCosMigration(project);
        const completed = [];
        for (const entry of entries) {
          try {
            await webMediaDelivery.migrateFile({root:webMediaDeliveryRoot, projectId:project.id, ...entry, config:readiness});
          } catch (error) {
            console.error('media_delivery_entry_failed', JSON.stringify({project_id:project.id, category:entry.category, code:error.code || 'MEDIA_DELIVERY_MIGRATION_FAILED'}));
            throw error;
          }
          completed.push(entry.category);
        }
        return completed;
      };
      const operation = running || migrate();
      if (!running) webMediaMigrationLocks.set(lockKey, operation);
      let completed;
      try { completed = await operation; }
      finally { if (webMediaMigrationLocks.get(lockKey) === operation) webMediaMigrationLocks.delete(lockKey); }
      return json(response, 200, {code:'MEDIA_DELIVERY_MIGRATED',status:'已完成媒体直连准备',mediaCount:completed.length,sourceVideoIncluded:completed.includes('source-video'),imagesIncluded:completed.some(item => item.includes('frame'))});
    } catch (error) {
      console.error('media_delivery_migration_failed', JSON.stringify({project_id:project.id, code:error.code || 'MEDIA_DELIVERY_MIGRATION_FAILED'}));
      return json(response, 409, {code:error.code || 'MEDIA_DELIVERY_MIGRATION_FAILED',error:'媒体加速迁移未完成；现有本地预览仍可使用'});
    }
  }
  const step01RunMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01-analysis\/([^/]+)$/);
  if (request.method === 'GET' && step01RunMatch) {
    const project=(await readOwnedProjects(user.id)).find(item=>item.id===step01RunMatch[1]);
    if(!project)return json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (fullSourceStep01BlockerResponse(response, project)) return;
    if(project.analysis?.runId!==step01RunMatch[2])return json(response,404,{code:'STEP01_ANALYSIS_RUN_NOT_FOUND',error:'分析 run 不存在'});
    const eventPath=path.join(jobsRoot,project.id,'evidence_events.jsonl');const reduced=step01EvidenceEvents.reduceEvidenceEvents(await step01EvidenceEvents.readEvidenceEvents(eventPath),{projectId:project.id,analysisRunId:project.analysis.runId,sourceSha256:project.source.sha256,sourceRevision:Number(project.analysis.sourceRevision)});
    return json(response,200,{analysisRun:{id:project.analysis.runId,sourceRevision:project.analysis.sourceRevision,sourceSha256:project.analysis.sourceSha256,status:reduced.status,accepted:reduced.accepted,delivered:reduced.delivered,eventCount:reduced.eventCount,blocker:reduced.blocker||project.analysis.blocker||null},worker:project.runtime?.worker||null});
  }
  const step01EvidenceMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01-evidence$/);
  if (request.method === 'GET' && step01EvidenceMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01EvidenceMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (fullSourceStep01BlockerResponse(response, project)) return;
    const authority = await currentStep01Authority(project).catch(error => {
      if (error?.code === 'STEP01_CURRENT_AUTHORITY_MISSING') return {kind:'legacy'};
      throw error;
    });
    if (authority.kind === 'legacy' && (project.runtime?.referenceEvidenceId === exactStep01EvidenceId || isExactStep01PilotProject(project))) return json(response, 200, {evidence:publicReferenceStep01Evidence(await loadWebsiteReferenceEvidence(exactStep01EvidenceId), project.id)});
    try { return json(response, 200, {evidence:publicStep01Evidence(await readVerifiedStep01Evidence(project), project.id)}); }
    catch (error) { return json(response, 409, {code:error.code || 'STEP01_EVIDENCE_NOT_READY',error:error.message || '原片事实证据包尚不可用'}); }
  }
  const step01EvidenceFrameMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01-evidence\/frames\/([^/]+)\/([^/]+)$/);
  if (request.method === 'GET' && step01EvidenceFrameMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01EvidenceFrameMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (fullSourceStep01BlockerResponse(response, project)) return;
    try { return await serveProjectStep01EvidenceFrame(response, project, step01EvidenceFrameMatch[2], step01EvidenceFrameMatch[3]); }
    catch (error) { return json(response, error.code === 'STEP01_SOURCE_FACT_FRAME_NOT_FOUND' ? 404 : 409, {code:error.code || 'STEP01_SOURCE_FACT_FRAME_UNAVAILABLE',error:error.message || '原片事实帧不可用'}); }
  }
  const step01LedgerFrameMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/ledger-frames\/([^/]+)\/([^/]+)$/);
  if (request.method === 'GET' && step01LedgerFrameMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01LedgerFrameMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (fullSourceStep01BlockerResponse(response, project)) return;
    try { return await serveProjectStep01LedgerFrame(response, project, step01LedgerFrameMatch[2], step01LedgerFrameMatch[3]); }
    catch (error) { return json(response, error.code === 'STEP01_LEDGER_FRAME_NOT_FOUND' ? 404 : 409, {code:error.code || 'STEP01_LEDGER_FRAME_UNAVAILABLE',error:error.message || '原片人物证据帧暂不可用'}); }
  }
  const step01EvidenceDownloadMatch=pathname.match(/^\/api\/projects\/([^/]+)\/step01-evidence\/download$/);
  if(request.method==='GET'&&step01EvidenceDownloadMatch){const project=(await readOwnedProjects(user.id)).find(item=>item.id===step01EvidenceDownloadMatch[1]);if(!project)return json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'});if(fullSourceStep01BlockerResponse(response,project))return;try{return await serveProjectStep01EvidenceDownload(response,project);}catch(error){if(response.headersSent){if(!response.destroyed)response.destroy();return;}return json(response,409,{code:error.code||'STEP01_EVIDENCE_DOWNLOAD_UNAVAILABLE',error:error.message||'原片事实证据包尚不可下载'});}}
  const sourceFactsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/source-facts$/);
  if(request.method==='GET'&&sourceFactsMatch){const project=(await readOwnedProjects(user.id)).find(item=>item.id===sourceFactsMatch[1]);if(!project)return json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'});if(fullSourceStep01BlockerResponse(response,project))return;try{response.setHeader('Deprecation','true');response.setHeader('Link','</api/projects/'+encodeURIComponent(project.id)+'/step01-evidence>; rel="successor-version"');return json(response,200,{evidence:publicStep01Evidence(await readVerifiedStep01Evidence(project),project.id)});}catch(error){return json(response,409,{code:error.code||'STEP01_EVIDENCE_NOT_READY',error:error.message||'原片事实证据包尚不可用'});}}
  const step01LedgerMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/shot-ledger$/);
  if (request.method === 'GET' && step01LedgerMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01LedgerMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (fullSourceStep01BlockerResponse(response, project)) return;
    try {
      const authority = await currentStep01Authority(project);
      const authorityProject = projectBoundToStep01Authority(project, authority);
      const ledger = await step01SourceLedger.readLedger({evidenceRoot:authority.evidence_root, overlayRoot:step01SourceLedgerOverlayRoot, project:authorityProject});
      const etag = '"step01-ledger-' + ledger.snapshot_sha256 + '"';
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.searchParams.get('format') === 'md') {
        const body = step01SourceLedger.markdownProjection(ledger);
        response.writeHead(200, {'Content-Type':'text/markdown; charset=utf-8','Content-Length':Buffer.byteLength(body),'ETag':etag,'Cache-Control':'private, no-store'});
        response.end(body);
        return;
      }
      return json(response, 200, {code:'STEP01_SOURCE_LEDGER_READY', ledger, markdownUrl:'/api/projects/' + encodeURIComponent(project.id) + '/step01/shot-ledger?format=md'}, {ETag:etag});
    } catch (error) {
      return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_SOURCE_LEDGER_NOT_READY', error:error.message || 'Step01 权威镜头账本尚不可用'});
    }
  }
  const step01LedgerRevisionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/shot-ledger\/revisions$/);
  if (request.method === 'POST' && step01LedgerRevisionMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01LedgerRevisionMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      const body = await readBodyJson(request);
      const authority = await currentStep01Authority(project);
      const ledger = await step01SourceLedger.appendRevision({evidenceRoot:authority.evidence_root, overlayRoot:step01SourceLedgerOverlayRoot, project:projectBoundToStep01Authority(project, authority), ifMatch:request.headers['if-match'], body, actor:user.id});
      const etag = '"step01-ledger-' + ledger.snapshot_sha256 + '"';
      return json(response, 200, {code:'STEP01_SOURCE_LEDGER_REVISION_RECORDED', ledger, invalidation:{policy:'affected_step03_items_only', providerSubmitted:false}}, {ETag:etag});
    } catch (error) {
      return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_SOURCE_LEDGER_REVISION_FAILED', error:error.message || 'Step01 账本修订失败'});
    }
  }
  const step01AuthorityRevisionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/authority-revisions\/(analysis-[A-Za-z0-9-]{8,120})$/);
  const step01AuthorityImportGrantMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/authority-revisions\/(analysis-[A-Za-z0-9-]{8,120})\/import-grant$/);
  const step01AuthorityImportMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/authority-revisions\/(analysis-[A-Za-z0-9-]{8,120})\/import$/);
  const step01AuthorityPromoteMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/authority-revisions\/(analysis-[A-Za-z0-9-]{8,120})\/promote$/);
  const step01AuthorityGateReconcileMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/authority-revisions\/(analysis-[A-Za-z0-9-]{8,120})\/promotion-gates\/reconcile$/);
  const step01AuthorityRollbackMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/authority\/rollback$/);
  if (step01AuthorityRevisionMatch && request.method === 'GET') {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01AuthorityRevisionMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      const revision = await step01AuthorityRevision.readRevision({root:step01AuthorityRevisionRoot, project, revisionId:step01AuthorityRevisionMatch[2]});
      return json(response, 200, {code:'STEP01_AUTHORITY_REVISION_READY', revision:{revision_id:revision.revision_id,status:revision.status,counts:revision.counts,visual_review:{status:revision.visual_review?.status,reviewed_frames:revision.visual_review?.reviewed_frames,expected_frames:revision.visual_review?.expected_frames,complete:revision.visual_review?.complete === true},created_at:revision.created_at,updated_at:revision.updated_at || null}});
    } catch (error) { return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_AUTHORITY_REVISION_NOT_READY',error:error.message || '证据 revision 尚不可用'}); }
  }
  if (step01AuthorityImportGrantMatch && request.method === 'POST') {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01AuthorityImportGrantMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      const result = await issueAuthorityImportGrant(project, step01AuthorityImportGrantMatch[2], await readBodyJson(request), request.headers['idempotency-key']);
      if (result.reconciled) return json(response, 200, {code:'STEP01_AUTHORITY_IMPORT_ALREADY_COMPLETED', revision:{revision_id:result.revision.revision_id,status:result.revision.status,counts:result.revision.counts}});
      return json(response, 201, {code:'STEP01_AUTHORITY_IMPORT_GRANT_READY', upload:{url:result.grant.url,method:'PUT',expires_at:result.grant.expires_at}, revision:{revision_id:result.declaration.revision_id,counts:result.declaration.counts}});
    } catch (error) { return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_AUTHORITY_IMPORT_GRANT_FAILED',error:error.message || '受控证据导入暂不可用'}); }
  }
  if (step01AuthorityImportMatch && request.method === 'POST') {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01AuthorityImportMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      if (!request.headers['idempotency-key']) throw createCodeError('STEP01_AUTHORITY_IMPORT_IDEMPOTENCY_REQUIRED', '缺少 Idempotency-Key');
      const revision = await importAuthorityEvidence(project, step01AuthorityImportMatch[2], request.headers['if-match'], request.headers['idempotency-key']);
      return json(response, 201, {code:'STEP01_AUTHORITY_IMPORT_COMPLETED',revision:{revision_id:revision.revision_id,status:revision.status,counts:revision.counts}});
    } catch (error) { return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_AUTHORITY_IMPORT_FAILED',error:error.message || '受控证据导入失败'}); }
  }
  if (step01AuthorityGateReconcileMatch && request.method === 'POST') {
    const project=(await readOwnedProjects(user.id)).find(item=>item.id===step01AuthorityGateReconcileMatch[1]);
    if(!project)return json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try{const result=await step01PromotionGate.assembleAndMarkReady({root:step01AuthorityRevisionRoot,project,revisionId:step01AuthorityGateReconcileMatch[2]});return json(response,200,{code:'STEP01_AUTHORITY_PROMOTION_GATES_READY',revision:{revision_id:result.revision.revision_id,status:result.revision.status},gate_receipt:{status:result.receipt.status,source_receipts:result.receipt.source_receipts}});}
    catch(error){return json(response,error.httpStatus||409,{code:error.code||'STEP01_AUTHORITY_PROMOTION_GATES_FAILED',error:error.message||'晋级证据尚未全部通过'});}
  }
  if (step01AuthorityPromoteMatch && request.method === 'POST') {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01AuthorityPromoteMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      if (!request.headers['if-match']) throw createCodeError('PRECONDITION_REQUIRED', '切换权威前必须读回当前版本');
      const pointer = await step01AuthorityRevision.promote({root:step01AuthorityRevisionRoot, project, revisionId:step01AuthorityPromoteMatch[2], ifMatch:request.headers['if-match']});
      authorityRuntimeServices.clear();
      return json(response, 200, {code:'STEP01_AUTHORITY_PROMOTED',current_authority:{revision_id:pointer.revision_id,promoted_at:pointer.promoted_at},invalidation:{step01_snapshot:'stale',step02:'upstream_source_truth_changed',step03:'upstream_source_truth_changed',provider_submitted:false}}, {ETag:step01AuthorityRevision.etag(pointer)});
    } catch (error) { return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_AUTHORITY_PROMOTION_FAILED',error:error.message || '当前证据尚不能切换为正式权威'}); }
  }
  if(step01AuthorityRollbackMatch&&request.method==='POST'){
    const project=(await readOwnedProjects(user.id)).find(item=>item.id===step01AuthorityRollbackMatch[1]);if(!project)return json(response,404,{code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try{if(!request.headers['if-match'])throw createCodeError('PRECONDITION_REQUIRED','回滚权威前必须读回当前版本');const pointer=await step01AuthorityRevision.rollback({root:step01AuthorityRevisionRoot,project,ifMatch:request.headers['if-match']});authorityRuntimeServices.clear();return json(response,200,{code:'STEP01_AUTHORITY_ROLLED_BACK',current_authority:{revision_id:pointer.revision_id,rolled_back_at:pointer.rolled_back_at},forward_recovery_target:pointer.forward_recovery_target},{ETag:step01AuthorityRevision.etag(pointer)});}catch(error){return json(response,error.httpStatus||409,{code:error.code||'STEP01_AUTHORITY_ROLLBACK_FAILED',error:error.message||'当前权威不能安全回滚'});}
  }
  const step01VisualFactsReconcileMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/visual-facts\/reconcile$/);
  if (request.method === 'GET' && step01VisualFactsReconcileMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01VisualFactsReconcileMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (fullSourceStep01BlockerResponse(response, project)) return;
    const receipt = await readJsonFile(visualFactsReconcileReceiptPath(project.id), null);
    const status = receipt?.status === 'completed' ? '已完成完整证据整理' : receipt?.status === 'running' ? '正在整理完整原片证据' : receipt?.status === 'failed' ? '整理需要重新开始' : '尚未整理完整原片证据';
    return json(response, 200, {code:'STEP01_VISUAL_FACTS_STATUS', reconcile:{status, completed:receipt?.status === 'completed', updated_at:receipt?.completed_at || receipt?.failed_at || receipt?.started_at || null}});
  }
  if (request.method === 'POST' && step01VisualFactsReconcileMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01VisualFactsReconcileMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      const body = await readBodyJson(request);
      const result = await reconcileStep01VisualFacts({project, actor:user.id, idempotencyKey:request.headers['idempotency-key'], revisionId:body.revision_id || null});
      return json(response, result.idempotent ? 200 : 201, {code:result.idempotent ? 'STEP01_VISUAL_FACTS_REUSED' : 'STEP01_VISUAL_FACTS_RECONCILED',reconcile:result,invalidation:{step01_snapshot:'stale',step02:'upstream_source_truth_changed',step03:'upstream_source_truth_changed',providerSubmitted:false}});
    } catch (error) { return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_VISUAL_FACTS_RECONCILE_FAILED',error:error.message || '原片事实整理失败'}); }
  }
  const step01StoryMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/story-authority$/);
  const step01RoleCardsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/role-cards$/);
  if (request.method === 'GET' && step01RoleCardsMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01RoleCardsMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (fullSourceStep01BlockerResponse(response, project)) return;
    try {
      const authority = await currentStep01Authority(project);
      const authorityProject = projectBoundToStep01Authority(project, authority);
      const ledger = await step01SourceLedger.readLedger({evidenceRoot:authority.evidence_root, overlayRoot:step01SourceLedgerOverlayRoot, project:authorityProject});
      let cards = await step01RoleCardAuthority.get({root:step01RoleCardAuthorityRoot, project:authorityProject});
      const story = await step01StoryAuthority.get({root:step01StoryAuthorityRoot, project:authorityProject, ledger});
      let fullEvidenceIndex = null;
      try { fullEvidenceIndex = await step01FullEvidenceIndex.readVerified({evidenceRoot:authority.evidence_root, project:authorityProject}); } catch {}
      if (cards && cards.derivation_version !== step01RoleCardAuthority.DERIVATION_VERSION && fullEvidenceIndex && story?.gemini_sidecar?.full_evidence_coverage?.complete === true) {
        cards = await step01RoleCardAuthority.generate({root:step01RoleCardAuthorityRoot, project:authorityProject, ledger, story, fullEvidenceIndex});
      }
      return json(response, 200, {code:'STEP01_ROLE_CARDS_READY', cards, requirements:{important_cards_must_be_confirmed:true}, ledger:{snapshot_id:ledger.snapshot_id}}, cards ? {ETag:step01RoleCardAuthority.etag(cards)} : {});
    } catch (error) { return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_ROLE_CARDS_NOT_READY',error:error.message || '角色卡尚不可用'}); }
  }
  if (request.method === 'POST' && step01RoleCardsMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01RoleCardsMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      if (!request.headers['idempotency-key']) throw step01RoleCardAuthority.error('STEP01_ROLE_CARDS_IDEMPOTENCY_REQUIRED', 422, '缺少 Idempotency-Key');
      const authority = await currentStep01Authority(project);
      const authorityProject = projectBoundToStep01Authority(project, authority);
      const ledger = await step01SourceLedger.readLedger({evidenceRoot:authority.evidence_root, overlayRoot:step01SourceLedgerOverlayRoot, project:authorityProject});
      const story = await step01StoryAuthority.get({root:step01StoryAuthorityRoot, project:authorityProject, ledger});
      const fullEvidenceIndex = await step01FullEvidenceIndex.readVerified({evidenceRoot:authority.evidence_root, project:authorityProject});
      if (story?.gemini_sidecar?.full_evidence_coverage?.complete !== true) throw step01RoleCardAuthority.error('STEP01_ROLE_CARDS_FULL_EVIDENCE_REQUIRED', 409, '完整原片证据尚未整理，暂不能重建角色卡');
      const cards = await step01RoleCardAuthority.generate({root:step01RoleCardAuthorityRoot, project:authorityProject, ledger, story, fullEvidenceIndex});
      return json(response, 200, {code:'STEP01_ROLE_CARDS_DRAFTED',cards}, {ETag:step01RoleCardAuthority.etag(cards)});
    } catch (error) { return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_ROLE_CARDS_GENERATION_FAILED',error:error.message || '角色卡生成失败'}); }
  }
  const step01RoleCardRevisionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/role-cards\/revisions$/);
  if (request.method === 'POST' && step01RoleCardRevisionMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01RoleCardRevisionMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      if (!request.headers['idempotency-key']) throw step01RoleCardAuthority.error('STEP01_ROLE_CARDS_IDEMPOTENCY_REQUIRED', 422, '缺少 Idempotency-Key');
      const body = await readBodyJson(request);
      const authority = await currentStep01Authority(project);
      const authorityProject = projectBoundToStep01Authority(project, authority);
      const ledger = await step01SourceLedger.readLedger({evidenceRoot:authority.evidence_root, overlayRoot:step01SourceLedgerOverlayRoot, project:authorityProject});
      const cards = await step01RoleCardAuthority.revise({root:step01RoleCardAuthorityRoot, project:authorityProject, ledger, ifMatch:request.headers['if-match'], idempotencyKey:request.headers['idempotency-key'], body, actor:user.id});
      return json(response, 200, {code:body.action === 'confirm' ? 'STEP01_ROLE_CARD_CONFIRMED' : (body.action === 'add' ? 'STEP01_ROLE_CARD_ADDED' : (body.action === 'delete' ? 'STEP01_ROLE_CARD_DELETED' : 'STEP01_ROLE_CARD_REVISED')),cards,invalidation:{story_authority:'stale',provider_submitted:false}}, {ETag:step01RoleCardAuthority.etag(cards)});
    } catch (error) { return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_ROLE_CARD_REVISION_FAILED',error:error.message || '角色卡保存失败'}); }
  }
  if (request.method === 'GET' && step01StoryMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01StoryMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    if (fullSourceStep01BlockerResponse(response, project)) return;
    try {
      const authority = await currentStep01Authority(project);
      const authorityProject = projectBoundToStep01Authority(project, authority);
      const ledger = await step01SourceLedger.readLedger({evidenceRoot:authority.evidence_root, overlayRoot:step01SourceLedgerOverlayRoot, project:authorityProject});
      const story = await step01StoryAuthority.get({root:step01StoryAuthorityRoot, project:authorityProject, ledger});
      const roleCards = await step01RoleCardAuthority.get({root:step01RoleCardAuthorityRoot, project:authorityProject});
      const roleCardsStale = Boolean(story && (!roleCards || story.role_card_snapshot_sha256 !== roleCards.snapshot_sha256));
      return json(response, 200, {code:'STEP01_STORY_AUTHORITY_READY', story, role_cards:{ready:Boolean(roleCards), stale:roleCardsStale, all_important_confirmed:roleCards ? step01RoleCardAuthority.allImportantConfirmed(roleCards) : false}, ledger:{snapshot_id:ledger.snapshot_id,snapshot_sha256:ledger.snapshot_sha256}, gemini:{configured:step01StoryAuthority.defaultGeminiConfig().configured, model:step01StoryAuthority.defaultGeminiConfig().model}}, story ? {ETag:step01StoryAuthority.etag(story)} : {});
    } catch (error) {
      return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_STORY_AUTHORITY_NOT_READY',error:error.message || '剧情权威大纲尚不可用'});
    }
  }
  if (request.method === 'POST' && step01StoryMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01StoryMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      const body = await readBodyJson(request);
      const authority = await currentStep01Authority(project);
      const authorityProject = projectBoundToStep01Authority(project, authority);
      const ledger = await step01SourceLedger.readLedger({evidenceRoot:authority.evidence_root, overlayRoot:step01SourceLedgerOverlayRoot, project:authorityProject});
      const roleCards = await step01RoleCardAuthority.get({root:step01RoleCardAuthorityRoot, project:authorityProject});
      const sourceKey = String(project.source?.storage_key || '').replace(/\\/g, '/');
      const sourceVideoPath = sourceKey.startsWith('uploads/') && !sourceKey.includes('..') ? path.resolve(dataRoot, ...sourceKey.split('/')) : null;
      if (sourceVideoPath && !sourceVideoPath.startsWith(uploadsRoot + path.sep)) throw createCodeError('STEP01_STORY_SOURCE_PATH_INVALID', '原片路径无效');
      const story = await step01StoryAuthority.generate({root:step01StoryAuthorityRoot, project:authorityProject, ledger, roleCards, scriptText:body.script_text, requestGemini:body.request_gemini !== false, reuseGeminiSidecar:body.reuse_gemini_sidecar === true, sourceVideoPath, evidenceRoot:authority.evidence_root});
      return json(response, 200, {code:'STEP01_STORY_AUTHORITY_DRAFTED',story,gemini:{configured:step01StoryAuthority.defaultGeminiConfig().configured,model:step01StoryAuthority.defaultGeminiConfig().model}}, {ETag:step01StoryAuthority.etag(story)});
    } catch (error) {
      return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_STORY_AUTHORITY_GENERATION_FAILED',error:error.message || '剧情大纲草案生成失败'});
    }
  }
  const step01StoryRevisionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01\/story-authority\/revisions$/);
  if (request.method === 'POST' && step01StoryRevisionMatch) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === step01StoryRevisionMatch[1]);
    if (!project) return json(response, 404, {code:'PROJECT_NOT_FOUND',error:'项目不存在'});
    try {
      const body = await readBodyJson(request);
      const authority = await currentStep01Authority(project);
      const authorityProject = projectBoundToStep01Authority(project, authority);
      const ledger = await step01SourceLedger.readLedger({evidenceRoot:authority.evidence_root, overlayRoot:step01SourceLedgerOverlayRoot, project:authorityProject});
      const roleCards = await step01RoleCardAuthority.get({root:step01RoleCardAuthorityRoot, project:authorityProject});
      const story = await step01StoryAuthority.revise({root:step01StoryAuthorityRoot, project:authorityProject, ledger, roleCards, ifMatch:request.headers['if-match'], body, actor:user.id});
      return json(response, 200, {code:story.status === 'confirmed' ? 'STEP01_STORY_AUTHORITY_CONFIRMED' : 'STEP01_STORY_AUTHORITY_REVISED',story}, {ETag:step01StoryAuthority.etag(story)});
    } catch (error) {
      return json(response, error.httpStatus || 409, {code:error.code || 'STEP01_STORY_AUTHORITY_REVISION_FAILED',error:error.message || '剧情大纲保存失败'});
    }
  }
  const projectSettingsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/settings$/);
  if (request.method === 'POST' && projectSettingsMatch) return updateProjectSettings(request, response, user, projectSettingsMatch[1]);
  const step01AnalysisMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01-analysis$/);
  if (request.method === 'POST' && step01AnalysisMatch) return queueStep01Analysis(request, response, user, step01AnalysisMatch[1]);
  const step01FixedResumeMatch = pathname.match(/^\/api\/projects\/([^/]+)\/step01-fixed-phase\/resume$/);
  if (request.method === 'POST' && step01FixedResumeMatch) return resumeExistingFixedStep01Phase(request,response,user,step01FixedResumeMatch[1]);
  const projectPrefix = '/api/projects/';
  const projectId = pathname.startsWith(projectPrefix) ? pathname.slice(projectPrefix.length) : '';
  if (request.method === 'GET' && projectId && !projectId.includes('/')) {
    const project = (await readOwnedProjects(user.id)).find(item => item.id === projectId) || await ensureWebCanvasProject(user, projectId);
    if (!project) return json(response, 404, {error:'项目不存在'});
    if (project.canvasOnly === true) return json(response, 200, {project:{id:project.id,name:project.name,status:project.status,createdAt:project.createdAt,updatedAt:project.updatedAt,workspaceProjectId:project.id,source:null,runtime:project.runtime || {}}});
    return json(response, 200, {project:publicProject(project)});
  }
  return json(response, 404, {error:'API 不存在'});
}

async function serveStatic(request, response, pathname) {
  const relative = pathname === '/' ? 'index.html' : (pathname.startsWith('/') ? pathname.slice(1) : pathname);
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root)) { response.writeHead(403); return response.end('Forbidden'); }
  try {
    const stats = await fsp.stat(filePath);
    const resolved = stats.isDirectory() ? path.join(filePath,'index.html') : filePath;
    const data = await fsp.readFile(resolved);
    const fileName = path.basename(resolved).toLowerCase();
    const cacheControl = ['index.html','app.js','sw.js','manifest.webmanifest','product.css','product-system.css'].includes(fileName) ? 'no-store, max-age=0' : 'public, max-age=3600';
    response.writeHead(200, {'Content-Type':contentTypes[path.extname(resolved).toLowerCase()] || 'application/octet-stream','Cache-Control':cacheControl});
    response.end(data);
  } catch {
    response.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    response.end('Not found');
  }
}

const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  try {
    if (pathname.startsWith('/api/')) return await handleApi(request, response, pathname);
    return await serveStatic(request, response, pathname);
  } catch (error) {
    if(response.headersSent){if(!response.destroyed)response.destroy();return;}
    json(response, 500, {error:error.message});
  }
});

ensureData().then(() => server.listen(port, '127.0.0.1', () => console.log('NianNian AI listening on http://127.0.0.1:' + port)));
