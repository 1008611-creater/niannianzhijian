'use strict';
const assert=require('assert/strict');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const {createStep03Service,canonical,sha256}=require('./bridge/niannian_step03_runtime');

const OWNER='owner-canonical-runtime';
const EXPECTED={projectId:'NN-CANONICAL-RUNTIME',analysisRunId:'authority-current',sourceSha256:'a'.repeat(64),sourceBytes:120};
const PROJECT={id:EXPECTED.projectId,analysis:{runId:EXPECTED.analysisRunId},source:{sha256:EXPECTED.sourceSha256,bytes:EXPECTED.sourceBytes}};
const VARIANT={variant_id:'S02-es-MX-'+ 'b'.repeat(20),locale:'es-MX',status:'confirmed',qa:{passed:true},confirmed_sha256:'c'.repeat(64),shots:[]};
const PLAN_ID='S03-es-MX-'+ 'd'.repeat(20);
const GROUP_ID='G001';

function plan(authorityRevision=EXPECTED.analysisRunId){
  const value={schema_version:'niannian.step03_plan.v1',plan_id:PLAN_ID,project_id:EXPECTED.projectId,analysis_run_id:authorityRevision,source_sha256:EXPECTED.sourceSha256,source_bytes:EXPECTED.sourceBytes,step02_variant_id:VARIANT.variant_id,step02_confirmed_sha256:VARIANT.confirmed_sha256,locale:'es-MX',market:'Mexico',language:'Spanish (Mexico)',created_at:'2026-07-27T00:00:00.000Z'};
  return {...value,plan_sha256:sha256(canonical(value))};
}
function state(overrides={}){
  return {schema_version:'niannian.step03_state.v1',status:'character_review',substep:'characters',error:null,planning_sha256:'e'.repeat(64),continuity_ledger:[{character_id:'C001'}],source_shots:[],characters:[],assets:[{asset_id:'A001',status:'accepted',accepted_artifact_sha256:'f'.repeat(64),used_by_groups:[GROUP_ID]}],groups:[{group_id:GROUP_ID,source_shot_ids:[],asset_dependencies:['A001']}],firstframes:[{group_id:GROUP_ID,candidate_ids:[],selected_candidate_id:null,selected_artifact_sha256:null,status:'awaiting_generation'}],tasks:[],snapshot:null,updated_at:'2026-07-27T00:00:00.000Z',...overrides};
}
async function writeFixture(root,planValue,stateValue){
  const directory=path.join(root,'v1','owners',sha256(OWNER),'projects',EXPECTED.projectId,'plans',PLAN_ID);
  await fsp.mkdir(directory,{recursive:true});
  await fsp.writeFile(path.join(directory,'plan.json'),JSON.stringify(planValue,null,2)+'\n');
  await fsp.writeFile(path.join(directory,'state.json'),JSON.stringify(stateValue,null,2)+'\n');
  return directory;
}
function service(root){return createStep03Service({root,expected:EXPECTED,step02Service:{async getVariant(){return structuredClone(VARIANT);}}});}
async function snapshot(directory){return fsp.readFile(path.join(directory,'state.json'),'utf8');}
async function rejectsWithoutWrite(directory,operation,code){
  const before=await snapshot(directory);
  await assert.rejects(operation,error=>error.httpStatus===409&&(!code||error.code===code));
  assert.equal(await snapshot(directory),before,'rejected canonical mutation must not write state');
}

(async()=>{
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-canonical-runtime-'));
  try{
    let directory=await writeFixture(root,plan(),state({planning_sha256:null,continuity_ledger:[]}));
    let current=await service(root).getPlan({ownerId:OWNER,project:PROJECT,planId:PLAN_ID});
    await rejectsWithoutWrite(directory,()=>service(root).queueAssets({ownerId:OWNER,project:PROJECT,planId:PLAN_ID,assetIds:[],idempotencyKey:'compile-contract-incomplete',ifMatch:current.etag}),'CANONICAL_CONTRACT_BLOCKED');

    await writeFixture(root,plan(),state({assets:[{asset_id:'A001',status:'blocked',accepted_artifact_sha256:null,used_by_groups:[GROUP_ID]}]}));
    current=await service(root).getPlan({ownerId:OWNER,project:PROJECT,planId:PLAN_ID});
    await rejectsWithoutWrite(directory,()=>service(root).queueFirstFrames({ownerId:OWNER,project:PROJECT,planId:PLAN_ID,groupIds:[GROUP_ID],idempotencyKey:'dependency-closure-missing',ifMatch:current.etag}),'CANONICAL_CONTRACT_BLOCKED');

    await writeFixture(root,plan(),state());
    current=await service(root).getPlan({ownerId:OWNER,project:PROJECT,planId:PLAN_ID});
    await rejectsWithoutWrite(directory,()=>service(root).confirmPlan({ownerId:OWNER,project:PROJECT,planId:PLAN_ID,ifMatch:current.etag}),'STEP03_CONFIRM_INCOMPLETE');

    await writeFixture(root,plan('authority-stale'),state());
    current=await service(root).getPlan({ownerId:OWNER,project:PROJECT,planId:PLAN_ID});
    await rejectsWithoutWrite(directory,()=>service(root).queueAssets({ownerId:OWNER,project:PROJECT,planId:PLAN_ID,assetIds:[],idempotencyKey:'authority-revision-mismatch',ifMatch:current.etag}),'CANONICAL_AUTHORITY_MISMATCH');

    await writeFixture(root,plan(),state({planning_sha256:null,continuity_ledger:[]}));
    const beforeRestart=await service(root).getPlan({ownerId:OWNER,project:PROJECT,planId:PLAN_ID});
    const restarted=service(root);
    await rejectsWithoutWrite(directory,()=>restarted.queueAssets({ownerId:OWNER,project:PROJECT,planId:PLAN_ID,assetIds:[],idempotencyKey:'restart-durable-gate',ifMatch:beforeRestart.etag}),'CANONICAL_CONTRACT_BLOCKED');
    console.log('PASS canonical runtime 409/no-write, authority, dependency, confirmation and restart recovery');
  }finally{await fsp.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
