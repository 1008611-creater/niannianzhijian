'use strict';

const clean = require('../../bridge/niannian_step02_clean_handoff');

const PROJECT_ID = 'NN-20260715083045-8120F5';
const REVISION_ID = 'analysis-20260727-full-evidence-r1';
const hex = character => character.repeat(64);
const shotId = index => 'S' + String(index).padStart(3, '0');
const seconds = index => Number(((index - 1) * 2.5).toFixed(2));
const time = value => '00:' + String(Math.floor(value)).padStart(2, '0') + '.' + String(Math.round((value % 1) * 100)).padStart(2, '0');

function authorityFixture() {
  const revision = {
    schema_version:'niannian.step01_authority_revision.v1',project_id:PROJECT_ID,revision_id:REVISION_ID,
    source_sha256:hex('a'),source_bytes:9876543,source_revision:3,strict_manifest_sha256:hex('b'),
    full_evidence_index_sha256:null,ledger_snapshot_sha256:null,status:'accepted'
  };
  const core = {
    schema_version:'niannian.step01_current_authority.v1',project_id:PROJECT_ID,revision_id:REVISION_ID,
    source_sha256:revision.source_sha256,source_bytes:revision.source_bytes,source_revision:revision.source_revision,
    strict_manifest_sha256:revision.strict_manifest_sha256,full_evidence_index_sha256:revision.full_evidence_index_sha256,
    previous_revision_id:'analysis-20260726-prior',promoted_at:'2026-07-27T06:00:00.000Z'
  };
  const shots = Array.from({length:37}, (_, offset) => ({shot_id:shotId(offset + 1),start_sec:seconds(offset + 1),end_sec:seconds(offset + 1) + 2.5}));
  const projection_frames=shots.flatMap((shot,offset)=>['start','mid','end'].map((role,index)=>({projection_id:'PRJ-'+String(offset*3+index+1).padStart(3,'0'),shot_id:shot.shot_id,role}))).slice(0,111);
  const ledgerCore = {schema_version:'niannian.step01_source_shot_ledger.v1',project_id:PROJECT_ID,source_sha256:revision.source_sha256,counts:{shots:37,frame_evidence:111},shots,projection_frames};
  const ledger = {...ledgerCore,snapshot_sha256:clean.sha256(clean.canonical(ledgerCore))};
  const indexCore = {schema_version:'niannian.step01_full_evidence_index.v1',project_id:PROJECT_ID,source_sha256:revision.source_sha256,observations:Array.from({length:254},(_, index)=>({observation_id:'OBS-'+String(index+1).padStart(3,'0'),source_sec:Number((index*0.35).toFixed(2)),visual_fact:'证据观察 '+String(index+1)}))};
  const fullEvidenceIndex = {...indexCore,index_sha256:clean.sha256(clean.canonical(indexCore))};
  revision.ledger_snapshot_sha256=ledger.snapshot_sha256;revision.full_evidence_index_sha256=fullEvidenceIndex.index_sha256;
  core.strict_manifest_sha256=revision.strict_manifest_sha256;core.full_evidence_index_sha256=revision.full_evidence_index_sha256;
  const pointer = {...core,pointer_sha256:clean.sha256(clean.canonical(core))};
  const pointerEvidence=clean.artifactEnvelope(pointer,'fixture/authority/current.json');
  const revisionEvidence=clean.artifactEnvelope(revision,'fixture/authority/revision.json');
  const ledgerEvidence=clean.artifactEnvelope(ledger,'fixture/authority/source-ledger.json');
  const fullEvidenceIndexEvidence=clean.artifactEnvelope(fullEvidenceIndex,'fixture/authority/full-evidence-index.json');
  const resolution = clean.resolveAcceptedAuthority({pointer:pointerEvidence,revision:revisionEvidence,ledger:ledgerEvidence,fullEvidenceIndex:fullEvidenceIndexEvidence,expectedRevisionId:REVISION_ID});
  const binding = resolution.binding;
  const evidenceWindows=[
    {window_id:'W001',source_start_sec:.4,source_end_sec:1.2,classification:'confirmed_dialogue',dialogue_id:'D001',evidence_basis:['vad','dense_review']},
    {window_id:'W002',source_start_sec:10.2,source_end_sec:11.4,classification:'confirmed_dialogue',dialogue_id:'D002',evidence_basis:['vad','phone_state']},
    {window_id:'W003',source_start_sec:20.05,source_end_sec:20.25,classification:'confirmed_dialogue',dialogue_id:'D003',short_candidate_confirmed:true,evidence_basis:['vad','dense_0.1s_review']},
    {window_id:'W004',source_start_sec:40,source_end_sec:40.6,classification:'background_voice',evidence_basis:['vad','ambient_review']},
    {window_id:'W005',source_start_sec:70,source_end_sec:70.3,classification:'hallucination',evidence_basis:['vad','dense_review']}
  ];
  return {pointer,revision,ledger,fullEvidenceIndex,pointerEvidence,revisionEvidence,ledgerEvidence,fullEvidenceIndexEvidence,resolution,binding,evidenceWindows,ledgerShotIds:shots.map(item=>item.shot_id)};
}

function blockerFixture(overrides = {}) {
  return {
    blocker_id:'B001',class:'evidence',code:'DIALOGUE_TEXT_UNRESOLVED',scope:'window:W001',owner:'step02-evidence-owner',
    critical:true,retryable:true,automatic_retry_allowed:false,resume_event:'dense_window_reviewed',evidence_refs:['EVID-W001'],
    blocker_signature:hex('e'),created_at:'2026-07-27T06:30:00.000Z',terminal_state:null,
    public_message:'一处短对白仍在核对，完成后才能进入下一步。',...overrides
  };
}

