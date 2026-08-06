const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ASSET_TYPES = Object.freeze(['wardrobe','scene','prop','document','text-screen','phone-ui']);
const IMPORTANCE = Object.freeze(['lead','important','supporting']);

function plannerError(code,message,httpStatus=502){const error=new Error(message||code);error.code=code;error.httpStatus=httpStatus;return error;}
function extractText(value){if(typeof value?.output_text==='string')return value.output_text;for(const item of value?.output||[])for(const content of item?.content||[])if(typeof content?.text==='string')return content.text;throw plannerError('STEP03_PLANNER_TEXT_MISSING','第三步规划未返回结构化结果');}
async function sourceVisionEvidence(input,evidenceRoot){
  if(!evidenceRoot||!input?.source_authority?.shots?.length)return[];
  const manifestValue=JSON.parse(await fs.promises.readFile(path.join(evidenceRoot,'artifacts','shotlevel_start_mid_end_manifest.json'),'utf8'));
  const manifest=Array.isArray(manifestValue)?manifestValue:manifestValue.frames;
  const blocks=[];
  for(const shot of input.source_authority.shots){
    const sequence=Number(String(shot.shot_id||'').slice(1));
    const authority=(shot.frame_evidence||[]).find(item=>item.point==='mid');
    const relative=String(authority?.relative_path||'').replace(/\\/g,'/');
    if(!authority||!relative||path.isAbsolute(relative)||relative.includes('\0')||path.posix.normalize(relative)!==relative||relative.startsWith('../'))throw plannerError('STEP03_PLANNER_SOURCE_FRAME_MISSING','Step01 权威镜头缺少中间关键帧',503);
    const artifactsRoot=path.resolve(evidenceRoot,'artifacts'),framePath=path.resolve(artifactsRoot,...relative.split('/'));
    if(!framePath.startsWith(artifactsRoot+path.sep))throw plannerError('STEP03_PLANNER_SOURCE_FRAME_MISSING','Step01 权威镜头缺少中间关键帧',503);
    const bytes=await fs.promises.readFile(framePath);
    if(bytes.length!==Number(authority.bytes)||crypto.createHash('sha256').update(bytes).digest('hex')!==authority.sha256)throw plannerError('STEP03_PLANNER_SOURCE_FRAME_INTEGRITY_FAILED','Step01 权威关键帧完整性校验失败',503);
    const webp=await sharp(bytes,{failOn:'error'}).rotate().resize({width:432,fit:'inside',withoutEnlargement:true}).webp({quality:70,effort:3,smartSubsample:true}).toBuffer();
    blocks.push({type:'input_text',text:'权威原片镜头 '+shot.shot_id+' 中间关键帧；只用于识别原片人物、服装、动作与连续性，不得继承原演员面孔到海外选角。'});
    blocks.push({type:'input_image',image_url:'data:image/webp;base64,'+webp.toString('base64'),detail:'low'});
  }
  return blocks;
}
function stringArray(maxItems,maxLength,pattern){return{type:'array',maxItems,items:{type:'string',minLength:1,maxLength,...(pattern?{pattern}:{})}};}
function planningSchema(){return{type:'object',additionalProperties:false,required:['characters','continuity_ledger','assets','group_annotations'],properties:{
  characters:{type:'array',minItems:1,maxItems:30,items:{type:'object',additionalProperties:false,required:['character_id','source_identity','localized_identity','function','importance','target_casting','age_band','relationship','profession','appearance_shot_ids'],properties:{character_id:{type:'string',pattern:'^C\\d{3}$'},source_identity:{type:'string',minLength:1,maxLength:500},localized_identity:{type:'string',minLength:1,maxLength:500},function:{type:'string',minLength:1,maxLength:900},importance:{type:'string',enum:IMPORTANCE},target_casting:{type:'string',minLength:1,maxLength:900},age_band:{type:'string',minLength:1,maxLength:120},relationship:{type:'string',minLength:1,maxLength:500},profession:{type:'string',minLength:1,maxLength:500},appearance_shot_ids:stringArray(37,4,'^S\\d{3}$')}}},
  continuity_ledger:{type:'array',maxItems:160,items:{type:'object',additionalProperties:false,required:['appearance_id','character_id','continuity_block_id','source_shot_ids','source_wardrobe_evidence','decision','change_reason'],properties:{appearance_id:{type:'string',pattern:'^AP-[A-Za-z0-9-]{1,80}$'},character_id:{type:'string',pattern:'^C\\d{3}$'},continuity_block_id:{type:'string',pattern:'^CB-[A-Za-z0-9-]{1,80}$'},source_shot_ids:stringArray(37,4,'^S\\d{3}$'),source_wardrobe_evidence:{type:'string',minLength:1,maxLength:1000},decision:{type:'string',enum:['first_appearance','reuse','wardrobe_change']},change_reason:{type:'string',minLength:1,maxLength:1000}}}},
  assets:{type:'array',maxItems:160,items:{type:'object',additionalProperties:false,required:['asset_id','canonical_type','name','description','owner_character_id','dependencies','used_by_shots','prompt','reference_strategy','visible_text_original','visible_text_localized'],properties:{asset_id:{type:'string',pattern:'^A-[A-Z]+-[A-Za-z0-9-]{1,80}$'},canonical_type:{type:'string',enum:ASSET_TYPES},name:{type:'string',minLength:1,maxLength:240},description:{type:'string',minLength:1,maxLength:1600},owner_character_id:{type:['string','null'],pattern:'^C\\d{3}$'},dependencies:stringArray(20,4,'^C\\d{3}$'),used_by_shots:stringArray(37,4,'^S\\d{3}$'),prompt:{type:'string',minLength:20,maxLength:5000},reference_strategy:{type:'string',enum:['text_to_image','character_image_to_image']},visible_text_original:{type:['string','null'],maxLength:1600},visible_text_localized:{type:['string','null'],maxLength:1600}}}},
  group_annotations:{type:'array',minItems:1,maxItems:80,items:{type:'object',additionalProperties:false,required:['group_id','difficulty_types','asset_ids','visual_goal'],properties:{group_id:{type:'string',pattern:'^G(?:\\d{3}|-[a-f0-9]{8})$'},difficulty_types:stringArray(12,80),asset_ids:stringArray(80,100,'^A-[A-Z]+-[A-Za-z0-9-]{1,80}$'),visual_goal:{type:'string',minLength:1,maxLength:1600}}}}
}};}

