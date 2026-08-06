'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {THREADS,PROJECT_ROOT} = require('./bridge/mac_codex_app_employee_bootstrap');
const {executeWebsiteDispatch} = require('./bridge/mac-employee-training/execute_website_dispatch');
const {run} = require('./bridge/mac_codex_app_synthetic_job_dispatch');

function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
async function evidence(filePath){const value=await fsp.readFile(filePath);return {sha256:hash(value),bytes:value.length};}
async function writeJson(filePath,value){await fsp.mkdir(path.dirname(filePath),{recursive:true});await fsp.writeFile(filePath,JSON.stringify(value,null,2)+'\n','utf8');}
async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}

async function buildFixture(root,suffix='A'){
  const projectRoot=__dirname;
  const employee=THREADS[0];
  const homeDir=path.join(root,'home-'+suffix);
  const dispatchId='N06EMP-TEST-'+suffix;
  const workspace=path.join(homeDir,'.local','share','niannian-ai','employee-workspaces',employee.employee,dispatchId);
  const referenceRelative='input/references/01-FF_V001_S001.png';
  const referencePath=path.join(workspace,...referenceRelative.split('/'));
  const referenceBytes=Buffer.from('exact-reference-'+suffix);
  await fsp.mkdir(path.dirname(referencePath),{recursive:true});
  await fsp.writeFile(referencePath,referenceBytes);
  const authoritySpecSha=hash('authority-spec-'+suffix);
  const promptSha=hash('locked-prompt-'+suffix);
  const portableSpec={
    execution_mode:'real_submit_candidate_v2',transaction_id:'N06INT-TEST-'+suffix,
    authority_spec:{exact_path:'D:/authority/video_task_spec.json',sha256:authoritySpecSha},
    prompt:{text:'locked-prompt-'+suffix,sha256:promptSha},
    references:[{ref_key:'FF_V001_S001',duty:'首帧构图与开场镜头锚点',sha256:hash(referenceBytes),uploadEligible:true,path:referencePath,original_authority:{exact_path:'D:/authority/FF_V001_S001.png',sha256:hash(referenceBytes)},portable_transport:{relative_path:referenceRelative,sha256:hash(referenceBytes)}}]
  };
  const portableSpecPath=path.join(workspace,'input','video_task_spec.json');
  await writeJson(portableSpecPath,portableSpec);
  const authorityFiles={
    agents:path.join(projectRoot,'AGENTS.md'),
    route_matrix:path.join(projectRoot,'bridge','mac-employee-training','route_matrix.json'),
    skill_bundle_manifest:path.join(projectRoot,'bridge','mac-skill-bundles','niannian-mac-production-skills-v1.manifest.json')
  };
  const authority={};
  for(const [key,filePath] of Object.entries(authorityFiles))authority[key]={exact_path:filePath,sha256:(await evidence(filePath)).sha256};
  const dispatch={
    schema_version:'niannian_n06_mac_employee_dispatch_v1',dispatch_id:dispatchId,status:'prepared',phase:'prepared_for_transport',execution_mode:'synthetic_fake_transport_only',idempotency_key:hash('idempotency-'+suffix),
    project_id:'NS-TEST',job_id:'web_ns-test-job-001',group_id:'V001',transaction_id:portableSpec.transaction_id,spec_sha256:authoritySpecSha,portable_spec_sha256:(await evidence(portableSpecPath)).sha256,prompt_sha256:promptSha,portable_spec_relative_path:'input/video_task_spec.json',
    references:[{ref_key:'FF_V001_S001',duty:'首帧构图与开场镜头锚点',sha256:hash(referenceBytes),confirmed:true,upload_eligible:true,local_edit_applied:false,relative_path:referenceRelative}],
    employee:{...employee,project_root:PROJECT_ROOT,workspace},authority,
    employee_model_channel:{channel_id:'krill_codex_custom_provider_v1',provider_config_id:'codex_local_access',credential_source:'env_key',env_key_name:'KRILL_CODEX_API_KEY',requires_openai_auth:false,requested:true,used:false},
    lease:{status:'unclaimed',lease_id:null,owner_thread_id:employee.thread_id,claimed_at:null,completed_at:null},
    media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,production_data_write_requested:false,test_only:true,real_delivery:false
  };
  const dispatchPath=path.join(workspace,'employee_dispatch.json');
  await writeJson(dispatchPath,dispatch);
  return {projectRoot,homeDir,workspace,dispatchPath,dispatch,employee};
}

