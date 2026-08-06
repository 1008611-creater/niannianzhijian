'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const clean=require('./bridge/niannian_step02_clean_handoff');
const fixture=require('./tests/fixtures/step02_clean_handoff_fixture');

function rejectsCode(action,code){assert.throws(action,caught=>caught.code===code,code);}
async function rejectsCodeAsync(action,code){await assert.rejects(action,caught=>caught.code===code,code);}
function context(authority){return {currentAuthority:authority.binding,ledgerShots:authority.ledger.shots,evidenceWindows:authority.evidenceWindows};}
function validate(candidate,authority){return clean.validateCleanHandoff(candidate,context(authority));}
function mutate(candidate,fn){const copy=structuredClone(candidate);fn(copy);return copy;}

async function main(){
  const {candidate,authority}=fixture.candidateFixture();
  assert.equal(validate(candidate,authority),true);
  assert.equal(candidate.sourceRows.length,37);
  assert.equal(authority.fullEvidenceIndex.observations.length,254);
  assert.equal(authority.ledger.projection_frames.length,111);

  const tampered=structuredClone(authority.fullEvidenceIndexEvidence);tampered.value.observations[0].visual_fact='篡改';
  rejectsCode(()=>clean.resolveAcceptedAuthority({pointer:authority.pointerEvidence,revision:authority.revisionEvidence,ledger:authority.ledgerEvidence,fullEvidenceIndex:tampered,expectedRevisionId:fixture.REVISION_ID}),'STEP02_AUTHORITY_ARTIFACT_TAMPERED');
  const staleIndex=structuredClone(authority.fullEvidenceIndex);staleIndex.observations[0].visual_fact='内容变化但语义摘要未更新';
  rejectsCode(()=>clean.resolveAcceptedAuthority({pointer:authority.pointerEvidence,revision:authority.revisionEvidence,ledger:authority.ledgerEvidence,fullEvidenceIndex:clean.artifactEnvelope(staleIndex,'fixture/authority/full-evidence-index.json'),expectedRevisionId:fixture.REVISION_ID}),'STEP01_AUTHORITY_BINDING_MISMATCH');
  const staleLedger=structuredClone(authority.ledger);staleLedger.shots[0].end_sec=2.4;
  rejectsCode(()=>clean.resolveAcceptedAuthority({pointer:authority.pointerEvidence,revision:authority.revisionEvidence,ledger:clean.artifactEnvelope(staleLedger,'fixture/authority/source-ledger.json'),fullEvidenceIndex:authority.fullEvidenceIndexEvidence,expectedRevisionId:fixture.REVISION_ID}),'STEP01_LEDGER_BINDING_MISMATCH');
  const projectionRemoved=structuredClone(authority.ledger);projectionRemoved.projection_frames.pop();
  const ledgerCore={...projectionRemoved};delete ledgerCore.snapshot_sha256;projectionRemoved.snapshot_sha256=clean.sha256(clean.canonical(ledgerCore));
  const revision=structuredClone(authority.revision);revision.ledger_snapshot_sha256=projectionRemoved.snapshot_sha256;
  const pointerCore={...authority.pointer,ledger_snapshot_sha256:undefined};delete pointerCore.pointer_sha256;delete pointerCore.ledger_snapshot_sha256;
  // The current pointer does not carry the ledger digest; only revision and ledger need coherent replacement.
  rejectsCode(()=>clean.resolveAcceptedAuthority({pointer:authority.pointerEvidence,revision:clean.artifactEnvelope(revision,'fixture/authority/revision.json'),ledger:clean.artifactEnvelope(projectionRemoved,'fixture/authority/source-ledger.json'),fullEvidenceIndex:authority.fullEvidenceIndexEvidence,expectedRevisionId:fixture.REVISION_ID}),'STEP01_PROJECTION_COVERAGE_INVALID');
  assert.equal(authority.ledger.projection_frames.length,111);
  const noProjection=structuredClone(candidate);noProjection.authority_binding.counts.projection_frames=110;
  rejectsCode(()=>validate(noProjection,authority),'STEP01_OBSERVATION_COVERAGE_INCOMPLETE');
  const semanticBefore=clean.semanticSha(candidate);const displayOnly=structuredClone(authority.ledger.projection_frames);displayOnly.pop();assert.equal(clean.semanticSha(candidate),semanticBefore);

  const node=clean.createNodeContract({authorityResolution:authority.resolution,candidate});
  assert.equal(Object.keys(node.exact_paths_and_sha256).length,4);
  for(const value of Object.values(node.exact_paths_and_sha256)){assert.ok(value.exact_path);assert.match(value.sha256,/^[a-f0-9]{64}$/);}

  for(const field of ['test_only','fixture_evidence','metrics'])rejectsCode(()=>validate(mutate(candidate,value=>delete value[field]),authority),'STEP02_SCHEMA_INVALID');
  rejectsCode(()=>validate(mutate(candidate,value=>value.sourceRows[0].extra='x'),authority),'STEP02_SOURCE_ROW_INVALID');
  rejectsCode(()=>validate(mutate(candidate,value=>delete value.sourceRows[0].time_label),authority),'STEP02_SOURCE_ROW_INVALID');
  rejectsCode(()=>validate(mutate(candidate,value=>value.sourceRows[0].time_label=''),authority),'STEP02_SOURCE_ROW_INVALID');
  rejectsCode(()=>validate(mutate(candidate,value=>value.textEvidence[0].text_type='face'),authority),'STEP02_TEXT_EVIDENCE_INVALID');
  rejectsCode(()=>validate(mutate(candidate,value=>delete value.hardSceneCandidates[0].source_timecode),authority),'STEP02_HARD_SCENE_INVALID');
  rejectsCode(()=>validate(mutate(candidate,value=>delete value.dialogueBindings[0].source_text),authority),'STEP02_DIALOGUE_BINDING_INVALID');
  rejectsCode(()=>validate(mutate(candidate,value=>value.sourceRows[1].dialogue_ids.push('D001')),authority),'STEP02_DIALOGUE_REFERENCE_INVALID');
  rejectsCode(()=>clean.validateCleanHandoff(candidate,{currentAuthority:authority.binding,ledgerShots:authority.ledger.shots,evidenceWindows:[]}),'STEP02_EVIDENCE_WINDOW_INVENTORY_REQUIRED');
  const missingWindow=authority.evidenceWindows.filter(item=>item.dialogue_id!=='D003');
  rejectsCode(()=>clean.validateCleanHandoff(candidate,{currentAuthority:authority.binding,ledgerShots:authority.ledger.shots,evidenceWindows:missingWindow}),'STEP02_DIALOGUE_WINDOW_MISSING');
  const shortUnconfirmed=structuredClone(authority.evidenceWindows);delete shortUnconfirmed.find(item=>item.dialogue_id==='D003').short_candidate_confirmed;
  rejectsCode(()=>clean.validateCleanHandoff(candidate,{currentAuthority:authority.binding,ledgerShots:authority.ledger.shots,evidenceWindows:shortUnconfirmed}),'STEP02_SHORT_DIALOGUE_EVIDENCE_REQUIRED');
  const centered=mutate(candidate,value=>value.dialogueBindings[0].evidence_basis=['centered_subject']);
  rejectsCode(()=>validate(centered,authority),'STEP02_DIALOGUE_SPEAKER_UNRESOLVED');
  rejectsCode(()=>validate(mutate(candidate,value=>value.sourceRows[0].source_start_sec=.1),authority),'STEP02_SOURCE_TIME_AXIS_MISMATCH');
  rejectsCode(()=>validate(mutate(candidate,value=>value.sourceRows[0].visual_composition='按原片看抽帧'),authority),'STEP02_FORBIDDEN_CLEAN_VALUE');
  rejectsCode(()=>validate(mutate(candidate,value=>value.dialogueBindings[0].raw_asr={text:'x'}),authority),'STEP02_FORBIDDEN_CLEAN_FIELD');
  rejectsCode(()=>validate(mutate(candidate,value=>value.effects.spend_requested=true),authority),'STEP02_SIDE_EFFECT_FORBIDDEN');
  rejectsCode(()=>validate(mutate(candidate,value=>value.dialogueBindings.push({...value.dialogueBindings[0],dialogue_id:'D999',onset_shot:'S002',best_evidence_shot:'S002'})),authority),'STEP02_DIALOGUE_DUPLICATED');
  rejectsCode(()=>validate(mutate(candidate,value=>value.assetCandidates[0].visual_identity='沈清宁穿红裙'),authority),'STEP02_UNPROVEN_CANONICAL_NAME');
  rejectsCode(()=>validate(mutate(candidate,value=>value.textEvidence[0].dialogue_id='D001'),authority),'STEP02_SILENT_TEXT_DIALOGUE_FORBIDDEN');
  const readout=mutate(candidate,value=>{value.textEvidence[0].terminal_state='audible_readout';value.textEvidence[0].dialogue_id='D001';});assert.equal(validate(readout,authority),true);

  assert.equal(clean.paddleModelFor('subtitle'),'PP-OCRv6');assert.equal(clean.paddleModelFor('document'),'PaddleOCR-VL-1.6');
  assert.equal(clean.preparePaddleEvidence({textType:'document',runtimeTokenPresent:false}).local_fallback,false);
  assert.equal(clean.classifyHardScene({readable_screen_or_document:true}),'readable_screen_evidence');assert.equal(clean.classifyHardScene({ordinary_closeup:true}),null);
  rejectsCode(()=>clean.classifyEvidenceWindow({window_id:'W',source_start_sec:.1,source_end_sec:.2,classification:'hearing_unclear',critical:true,evidence_basis:['listening']}),'DIALOGUE_TEXT_UNRESOLVED');
  const fakeBlockedWindows=[...structuredClone(authority.evidenceWindows),{window_id:'W006',source_start_sec:80,source_end_sec:80.4,classification:'hearing_unclear',critical:true,blocker_id:'DOES-NOT-EXIST',evidence_basis:['dense_review']}];
  rejectsCode(()=>clean.validateCleanHandoff(candidate,{currentAuthority:authority.binding,ledgerShots:authority.ledger.shots,evidenceWindows:fakeBlockedWindows}),'DIALOGUE_TEXT_UNRESOLVED');

  const cacheBase={project_id:fixture.PROJECT_ID,source_sha256:authority.binding.source_sha256,source_bytes:authority.binding.source_bytes,authority_revision_id:fixture.REVISION_ID,authority_pointer_sha256:authority.binding.authority_pointer_sha256,strict_manifest_sha256:authority.binding.strict_manifest_sha256,full_evidence_index_sha256:authority.binding.full_evidence_index_sha256,ledger_snapshot_sha256:authority.binding.ledger_snapshot_sha256,service:'paddle',model_version:'v6',purpose:'subtitle',window_or_region_id:'W001',schema_version:'v1',compiler_version:'c1'};
  const cacheId=clean.cacheIdentity(cacheBase);for(const [key,value] of [['service','mimo'],['model_version','v7'],['purpose','screen'],['window_or_region_id','W002'],['compiler_version','c2']])assert.notEqual(clean.cacheIdentity({...cacheBase,[key]:value}),cacheId,key);
  const changedKeys=['source_sha256','source_bytes','source_revision','authority_pointer_sha256','strict_manifest_sha256','full_evidence_index_sha256','ledger_snapshot_sha256'];
  for(const key of changedKeys){const current={...authority.binding,[key]:key==='source_bytes'?authority.binding.source_bytes+1:key==='source_revision'?authority.binding.source_revision+1:fixture.hex('9')};const stale=clean.transitionDependentState({status:'candidate',downstream_consumable:false,authority_binding:authority.binding},current);assert.equal(stale.status,'stale');assert.ok(stale.invalidated_by.includes(key));}
  const superseded=clean.transitionDependentState({status:'accepted',downstream_consumable:true,authority_binding:authority.binding},{...authority.binding,ledger_snapshot_sha256:fixture.hex('8')});assert.equal(superseded.status,'superseded');assert.equal(superseded.downstream_consumable,false);

  const request={project_id:fixture.PROJECT_ID,analysis_run_id:fixture.REVISION_ID,source_sha256:authority.binding.source_sha256,authority_revision_id:fixture.REVISION_ID,ledger_snapshot_sha256:authority.binding.ledger_snapshot_sha256,step02_run_id:'S02RUN-001',service:'paddle_ocr',model_version:'PP-OCRv6',purpose:'subtitle_qa',window_or_region_id:'W001'};
  let receipts=clean.appendReceiptAttempt([],request,{terminal_state:'done_text',charge_state:'charged',created_at:'2026-07-27T01:00:00Z',result_evidence_sha256:fixture.hex('7')});
  receipts=clean.appendReceiptAttempt(receipts,request,{terminal_state:'verified',charge_state:'reused',reused:true,created_at:'2026-07-27T01:01:00Z'});
  assert.deepEqual(receipts.map(item=>item.attempt_number),[1,2]);assert.equal(receipts[0].terminal_state,'done_text');assert.equal(receipts[1].reused,true);
  assert.equal(clean.reconcileReceipt(receipts,request).submit,false);
  assert.deepEqual(clean.dependencyClosure('W001',{W001:[],W002:['W001'],W003:[],W004:['W002']}),['W001','W002','W004']);

  const before=structuredClone(candidate);const revisionEvent={revision_id:'UR-1',accepted_evidence:true,actor:'user',reason:'姓名校对',base_authority_revision_id:authority.binding.authority_revision_id,base_ledger_snapshot_sha256:authority.binding.ledger_snapshot_sha256,created_at:'2026-07-27T02:00:00Z',changes:[{entity_type:'dialogue',entity_id:'D001',field:'source_speaker',before:'红裙女主',after:'红裙女性'}]};
  const revised=clean.applyAcceptedUserRevision(candidate,revisionEvent);assert.equal(revised.candidate.dialogueBindings[0].source_speaker,'红裙女性');assert.equal(revised.candidate.textEvidence[0].source_text,before.textEvidence[0].source_text);assert.deepEqual(revised.event.affected.dialogues,['D001']);assert.equal(revised.event.actor,'user');
  rejectsCode(()=>clean.applyAcceptedUserRevision(candidate,{...revisionEvent,accepted_evidence:false}),'STEP02_USER_REVISION_INVALID');
  rejectsCode(()=>clean.applyAcceptedUserRevision(candidate,{...revisionEvent,base_ledger_snapshot_sha256:fixture.hex('0')}),'STEP02_USER_REVISION_INVALID');

  const events=[{type:'trusted_timeline_row',at:'2026-07-27T01:00:00.000Z'},{type:'ocr_terminal',reused:true},{type:'ocr_terminal',reused:false},{type:'service_submitted',receipt_key:'A'},{type:'service_submitted',receipt_key:'A'},{type:'speaker_binding_reviewed'},{type:'speaker_binding_changed'},{type:'user_revision_applied'},{type:'recovery_started',at:'2026-07-27T01:01:00.000Z'},{type:'recovery_completed',at:'2026-07-27T01:01:10.000Z'}];
  const metrics=clean.reduceMetrics(events);assert.deepEqual(metrics.ocr_reuse_rate,{state:'measured',value:.5});assert.equal(metrics.duplicate_submissions.value,1);assert.equal(metrics.recovery_seconds.value,10);assert.equal(metrics.final_handoff_at.state,'missing');
  assert.equal(clean.reduceMetrics([],{ocr:false}).ocr_reuse_rate.state,'not_applicable');

  const acceptanceArgs={candidate,currentAuthority:authority.binding,ledgerShots:authority.ledger.shots,evidenceWindows:authority.evidenceWindows};
  rejectsCode(()=>clean.planAcceptance({...acceptanceArgs,ifMatch:null}),'STEP02_PRECONDITION_REQUIRED');rejectsCode(()=>clean.planAcceptance({...acceptanceArgs,ifMatch:'"stale"'}),'STEP02_CAS_CONFLICT');rejectsCode(()=>clean.planAcceptance({...acceptanceArgs,ifMatch:clean.etag(candidate)}),'STEP02_FIXTURE_CANDIDATE_NOT_ACCEPTABLE');
  assert.equal(clean.planAcceptance({...acceptanceArgs,ifMatch:clean.etag(candidate),dryRun:true}).downstream_consumable,false);
  const projection=clean.buildWebsiteProjection(candidate);assert.equal(projection.source_rows.length,37);assert.deepEqual(projection.summary,{dialogues:3,visible_text:1,hard_scenes:1});for(const forbidden of ['pointer_sha256','ledger_snapshot_sha256','receipt_key','provider_job','exact_path'])assert.ok(!JSON.stringify(projection).includes(forbidden));

  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'step02-fixture-'));
  try{
    const statePath=path.join(root,'cas','state.json'),initial={revision:1},next={revision:2};
    const emptySnapshot=await clean.fixtureStoreSnapshot(root);
    await rejectsCodeAsync(()=>clean.casPersistFixtureJson({filePath:statePath,currentValue:initial,nextValue:next,ifMatch:null}),'STEP02_PRECONDITION_REQUIRED');assert.deepEqual(await clean.fixtureStoreSnapshot(root),emptySnapshot);
    await rejectsCodeAsync(()=>clean.casPersistFixtureJson({filePath:statePath,currentValue:initial,nextValue:next,ifMatch:'"stale"'}),'STEP02_CAS_CONFLICT');assert.deepEqual(await clean.fixtureStoreSnapshot(root),emptySnapshot);
    const casEtag='"fixture-state-'+clean.sha256(clean.canonical(initial))+'"';await clean.casPersistFixtureJson({filePath:statePath,currentValue:initial,nextValue:next,ifMatch:casEtag});assert.deepEqual(JSON.parse(await fsp.readFile(statePath,'utf8')),next);
    const commitRoot=path.join(root,'acceptance');
    await rejectsCodeAsync(()=>clean.commitFixtureAcceptance({...acceptanceArgs,root:commitRoot,ifMatch:clean.etag(candidate),crashAfterEvent:true}),'STEP02_FIXTURE_CRASH_AFTER_EVENT');assert.ok(fs.existsSync(path.join(commitRoot,'events.jsonl')));assert.equal(fs.existsSync(path.join(commitRoot,'current.json')),false);
    const replay=await clean.replayFixtureAcceptance({...acceptanceArgs,root:commitRoot});const firstHashes=(await clean.fixtureStoreSnapshot(replay.commit_root)).map(item=>[item.relative_path,item.sha256]);
    const second=await clean.commitFixtureAcceptance({...acceptanceArgs,root:commitRoot,ifMatch:clean.etag(candidate)});const secondHashes=(await clean.fixtureStoreSnapshot(second.commit_root)).map(item=>[item.relative_path,item.sha256]);
    assert.equal(second.commit_id,replay.commit_id);assert.deepEqual(secondHashes,firstHashes);
    for(const name of ['acceptance.json','reducer.json','artifact-ledger.json','checkpoint.json','website-projection.json'])assert.ok(fs.existsSync(path.join(second.commit_root,name)),name);
    assert.equal(second.acceptance.fixture_evidence,true);assert.equal(second.acceptance.downstream_consumable,false);assert.equal(second.acceptance.step04_ready,false);assert.equal(second.ledger.status,'simulation_only');
    const changedAuthority={...authority.binding,source_revision:authority.binding.source_revision+1};const authorityCore={...changedAuthority};delete authorityCore.binding_sha256;changedAuthority.binding_sha256=clean.sha256(clean.canonical(authorityCore));
    const changedCandidate=structuredClone(candidate);changedCandidate.authority_binding=changedAuthority;
    const changedCommit=await clean.commitFixtureAcceptance({root:commitRoot,candidate:changedCandidate,currentAuthority:changedAuthority,ledgerShots:authority.ledger.shots,evidenceWindows:authority.evidenceWindows,ifMatch:clean.etag(changedCandidate)});
    assert.notEqual(changedCommit.commit_id,second.commit_id);assert.equal(changedCommit.acceptance.authority_binding.binding_sha256,changedAuthority.binding_sha256);assert.equal(JSON.parse(await fsp.readFile(path.join(changedCommit.commit_root,'acceptance.json'),'utf8')).authority_binding.binding_sha256,changedAuthority.binding_sha256);
  }finally{await fsp.rm(root,{recursive:true,force:true});}

  rejectsCode(()=>clean.step04Guard({acceptance:null,currentAuthority:authority.binding,requiredAcceptanceSha256:fixture.hex('6')}),'STEP02_REDUCER_ACCEPTANCE_REQUIRED');
  process.stdout.write(JSON.stringify({ok:true,level:'phase_a_structural',verified:['strict schema and authority artifact binding','254 observations / 37 shots / 111 projection separation','complete evidence-window inventory','CAS and deterministic simulation-only replay','receipt/revision/metrics lifecycle','sanitized website projection'],not_executed:['provider network','SSH','deployment','promotion','production acceptance','Step04/media generation']})+'\n');
}

main().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