function assertUnique(rows,key,code){const seen=new Set();for(const row of rows){if(seen.has(row[key]))throw plannerError(code,'第三步规划存在重复标识',422);seen.add(row[key]);}}
function normalizeContinuityLedger(rows){
  const normalized=[],seenIds=new Set(),seenRows=new Set();
  for(const source of rows){
    const row=JSON.parse(JSON.stringify(source));
    const signature=JSON.stringify({character_id:row.character_id,continuity_block_id:row.continuity_block_id,source_shot_ids:row.source_shot_ids,source_wardrobe_evidence:row.source_wardrobe_evidence,decision:row.decision,change_reason:row.change_reason});
    if(seenRows.has(signature))continue;
    seenRows.add(signature);
    if(seenIds.has(row.appearance_id))row.appearance_id='AP-'+String(row.character_id||'C000')+'-'+crypto.createHash('sha256').update(signature).digest('hex').slice(0,16);
    while(seenIds.has(row.appearance_id))row.appearance_id+='-2';
    seenIds.add(row.appearance_id);
    normalized.push(row);
  }
  return normalized;
}
function normalizeShotReferences(value,shotIds){
  const keep=ids=>[...new Set((Array.isArray(ids)?ids:[]).filter(id=>shotIds.has(id)))];
  for(const row of value.continuity_ledger)row.source_shot_ids=keep(row.source_shot_ids);
  value.continuity_ledger=value.continuity_ledger.filter(row=>row.source_shot_ids.length);
  for(const row of value.characters){
    row.appearance_shot_ids=keep(row.appearance_shot_ids);
    if(!row.appearance_shot_ids.length)row.appearance_shot_ids=keep(value.continuity_ledger.filter(item=>item.character_id===row.character_id).flatMap(item=>item.source_shot_ids));
  }
  return value;
}
function normalizeAssetDependencies(value){
  const characterIds=new Set(value.characters.map(row=>row.character_id));
  for(const row of value.assets){
    row.dependencies=[...new Set(Array.isArray(row.dependencies)?row.dependencies:[])];
    if(row.reference_strategy!=='character_image_to_image'||row.dependencies.length)continue;
    if(row.owner_character_id&&characterIds.has(row.owner_character_id)){
      row.dependencies=[row.owner_character_id];
      continue;
    }
    const usedShots=new Set(Array.isArray(row.used_by_shots)?row.used_by_shots:[]);
    const candidates=value.characters.filter(character=>(character.appearance_shot_ids||[]).some(shotId=>usedShots.has(shotId)));
    if(candidates.length===1)row.dependencies=[candidates[0].character_id];
  }
  return value;
}
function validateMarketCasting(value,context){
  const locale=String(context.locale||'');
  const forbidden=/(?:中国|华人|东亚|亚洲面孔|\bchinese\b|\bchin[oa]s?\b|\beast asian\b)/i;
  const mexico=/(?:墨西哥|拉丁美洲|拉美|\bmexican[oa]s?\b|\blatin[oa]s?\b|\blatinoamerican[oa]s?\b)/i;
  for(const row of value.characters){
    const casting=String(row.target_casting||'');
    if(forbidden.test(casting))throw plannerError('STEP03_PLANNER_SOURCE_ETHNICITY_LEAK','目标地区选角继承了中国原演员身份',422);
    if(locale==='es-MX'&&!mexico.test(casting))throw plannerError('STEP03_PLANNER_MARKET_CASTING_REQUIRED','墨西哥版本缺少可信墨西哥或拉美选角约束',422);
  }
  return value;
}
function validatePlanningResult(value,context={}){
  if(!value||!Array.isArray(value.characters)||!value.characters.length||!Array.isArray(value.continuity_ledger)||!Array.isArray(value.assets)||!Array.isArray(value.group_annotations))throw plannerError('STEP03_PLANNER_SCHEMA_INVALID','第三步规划结果不符合合同',422);
  value=JSON.parse(JSON.stringify(value));
  value.continuity_ledger=normalizeContinuityLedger(value.continuity_ledger);
  const shotIds=new Set((context.shots||[]).map(row=>row.shot_id));
  value=normalizeShotReferences(value,shotIds);
  value=normalizeAssetDependencies(value);
  value=validateMarketCasting(value,context);
  assertUnique(value.characters,'character_id','STEP03_PLANNER_CHARACTER_DUPLICATE');assertUnique(value.continuity_ledger,'appearance_id','STEP03_PLANNER_APPEARANCE_DUPLICATE');assertUnique(value.assets,'asset_id','STEP03_PLANNER_ASSET_DUPLICATE');assertUnique(value.group_annotations,'group_id','STEP03_PLANNER_GROUP_DUPLICATE');
  const groupIds=new Set((context.groups||[]).map(row=>row.group_id)),characterIds=new Set(value.characters.map(row=>row.character_id)),assetIds=new Set(value.assets.map(row=>row.asset_id));
  const requireShots=(ids,code)=>{if(!Array.isArray(ids)||!ids.length||ids.some(id=>!shotIds.has(id)))throw plannerError(code,'第三步规划引用了无效源镜头',422);};
  for(const row of value.characters){if(!IMPORTANCE.includes(row.importance))throw plannerError('STEP03_PLANNER_CHARACTER_INVALID','第三步角色重要等级无效',422);requireShots(row.appearance_shot_ids,'STEP03_PLANNER_CHARACTER_SHOTS_INVALID');}
  for(const row of value.continuity_ledger){if(!characterIds.has(row.character_id))throw plannerError('STEP03_PLANNER_CONTINUITY_CHARACTER_INVALID','连续性表引用了无效角色',422);requireShots(row.source_shot_ids,'STEP03_PLANNER_CONTINUITY_SHOTS_INVALID');}
  for(const row of value.assets){if(!ASSET_TYPES.includes(row.canonical_type)||!Array.isArray(row.dependencies)||row.dependencies.some(id=>!characterIds.has(id))||(row.owner_character_id!==null&&!characterIds.has(row.owner_character_id)))throw plannerError('STEP03_PLANNER_ASSET_DEPENDENCY_INVALID','资产依赖无效',422);requireShots(row.used_by_shots,'STEP03_PLANNER_ASSET_SHOTS_INVALID');if(row.reference_strategy==='character_image_to_image'&&!row.dependencies.length)throw plannerError('STEP03_PLANNER_ASSET_REFERENCE_INVALID','图生图资产缺少已确认人物依赖',422);if(['document','text-screen','phone-ui'].includes(row.canonical_type)&&!String(row.visible_text_localized||'').trim())throw plannerError('STEP03_PLANNER_LOCALIZED_TEXT_REQUIRED','文字资产缺少目标地区文案',422);}
  for(const row of value.group_annotations){if(!groupIds.has(row.group_id)||row.asset_ids.some(id=>!assetIds.has(id)))throw plannerError('STEP03_PLANNER_GROUP_REFERENCE_INVALID','生产组规划引用无效',422);}
  if(!value.characters.some(row=>row.importance==='lead'))throw plannerError('STEP03_PLANNER_LEAD_REQUIRED','第三步规划缺少主角',422);
  return JSON.parse(JSON.stringify(value));
}