class FakeClient{
  constructor(fixture){this.fixture=fixture;this.turnId='turn-synthetic-'+fixture.dispatch.dispatch_id;this.completed=false;this.turnStarts=0;}
  async request(method,params){
    if(method==='thread/read')return {thread:{id:this.fixture.employee.thread_id,name:this.fixture.employee.title,cwd:PROJECT_ROOT,status:{type:'idle'},turns:this.completed?[{id:this.turnId,status:'completed',error:null,items:[{type:'agentMessage',text:'test_only integrated receipt returned'}]}]:[]}};
    if(method==='turn/start'){
      this.turnStarts+=1;
      assert.equal(params.threadId,this.fixture.employee.thread_id);
      assert.equal(params.sandboxPolicy.type,'workspaceWrite');
      assert.deepEqual(params.sandboxPolicy.writableRoots,[this.fixture.workspace]);
      assert.equal(params.sandboxPolicy.networkAccess,false);
      await executeWebsiteDispatch({dispatchPath:this.fixture.dispatchPath,projectRoot:this.fixture.projectRoot,homeDir:this.fixture.homeDir});
      this.completed=true;
      return {turn:{id:this.turnId}};
    }
    throw new Error('unexpected_method:'+method);
  }
  async waitForTurn(threadId,turnId){assert.equal(threadId,this.fixture.employee.thread_id);assert.equal(turnId,this.turnId);return {id:this.turnId,status:'completed',error:null};}
  close(){}
}

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-mac-app-job-'));
  try{
    const fixture=await buildFixture(root,'PASS');
    const configPath=path.join(root,'config.toml');
    await fsp.writeFile(configPath,'model_provider = "codex_local_access"\n[model_providers.codex_local_access]\nwire_api = "responses"\nenv_key = "KRILL_CODEX_API_KEY"\nrequires_openai_auth = false\n','utf8');
    const client=new FakeClient(fixture);
    const control=await run({dispatchPath:fixture.dispatchPath,configPath,client});
    assert.equal(control.completion_event.method,'turn/completed');
    assert.equal(control.completion_event.status,'completed');
    assert.equal(control.completion_event.error,null);
    assert.equal(control.media_provider_submit_requested,false);
    assert.equal(control.real_delivery,false);
    assert.equal(client.turnStarts,1);
    const receipt=await readJson(path.join(fixture.workspace,'employee_worker_receipt.json'));
    assert.equal(receipt.authority_spec_sha256,fixture.dispatch.spec_sha256);
    assert.equal(receipt.portable_spec_sha256,fixture.dispatch.portable_spec_sha256);
    assert.equal(receipt.status,'test_only_qa_passed');
    assert.equal(receipt.completion_event.turn_id,client.turnId);
    const returnedDispatch=await readJson(fixture.dispatchPath);
    assert.equal(returnedDispatch.phase,'employee_turn_completed');
    assert.equal(returnedDispatch.lease.status,'completed');
    assert.equal(returnedDispatch.lease.lease_id,client.turnId);
    const manifest=await readJson(path.join(fixture.workspace,'artifact_manifest.json'));
    assert.equal(manifest.phase,'turn_completed_and_read_back');
    assert.deepEqual(manifest.files.map(item=>item.relative_path).sort(),['employee_dispatch.json','employee_worker_receipt.json','fake-download.mp4','ffprobe.json','mac_employee_dispatch_control_receipt.json','visual_qa.json','website_projection.json'].sort());
    for(const item of manifest.files){const actual=await evidence(path.join(fixture.workspace,item.relative_path));assert.deepEqual(actual,{sha256:item.sha256,bytes:item.bytes});}
    await run({dispatchPath:fixture.dispatchPath,configPath,client});
    assert.equal(client.turnStarts,1,'completed idempotency receipt must prevent a duplicate App turn');

    const stalePortable=await buildFixture(root,'STALE-PORTABLE');
    stalePortable.dispatch.portable_spec_sha256='0'.repeat(64);
    await writeJson(stalePortable.dispatchPath,stalePortable.dispatch);
    await assert.rejects(()=>executeWebsiteDispatch({dispatchPath:stalePortable.dispatchPath,projectRoot:stalePortable.projectRoot,homeDir:stalePortable.homeDir}),/website_dispatch_spec_mismatch/);
    const staleAuthority=await buildFixture(root,'STALE-AUTHORITY');
    const staleSpec=await readJson(path.join(staleAuthority.workspace,'input','video_task_spec.json'));
    staleSpec.authority_spec.sha256='f'.repeat(64);
    await writeJson(path.join(staleAuthority.workspace,'input','video_task_spec.json'),staleSpec);
    staleAuthority.dispatch.portable_spec_sha256=(await evidence(path.join(staleAuthority.workspace,'input','video_task_spec.json'))).sha256;
    await writeJson(staleAuthority.dispatchPath,staleAuthority.dispatch);
    await assert.rejects(()=>executeWebsiteDispatch({dispatchPath:staleAuthority.dispatchPath,projectRoot:staleAuthority.projectRoot,homeDir:staleAuthority.homeDir}),/website_dispatch_spec_mismatch/);
    process.stdout.write(JSON.stringify({ok:true,verified:['authority and portable spec SHA stay distinct','exact reference transport SHA and duties','existing allowlisted thread only','workspace-write network-off turn','exact turn/completed plus thread/read','final manifest regenerated after receipt/control update','phase lease and idempotent no-duplicate turn','media provider upload submit spend deploy all false']})+'\n');
  }finally{await fsp.rm(root,{recursive:true,force:true});}
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
