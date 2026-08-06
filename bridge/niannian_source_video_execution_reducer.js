'use strict';

const path = require('path');
const adapterContract = require('./niannian_source_video_adapter_contract');
const specContract = require('./niannian_source_video_task_spec');
const store = require('./niannian_source_video_execution_store');

function eventId(spec,type,payload={}) { return 'evt-'+specContract.canonicalSha({transaction_id:spec.transaction_id,type,payload}).slice(0,40); }
function stageEvent(spec,state,payload,at) { return {event_id:eventId(spec,state,payload),type:'state_transition',state,transaction_id:spec.transaction_id,project_id:spec.project_id,group_id:spec.group_id,payload,at}; }
function latestState(events) { const row=[...events].reverse().find(item=>item.type==='state_transition'||item.type==='prepared'); return row?.state||'prepared'; }
function cleanPayload(value) { return JSON.parse(JSON.stringify(value)); }

async function appendState(root,spec,from,to,payload,at) {
  adapterContract.validateTransition(from,to);
  await store.appendEvent(root,stageEvent(spec,to,cleanPayload(payload),at));
  return to;
}

async function reduce(root) {
  const loaded=await store.load(root), {spec,events}=loaded;
  let orderedState='prepared';for(const event of events.filter(item=>item.type==='state_transition')){adapterContract.validateTransition(orderedState,event.state);orderedState=event.state;}
  const state=latestState(events);
  const transitions=events.filter(item=>item.type==='state_transition');
  const payloadByState=Object.fromEntries(transitions.map(item=>[item.state,item.payload]));
  const lastBlockedIndex=events.map(item=>item.type).lastIndexOf('blocked'),lastRecoveredIndex=events.map(item=>item.type).lastIndexOf('recovered');
  const blocker=lastBlockedIndex>=0&&lastRecoveredIndex<lastBlockedIndex?events[lastBlockedIndex].blocker:null;
  const updatedAt=(events[events.length-1]?.at)||spec.created_at;
  if(adapterContract.STATES.indexOf(state)>=adapterContract.STATES.indexOf('downloaded')){
    const download=payloadByState.downloaded;if(!download?.exact_path||!/^[a-f0-9]{64}$/.test(String(download.sha256||''))||!Number.isFinite(Number(download.bytes)))throw store.codeError('SOURCE_VIDEO_DOWNLOADED_RECEIPT_MISSING');const current=await specContract.fileEvidence(download.exact_path,spec.output_roots.media_root);if(current.sha256!==download.sha256||current.bytes!==Number(download.bytes))throw store.codeError('SOURCE_VIDEO_DOWNLOADED_ARTIFACT_INVALID');
    if(adapterContract.STATES.indexOf(state)>=adapterContract.STATES.indexOf('probe_passed')){const probe=payloadByState.probe_passed;if(!probe?.receipt_sha256)throw store.codeError('SOURCE_VIDEO_PROBE_RECEIPT_MISSING');const copy={...probe};delete copy.receipt_sha256;if(probe.artifact_sha256!==download.sha256||probe.receipt_sha256!==specContract.canonicalSha(copy))throw store.codeError('SOURCE_VIDEO_PROBE_RECEIPT_INVALID');}
    if(adapterContract.STATES.indexOf(state)>=adapterContract.STATES.indexOf('visual_qa_passed')){const visual=payloadByState.visual_qa_passed;if(!visual?.receipt_sha256)throw store.codeError('SOURCE_VIDEO_VISUAL_QA_RECEIPT_MISSING');const copy={...visual};delete copy.receipt_sha256;if(visual.artifact_sha256!==download.sha256||visual.probe_receipt_sha256!==payloadByState.probe_passed.receipt_sha256||visual.independent_receipt!==true||visual.receipt_sha256!==specContract.canonicalSha(copy))throw store.codeError('SOURCE_VIDEO_VISUAL_QA_RECEIPT_INVALID');}
  }
  const checkpoint={schema_version:'source_video_execution_checkpoint_v1',status:blocker?'blocked':state,state,project_id:spec.project_id,job_id:spec.job_id,group_id:spec.group_id,transaction_id:spec.transaction_id,spec_sha256:loaded.transaction.spec_sha256,provider:spec.provider,provider_task_id:loaded.transaction.provider_task_id||null,submit_unknown:loaded.transaction.submit_unknown===true,blocker,retry_policy:spec.retry_policy,event_ids:events.map(item=>item.event_id),test_only:spec.test_only,...specContract.falseEffects(),updated_at:updatedAt};
  const result={schema_version:'source_video_execution_result_v1',status:blocker?'blocked':state,project_id:spec.project_id,group_id:spec.group_id,transaction_id:spec.transaction_id,spec_sha256:loaded.transaction.spec_sha256,provider:spec.provider,provider_task_id:loaded.transaction.provider_task_id||null,download:payloadByState.downloaded||null,probe:payloadByState.probe_passed||null,visual_qa:payloadByState.visual_qa_passed||null,downstream_consumable:state==='projected'&&spec.test_only===false,test_only:spec.test_only,blocker,...specContract.falseEffects(),updated_at:updatedAt};
  const artifacts=[];
  if(payloadByState.downloaded)artifacts.push({artifact_id:'source_video_provider_output',node_id:'provider_execution',exact_path:payloadByState.downloaded.exact_path,sha256:payloadByState.downloaded.sha256,bytes:payloadByState.downloaded.bytes,status:spec.test_only?'test_only':'candidate',downstream_consumable_by:spec.test_only?[]:['media_projection']});
  const ledger={schema_version:'source_video_artifact_ledger_v1',status:state==='projected'?(spec.test_only?'test_only_verified':'verified'):'pending',project_id:spec.project_id,group_id:spec.group_id,transaction_id:spec.transaction_id,spec_sha256:loaded.transaction.spec_sha256,event_count:events.length,event_ids:events.map(item=>item.event_id),artifacts,test_only:spec.test_only,...specContract.falseEffects(),updated_at:updatedAt};
  const projection={schema_version:'source_video_media_projection_v1',status:state,project_id:spec.project_id,group_id:spec.group_id,transaction_id:spec.transaction_id,provider:spec.provider,provider_task_id:loaded.transaction.provider_task_id||null,media:state==='projected'?payloadByState.downloaded||null:null,probe:state==='projected'?payloadByState.probe_passed||null:null,visual_qa:state==='projected'?payloadByState.visual_qa_passed||null:null,verified:state==='projected'&&spec.test_only===false,downstream_consumable:state==='projected'&&spec.test_only===false,test_only:spec.test_only,historical_channel_evidence_is_execution_authority:false,real_submit_enabled:false,...specContract.falseEffects(),updated_at:updatedAt};
  await store.atomicJson(store.file(root,'checkpoint.json'),checkpoint);
  await store.atomicJson(store.file(root,'result.json'),result);
  await store.atomicJson(store.file(root,'artifact_ledger.json'),ledger);
  await store.atomicJson(store.file(root,'website_media_projection.json'),projection);
  return {state,checkpoint,result,ledger,projection,events};
}

