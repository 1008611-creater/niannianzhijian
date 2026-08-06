const assert = require('assert');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const authority = require('./bridge/niannian_step01_authority_revision');

function gates(revision) {
  const binding = {revision_id:revision.revision_id,source_sha256:revision.source_sha256,full_evidence_index_sha256:revision.full_evidence_index_sha256};
  return {
    gemini_review:{...binding,status:'completed',model:'gemini-3.1-pro-preview',reviewed_frames:254,unique_frame_ids:254,receipt_set_sha256:'d'.repeat(64),observations_sha256:'e'.repeat(64)},
    ocr_review:{...binding,status:'completed',frames_considered:254,traceable_results:41,receipt_set_sha256:'1'.repeat(64),output_index_sha256:'2'.repeat(64),visual_fact_override:false},
    source_authority:{...binding,status:'completed',shots:37,observed_frames:254,ledger_snapshot_sha256:'3'.repeat(64),role_card_snapshot_sha256:'4'.repeat(64),story_snapshot_sha256:'5'.repeat(64)},
    downstream_stale:{...binding,status:'committed',step01_snapshot:'superseded',role_cards:'superseded',story_authority:'superseded',step02:'stale',step03:'stale',step04_created:false,provider_submitted:false,event_sha256:'6'.repeat(64)},
    candidate_acceptance:{...binding,status:'accepted',api:'passed',cos:'passed',pwa:'passed',security:'passed',post_coding_review:'passed',video_range_206:true,unauthorized_rejected:true,cross_user_rejected:true,expired_rejected:true,secret_scan_passed:true,viewports:['1440x900','1366x768','390x844'],receipt_sha256:'7'.repeat(64)}
  };
}

