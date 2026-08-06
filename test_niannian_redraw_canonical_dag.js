'use strict';
const assert=require('assert');
const dag=require('./bridge/niannian_redraw_canonical_dag');

assert.deepStrictEqual(dag.NODE_IDS,['S01_EVIDENCE','S02_SOURCE_TIMELINE','S04_LOCALIZATION_COMPILE','S05A_SUPPORT_ASSETS','S05B_FIRST_FRAMES','VIDEO_EXECUTION','FINAL_QA','DELIVERY']);
assert.strictEqual(dag.AUTHORITY_REVISION,'mx-shortdrama-redraw-v1.4.1/full-chain-dag-contract');
assert(!dag.NODE_IDS.includes('STEP03'));
assert.deepStrictEqual(dag.PUBLIC_STAGES.map(row=>row.label),['原片分析','原片时间轴','地区改编','资产与首帧','视频生成','质量核验','可交付']);

const mappings=[
  [{step:'Step01'},'S01_EVIDENCE'],
  [{step:'Step02'},'S02_SOURCE_TIMELINE'],
  [{step:'Step04'},'S04_LOCALIZATION_COMPILE'],
  [{step:'Step03',subtype:'compiled_prompt'},'S04_LOCALIZATION_COMPILE'],
  [{step:'Step03',subtype:'support_asset'},'S05A_SUPPORT_ASSETS'],
  [{step:'Step03',subtype:'video_first_frame_anchor'},'S05B_FIRST_FRAMES'],
  [{step:'Step05',subtype:'provider_downloaded'},'VIDEO_EXECUTION'],
  [{step:'Step05',subtype:'content_qa'},'FINAL_QA'],
  [{step:'Step05',subtype:'delivered'},'DELIVERY']
];
for(const [legacy,expected] of mappings)assert.strictEqual(dag.resolveNodeId(legacy),expected,JSON.stringify(legacy));
const discoveredLegacyObjects=[
  [{currentNode:'Step01',status:'running_step01'},'S01_EVIDENCE'],
  [{earliestIncompleteNode:'Step01',status:'evidence_ready'},'S01_EVIDENCE'],
  [{currentNode:'Step02',status:'running_step02'},'S02_SOURCE_TIMELINE'],
  [{earliestIncompleteNode:'Step02',status:'step02_return_ready'},'S02_SOURCE_TIMELINE'],
  [{currentNode:'Step02',status:'step02_accepted'},'S02_SOURCE_TIMELINE'],
  [{currentNode:'Step04',status:'running_step04'},'S04_LOCALIZATION_COMPILE'],
  [{earliestIncompleteNode:'Step04',status:'step04_accepted'},'S04_LOCALIZATION_COMPILE'],
  [{currentNode:'Step03',status:'asset_generation',subtype:'support_asset'},'S05A_SUPPORT_ASSETS'],
  [{currentNode:'Step03',status:'firstframe_generation',subtype:'video_first_frame_anchor'},'S05B_FIRST_FRAMES'],
  [{currentNode:'Step05',status:'running_step05',subtype:'provider_downloaded'},'VIDEO_EXECUTION'],
  [{currentNode:'Step05',status:'qa_running',subtype:'content_qa'},'FINAL_QA'],
  [{currentNode:'Step05',status:'user_visible_acceptance',subtype:'delivered'},'DELIVERY']
];
for(const [legacy,nodeId] of discoveredLegacyObjects){
  const contract=dag.NODE_CONTRACTS[nodeId],input_contract=Object.fromEntries(contract.input.map(key=>[key,true])),output_contract=Object.fromEntries(contract.output.map(key=>[key,true]));
  const trace=dag.resolveCanonicalState({legacy,authority_revision:'exact-evidence-revision',current_authority_revision:'exact-evidence-revision',input_contract,output_contract});
  assert.equal(trace.canonical_node_id,nodeId,JSON.stringify(legacy));
  assert.equal(trace.resolution_status,'resolved',JSON.stringify(legacy));
  assert.deepEqual(Object.keys(trace).filter(key=>['legacy_step_name','canonical_node_id','authority_revision','input_contract','output_contract','downstream_gate'].includes(key)),['legacy_step_name','canonical_node_id','authority_revision','input_contract','output_contract','downstream_gate']);
  assert.equal(trace.input_contract.satisfied,true);assert.equal(trace.output_contract.satisfied,true);assert.deepEqual(trace.downstream_gate.next_node_ids,contract.next);
}
for(const legacy of [{step:'Step03'},{step:'Step05'},{step:'unknown'}]){
  const trace=dag.resolveCanonicalState({legacy,authority_revision:'rev-a',current_authority_revision:'rev-a'});
  assert.strictEqual(trace.resolution_status,'blocked');
  assert.strictEqual(trace.downstream_gate.eligible,false);
}