async function block(root,spec,adapter,error,at) {
  const blocker=adapter.classifyError(error);
  const existingEvents=await store.readEvents(root);
  const lastRecoveryIndex=existingEvents.map(item=>item.type).lastIndexOf('recovered'),priorIndex=existingEvents.map(item=>item.type==='blocked'&&item.blocker?.kind===blocker.kind&&item.blocker?.message===blocker.message).lastIndexOf(true);
  if(priorIndex<0||lastRecoveryIndex>priorIndex)await store.appendEvent(root,{event_id:eventId(spec,'blocked',{blocker,after:existingEvents[existingEvents.length-1]?.event_sha256||null}),type:'blocked',state:latestState(existingEvents),transaction_id:spec.transaction_id,project_id:spec.project_id,group_id:spec.group_id,blocker,at});
  if(blocker.kind==='submit_unknown')await store.updateTransaction(root,{submit_unknown:true,status:'blocked',updated_at:at});
  else await store.updateTransaction(root,{status:'blocked',updated_at:at});
  const reduced=await reduce(root);
  const wrapped=new Error('SOURCE_VIDEO_EXECUTION_BLOCKED:'+blocker.kind+':'+blocker.message);wrapped.code='SOURCE_VIDEO_EXECUTION_BLOCKED';wrapped.blocker=blocker;wrapped.review=reduced;throw wrapped;
}

