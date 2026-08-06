const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {createShotReviewService} = require('./bridge/niannian_shot_review');
const {createStep02Service,sha256,shotPlanJsonSchema} = require('./bridge/niannian_step02_runtime');
const {build:buildSkillBundle} = require('./scripts/build_step02_skill_bundle');

const EXPECTED = Object.freeze({
  projectId:'NN-20260715083045-8120F5',
  analysisRunId:'analysis-1-0dc5c5d751592e9fd0656a81',
  sourceSha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',
  sourceBytes:145897161,
  evidenceId:'NN-20260715083045-8120F5-EP001'
});

function response(value, model = 'gpt-5.6') { return {model,output_text:JSON.stringify(value)}; }

function planShot(shot, suffix = '') {
  return {
    shot_id:shot.shot_id,
    source_shot_ids:[shot.shot_id],
    target_people_identity:'Diego 与 Sofia 保持原片人物功能' + suffix,
    localized_setting:'墨西哥城的现代室内场景' + suffix,
    action:'保持原镜头动作节拍' + suffix,
    target_dialogue:'No voy a dejar que decidas por mí.' + suffix,
    chinese_back_translation:'我不会让你替我做决定。' + suffix,
    expression_intent:'克制但坚定地反抗' + suffix,
    cultural_replacements:['称谓和生活语境本地化'],
    continuity_requirements:['服装、关系与情绪承接上一镜头'],
    duration_fit:{estimated_speech_seconds:Math.min(3,Number(shot.duration_sec || 3)),fits:true,note:'适合原镜头时长'},
    structure_change:{type:'preserve',reason:'保持原片镜头功能与顺序'}
  };
}

class FakeResponsesClient {
  constructor() { this.calls = []; this.failNextConfirmQa = false; this.incompleteNextBatch = false; this.batchSchemaSizes = []; this.batchRequiredMinLengths = []; }
  async call(body) {
    this.calls.push(body.text.format.name);
    const name = body.text.format.name;
    if (name === 'step02_global_context_v1') return response({character_map:[{source_identity:'原片男女主',localized_identity:'Diego 与 Sofia',function:'保持核心冲突双方'}],continuity_rules:['人物关系与情绪逐镜头连续'],causality:['冲突推动反转'],localization_principles:['使用自然墨西哥西班牙语']});
    if (name === 'step02_shot_batch_v1') {
      const payload = JSON.parse(body.input[0].content[0].text);
      this.batchSchemaSizes.push([body.text.format.schema.properties.shots.minItems,body.text.format.schema.properties.shots.maxItems]);
      const shotProperties = body.text.format.schema.properties.shots.items.properties;
      this.batchRequiredMinLengths.push([shotProperties.target_people_identity.minLength,shotProperties.localized_setting.minLength,shotProperties.action.minLength,shotProperties.expression_intent.minLength,shotProperties.duration_fit.properties.note.minLength,shotProperties.structure_change.properties.reason.minLength]);
      if (this.incompleteNextBatch) {
        this.incompleteNextBatch = false;
        return response({shots:payload.shots.slice(0,-1).map(planShot)});
      }
      return response({shots:payload.shots.map(planShot)});
    }
    if (name === 'step02_shot_candidate_v1') {
      const payload = JSON.parse(body.input);
      return response(planShot({shot_id:payload.current.shot_id,duration_sec:payload.current.duration_sec},'（候选）'));
    }
    if (name === 'step02_confirm_qa_v1' && this.failNextConfirmQa) {
      this.failNextConfirmQa = false;
      return response({passed:false,all_source_shots_mapped:true,character_continuity_passed:true,plot_causality_passed:true,language_naturalness_passed:false,back_translation_consistent:true,duration_fit_passed:true,findings:[{shot_id:'S001',severity:'error',message:'对白不自然',suggestion:'重写当前镜头对白'}]});
    }
    if (name === 'step02_whole_episode_qa_v1' || name === 'step02_confirm_qa_v1') return response({passed:true,all_source_shots_mapped:true,character_continuity_passed:true,plot_causality_passed:true,language_naturalness_passed:true,back_translation_consistent:true,duration_fit_passed:true,findings:[]});
    if (name === 'niannian_step02_capability_probe_v1') return response({ok:true,wire_api:'responses',model:'gpt-5',image_input:true});
    throw new Error('unexpected_fake_model_call:' + name);
  }
}

async function waitForReady(service, context, variantId) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const variant = await service.getVariant({...context,variantId});
    if (variant.status === 'ready') return variant;
    if (variant.status === 'failed') throw new Error('variant_failed:' + JSON.stringify(variant.error));
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  throw new Error('variant_timeout');
}

