'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const authority = require('./niannian_step01_authority_revision');

const RECEIPTS = Object.freeze({
  gemini:['gemini.json','niannian.step01.gemini_gate.v1'],
  ocr:['ocr.json','niannian.step01.ocr_gate.v1'],
  source:['source-authority.json','niannian.step01.source_authority_gate.v1'],
  stale:['downstream-stale.json','niannian.step01.downstream_stale_gate.v1'],
  candidate:['candidate-acceptance.json','niannian.step01.candidate_acceptance_gate.v1'],
  review:['post-coding-review.json','niannian.step01.post_coding_review_gate.v1']
});

function canonical(value) { return authority.canonical(value); }
function sha256(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex'); }
function fail(code, message) { const error = new Error(message || code); error.code = code; error.httpStatus = 409; return error; }
function exactSha(value) { return /^[a-f0-9]{64}$/.test(String(value || '')); }
function gateRoot(root, projectId, revisionId) { return path.join(authority.revisionRoot(root, projectId, revisionId), 'promotion-gates'); }
async function readReceipt(filePath) {
  let body;
  try { body = await fsp.readFile(filePath); }
  catch (error) { if (error.code === 'ENOENT') throw fail('STEP01_PROMOTION_GATE_RECEIPT_MISSING', '晋级证据文件缺失'); throw error; }
  let value;
  try { value = JSON.parse(body.toString('utf8')); }
  catch { throw fail('STEP01_PROMOTION_GATE_RECEIPT_INVALID', '晋级证据文件无效'); }
  return {value,sha256:sha256(body),bytes:body.length};
}
async function verifyPointer(rootPath,pointerValue){const relative=String(pointerValue?.relative_path||'').replace(/\\/g,'/');if(!relative||relative.startsWith('/')||relative.includes('..'))throw fail('STEP01_PROMOTION_GATE_POINTER_INVALID','晋级证据指针无效');const target=path.resolve(rootPath,...relative.split('/'));if(!target.startsWith(path.resolve(rootPath)+path.sep))throw fail('STEP01_PROMOTION_GATE_POINTER_INVALID','晋级证据指针越界');const evidence=await readReceipt(target);if(evidence.sha256!==pointerValue.sha256||evidence.bytes!==Number(pointerValue.bytes))throw fail('STEP01_PROMOTION_GATE_POINTER_MISMATCH','晋级证据文件哈希不匹配');return evidence;}
function binding(revision) { return {project_id:revision.project_id,revision_id:revision.revision_id,source_sha256:revision.source_sha256,full_evidence_index_sha256:revision.full_evidence_index_sha256}; }
function assertBinding(receipt, revision, schema) {
  const expected = binding(revision);
  if (receipt.schema_version !== schema || receipt.status !== 'completed' || Object.keys(expected).some(key => receipt[key] !== expected[key])) throw fail('STEP01_PROMOTION_GATE_IDENTITY_MISMATCH', '晋级证据身份与当前 revision 不一致');
}
function uniqueFrameIds(rows, expected) {
  if (!Array.isArray(rows) || rows.length !== expected) throw fail('STEP01_PROMOTION_GATE_FRAME_COVERAGE_INVALID', '晋级证据帧覆盖不完整');
  const ids = rows.map(row => String(row?.frame_id || ''));
  if (new Set(ids).size !== expected || ids.some(id => !/^F-[A-Za-z0-9-]{1,120}$/.test(id))) throw fail('STEP01_PROMOTION_GATE_FRAME_COVERAGE_INVALID', '晋级证据帧身份重复或无效');
  return ids;
}
async function atomicWrite(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(5).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
  try { await fsp.rename(temporary, filePath); }
  catch (error) { await fsp.rm(temporary,{force:true}).catch(()=>{}); throw error; }
}

async function assemble({root, project, revisionId}) {
  const revision = await authority.readRevision({root,project,revisionId});
  const rootPath = gateRoot(root,project.id,revisionId);
  const loaded = {};
  for (const [key,[name,schema]] of Object.entries(RECEIPTS)) {
    loaded[key] = await readReceipt(path.join(rootPath,name));
    assertBinding(loaded[key].value,revision,schema);
  }
  const gemini = loaded.gemini.value;
  const geminiIndex=await verifyPointer(rootPath,gemini.observation_index);if(canonical(geminiIndex.value.frames)!==canonical(gemini.frames))throw fail('STEP01_PROMOTION_GATE_GEMINI_INVALID','Gemini observation index 不一致');
  const geminiFrameIds = uniqueFrameIds(gemini.frames,revision.counts.frames);
  if (gemini.model !== 'gemini-3.1-pro-preview' || gemini.frames.some(row=>!exactSha(row.input_sha256)||!exactSha(row.observation_sha256)||!exactSha(row.batch_receipt_sha256))) throw fail('STEP01_PROMOTION_GATE_GEMINI_INVALID','Gemini 晋级证据无效');
  const ocr = loaded.ocr.value;
  const ocrIndex=await verifyPointer(rootPath,ocr.result_index);if(canonical(ocrIndex.value.frame_checks)!==canonical(ocr.frame_checks))throw fail('STEP01_PROMOTION_GATE_OCR_INVALID','OCR result index 不一致');
  const ocrFrameIds = uniqueFrameIds(ocr.frame_checks,revision.counts.frames);
  if (canonical(ocrFrameIds) !== canonical(geminiFrameIds) || ocr.visual_fact_override === true || ocr.frame_checks.some(row=>!exactSha(row.input_sha256)||!exactSha(row.receipt_sha256)||!exactSha(row.output_sha256))) throw fail('STEP01_PROMOTION_GATE_OCR_INVALID','OCR 晋级证据无效');
  const source = loaded.source.value;
  const ledgerEvidence=await verifyPointer(rootPath,source.ledger);const roleEvidence=await verifyPointer(rootPath,source.role_cards);const storyEvidence=await verifyPointer(rootPath,source.story);
  if (!Array.isArray(source.shots) || source.shots.length !== revision.counts.shots || new Set(source.shots.map(row=>row.shot_id)).size !== revision.counts.shots || source.ledger_snapshot_sha256!==ledgerEvidence.sha256 || source.role_card_snapshot_sha256!==roleEvidence.sha256 || source.story_snapshot_sha256!==storyEvidence.sha256) throw fail('STEP01_PROMOTION_GATE_SOURCE_INVALID','原片权威晋级证据无效');
  const sourceFrames = [...new Set(source.shots.flatMap(row=>Array.isArray(row.observed_frame_ids)?row.observed_frame_ids:[]))];
  if (sourceFrames.length !== revision.counts.frames || sourceFrames.some(id=>!new Set(geminiFrameIds).has(id))) throw fail('STEP01_PROMOTION_GATE_SOURCE_INVALID','原片权威未引用全部视觉观察');
  const stale = loaded.stale.value;
  await verifyPointer(rootPath,stale.event_log);
  if (stale.step01_snapshot!=='superseded'||stale.role_cards!=='superseded'||stale.story_authority!=='superseded'||stale.step02!=='stale'||stale.step03!=='stale'||stale.step04_created!==false||stale.provider_submitted!==false||!Array.isArray(stale.events)||stale.events.length<5) throw fail('STEP01_PROMOTION_GATE_STALE_INVALID','下游 stale 证据无效');
  const candidate = loaded.candidate.value;
  for(const check of candidate.checks||[])await verifyPointer(rootPath,check);
  const viewports = new Set(candidate.viewports || []); const checkKinds = new Set((candidate.checks||[]).map(item=>item.kind));
  if (candidate.api!=='passed'||candidate.cos!=='passed'||candidate.pwa!=='passed'||candidate.security!=='passed'||candidate.video_range_206!==true||candidate.unauthorized_rejected!==true||candidate.cross_user_rejected!==true||candidate.expired_rejected!==true||candidate.secret_scan_passed!==true||!viewports.has('1440x900')||!viewports.has('1366x768')||!viewports.has('390x844')||['api','cos','pwa','browser','security'].some(kind=>!checkKinds.has(kind))||(candidate.checks||[]).some(item=>!exactSha(item.sha256))) throw fail('STEP01_PROMOTION_GATE_CANDIDATE_INVALID','候选环境验收证据无效');
  const review = loaded.review.value;
  if (review.level!==3||review.result!=='passed'||review.real_candidate_path_checked!==true||!Array.isArray(review.changed_files)||!review.changed_files.length) throw fail('STEP01_PROMOTION_GATE_REVIEW_INVALID','Level 3 复核证据无效');
  const exact = binding(revision);
  const gates = {
    gemini_review:{...exact,status:'completed',model:gemini.model,reviewed_frames:geminiFrameIds.length,unique_frame_ids:new Set(geminiFrameIds).size,receipt_set_sha256:sha256(canonical([...new Set(gemini.frames.map(row=>row.batch_receipt_sha256))])),observations_sha256:sha256(canonical(gemini.frames.map(row=>({frame_id:row.frame_id,observation_sha256:row.observation_sha256}))))},
    ocr_review:{...exact,status:'completed',frames_considered:ocrFrameIds.length,traceable_results:ocr.frame_checks.filter(row=>Number(row.text_count||0)>0).length,receipt_set_sha256:loaded.ocr.sha256,output_index_sha256:sha256(canonical(ocr.frame_checks.map(row=>({frame_id:row.frame_id,output_sha256:row.output_sha256})))),visual_fact_override:false},
    source_authority:{...exact,status:'completed',shots:source.shots.length,observed_frames:sourceFrames.length,ledger_snapshot_sha256:source.ledger_snapshot_sha256,role_card_snapshot_sha256:source.role_card_snapshot_sha256,story_snapshot_sha256:source.story_snapshot_sha256},
    downstream_stale:{...exact,status:'committed',step01_snapshot:stale.step01_snapshot,role_cards:stale.role_cards,story_authority:stale.story_authority,step02:stale.step02,step03:stale.step03,step04_created:false,provider_submitted:false,event_sha256:loaded.stale.sha256},
    candidate_acceptance:{...exact,status:'accepted',api:candidate.api,cos:candidate.cos,pwa:candidate.pwa,security:candidate.security,post_coding_review:'passed',video_range_206:true,unauthorized_rejected:true,cross_user_rejected:true,expired_rejected:true,secret_scan_passed:true,viewports:[...viewports],receipt_sha256:sha256(canonical({candidate:loaded.candidate.sha256,review:loaded.review.sha256}))}
  };
  return {schema_version:'niannian.step01.promotion_gate_receipt.v1',...exact,status:'assembled',source_receipts:Object.fromEntries(Object.entries(loaded).map(([key,item])=>[key,{sha256:item.sha256,bytes:item.bytes}])),gates,assembled_at:new Date().toISOString()};
}

async function recordReceipt({root,project,revisionId,kind,value}) {
  const contract=RECEIPTS[kind];
  if(!contract)throw fail('STEP01_PROMOTION_GATE_KIND_INVALID','晋级证据类型无效');
  const revision=await authority.readRevision({root,project,revisionId});
  assertBinding(value,revision,contract[1]);
  await atomicWrite(path.join(gateRoot(root,project.id,revisionId),contract[0]),value);
  return await readReceipt(path.join(gateRoot(root,project.id,revisionId),contract[0]));
}
async function recordEvidence({root,project,revisionId,relativePath,value}){const relative=String(relativePath||'').replace(/\\/g,'/');if(!relative.startsWith('evidence/')||relative.includes('..'))throw fail('STEP01_PROMOTION_GATE_POINTER_INVALID','晋级证据路径无效');const target=path.join(gateRoot(root,project.id,revisionId),...relative.split('/'));await atomicWrite(target,value);const evidence=await readReceipt(target);return {relative_path:relative,sha256:evidence.sha256,bytes:evidence.bytes};}

async function assembleAndMarkReady({root,project,revisionId}) {
  const lockPath=path.join(gateRoot(root,project.id,revisionId),'.assembler-lock');
  await fsp.mkdir(path.dirname(lockPath),{recursive:true});
  try { await fsp.mkdir(lockPath); }
  catch(error){if(error.code==='EEXIST')throw fail('STEP01_PROMOTION_GATE_ASSEMBLER_LOCKED','晋级证据正在归并');throw error;}
  try {
    const receipt=await assemble({root,project,revisionId});
    await atomicWrite(path.join(gateRoot(root,project.id,revisionId),'promotion-gate-receipt.json'),receipt);
    const revision=await authority.markReadyForPromotion({root,project,revisionId,gates:receipt.gates});
    return {receipt,revision};
  } finally { await fsp.rmdir(lockPath).catch(()=>{}); }
}

module.exports={RECEIPTS,gateRoot,recordEvidence,recordReceipt,assemble,assembleAndMarkReady,sha256,canonical};
