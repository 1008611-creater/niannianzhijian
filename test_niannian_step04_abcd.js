const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const step04 = require('./bridge/niannian_step04_abcd');

const assetPath = path.join(os.tmpdir(), 'niannian-step04-test-char-1.png');
fs.writeFileSync(assetPath, Buffer.from('step04-test-asset'));
const assetSha = crypto.createHash('sha256').update(fs.readFileSync(assetPath)).digest('hex');

function validInput() {
  return {
    source: {project_id:'P-TEST',source_sha256:'4d4f9852805f4e5e5eb01768e9e071b5227052d3f2fd37c13737e63e534477ae',step02_acceptance_sha256:'80bd97228b9ac9655457568b65b4f2087f606b683bf7a315f053367baa894182'},
    step02Manifest: {status:'accepted',semantic_status:'accepted',acceptance_mode:'semantic',source_sha256:'4d4f9852805f4e5e5eb01768e9e071b5227052d3f2fd37c13737e63e534477ae',semantic_alignment:{status:'accepted',mapping_policy:'continuous_observation_local_interval_plus_segment_start; never_ordinal_shot_mapping',semantic_unit_ids:['OBS-1']},asset_requirements:[{asset_id:'SCENE-1',kind:'scene',purpose:'锁定会议室空间和基础光',evidence_ids:['G1'],required_shot_ids:['S001']},{asset_id:'PROP-1',kind:'prop',purpose:'锁定桌面文件夹的位置',evidence_ids:['G1'],required_shot_ids:['S001']}],cards:[{shot_id:'S001',source_start_ms:0,source_end_ms:1000,verdict:'pass',evidence_ids:['G1'],semantic_unit_ids:['OBS-1'],scene_identity:'会议室内的质询',environment_identity:'现代墨西哥办公室',composition:'中景，人物位于会议桌旁',camera_motion_detail:'固定机位，最后轻微推近',lighting:'右侧窗光保持柔和阴影',audio_observation:'室内空气声和衣物摩擦',context_reference_slot_ids:['REF-001-SCENE-1','REF-001-PROP-1'],entity_instances:[{instance_id:'S001:CHAR-1',role_ref:'@沈川',asset_id:'CHAR-1',status:'resolved',evidence_ids:['F1']}],event_blocks:[{timecode_ms:[0,1000],subject_instance_id:'S001:CHAR-1',object_instance_id:'',start_state:'站立',change:'抬头',end_state:'看向画外',evidence_ids:['G1']}]}]},
    identityBindings: {bindings:[{binding_id:'B1',canonical_role:'沈川',target_ref:'@沈川',target_asset:'CHAR-1',identity_status:'resolved',shot_ids:['S001'],evidence_ids:['F1']}]},
    assetRegistry: {assets:[{asset_id:'CHAR-1',display_name:'@沈川',exact_path:assetPath,sha256:assetSha,status:'accepted',generation_prompt:'男主定妆母图，现代墨西哥写实短剧，保持脸部辨识度与深色西装。',allowed_instance_ids:['S001:CHAR-1']},{asset_id:'SCENE-1',display_name:'@会议室',exact_path:assetPath,sha256:assetSha,status:'accepted',generation_prompt:'现代墨西哥办公室会议室场景，锁定长桌、窗帘和白天窗侧光，无人物。'},{asset_id:'PROP-1',display_name:'@文件夹',exact_path:assetPath,sha256:assetSha,status:'accepted',generation_prompt:'绿色文件夹道具，锁定桌面位置和半开启状态，写实材质。'}]}
  };
}

