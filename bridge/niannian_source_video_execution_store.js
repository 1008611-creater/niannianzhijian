'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const taskSpec = require('./niannian_source_video_task_spec');

function codeError(code, detail) { const error = new Error(code + (detail ? ':' + detail : '')); error.code = code; return error; }
function executionRoot(spec) { return path.resolve(spec.output_roots.transaction_root); }
function file(root, name) { return path.join(root, name); }
async function atomicBytes(target, bytes) {
  await fsp.mkdir(path.dirname(target), {recursive:true});
  const temp = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(5).toString('hex');
  await fsp.writeFile(temp, bytes, {flag:'wx'});
  try { await fsp.rename(temp, target); }
  catch (error) { await fsp.rm(temp,{force:true}).catch(()=>{}); throw error; }
}
async function atomicJson(target, value) { await atomicBytes(target, Buffer.from(JSON.stringify(value,null,2)+'\n','utf8')); }
async function readJson(target, optional = false) {
  try { return JSON.parse(await fsp.readFile(target,'utf8')); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
async function prepare(spec) {
  taskSpec.validateSpec(spec,{jobRoot:path.dirname(path.dirname(executionRoot(spec))),allowTestOnly:true});
  const root = executionRoot(spec);
  await fsp.mkdir(root,{recursive:true});
  const specPath = file(root,'source_video_task_spec.json');
  const existing = await readJson(specPath,true);
  if (existing) {
    if (taskSpec.canonicalSha(existing) !== taskSpec.canonicalSha(spec) || existing.idempotency_key !== spec.idempotency_key) throw codeError('SOURCE_VIDEO_TRANSACTION_IDEMPOTENCY_CONFLICT');
  } else await atomicJson(specPath,spec);
  const specBytes = await fsp.readFile(specPath);
  const specSha = taskSpec.sha256(specBytes);
  const transactionPath = file(root,'transaction.json');
  let transaction = await readJson(transactionPath,true);
  if (!transaction) {
    transaction = {schema_version:'source_video_execution_transaction_v1',status:'prepared',revision:0,project_id:spec.project_id,job_id:spec.job_id,group_id:spec.group_id,spec_id:spec.spec_id,spec_sha256:specSha,transaction_id:spec.transaction_id,idempotency_key:spec.idempotency_key,provider:spec.provider,adapter_identity:spec.adapter_identity,provider_task_id:null,submit_unknown:false,test_only:spec.test_only,created_at:spec.created_at,updated_at:spec.created_at};
    await atomicJson(transactionPath,transaction);
  } else if (transaction.spec_sha256 !== specSha || transaction.idempotency_key !== spec.idempotency_key || transaction.project_id !== spec.project_id || transaction.group_id !== spec.group_id) throw codeError('SOURCE_VIDEO_TRANSACTION_BINDING_INVALID');
  await appendEvent(root,{event_id:'evt-'+taskSpec.canonicalSha({transaction_id:spec.transaction_id,type:'prepared'}).slice(0,40),type:'prepared',state:'prepared',transaction_id:spec.transaction_id,project_id:spec.project_id,group_id:spec.group_id,spec_sha256:specSha,at:spec.created_at});
  return {root,spec,spec_sha256:specSha,transaction};
}
async function readEvents(root) {
  try {
    const events=String(await fsp.readFile(file(root,'events.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
    let previous=null,binding=null;
    for(let index=0;index<events.length;index+=1){const event=events[index],copy={...event};delete copy.event_sha256;const computed=taskSpec.canonicalSha(copy);if(event.sequence!==index+1||event.prev_event_sha256!==(previous?.event_sha256||null)||event.event_sha256!==computed)throw codeError('SOURCE_VIDEO_EVENT_CHAIN_INVALID');const current={transaction_id:event.transaction_id,spec_sha256:event.spec_sha256,project_id:event.project_id,group_id:event.group_id};if(!binding)binding=current;else if(taskSpec.canonicalSha(binding)!==taskSpec.canonicalSha(current))throw codeError('SOURCE_VIDEO_EVENT_CROSS_BINDING_INVALID');previous=event;}
    return events;
  }
  catch (error) { if(error.code==='ENOENT')return []; throw error; }
}
async function appendEvent(root,event) {
  const events = await readEvents(root);
  const existing = events.find(item=>item.event_id===event.event_id);
  if (existing) {
    const prior={...existing};for(const key of ['sequence','prev_event_sha256','event_sha256'])delete prior[key];
    const candidate={...event,spec_sha256:event.spec_sha256||prior.spec_sha256,group_id:event.group_id||prior.group_id};
    if (taskSpec.canonicalSha(prior)!==taskSpec.canonicalSha(candidate)) throw codeError('SOURCE_VIDEO_EVENT_ID_CONFLICT');
    return {appended:false,event:existing};
  }
  const first=events[0]||null;
  const normalized={...event,spec_sha256:event.spec_sha256||first?.spec_sha256,project_id:event.project_id||first?.project_id,group_id:event.group_id||first?.group_id,transaction_id:event.transaction_id||first?.transaction_id,sequence:events.length+1,prev_event_sha256:events.length?events[events.length-1].event_sha256:null};
  if(!normalized.transaction_id||!normalized.spec_sha256||!normalized.project_id||!normalized.group_id)throw codeError('SOURCE_VIDEO_EVENT_BINDING_MISSING');
  normalized.event_sha256=taskSpec.canonicalSha(normalized);
  await atomicBytes(file(root,'events.jsonl'),Buffer.from(events.concat(normalized).map(item=>JSON.stringify(item)).join('\n')+'\n','utf8'));
  return {appended:true,event:normalized};
}
async function updateTransaction(root,patch,expectedRevision=null) {
  const current = await readJson(file(root,'transaction.json'));
  if(expectedRevision!==null&&Number(current.revision)!==Number(expectedRevision))throw codeError('SOURCE_VIDEO_TRANSACTION_CAS_CONFLICT');
  const next = {...current,...patch,revision:Number(current.revision||0)+1,transaction_id:current.transaction_id,project_id:current.project_id,spec_sha256:current.spec_sha256,idempotency_key:current.idempotency_key};
  await atomicJson(file(root,'transaction.json'),next);
  return next;
}
async function acquireLease(root,{owner='source-video-runner',ttlMs=120000,nowMs=Date.now()}={}){
  const leaseRoot=file(root,'.transaction-lease'),staging=leaseRoot+'.staging-'+process.pid+'-'+crypto.randomBytes(5).toString('hex'),leaseId='lease-'+crypto.randomBytes(12).toString('hex');
  await fsp.mkdir(staging,{recursive:false});await atomicJson(path.join(staging,'lease.json'),{schema_version:'source_video_transaction_lease_v1',lease_id:leaseId,owner,acquired_at:new Date(nowMs).toISOString(),expires_at:new Date(nowMs+ttlMs).toISOString()});
  try{await fsp.rename(staging,leaseRoot);}catch(error){await fsp.rm(staging,{recursive:true,force:true});if(await fsp.lstat(leaseRoot).catch(()=>null))throw codeError('SOURCE_VIDEO_TRANSACTION_LEASE_CONFLICT');throw error;}
  return{lease_id:leaseId,root:leaseRoot};
}
async function releaseLease(lease){if(!lease)return;const current=await readJson(path.join(lease.root,'lease.json'),true);if(!current||current.lease_id!==lease.lease_id)throw codeError('SOURCE_VIDEO_TRANSACTION_LEASE_OWNERSHIP_INVALID');await fsp.rm(lease.root,{recursive:true,force:true});}
async function load(root) {
  const [spec,transaction,events,checkpoint,result,ledger,projection] = await Promise.all([
    readJson(file(root,'source_video_task_spec.json')),readJson(file(root,'transaction.json')),readEvents(root),readJson(file(root,'checkpoint.json'),true),readJson(file(root,'result.json'),true),readJson(file(root,'artifact_ledger.json'),true),readJson(file(root,'website_media_projection.json'),true)
  ]);
  return {root,spec,transaction,events,checkpoint,result,ledger,projection};
}

module.exports = {acquireLease,appendEvent,atomicBytes,atomicJson,codeError,executionRoot,file,load,prepare,readEvents,readJson,releaseLease,updateTransaction};
