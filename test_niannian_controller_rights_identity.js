'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const {verifyExistingJob,rebindExistingRecoveryAuthority}=require('./bridge/niannian_controller_bridge');

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
async function writeJson(filePath,value){await fsp.mkdir(path.dirname(filePath),{recursive:true});await fsp.writeFile(filePath,JSON.stringify(value,null,2)+'\n','utf8');}

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-controller-identity-'));
  try{
    const source=Buffer.from('same-source-content');const sourcePath=path.join(root,'source','source.mp4');await fsp.mkdir(path.dirname(sourcePath),{recursive:true});await fsp.writeFile(sourcePath,source);
    const rights={schema_version:'niannian_source_rights_authority_v1',event_id:'rights-'+sha256('rights').slice(0,24),status:'confirmed',confirmed_by_user_id:'user-a',source_sha256:sha256(source),source_bytes:source.length,scope:'source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates',declaration:'user_confirmed_rights_to_use_and_adapt_uploaded_source',confirmed_at:'2026-07-15T00:00:00.000Z',revoked:false};await writeJson(path.join(root,'rights_authority.json'),rights);const rightsBytes=await fsp.readFile(path.join(root,'rights_authority.json'));
    const identity={remote_project_id:'NN-CONTROLLER-IDENTITY-0001',source_sha256:sha256(source),source_bytes:source.length,rights_authority_event_id:rights.event_id,rights_authority_sha256:sha256(rightsBytes),rights_authority_bytes:rightsBytes.length,rights_authority_scope:rights.scope,step01_authorization_event_id:'step01-'+sha256('auth').slice(0,24),settings_version:2,analysis_network_event_id:'analysisnet-'+sha256('network').slice(0,24),media_contract:{width:1080,height:1920,duration_seconds:96.64,fps:25,audio_stream_count:1,audio_sample_rate:48000},media_provider_authority_granted:false};
    await writeJson(path.join(root,'task.json'),{remote_job_id:identity.remote_project_id,source_video:{exact_path:sourcePath,sha256:identity.source_sha256,bytes:identity.source_bytes},authority_bindings:identity});
    const verified=await verifyExistingJob(root,identity.remote_project_id,identity.source_sha256,identity);assert.equal(verified.evidence.sha256,identity.source_sha256);
    for(const [name,mutate] of [['rights event',value=>{value.rights_authority_event_id='rights-'+sha256('other').slice(0,24);}],['settings',value=>{value.settings_version=3;}],['analysis event',value=>{value.analysis_network_event_id='analysisnet-'+sha256('other').slice(0,24);}],['media contract',value=>{value.media_contract.audio_sample_rate=44100;}],['source bytes',value=>{value.source_bytes+=1;}]] ){
      const stale=structuredClone(identity);mutate(stale);await assert.rejects(()=>verifyExistingJob(root,identity.remote_project_id,identity.source_sha256,stale),/authority_identity_mismatch/,name);
    }
    await writeJson(path.join(root,'status.json'),{job_id:'web_nn-controller-identity-0001',status:'blocked_contract'});
    await writeJson(path.join(root,'checkpoint.json'),{job_id:'web_nn-controller-identity-0001',status:'blocked_contract',blockers:[{code:'OLD'}]});
    await writeJson(path.join(root,'gate_dashboard.json'),{job_id:'web_nn-controller-identity-0001',gates:{Step01:{status:'blocked_contract'}}});
    await writeJson(path.join(root,'route_decision.json'),{job_id:'web_nn-controller-identity-0001',authorization_event_id:identity.step01_authorization_event_id});
    await writeJson(path.join(root,'result_manifest.json'),{job_id:'web_nn-controller-identity-0001',status:'blocked_contract',artifacts:[]});
    await writeJson(path.join(root,'artifact_ledger.json'),{schema_version:'artifact_ledger_v1',job_id:'web_nn-controller-identity-0001',artifacts:[]});
    await writeJson(path.join(root,'step01_authorization.json'),{event_id:identity.step01_authorization_event_id,source_sha256:identity.source_sha256,settings_version:2});
    const recoveryIdentity=structuredClone(identity);recoveryIdentity.step01_authorization_event_id='step01-'+sha256('recovery-auth').slice(0,24);recoveryIdentity.analysis_network_event_id='analysisnet-'+sha256('recovery-network').slice(0,24);
    const networkAuthority={schema_version:'niannian_step01_analysis_service_network_authority_v1',event_id:recoveryIdentity.analysis_network_event_id,status:'authorized',authorization_event_id:recoveryIdentity.step01_authorization_event_id,source_sha256:identity.source_sha256,settings_version:2,allowed_services:[{service_id:'mimo_asr'},{service_id:'paddle_ocr'}],media_provider_authority_granted:false,media_provider_submit_requested:false,spend_requested:false};
    const authorization={event_id:recoveryIdentity.step01_authorization_event_id,source_sha256:identity.source_sha256,settings_version:2,rights_authority:{event_id:rights.event_id,sha256:identity.rights_authority_sha256},analysis_service_network_authority:networkAuthority,approval_mode:'policy_auto',approval_policy_id:'niannian_low_risk_analysis_v1',risk_class:'low',auto_approved:true};
    const job={id:identity.remote_project_id,source:{sha256:identity.source_sha256,bytes:identity.source_bytes},settingsVersion:2,analysis:{status:'queued',recoveryFromStatus:'blocked_contract',authorizationEventId:recoveryIdentity.step01_authorization_event_id,settingsVersion:2,analysisServiceNetworkAuthorityEventId:recoveryIdentity.analysis_network_event_id},preflight:{status:'passed',durationSeconds:96.64,video:{width:1080,height:1920,fps:25},audio:{streamCount:1,sampleRates:[48000]}}};
    const rebound=await rebindExistingRecoveryAuthority(root,identity.remote_project_id,identity.source_sha256,recoveryIdentity,authorization,job,{rights,sha256:identity.rights_authority_sha256,byteLength:rightsBytes.length,bytes:rightsBytes});
    assert.equal(rebound.receipt.status,'rebound');assert.equal(rebound.task.authority_bindings.step01_authorization_event_id,recoveryIdentity.step01_authorization_event_id);
    assert.equal((await fsp.readFile(sourcePath)).toString(),'same-source-content');
    assert.equal((JSON.parse(await fsp.readFile(path.join(root,'status.json'),'utf8'))).status,'prepared');
    assert.equal((JSON.parse(await fsp.readFile(path.join(root,'step01_authorization.json'),'utf8'))).event_id,recoveryIdentity.step01_authorization_event_id);
    assert.equal((JSON.parse(await fsp.readFile(path.join(root,'step01_recovery_authority_rebind_receipt.json'),'utf8'))).provider_submission_requested,false);
    const exactReplay=await verifyExistingJob(root,identity.remote_project_id,identity.source_sha256,recoveryIdentity);assert.equal(exactReplay.task.authority_bindings.analysis_network_event_id,recoveryIdentity.analysis_network_event_id);
    await writeJson(path.join(root,'step01_authorization.json'),{event_id:identity.step01_authorization_event_id,source_sha256:identity.source_sha256,settings_version:2});
    await assert.rejects(()=>verifyExistingJob(root,identity.remote_project_id,identity.source_sha256,recoveryIdentity),/authority_file_mismatch/);
    const ordinaryQueued=structuredClone(job);delete ordinaryQueued.analysis.recoveryFromStatus;
    await assert.rejects(()=>rebindExistingRecoveryAuthority(root,identity.remote_project_id,identity.source_sha256,recoveryIdentity,authorization,ordinaryQueued,{rights,sha256:identity.rights_authority_sha256,byteLength:rightsBytes.length,bytes:rightsBytes}),/recovery_status_not_blocked/);
    await rebindExistingRecoveryAuthority(root,identity.remote_project_id,identity.source_sha256,recoveryIdentity,authorization,job,{rights,sha256:identity.rights_authority_sha256,byteLength:rightsBytes.length,bytes:rightsBytes});
    assert.equal((JSON.parse(await fsp.readFile(path.join(root,'step01_authorization.json'),'utf8'))).event_id,recoveryIdentity.step01_authorization_event_id);
    const transportRecovery=structuredClone(job);transportRecovery.analysis.status='blocked_transport';transportRecovery.analysis.recoveryFromStatus='blocked_transport';const transportRebound=await rebindExistingRecoveryAuthority(root,identity.remote_project_id,identity.source_sha256,recoveryIdentity,authorization,transportRecovery,{rights,sha256:identity.rights_authority_sha256,byteLength:rightsBytes.length,bytes:rightsBytes});assert.equal(transportRebound.receipt.status,'rebound');
    const rightsTampered=JSON.parse(JSON.stringify(rights));rightsTampered.scope='other';await writeJson(path.join(root,'rights_authority.json'),rightsTampered);await assert.rejects(()=>verifyExistingJob(root,identity.remote_project_id,identity.source_sha256,recoveryIdentity),/rights_authority_sha256_mismatch/);
    process.stdout.write(JSON.stringify({ok:true,verified:['existing same-source job requires exact remote/source-bytes/rights/auth/settings/analysis/media identity','ordinary queued prepared job cannot masquerade as recovery','explicit remote recovery-from status including blocked_transport may consume its exact current authorization event','rebind preserves source bytes and resets local projection to prepared','same recovery event replay verifies without another rebind','partial rebind with stale authorization file resumes from exact receipt','stale local same-source root rejected','rights file SHA drift rejected']})+'\n');
  }finally{await fsp.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
