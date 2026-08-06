const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {createStep03Worker} = require('./bridge/niannian_step03_worker');

async function run(){
  const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'step03-worker-'));
  await fsp.writeFile(path.join(directory,'state.json'),JSON.stringify({tasks:[]}));
  const referencePath=path.join(directory,'character.png'),referenceDigest='c'.repeat(64);
  await fsp.writeFile(referencePath,pngFixture());
  const planningTask={task_id:'T03-PLAN-test',type:'planning',item_id:'S03-test',purpose:'visual_asset_planning',planning_input:{locale:'es-MX',shots:[],groups:[]},status:'created'};
  const referenceTask={task_id:'T03-REFERENCE',type:'character',artifact_sha256:referenceDigest,artifact_path:referencePath,status:'accepted'};
  const task={task_id:'T03-test',type:'character',item_id:'C001-candidate-1',purpose:'character_candidate',prompt:'[模板版本] character-authority-sheet-v3.4-ciwei-character-only-board。可信墨西哥角色。[人物签名] 锁定辨识度。',prompt_sha256:'a'.repeat(64),references:[{role:'previous_rejected_character_board_identity_and_layout',artifact_sha256s:[referenceDigest]}],aspect_ratio:'16:9',resolution:'4k',transaction_key:'b'.repeat(64),attempt:1,status:'created'};
  const tasks=[planningTask,referenceTask,task],updates=[],resolvedReferences=[],runtime={claimIndex:0,async claimNextTask(){const claimed=[planningTask,task][this.claimIndex++];return claimed?{directory,task:claimed}:null;},async loadWorkerState(){return{tasks};},async resolveTaskArtifact({task:source,verify}){resolvedReferences.push({taskId:source.task_id,verify});return{path:referencePath};},async updateWorkerTask({taskId,patch}){updates.push({taskId,...patch});Object.assign(tasks.find(row=>row.task_id===taskId),patch);return tasks.find(row=>row.task_id===taskId);}};
  const calls=[],provider={async submit(received,refs){calls.push(['submit',refs.length]);return{taskId:'rh-task-001',payload:{endpoint:'/image',referenceCount:refs.length}};},async query(id){calls.push(['query',id]);return{status:'completed',imageUrls:['https://media.example/result.png'],errorCategory:null};},async download(){calls.push(['download']);return{bytes:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(2048)]),mime:'image/png'};}};
  const qa={async review(){throw new Error('external QA must not be called for RH acceptance');}};
  const planningResult={characters:[],continuity_ledger:[],assets:[],group_annotations:[]},planner={async plan(input){calls.push(['plan',input.locale]);return planningResult;}};
  const worker=createStep03Worker({runtime,provider,qa,planner,evidenceRoot:directory,workerId:'test-worker',providerPreflight:async()=>({allowed:true})});
  let result=await worker.runOnce();
  assert.equal(result.processed,true);
  assert.equal(updates[0].status,'generating');
  assert.deepEqual(updates[1].planning_result,planningResult);
  result=await worker.runOnce();
  assert.equal(result.processed,true);
  const imageUpdates=updates.filter(row=>row.taskId==='T03-test');
  assert.equal(imageUpdates[0].status,'submitting');
  assert.equal(imageUpdates[1].status,'submitted','task id must be persisted immediately after submit');
  assert.equal(imageUpdates[1].provider_task_id,'rh-task-001');
  assert.equal(imageUpdates.at(-1).status,'accepted');
  assert.equal(imageUpdates.at(-1).qa.reviewer,'runninghub_artifact_download_verified');
  assert.equal(imageUpdates.at(-1).qa.user_review_required,true);
  assert.deepEqual(calls.map(row=>row[0]),['plan','submit','query','download']);
  assert.equal(calls[1][1],1,'worker must resolve artifact references from replayed task events');
  assert.deepEqual(resolvedReferences,[{taskId:'T03-REFERENCE',verify:true}]);
  assert.ok(imageUpdates.at(-2).artifact_sha256);
  assert.match(imageUpdates.at(-2).artifact_key,/^artifacts\/ART-[a-f0-9]{24}\.png$/);
  assert.equal(imageUpdates.at(-2).artifact_path,undefined,'new worker events must not persist absolute artifact paths');

  const authorityRelativePath='recovered_source_frames/S001_start.png',authorityBytes=pngFixture(),authorityDigest=crypto.createHash('sha256').update(authorityBytes).digest('hex');
  await fsp.mkdir(path.join(directory,'artifacts','recovered_source_frames'),{recursive:true});
  await fsp.writeFile(path.join(directory,'artifacts',...authorityRelativePath.split('/')),authorityBytes);
  await fsp.mkdir(path.join(directory,'artifacts','shotlevel_start_mid_end_frames'),{recursive:true});
  await fsp.writeFile(path.join(directory,'artifacts','shotlevel_start_mid_end_frames','legacy-start.png'),Buffer.from('legacy-static-frame-must-not-be-used'));
  await fsp.writeFile(path.join(directory,'artifacts','shotlevel_start_mid_end_manifest.json'),JSON.stringify([{shot_id:1,point:'start',file:'legacy-start.png'}]));
  const firstFrameTask={task_id:'T03-firstframe-authority',type:'firstframe',references:[{role:'source_composition',shot_id:'S001',relative_path:authorityRelativePath,sha256:authorityDigest,bytes:authorityBytes.length}]};
  assert.deepEqual(await worker.referenceFiles({directory,task:firstFrameTask}),[path.join(directory,'artifacts',...authorityRelativePath.split('/'))],'first-frame composition must use the declared source-authority frame, not the legacy static manifest');
  for(const invalidReference of [
    {...firstFrameTask.references[0],sha256:'0'.repeat(64)},
    {...firstFrameTask.references[0],bytes:authorityBytes.length+1},
    {...firstFrameTask.references[0],relative_path:'../recovered_source_frames/S001_start.png'}
  ])await assert.rejects(()=>worker.referenceFiles({directory,task:{...firstFrameTask,references:[invalidReference]}}),error=>error.code==='STEP03_SOURCE_AUTHORITY_FRAME_INVALID');

  const recoveryTask={...task,task_id:'T03-network-recovery',item_id:'C001-candidate-2',references:[],status:'generating',provider_task_id:'rh-task-existing'},recoveryUpdates=[],recoveryRuntime={claimed:false,async claimNextTask(){if(this.claimed)return null;this.claimed=true;return{directory,task:recoveryTask};},async loadWorkerState(){return{tasks:[recoveryTask]};},async updateWorkerTask({patch}){recoveryUpdates.push(patch);Object.assign(recoveryTask,patch);return recoveryTask;}},recoveryProvider={async submit(){throw new Error('must not submit');},async query(){const error=new Error('temporary query failure');error.code='RUNNINGHUB_NETWORK_UNCERTAIN';throw error;}};
  const recoveryWorker=createStep03Worker({runtime:recoveryRuntime,provider:recoveryProvider,qa,planner,evidenceRoot:directory,workerId:'recovery-worker',providerPreflight:async()=>({allowed:true})});
  await recoveryWorker.runOnce();
  assert.equal(recoveryUpdates.at(-1).status,'generating');
  assert.equal(recoveryUpdates.at(-1).error.code,'RUNNINGHUB_NETWORK_UNCERTAIN');

  const downloadRecoveryTask={...task,task_id:'T03-download-recovery',item_id:'C001-candidate-download-recovery',references:[],status:'submitted',provider_task_id:'rh-completed-output'},downloadRecoveryUpdates=[],downloadRecoveryCalls=[];
  const downloadRecoveryRuntime={claimed:false,async claimNextTask(){if(this.claimed)return null;this.claimed=true;return{directory,task:downloadRecoveryTask};},async loadWorkerState(){return{tasks:[downloadRecoveryTask]};},async updateWorkerTask({patch}){downloadRecoveryUpdates.push(patch);Object.assign(downloadRecoveryTask,patch);return downloadRecoveryTask;}};
  const downloadRecoveryProvider={async submit(){downloadRecoveryCalls.push('submit');throw new Error('must not submit');},async query(){downloadRecoveryCalls.push('query');return{status:'completed',imageUrls:['https://media.example/existing-output.png']};},async download(){downloadRecoveryCalls.push('download');const error=new Error('temporary download failure');error.code='RUNNINGHUB_DOWNLOAD_FAILED';throw error;}};
  const downloadRecoveryWorker=createStep03Worker({runtime:downloadRecoveryRuntime,provider:downloadRecoveryProvider,qa,planner,evidenceRoot:directory,workerId:'download-recovery-worker',providerPreflight:async()=>({allowed:true})});
  await downloadRecoveryWorker.runOnce();
  assert.equal(downloadRecoveryUpdates.at(-1).status,'submitted','download failure must retain the persisted provider task for reconciliation');
  assert.equal(downloadRecoveryUpdates.at(-1).error.code,'RUNNINGHUB_DOWNLOAD_FAILED');
  assert.deepEqual(downloadRecoveryCalls,['query','download'],'download recovery must never submit a duplicate provider task');

  const verifyTask={...task,task_id:'T03-download-verified',item_id:'C001-candidate-3',references:[],status:'created',provider_task_id:null,artifact_id:null,artifact_path:null,artifact_sha256:null,artifact_bytes:null,artifact_mime:null,qa:null,error:null},verifyUpdates=[],verifyCalls=[];
  const verifyRuntime={claimed:false,async claimNextTask(){if(this.claimed)return null;this.claimed=true;return{directory,task:verifyTask};},async loadWorkerState(){return{tasks:[verifyTask]};},async updateWorkerTask({patch}){verifyUpdates.push(patch);Object.assign(verifyTask,patch);return verifyTask;}};
  const verifyProvider={async submit(){verifyCalls.push('submit');return{taskId:'rh-download-verified',payload:{}};},async query(){verifyCalls.push('query');return{status:'completed',imageUrls:['https://media.example/download-verified.png']};},async download(){verifyCalls.push('download');return{bytes:pngFixture(),mime:'image/png'};}};
  const verifyWorker=createStep03Worker({runtime:verifyRuntime,provider:verifyProvider,qa,planner,evidenceRoot:directory,workerId:'download-verify-worker',providerPreflight:async()=>({allowed:true})});
  await verifyWorker.runOnce();
  assert.equal(verifyCalls.filter(value=>value==='submit').length,1);
  assert.equal(verifyUpdates.at(-1).status,'accepted');
  assert.equal(verifyUpdates.at(-1).qa.reviewer,'runninghub_artifact_download_verified');
  assert.equal(verifyUpdates.at(-1).qa.checks.artifact_bytes_verified,true);
  assert.ok(!verifyUpdates.some(row=>row.error?.code==='STEP03_QA_RETRYING'));

  const legacyTask={...task,task_id:'T03-legacy-template',item_id:'C001-candidate-legacy',prompt:'旧版人物图提示词',provider_task_id:null,status:'created'},legacyUpdates=[],legacyCalls=[];
  const legacyRuntime={claimed:false,async claimNextTask(){if(this.claimed)return null;this.claimed=true;return{directory,task:legacyTask};},async updateWorkerTask({patch}){legacyUpdates.push(patch);Object.assign(legacyTask,patch);return legacyTask;}};
  const legacyProvider={async submit(){legacyCalls.push('submit');throw new Error('must not submit');}};
  const legacyWorker=createStep03Worker({runtime:legacyRuntime,provider:legacyProvider,qa,planner,evidenceRoot:directory,workerId:'legacy-template-worker',providerPreflight:async()=>({allowed:true})});
  await legacyWorker.runOnce();
  assert.equal(legacyUpdates.at(-1).status,'failed');
  assert.equal(legacyUpdates.at(-1).error.code,'STEP03_CHARACTER_TEMPLATE_SUPERSEDED');
  assert.equal(legacyCalls.length,0,'old unsubmitted character tasks must not reach RunningHub');
  const blockedTask={...task,task_id:'T03-localization-preflight-blocked',references:[],status:'created',provider_task_id:null},blockedUpdates=[],blockedCalls=[],blockedRuntime={claimed:false,async claimNextTask(){if(this.claimed)return null;this.claimed=true;return{directory,task:blockedTask};},async updateWorkerTask({patch}){blockedUpdates.push(patch);Object.assign(blockedTask,patch);return blockedTask;}},blockedProvider={async submit(){blockedCalls.push('submit');throw new Error('must not submit');}};
  await createStep03Worker({runtime:blockedRuntime,provider:blockedProvider,qa,planner,evidenceRoot:directory,workerId:'localization-preflight-blocked'}).runOnce();
  assert.equal(blockedUpdates.at(-1).error.code,'LOCALIZATION_PROVIDER_PREFLIGHT_REQUIRED');assert.equal(blockedCalls.length,0,'missing localization provider preflight must block submit');
  await fsp.rm(directory,{recursive:true,force:true});
  process.stdout.write(JSON.stringify({ok:true,planning_worker:true,replayed_reference_resolution:true,task_id_persisted_before_poll:true,no_duplicate_submit:calls.filter(row=>row[0]==='submit').length===1,query_network_recovery:true,download_network_recovery:true,runninghub_download_verified:true,external_qa_not_called:true,legacy_template_submit_blocked:true,localization_provider_preflight_fail_closed:true})+'\n');
}
function pngFixture(){return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(2048)]);}
run().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
