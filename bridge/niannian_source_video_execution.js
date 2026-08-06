'use strict';

const path = require('path');
const fsp = require('fs').promises;
const taskSpec = require('./niannian_source_video_task_spec');
const store = require('./niannian_source_video_execution_store');
const reducer = require('./niannian_source_video_execution_reducer');
const {createMimoAdapter} = require('./niannian_source_mimo_execution_adapter');

async function prepareFromJob({project,jobRoot,groupId='V001',testOnly=false,trustedSourceRoot=null,now}) {
  const spec=await taskSpec.buildSpec({project,jobRoot,groupId,testOnly,trustedSourceRoot,now});
  const root=store.executionRoot(spec);await fsp.mkdir(root,{recursive:true});const lease=await store.acquireLease(root,{owner:'source-video-prepare:'+spec.transaction_id});try{const prepared=await store.prepare(spec);return {...prepared,review:await reducer.reduce(prepared.root)};}finally{await store.releaseLease(lease);}
}
async function reviewFromJob({project,jobRoot,groupId='V001',testOnly}) {
  const providerRoot=path.join(jobRoot,'provider-executions');
  const entries=await require('fs').promises.readdir(providerRoot,{withFileTypes:true}).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error));
  const matches=[];
  for(const entry of entries){if(!entry.isDirectory())continue;const loaded=await store.load(path.join(providerRoot,entry.name));if(loaded.spec.project_id===project.id&&loaded.spec.group_id===String(groupId).toUpperCase()&&(testOnly===undefined||loaded.spec.test_only===testOnly))matches.push(loaded);}
  if(matches.length!==1){const error=new Error(matches.length?'SOURCE_VIDEO_EXECUTION_AMBIGUOUS':'SOURCE_VIDEO_EXECUTION_NOT_PREPARED');error.code=error.message;throw error;}
  const lease=await store.acquireLease(matches[0].root,{owner:'source-video-review:'+project.id+':'+String(groupId).toUpperCase()});try{return await reducer.reduce(matches[0].root);}finally{await store.releaseLease(lease);}
}
async function runFakeFromJob({project,jobRoot,groupId='V001',transport,trustedSourceRoot=null,now}) {
  const prepared=await prepareFromJob({project,jobRoot,groupId,testOnly:true,trustedSourceRoot,now:typeof now==='function'?now():now});
  const adapter=createMimoAdapter({transport,mode:'synthetic_fake_transport'});
  return reducer.runSynthetic({spec:prepared.spec,adapter,now:typeof now==='function'?now:()=>new Date().toISOString(),wait:createSyntheticWait()});
}
function createSyntheticWait(){const calls=[];const wait=async ms=>{calls.push(ms);return{waited_ms:ms,clock:'injected_synthetic'}};wait.calls=calls;return wait;}
function createDeterministicFakeTransport({media=Buffer.from('synthetic-mimo-video'),pollStatuses=[50,20,60,1]}={}) {
  const calls=[];let pollIndex=0;const record=(method,payload)=>{calls.push({method,payload:JSON.parse(JSON.stringify(payload||{}))});};
  return {calls,
    async preflight(payload){record('preflight',payload);return{status:'ready',network_called:false,secret_read:false};},
    async stageUpload(payload){record('stageUpload',payload);return{provider_material_id:'fake-material-'+payload.asset_id,audio_vid:payload.material_type==='audio'?'fake-audio-vid-'+payload.asset_id:null,network_called:false};},
    async readbackInputs(payload){record('readbackInputs',payload);return{status:'matched',network_called:false};},
    async submit(payload){record('submit',payload);return{provider_task_id:'fake-provider-task-001',network_called:false};},
    async poll(payload){record('poll',payload);const provider_status=pollStatuses[Math.min(pollIndex++,pollStatuses.length-1)];return{provider_status,download_key:provider_status===1?'fake-download-key':null,network_called:false};},
    async reconcileSubmission(payload){record('reconcileSubmission',payload);return{unique_match:true,provider_task_id:'fake-provider-task-recovered-001',provider_status:50,network_called:false};},
    async reconcile(payload){record('reconcile',payload);return{unique_match:true,provider_status:1,download_key:'fake-download-key',network_called:false};},
    async download(payload){record('download',payload);return{bytes:Buffer.from(media),network_called:false};},
    async probe(payload){record('probe',payload);return{status:'passed',duration_sec:8,width:720,height:1280,audio_stream_count:1};},
    async visualQa(payload){record('visualQa',payload);return{status:'passed',checks:['synthetic_structure_only'],evidence_sha256:require('crypto').createHash('sha256').update('synthetic-independent-visual-qa').digest('hex'),independent_receipt:true,local_image_editing_used:false};}
  };
}

module.exports={createDeterministicFakeTransport,createSyntheticWait,prepareFromJob,reviewFromJob,runFakeFromJob};