async function run() {
  buildSkillBundle();
  const manifestPath = path.join(__dirname,'runtime','skill-bundles','shortdrama-localization-runtime-1','manifest.json');
  const firstManifestSha = sha256(await fsp.readFile(manifestPath));
  buildSkillBundle();
  assert.equal(sha256(await fsp.readFile(manifestPath)),firstManifestSha,'Skill Bundle must be reproducible');
  for (const name of ['step01-snapshot.schema.json','step02-shot.schema.json','step02-variant.schema.json','step02-qa.schema.json','step02-candidate.schema.json','step02-revision.schema.json','api-fixtures.json']) JSON.parse(await fsp.readFile(path.join(__dirname,'docs','step02-runtime-contract',name),'utf8'));
  const root = await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-step02-'));
  const evidenceRoot = path.join(__dirname,'data-local','step01-evidence',EXPECTED.projectId,'EP001');
  const overlayRoot = path.join(root,'shot-review-overlays');
  const shotReviewService = createShotReviewService({contractRoot:path.join(__dirname,'docs','shot-review-contract'),evidenceRoot,overlayRoot,expected:EXPECTED});
  const fake = new FakeResponsesClient();
  const service = createStep02Service({root:path.join(root,'step02'),evidenceRoot,bundleRoot:path.join(__dirname,'runtime','skill-bundles','shortdrama-localization-runtime-1'),shotReviewService,responsesClient:fake,expected:EXPECTED});
  const project = {id:EXPECTED.projectId,ownerId:'owner-145',analysis:{runId:EXPECTED.analysisRunId,sourceSha256:EXPECTED.sourceSha256,status:'evidence_ready'},source:{sha256:EXPECTED.sourceSha256,bytes:EXPECTED.sourceBytes}};
  const context = {ownerId:'owner-145',project};

  const review = await shotReviewService.getReview({ownerId:context.ownerId,project,analysisRunId:EXPECTED.analysisRunId});
  await assert.rejects(()=>service.confirmStep01({...context,analysisRunId:EXPECTED.analysisRunId,ifMatch:null,confirmedBy:'owner-145'}),error=>error.code==='PRECONDITION_REQUIRED');
  const first = await service.confirmStep01({...context,analysisRunId:EXPECTED.analysisRunId,ifMatch:review.etag,confirmedBy:'owner-145'});
  assert.equal(first.idempotent,false);
  assert.equal(first.snapshot.shot_review_revision,review.etag,'public snapshot must identify the exact confirmed ShotReviewModel revision');
  assert.deepEqual(first.snapshot.counts,{shots:37,frames:111,dialogue:13,ocr:34});
  const replay = await service.confirmStep01({...context,analysisRunId:EXPECTED.analysisRunId,ifMatch:review.etag,confirmedBy:'owner-145'});
  assert.equal(replay.idempotent,true);
  assert.equal(replay.snapshot.snapshot_sha256,first.snapshot.snapshot_sha256);
  assert.equal((await service.listVariants(context)).variants.length,0);
  assert.equal(fake.calls.length,0,'read and confirmation must not call the model');
  const capabilityProbe = await service.probe({includeImage:true});
  assert.equal(capabilityProbe.response_model,'gpt-5.6','capability probe must use the Responses transport model');
  assert.equal(capabilityProbe.model,'gpt-5','model-generated self-identification is not authoritative');

  const runtimeRoot = path.join(root,'step02');
  const ownerProjectRoot = path.join(runtimeRoot,'v1','owners',sha256(context.ownerId),'projects',EXPECTED.projectId);
  const snapshotPath = path.join(ownerProjectRoot,'step01-snapshots',first.snapshot.snapshot_id + '.json');
  const snapshotBytes = await fsp.readFile(snapshotPath);
  const tamperedSnapshot = JSON.parse(snapshotBytes.toString('utf8'));
  tamperedSnapshot.shots[0].action = 'tampered';
  await fsp.writeFile(snapshotPath,JSON.stringify(tamperedSnapshot,null,2)+'\n');
  await assert.rejects(()=>service.getCurrentSnapshot(context),error=>error.code==='STEP01_SNAPSHOT_TAMPERED');
  await fsp.writeFile(snapshotPath,snapshotBytes);
  assert.equal((await service.getCurrentSnapshot(context)).snapshot_sha256,first.snapshot.snapshot_sha256);

  const key = sha256([EXPECTED.projectId,first.snapshot.snapshot_sha256,'es-MX','whole_episode_v1'].join(':'));
  await assert.rejects(()=>service.createVariant({...context,locale:'es-MX',idempotencyKey:'wrong-key-value'}),error=>error.code==='IDEMPOTENCY_KEY_INVALID');
  fake.incompleteNextBatch = true;
  const created = await service.createVariant({...context,locale:'es-MX',idempotencyKey:key});
  assert.equal(created.idempotent,false);
  const variant = await waitForReady(service,context,created.variant_id);
  assert.equal(variant.shots.length,37);
  assert.equal(variant.progress.completed_shots,37);
  assert.equal(variant.qa.passed,true);
  assert.equal(new Set(variant.shots.flatMap(shot=>shot.source_shot_ids)).size,37);
  assert.ok(variant.shots.every(shot=>shot.source_shot_ids.length===1&&shot.source_shot_ids[0]===shot.shot_id));
  assert.equal(fake.calls.filter(name=>name==='step02_shot_batch_v1').length,11,'one incomplete batch must be retried exactly once across ten four-shot batches');
  assert.deepEqual(fake.batchSchemaSizes[0],[4,4],'batch schema must require the exact shot count');
  assert.equal(shotPlanJsonSchema().properties.source_shot_ids.maxItems,1,'each localized row must bind only its own source shot');
  assert.deepEqual(fake.batchRequiredMinLengths[0],[1,1,1,1,1,1],'strict schema must match all non-empty runtime text fields');
  const callsAfterReady = fake.calls.length;
  const variantReplay = await service.createVariant({...context,locale:'es-MX',idempotencyKey:key});
  assert.equal(variantReplay.idempotent,true);
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(fake.calls.length,callsAfterReady,'ready variant replay must not call the model');

  const shot = variant.shots[0];
  await assert.rejects(()=>service.createRevision({...context,variantId:variant.variant_id,shotId:shot.shot_id,ifMatch:variant.etag,body:{revision_id:'revision-invalid-map',base_revision:null,patch:{source_shot_ids:['S002']}}}),error=>error.code==='STEP02_SHOT_BINDING_INVALID');
  const revisionBodyA = {revision_id:'revision-test-0001',base_revision:null,patch:{source_shot_ids:[shot.shot_id],target_dialogue:'No permitiré que decidas por mí.',chinese_back_translation:'我不会允许你替我做决定。',review_status:'accepted'}};
  const revisionBodyB = {revision_id:'revision-test-0002',base_revision:null,patch:{target_dialogue:'No decidirás por mí.',chinese_back_translation:'你不能替我决定。',review_status:'accepted'}};
  await assert.rejects(()=>service.createRevision({...context,variantId:variant.variant_id,shotId:shot.shot_id,ifMatch:'"stale"',body:revisionBodyA}),error=>error.code==='STEP02_REVISION_CONFLICT');
  const concurrent = await Promise.allSettled([
    service.createRevision({...context,variantId:variant.variant_id,shotId:shot.shot_id,ifMatch:variant.etag,body:revisionBodyA}),
    service.createRevision({...context,variantId:variant.variant_id,shotId:shot.shot_id,ifMatch:variant.etag,body:revisionBodyB})
  ]);
  assert.equal(concurrent.filter(item=>item.status==='fulfilled').length,1,'only one concurrent revision may commit');
  assert.equal(concurrent.filter(item=>item.status==='rejected' && item.reason?.code==='STEP02_REVISION_CONFLICT').length,1,'stale concurrent revision must conflict');
  const revision = concurrent.find(item=>item.status==='fulfilled').value;
  const revisionBody = revision.revision.revision_id === revisionBodyA.revision_id ? revisionBodyA : revisionBodyB;
  assert.equal(revision.idempotent,false);
  assert.equal(revision.variant.shots[0].manual_locked,true);
  assert.equal(revision.variant.shots[0].target_dialogue,revisionBody.patch.target_dialogue);
  const revisionReplay = await service.createRevision({...context,variantId:variant.variant_id,shotId:shot.shot_id,ifMatch:revision.variant.etag,body:revisionBody});
  assert.equal(revisionReplay.idempotent,true);

  const candidate = await service.createCandidate({...context,variantId:variant.variant_id,shotId:shot.shot_id,ifMatch:revision.variant.etag,body:{request_id:'candidate-test-0001',intent:'保持原意换一种表达'}});
  assert.equal(candidate.candidate.requires_user_confirmation,true);
  assert.deepEqual(candidate.candidate.patch.source_shot_ids,[shot.shot_id]);
  const beforeAdopt = await service.getVariant({...context,variantId:variant.variant_id});
  assert.equal(beforeAdopt.shots[0].target_dialogue,revisionBody.patch.target_dialogue,'candidate must not overwrite active content');
  const adopted = await service.adoptCandidate({...context,variantId:variant.variant_id,shotId:shot.shot_id,ifMatch:beforeAdopt.etag,body:{candidate_id:candidate.candidate.candidate_id,revision_id:'revision-adopt-0002'}});
  assert.match(adopted.variant.shots[0].target_dialogue,/候选/);

  fake.failNextConfirmQa = true;
  await assert.rejects(()=>service.confirmVariant({...context,variantId:variant.variant_id,ifMatch:adopted.variant.etag}),error=>error.code==='STEP02_CONFIRM_QA_FAILED');
  const qaFailed = await service.getVariant({...context,variantId:variant.variant_id});
  assert.equal(qaFailed.status,'qa_failed');
  assert.equal(qaFailed.qa.passed,false);
  const confirmed = await service.confirmVariant({...context,variantId:variant.variant_id,ifMatch:qaFailed.etag});
  assert.equal(confirmed.status,'confirmed');
  assert.equal(confirmed.qa.passed,true);
  assert.ok(confirmed.confirmed_at);
  assert.equal(fake.calls.filter(name=>name==='step02_confirm_qa_v1').length,2,'failed confirmation and retry must each QA current revisions');
  const postConfirmRevision = await service.createRevision({...context,variantId:variant.variant_id,shotId:shot.shot_id,ifMatch:confirmed.etag,body:{revision_id:'revision-after-confirm-0001',base_revision:confirmed.shots[0].active_revision,patch:{manual_notes:'用户确认后微调一条镜头备注。',review_status:'needs_revision'}}});
  assert.equal(postConfirmRevision.variant.status,'ready','post-confirm micro edit must reopen the variant for review');
  assert.equal(postConfirmRevision.variant.confirmed_at,null);
  assert.equal(postConfirmRevision.variant.qa,null);
  assert.equal(postConfirmRevision.variant.shots[0].manual_notes,'用户确认后微调一条镜头备注。');

  const ptKey = sha256([EXPECTED.projectId,first.snapshot.snapshot_sha256,'pt-BR','whole_episode_v1'].join(':'));
  const ptCreated = await service.createVariant({...context,locale:'pt-BR',idempotencyKey:ptKey});
  const ptReady = await waitForReady(service,context,ptCreated.variant_id);
  const ptDirectory = path.join(ownerProjectRoot,'step02-variants',first.snapshot.snapshot_id,'pt-BR');
  const ptStatePath = path.join(ptDirectory,'state.json');
  const partialState = JSON.parse(await fsp.readFile(ptStatePath,'utf8'));
  partialState.status = 'generating';
  partialState.completed_batches = partialState.completed_batches.slice(0,2);
  partialState.qa = null;
  partialState.updated_at = new Date().toISOString();
  await fsp.writeFile(ptStatePath,JSON.stringify(partialState,null,2)+'\n');
  const recoveryFake = new FakeResponsesClient();
  const recoveryService = createStep02Service({root:runtimeRoot,evidenceRoot,bundleRoot:path.join(__dirname,'runtime','skill-bundles','shortdrama-localization-runtime-1'),shotReviewService,responsesClient:recoveryFake,expected:EXPECTED,autoRecover:false,batchSize:2});
  const recovered = await recoveryService.recoverPendingGenerations();
  assert.equal(recovered.resumed,1);
  const ptRecovered = await waitForReady(recoveryService,context,ptReady.variant_id);
  assert.equal(ptRecovered.shots.length,37);
  assert.equal(recoveryFake.calls.filter(name=>name==='step02_global_context_v1').length,0,'persisted global context must be reused after restart');
  assert.equal(recoveryFake.calls.filter(name=>name==='step02_shot_batch_v1').length,15,'restart must reuse eight completed shots and process only the remaining 29 at the new batch size');
  assert.equal(recoveryFake.calls.filter(name=>name==='step02_whole_episode_qa_v1').length,1);

  const diskText = (await Promise.all((await listFiles(path.join(root,'step02'))).map(file=>fsp.readFile(file,'utf8')))).join('\n');
  assert.doesNotMatch(diskText,/authorization|bearer|api[_-]?key|cookie/i);
  await fsp.rm(root,{recursive:true,force:true});
  process.stdout.write(JSON.stringify({ok:true,bundle_sha256:firstManifestSha,snapshot:first.snapshot.snapshot_id,variant:variant.variant_id,shots:37,model_calls:fake.calls.length,concurrent_revision_guard:true,snapshot_tamper_rejected:true,qa_failure_preserved:true,restart_resumed_batches:15,batch_size_change_reused_completed_shots:true,confirmed:true})+'\n');
}

async function listFiles(directory) {
  const entries = await fsp.readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.map(async entry=>entry.isDirectory()?listFiles(path.join(directory,entry.name)):[path.join(directory,entry.name)]))).flat();
}

run().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