assert.throws(() => step04.compile({...validInput(),step02Manifest:{...validInput().step02Manifest,semantic_status:'structural'}}), error => error.code === 'STEP04_STEP02_SEMANTIC_GATE_BLOCKED');
assert.throws(() => step04.compile({...validInput(),step02Manifest:{...validInput().step02Manifest,semantic_alignment:{}}}), error => error.code === 'STEP04_STEP02_SEMANTIC_GATE_BLOCKED');
assert.throws(() => step04.compile({...validInput(),step02Manifest:{...validInput().step02Manifest,cards:[{...validInput().step02Manifest.cards[0],verdict:'conflict'}]}}), error => error.code === 'STEP04_STEP02_SEMANTIC_GATE_BLOCKED');
assert.throws(() => step04.compile({...validInput(),assetRegistry:{assets:[{...validInput().assetRegistry.assets[0],display_name:'lead'}]}}), error => error.code === 'STEP04_ASSET_DISPLAY_NAME_INVALID');
assert.throws(() => step04.compile({...validInput(),identityBindings:{bindings:[...validInput().identityBindings.bindings,{binding_id:'B-2',canonical_role:'support-2',target_ref:'@男二',target_asset:'CHAR-2',identity_status:'resolved',shot_ids:['S001'],evidence_ids:['F2']} ]},assetRegistry:{assets:[...validInput().assetRegistry.assets,{asset_id:'CHAR-2',display_name:'@男二',exact_path:assetPath,sha256:assetSha,status:'accepted',allowed_instance_ids:['S001:CHAR-2']}]}}), error => error.code === 'STEP04_ENTITY_BINDING_MISMATCH');
assert.throws(() => step04.compile({...validInput(),step02Manifest:{...validInput().step02Manifest,cards:[{...validInput().step02Manifest.cards[0],event_blocks:[{...validInput().step02Manifest.cards[0].event_blocks[0],dialogue:{speaker_instance_id:'S001:CHAR-1',timecode_ms:[100,200],text:'你好'}}]}]}}), error => error.code === 'STEP04_DIALOGUE_EVIDENCE_MISSING');
assert.throws(() => step04.compile({...validInput(),step02Manifest:{...validInput().step02Manifest,cards:[{...validInput().step02Manifest.cards[0],event_blocks:[{...validInput().step02Manifest.cards[0].event_blocks[0],change:'',action:''}]}]}}), error => error.code === 'STEP04_EVENT_ACTION_MISSING');
assert.throws(() => step04.compile({...validInput(),step02Manifest:{...validInput().step02Manifest,cards:[{...validInput().step02Manifest.cards[0],context_reference_slot_ids:['REF-001-SCENE-1']} ]}}), error => error.code === 'STEP04_CONTEXT_REFERENCE_DECLARATION_MISMATCH');
const contract = step04.compile(validInput());
assert.equal(contract.layers.A.entities[0].role_ref,'@沈川');
assert.equal(contract.layers.B.reference_slots[0].asset_id,'CHAR-1');
assert.deepEqual(new Set(contract.layers.B.reference_slots.map(slot => slot.kind)),new Set(['character','scene','prop']));
assert.equal(contract.layers.C.prompt_groups[0].events[0].change,'抬头');
assert.equal(contract.layers.C.prompt_groups[0].context_reference_slots.length,2);
assert(contract.layers.C.prompt_groups[0].prompt_text.includes('参考图：'));
assert(contract.layers.C.prompt_groups[0].prompt_compression.compressed_chars <= contract.layers.C.prompt_groups[0].prompt_compression.raw_chars);
assert.equal(contract.layers.C.prompt_policy.references_lock_stable_facts,true);
assert.equal(contract.layers.D.provider_calls.video,false);
const sceneOnly = validInput();
sceneOnly.step02Manifest.cards = [
  ...sceneOnly.step02Manifest.cards,
  {shot_id:'S002',source_start_ms:1000,source_end_ms:2000,verdict:'pass',evidence_ids:['G2'],semantic_unit_ids:['OBS-1'],scene_identity:'会议室空镜建立',environment_identity:'现代墨西哥办公室',composition:'空桌与窗帘的静止全景',camera_motion_detail:'固定机位',lighting:'白天窗侧光保持',audio_observation:'室内空气声',event_blocks:[]}
];
sceneOnly.step02Manifest.asset_requirements.forEach(requirement => requirement.required_shot_ids.push('S002'));
sceneOnly.step02Manifest.cards[1].context_reference_slot_ids = ['REF-002-SCENE-1','REF-002-PROP-1'];
const sceneOnlyContract = step04.compile(sceneOnly);
assert.deepEqual(sceneOnlyContract.layers.C.prompt_groups[1].events,[]);
console.log('step04_abcd tests passed');