function createPlanningClient(options={}){
  const fetchImpl=options.fetchImpl||global.fetch;
  const base=String(options.baseUrl||process.env.NIANNIAN_STEP03_GPT_API_BASE_URL||'').replace(/\/+$/,'');
  const endpointPath=String(options.responsesPath||process.env.NIANNIAN_STEP03_GPT_RESPONSES_PATH||'/responses');
  const model=String(options.model||process.env.NIANNIAN_STEP03_GPT_MODEL||'gpt-5.6-sol');
  const bundleRoot=options.bundleRoot?path.resolve(options.bundleRoot):null;
  function profile(){const key=String(options.apiKey||process.env.KRILL_CODEX_API_KEY||'').trim();if(!base||!/^https:\/\//.test(base)||!endpointPath.startsWith('/')||!key)throw plannerError('KRILL_STEP03_PROFILE_NOT_CONFIGURED','Krill GPT-5.6 服务器规划配置未就绪',503);return{key,url:base+endpointPath};}
  function bundleInstructions(){if(options.instructions)return String(options.instructions);if(!bundleRoot)throw plannerError('STEP03_SKILL_BUNDLE_REQUIRED','第三步规划缺少 Skill Bundle',503);return fs.readFileSync(path.join(bundleRoot,'instructions.md'),'utf8');}
  async function plan(input){const {key,url}=profile();const context={shots:input.shots||[],groups:input.groups||[],locale:input.locale,market:input.market};const visualEvidence=await sourceVisionEvidence(input,options.evidenceRoot);const structuredInput={action:'shortdrama_step03_visual_plan',locale:input.locale,market:input.market,language:input.language,global_context:input.global_context,source_authority:input.source_authority,shots:input.shots,production_groups:input.groups,rules:{source_authority_precedence:'step01_frames_dialogue_ocr_over_step02_localized_inference',production_group_seconds:'8-15',runninghub_only:true,important_character_candidates:2,unique_appearance_ids:true,character_image_dependencies_required:true,target_market_casting_required:true,source_actor_identity_forbidden:true,local_pixel_edit_forbidden:true}};const body={model,store:false,instructions:bundleInstructions()+'\n你是念念AI第三步结构化视觉生产规划器。人物数量、人物出场镜头、服装和动作必须先服从 Step01 source_authority 及随附的逐镜头权威关键帧；Step02 只提供地区化身份与文化改编，不得反向改写原片人物事实。跨镜头按脸、发型、服装和对白关系合并同一人物，不能把同一人重复建档，也不能把不同人合并。只规划实际被镜头引用的资产；不得调用工具；不得生成图片；不得继承中国原演员身份、面孔或族裔外观。墨西哥版本的每个角色都必须在 target_casting 中明确写出可信墨西哥或拉美选角，不得写中国、中国人、华人、东亚或 Chinese/chino/china。localized_identity 可以保留上游已确认的角色称呼，但视觉身份必须完全目标地区化。continuity_ledger 的 appearance_id 必须全局唯一，不得重复输出同一出现记录；reference_strategy 为 character_image_to_image 时 dependencies 必须包含确切 character_id，并优先与 owner_character_id 一致；严格返回 JSON。',input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(structuredInput)},...visualEvidence]}],text:{format:{type:'json_schema',name:'niannian_step03_visual_plan_v1',strict:true,schema:planningSchema()}}};let response;try{response=await fetchImpl(url,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(30000,Number(process.env.NIANNIAN_STEP03_GPT_TIMEOUT_MS||180000)))});}catch(error){throw plannerError('KRILL_STEP03_PLANNER_NETWORK_FAILED','Krill 第三步规划网络请求失败');}if(!response.ok)throw plannerError('KRILL_STEP03_PLANNER_HTTP_'+response.status,'Krill 第三步规划请求失败 ('+response.status+')');let value;try{value=JSON.parse(extractText(await response.json()));}catch(error){if(error.code)throw error;throw plannerError('STEP03_PLANNER_JSON_INVALID','第三步规划未返回有效 JSON',422);}return validatePlanningResult(value,context);}
  return{plan,probe(){return{configured:Boolean(base&&/^https:\/\//.test(base)&&(options.apiKey||process.env.KRILL_CODEX_API_KEY)&&bundleRoot),wire_api:'responses',model,provider:'krill'}},schema:planningSchema};
}

module.exports={createPlanningClient,planningSchema,validatePlanningResult,extractText,sourceVisionEvidence,plannerError,ASSET_TYPES,IMPORTANCE};