function candidateFixture({withBlocker = false} = {}) {
  const authority = authorityFixture();
  const visualFactCards = authority.ledgerShotIds.map((id,index)=>({fact_id:'VF'+String(index+1).padStart(3,'0'),shot_ids:[id],fact_type:index===4?'phone_state':'composition',visible_fact:index===4?'床上通话女性侧卧持手机，红裙女主未出现在该空间。':'人物位于画面左侧，固定机位保持空间方向，前景道具状态连续。',evidence_refs:['OBS-'+String(index*3+1).padStart(3,'0')]}));
  const dialogueBindings = [
    {dialogue_id:'D001',source_start_sec:0.4,source_end_sec:1.2,onset_shot:'S001',best_evidence_shot:'S001',source_speaker:'红裙女主',source_text:'你来了。',evidence_basis:['mimo_candidate','forced_alignment_time','dense_subtitle_review','onscreen_mouth'],speaker_attribution_status:'onscreen_mouth'},
    {dialogue_id:'D002',source_start_sec:10.2,source_end_sec:11.4,onset_shot:'S005',best_evidence_shot:'S005',source_speaker:'床上通话女性',source_text:'我现在不方便。',evidence_basis:['phone_state','forced_alignment_time','subtitle_review'],speaker_attribution_status:'phone_voice'},
    {dialogue_id:'D003',source_start_sec:20.05,source_end_sec:20.25,onset_shot:'S009',best_evidence_shot:'S009',source_speaker:'红裙女主',source_text:'嗯。',evidence_basis:['dense_0.1s_review','subtitle_review','onscreen_mouth'],speaker_attribution_status:'onscreen_mouth'}
  ];
  const textEvidence = [{text_evidence_id:'TE001',shot_id:'S013',source_start_sec:30.1,source_end_sec:31.8,text_type:'phone',source_text:'来电中',screen_region:'手机屏幕中央',story_use:'证明电话仍在接通',evidence_basis:['targeted_ui_ocr','native_visual_review'],terminal_state:'visible_silent'}];
  const sourceRows = authority.ledgerShotIds.map((id,index)=>{
    const start=seconds(index+1), end=start+2.5;
    return {
      shot_id:id,source_start_sec:start,source_end_sec:end,time_label:time(start)+'–'+time(end),story_function:index===0?'人物进入冲突':'承接人物反应与空间连续',
      visual_composition:index===12?'手机近景占画面右侧，屏幕正面可读，手指停在屏幕边缘。':'中近景固定机位，人物与前景道具分层清楚，冷色侧光方向稳定。',
      blocking_movement:index===4?'床上通话女性位于画面右侧并面向左方，红裙女主不在场。':'主体保持画面左侧，朝右侧对手方向转身，未跨越镜头轴线。',
      continuity_state:'服装、手机状态、道具位置与相邻镜头一致。',
      dialogue_ids:dialogueBindings.filter(item=>item.onset_shot===id).map(item=>item.dialogue_id),
      text_evidence_ids:textEvidence.filter(item=>item.shot_id===id).map(item=>item.text_evidence_id),visual_fact_ids:['VF'+String(index+1).padStart(3,'0')]
    };
  });
  return {
    authority,
    candidate:{
      schema_version:clean.SCHEMA_VERSION,status:'candidate',downstream_consumable:false,test_only:true,fixture_evidence:true,
      authority_binding:authority.binding,source_media_contract:{duration_seconds:92.5,time_axis:'accepted_source_seconds_frozen'},
      sourceRows,dialogueBindings,visualFactCards,textEvidence,
      assetCandidates:[
        {asset_id:'CHAR-RED-DRESS',asset_type:'character',first_seen_shot:'S001',visual_identity:'穿红裙、长发、站立质问的女性',story_function:'冲突发起者'},
        {asset_id:'CHAR-BED-CALLER',asset_type:'character',first_seen_shot:'S005',visual_identity:'卧室床上接听电话的女性',story_function:'电话另一端关系节点'},
        {asset_id:'PROP-PHONE',asset_type:'prop',first_seen_shot:'S005',visual_identity:'亮屏智能手机',story_function:'维持通话状态并承载可见文字'}
      ],
      hardSceneCandidates:[{candidate_id:'H001',shots:['S013'],source_timecode:'00:30.00–00:32.50',difficulty_type:'readable_screen_evidence',difficulty_label:'可读手机画面',source_visual_info:'手机正面朝向镜头，来电状态文字位于屏幕中央，手指不得遮住文字。',why_normal_prompt_may_fail:'手机角度、手指位置和可读状态文字需要同时成立。',first_state_lock_target:'手机朝向、手指边缘、来电文字区域与人物握持姿势。',suggested_followup:'由 Step04 困难镜头门判断是否需要首态锚点。'}],
      blockers:withBlocker?[blockerFixture()]:[],effects:clean.falseEffects(),
      metrics:clean.reduceMetrics(withBlocker?[{type:'blocker_opened'}]:[],{ocr:false,submissions:false,recovery:false,speaker_review:false})
    }
  };
}

module.exports = {PROJECT_ID,REVISION_ID,authorityFixture,blockerFixture,candidateFixture,hex,shotId};