async function create(root, project, revisionId) {
  return authority.createRevision({root,project,revisionId,sourceRevision:1,manifestSha256:'b'.repeat(64),fullEvidenceIndexSha256:'c'.repeat(64),evidenceRootRelative:'evidence',counts:{frames:254,shots:37,triad_frames:111}});
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step01-authority-'));
  const project = {id:'NN-20260715083045-8120F5', source:{sha256:'a'.repeat(64),bytes:145897161}};
  const revisionId = 'analysis-20260727-full-evidence-r1';
  const created = await create(root, project, revisionId);
  assert.equal(created.status, 'verified_evidence_pending_visual_review');
  await assert.rejects(() => authority.markReadyForPromotion({root,project,revisionId,gates:{gemini_review:gates(created).gemini_review}}), error => error.code === 'STEP01_AUTHORITY_PROMOTION_GATES_INCOMPLETE');
  for (const mutate of [
    value=>{value.gemini_review.reviewed_frames=253;},
    value=>{value.ocr_review.receipt_set_sha256='';},
    value=>{value.source_authority.shots=36;},
    value=>{value.downstream_stale.step03='ready';},
    value=>{value.candidate_acceptance.viewports=['1440x900','1366x768'];}
  ]) { const value=gates(created); mutate(value); await assert.rejects(()=>authority.markReadyForPromotion({root,project,revisionId,gates:value}),error=>error.code==='STEP01_AUTHORITY_PROMOTION_GATES_INCOMPLETE'); }
  let stored = await authority.readRevision({root,project,revisionId});
  assert.equal(stored.status, 'verified_evidence_pending_visual_review');
  const ready = await authority.markReadyForPromotion({root,project,revisionId,gates:gates(created)});
  assert.equal(ready.status, 'ready_for_promotion');
  await assert.rejects(() => authority.promote({root,project,revisionId,ifMatch:'*'}), error => error.code === 'STEP01_CURRENT_AUTHORITY_ETAG_CONFLICT');
  await assert.rejects(() => authority.promote({root,project,revisionId,ifMatch:'W/'+authority.etag(null)}), error => error.code === 'STEP01_CURRENT_AUTHORITY_ETAG_CONFLICT');
  await assert.rejects(() => authority.promote({root,project,revisionId,ifMatch:authority.etag(null),atomicWriter:async()=>{ throw new Error('injected_pointer_write_failure'); }}), /injected_pointer_write_failure/);
  stored = await authority.readRevision({root,project,revisionId});
  assert.equal(stored.status, 'ready_for_promotion');
  await assert.rejects(() => fsp.stat(authority.pointerPath(root,project.id)), error => error.code === 'ENOENT');
  const pointer = await authority.promote({root,project,revisionId,ifMatch:authority.etag(null)});
  assert.equal(pointer.revision_id, revisionId);
  assert.equal(pointer.commit_state, 'committed');
  assert.equal(pointer.version, 1);
  const current = await authority.current({root,project});
  assert.equal(current.kind, 'revision');
  assert.equal(current.revision.status, 'accepted');
  assert.equal((await authority.readRevision({root,project,revisionId})).status, 'ready_for_promotion');
  const revision2Id = 'analysis-20260727-full-evidence-r2';
  const created2 = await create(root,project,revision2Id);
  await authority.markReadyForPromotion({root,project,revisionId:revision2Id,gates:gates(created2)});
  const pointer2 = await authority.promote({root,project,revisionId:revision2Id,ifMatch:authority.etag(pointer)});
  assert.equal(pointer2.version, 2);
  assert.equal(pointer2.rollback_target.revision_id,revisionId);assert.equal(pointer2.rollback_target.pointer_sha256,pointer.pointer_sha256);assert.equal(pointer2.rollback_target.version,1);
  await assert.rejects(() => authority.promote({root,project,revisionId,ifMatch:authority.etag(pointer)}), error => error.code === 'STEP01_CURRENT_AUTHORITY_ETAG_CONFLICT');
  const raceIds=['analysis-20260727-full-evidence-r3','analysis-20260727-full-evidence-r4'];
  for (const id of raceIds) { const candidate=await create(root,project,id); await authority.markReadyForPromotion({root,project,revisionId:id,gates:gates(candidate)}); }
  const race=await Promise.allSettled(raceIds.map(id=>authority.promote({root,project,revisionId:id,ifMatch:authority.etag(pointer2)})));
  assert.equal(race.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(race.filter(item=>item.status==='rejected').length,1);
  const racePointer=JSON.parse(await fsp.readFile(authority.pointerPath(root,project.id),'utf8'));
  assert.equal(racePointer.version,3);
  assert.ok(raceIds.includes(racePointer.revision_id));
  await assert.rejects(()=>authority.rollback({root,project,ifMatch:'W/'+authority.etag(racePointer)}),error=>error.code==='STEP01_CURRENT_AUTHORITY_ETAG_CONFLICT');
  await assert.rejects(()=>authority.rollback({root,project,ifMatch:authority.etag(racePointer),atomicWriter:async()=>{throw new Error('injected_rollback_failure');}}),/injected_rollback_failure/);
  const afterRollbackFailure=JSON.parse(await fsp.readFile(authority.pointerPath(root,project.id),'utf8'));assert.equal(afterRollbackFailure.pointer_sha256,racePointer.pointer_sha256);
  const rolled=await authority.rollback({root,project,ifMatch:authority.etag(racePointer)});assert.equal(rolled.revision_id,pointer2.revision_id);assert.equal(rolled.version,4);assert.equal(rolled.forward_recovery_target.revision_id,racePointer.revision_id);
  const rolledCurrent=await authority.current({root,project});assert.equal(rolledCurrent.revision_id,pointer2.revision_id);
  await assert.rejects(()=>authority.rollback({root,project,ifMatch:authority.etag(racePointer)}),error=>error.code==='STEP01_CURRENT_AUTHORITY_ETAG_CONFLICT');
  await fsp.rm(root, {recursive:true,force:true});
  process.stdout.write(JSON.stringify({ok:true,authority_revision:true,promotion_gate:true,strong_etag:true,atomic_failure_injection:true,rollback_target:true}) + '\n');
}

main().catch(error => { process.stderr.write((error.stack || error.message) + '\n'); process.exitCode = 1; });