const complete=dag.resolveCanonicalState({legacy:{step:'Step02'},authority_revision:'rev-a',current_authority_revision:'rev-a',input_contract:{S01_EVIDENCE:true},output_contract:{accepted:true,artifact_ledger_verified:true}});
assert.strictEqual(complete.resolution_status,'resolved');
assert.strictEqual(complete.downstream_gate.eligible,true);
assert.strictEqual(dag.publicProjection(complete).stage_label,'地区改编');
for(const field of ['legacy_step_name','canonical_node_id','authority_revision','input_contract','output_contract','downstream_gate'])assert(Object.hasOwn(complete,field),field);

const mismatch=dag.resolveCanonicalState({legacy:{step:'Step02'},authority_revision:'rev-a',current_authority_revision:'rev-b',input_contract:{S01_EVIDENCE:true},output_contract:{accepted:true,artifact_ledger_verified:true}});
assert.strictEqual(mismatch.downstream_gate.reason,'authority_revision_mismatch');
assert.throws(()=>dag.assertDownstreamGate(mismatch,'S04_LOCALIZATION_COMPILE','rev-b'),/CANONICAL_CONTRACT_BLOCKED/);

const forged=dag.resolveCanonicalState({legacy:{currentNode:'Step04',status:'step04_accepted'},authority_revision:'rev-a',current_authority_revision:'rev-a'});
assert.strictEqual(forged.resolution_status,'blocked');
assert.strictEqual(forged.downstream_gate.eligible,false);

const supportOnly=dag.resolveCanonicalState({legacy:{step:'Step03',subtype:'support_asset'},authority_revision:'rev-a',current_authority_revision:'rev-a',input_contract:{S04_LOCALIZATION_COMPILE:true,dependency_closure:true},output_contract:{verified:true,artifact_ledger_verified:true}});
assert.strictEqual(supportOnly.resolution_status,'resolved');
assert(supportOnly.downstream_gate.next_node_ids.includes('S05B_FIRST_FRAMES'));
assert(!supportOnly.downstream_gate.next_node_ids.includes('VIDEO_EXECUTION'));
assert.throws(()=>dag.assertDownstreamGate(supportOnly,'VIDEO_EXECUTION','rev-b'),/CANONICAL_AUTHORITY_MISMATCH/);
const unconfirmedFrame=dag.resolveCanonicalState({legacy:{step:'Step03',subtype:'video_first_frame_anchor'},authority_revision:'rev-a',current_authority_revision:'rev-a',input_contract:{S04_LOCALIZATION_COMPILE:true,declared_S05A_dependencies:true},output_contract:{verified:true,current_confirmation_bound:false,artifact_ledger_verified:true}});
assert.strictEqual(unconfirmedFrame.downstream_gate.eligible,false);
const downloadedWithoutReadback=dag.resolveCanonicalState({legacy:{step:'Step05',subtype:'provider_downloaded'},authority_revision:'rev-a',current_authority_revision:'rev-a',input_contract:{locked_video_task_spec:true,confirmed_references:true,authority_preflight:true},output_contract:{provider_downloaded:true,media_readback_complete:false}});
assert.strictEqual(downloadedWithoutReadback.downstream_gate.eligible,false);
const playableVideo=dag.resolveCanonicalState({legacy:{step:'Step05',subtype:'provider_downloaded'},authority_revision:'rev-a',current_authority_revision:'rev-a',input_contract:{locked_video_task_spec:true,confirmed_references:true,authority_preflight:true},output_contract:{provider_downloaded:true,media_readback_complete:true}});
assert.strictEqual(playableVideo.resolution_status,'resolved');
assert.deepStrictEqual(playableVideo.downstream_gate.next_node_ids,['FINAL_QA']);
console.log('PASS canonical DAG resolver');