async function runSyntheticLocked({spec,adapter,now=()=>new Date().toISOString(),stopAfter=null,wait=null}) {
  if(spec.test_only!==true||adapter.mode!=='synthetic_fake_transport')throw adapterContract.contractError('SOURCE_VIDEO_SYNTHETIC_MODE_REQUIRED');
  if(typeof wait!=='function')throw adapterContract.contractError('SOURCE_VIDEO_TEST_CLOCK_REQUIRED');
  const prepared=await store.prepare(spec), root=prepared.root;
  let loaded=await store.load(root), state=latestState(loaded.events);
  const eventPayload = target => [...loaded.events].reverse().find(item=>item.type==='state_transition'&&item.state===target)?.payload||null;
  try {
    let preflight=eventPayload('preflight_passed');
    if(state==='prepared'){preflight=await adapter.preflight({spec});state=await appendState(root,spec,state,'preflight_passed',preflight,now());loaded=await store.load(root);if(stopAfter===state)return reduce(root);}
    let uploads=eventPayload('uploads_staged');
    if(state==='preflight_passed'){uploads=await adapter.stageUploads({spec});state=await appendState(root,spec,state,'uploads_staged',uploads,now());loaded=await store.load(root);if(stopAfter===state)return reduce(root);}
    let inputs=eventPayload('inputs_readback');
    if(state==='uploads_staged'){inputs=await adapter.readbackInputs({spec,uploads});state=await appendState(root,spec,state,'inputs_readback',inputs,now());loaded=await store.load(root);if(stopAfter===state)return reduce(root);}
    let providerTask=eventPayload('provider_task_created');
    const transaction=(await store.load(root)).transaction;
    if(state==='inputs_readback'){
      if(transaction.submit_unknown===true){providerTask=await adapter.resume({spec,submitUnknown:true});await store.appendEvent(root,{event_id:eventId(spec,'recovered',{kind:'submit_unknown',provider_task_id:providerTask.provider_task_id}),type:'recovered',state,transaction_id:spec.transaction_id,project_id:spec.project_id,group_id:spec.group_id,blocker_kind:'submit_unknown',provider_task_id:providerTask.provider_task_id,at:now()});}
      else if(transaction.provider_task_id)providerTask=await adapter.resume({spec,providerTask:{provider_task_id:transaction.provider_task_id,provider_task_recovery_key:transaction.provider_task_recovery_key}});
      else {
        await store.updateTransaction(root,{status:'submitting',submit_unknown:true,submit_attempt_id:'submit-'+specContract.canonicalSha({transaction_id:spec.transaction_id,idempotency_key:spec.idempotency_key}).slice(0,32),updated_at:now()});
        providerTask=await adapter.submit({spec,inputs});
      }
      await store.updateTransaction(root,{status:'provider_task_created',provider_task_id:providerTask.provider_task_id,provider_task_recovery_key:providerTask.provider_task_recovery_key,submit_unknown:false,updated_at:now()});
      state=await appendState(root,spec,state,'provider_task_created',providerTask,now());loaded=await store.load(root);if(stopAfter===state)return reduce(root);
    }
    if(state==='provider_task_created'){state=await appendState(root,spec,state,'polling',{provider_task_id:providerTask.provider_task_id,provider_task_recovery_key:providerTask.provider_task_recovery_key,poll_interval_ms:adapter.poll_interval_ms,cancel_called:false},now());loaded=await store.load(root);if(stopAfter===state)return reduce(root);}
    let pollResult=eventPayload('polling');
    if(state==='polling'){
      providerTask=providerTask||{provider_task_id:loaded.transaction.provider_task_id,provider_task_recovery_key:loaded.transaction.provider_task_recovery_key};
      let attempts=0,totalWaitMs=0;
      do { const waited=await wait(adapter.poll_interval_ms);if(!waited||Number(waited.waited_ms)<adapter.poll_interval_ms)throw adapterContract.contractError('SOURCE_MIMO_POLL_INTERVAL_NOT_OBSERVED');totalWaitMs+=Number(waited.waited_ms);pollResult=await adapter.poll({spec,providerTask}); attempts+=1; if(pollResult.status!=='completed'&&attempts>=20)throw adapterContract.contractError('SOURCE_MIMO_POLL_TIMEOUT'); } while(pollResult.status!=='completed');
      const downloaded=await adapter.download({spec,poll:pollResult});state=await appendState(root,spec,state,'downloaded',{...downloaded,poll_wait_count:attempts,poll_wait_total_ms:totalWaitMs,poll_interval_ms:adapter.poll_interval_ms},now());loaded=await store.load(root);if(stopAfter===state)return reduce(root);
    }
    const download=eventPayload('downloaded')||[...loaded.events].reverse().find(item=>item.state==='downloaded')?.payload;
    if(state==='downloaded'){state=await appendState(root,spec,state,'probe_passed',await adapter.probe({spec,download}),now());loaded=await store.load(root);if(stopAfter===state)return reduce(root);}
    const probe=eventPayload('probe_passed')||[...loaded.events].reverse().find(item=>item.state==='probe_passed')?.payload;
    if(state==='probe_passed'){state=await appendState(root,spec,state,'visual_qa_passed',await adapter.visualQa({spec,download,probe}),now());loaded=await store.load(root);if(stopAfter===state)return reduce(root);}
    if(state==='visual_qa_passed'){state=await appendState(root,spec,state,'ledger_verified',{status:'test_only_verified',artifact_sha256:download.sha256,downstream_consumable:false},now());loaded=await store.load(root);if(stopAfter===state)return reduce(root);}
    if(state==='ledger_verified'){state=await appendState(root,spec,state,'projected',{status:'test_only_projected',artifact_sha256:download.sha256,downstream_consumable:false,real_submit_enabled:false},now());await store.updateTransaction(root,{status:'projected',updated_at:now()});}
    return reduce(root);
  } catch(error) { if(error.code==='SOURCE_VIDEO_EXECUTION_BLOCKED')throw error; return block(root,spec,adapter,error,now()); }
}
async function runSynthetic(options){const root=store.executionRoot(options.spec);await require('fs').promises.mkdir(root,{recursive:true});const lease=await store.acquireLease(root,{owner:'source-video:'+options.spec.transaction_id});try{return await runSyntheticLocked(options);}finally{await store.releaseLease(lease);}}

async function review(root) { return reduce(path.resolve(root)); }

module.exports={appendState,block,eventId,latestState,reduce,review,runSynthetic,runSyntheticLocked,stageEvent};
