'use strict';

const assert = require('assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const {Step05ReferenceAuthority,exactIdentity} = require('./bridge/niannian_step05_reference_authority');
const {buildVideoBatchInput} = require('./bridge/niannian_video_batch_input');

function ref(key,type,required,sha,prompt) {
  return {project_id:'P-1',ref_key:key,canonical_type:type,required,authority_revision:'AUTH-1',localization_revision:'LOC-1',authority_event_id:'AE-'+key,authority_source:'step04_explicit_registration',reference_role_cn:'视频职责',video_group:required?'V01':'',purpose_cn:key,source_fact_projection:{label:'来源事实'},related_support_ref_keys:[],locked_prompt_lineage:{prompt_revision:'PR-'+key,prompt_sha:prompt},dependencies:[],readback:{bytes:10,content_type:'image/png'},qa:{status:'pass',problem_cn:'',actions:[]},candidate:{candidate_revision:'C-'+key,content_sha:sha,public_candidate_url:''}};
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'video-batch-input-'));
try {
  const service=new Step05ReferenceAuthority({stateFile:path.join(root,'state.json')});
  service.initialize({project_id:'P-1',authority_revision:'AUTH-1',localization_revision:'LOC-1',delivery_target:'FIRST_REAL_VIDEO_PLAYABLE',execution_scope:{mode:'minimal_first_video',video_group_ids:['V01']},references:[ref('SUPPORT','support_asset_ref',false,'a'.repeat(64),'p-support'),ref('FIRST','video_first_frame_anchor',true,'b'.repeat(64),'p-first'),ref('IDENTITY','video_upload_non_first_ref',true,'c'.repeat(64),'p-identity')]});
  const pending=service.snapshot().state.refs.filter(item=>item.required).map(exactIdentity);
  service.batchConfirm({ifMatch:service.etag(),idempotency_key:'confirm-input',items:pending,confirmed_at:'2026-07-27T00:00:00.000Z'});
  const context={service,authorityRevision:'AUTH-1',localizationRevision:'LOC-1'};
  const registry={project_id:'P-1',authority_revision:'AUTH-1',localization_revision:'LOC-1',step04_registry_revision:'S04REG-1'};
  const plan={plan_id:'PLAN-1',groups:[{group_id:'G-001',revision:2,start_sec:0,end_sec:8,duration_sec:8,action_summary:'开场动作',dialogue_bindings:[{speaker:'女主'}]}]};
  const input=buildVideoBatchInput({project:{id:'P-1'},step05Context:context,step03Plan:plan,step04Registry:registry});
  assert.equal(input.groups.length,1);assert.equal(input.groups[0].group_id,'V01');assert.equal(input.groups[0].duration_seconds,8);assert.equal(input.groups[0].audio_requirement,'required');
  assert.deepEqual(input.groups[0].references.map(item=>item.ref_key),['FIRST','IDENTITY']);
  assert(!input.groups[0].references.some(item=>item.ref_key==='SUPPORT'));
  const repeat=buildVideoBatchInput({project:{id:'P-1'},step05Context:context,step03Plan:plan,step04Registry:registry});assert.deepEqual(repeat,input);
  service.reject({ifMatch:service.etag(),ref_key:'FIRST',issue_category:'构图不一致'});
  assert.throws(()=>buildVideoBatchInput({project:{id:'P-1'},step05Context:context,step03Plan:plan,step04Registry:registry}),/确认本批全部视频参考图|尚未全部确认/);
  console.log('PASS video batch exact Step05 input adapter');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
