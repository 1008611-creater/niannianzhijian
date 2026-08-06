const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const redrawCanonicalDag = require('./niannian_redraw_canonical_dag');
const {validatePlanningResult} = require('./niannian_step03_planner');
const step01SourceLedger = require('./niannian_step01_source_ledger');

const LOCALES = Object.freeze({
  'es-MX': {market:'Mexico',label:'墨西哥',language:'Spanish (Mexico)'},
  'pt-BR': {market:'Brazil',label:'巴西',language:'Portuguese (Brazil)'},
  'en-US': {market:'United States',label:'美国',language:'English (United States)'}
});
const PLAN_SCHEMA = 'niannian.step03_plan.v1';
const STATE_SCHEMA = 'niannian.step03_state.v1';
const SNAPSHOT_SCHEMA = 'niannian.step03_snapshot.v1';
const BUNDLE_VERSION = 'shortdrama-visual-assets-runtime-1';
const GROUPING_POLICY_VERSION = 'source-shots-8-15-v1';
const CHARACTER_AUTHORITY_PROMPT_VERSION = 'character-authority-sheet-v3.4-ciwei-character-only-board';
const IMAGE_RESOLUTIONS = new Set(['1k','2k','4k']);
const SKILL_OVERRIDE = Object.freeze({min_seconds:8,max_seconds:15,first_frame_per_group:true,overrides:['mx-shortdrama-04:4-15s','mx-shortdrama-05:hard-scenes-only']});
const STYLE_PROFILE_VERSION = 'mexico-english-redraw-style-v1';
const STYLE_CANDIDATE_DEFINITIONS = Object.freeze([
  {style_id:'STYLE-REALISTIC-SHORTDRAMA',title:'写实真人短剧',summary:'自然皮肤、真实会议室光线、轻微电影感',recommended:true,tone:'neutral',prompt_contract:'写实真人竖屏短剧；自然皮肤纹理；真实墨西哥城室内光线；克制的轻微电影感；不改变原片九镜头、动作关系、站位和剧情。'},
  {style_id:'STYLE-CINEMATIC-WARM',title:'温暖电影质感',summary:'暖色实景光线、柔和层次、精致但不过度修饰',recommended:false,tone:'warm',prompt_contract:'墨西哥城市写实电影质感；温暖实景光线；柔和高光和自然阴影；精致但不过度修饰；不改变原片九镜头、动作关系、站位和剧情。'},
  {style_id:'STYLE-DOCUMENTARY-NATURAL',title:'自然纪实质感',summary:'低修饰、环境光主导、表演更生活化',recommended:false,tone:'documentary',prompt_contract:'墨西哥城市自然纪实质感；低修饰真实皮肤；环境光主导；生活化表演；稳定清晰的竖屏画面；不改变原片九镜头、动作关系、站位和剧情。'}
]);

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function latestTask(tasks, ids, type) { return (tasks || []).filter(task => (ids || []).includes(task.task_id) && task.type === type).at(-1); }
function sha256(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function codedError(code, httpStatus, message) { const error = new Error(message || code); error.code = code; error.httpStatus = httpStatus; return error; }
function safeSegment(value, pattern = /^[A-Za-z0-9._:-]{1,160}$/) { const output = String(value || ''); if (!pattern.test(output)) throw codedError('STEP03_IDENTIFIER_INVALID',422,'标识无效'); return output; }
function normalizeImageResolution(value) { const output=String(value||'1k').toLowerCase();if(!IMAGE_RESOLUTIONS.has(output))throw codedError('STEP03_RESOLUTION_INVALID',422,'图片清晰度仅支持 1K、2K 或 4K');return output; }
function normalizeEtag(value) { return String(value || '').replace(/^W\//,''); }
function now() { return new Date().toISOString(); }

function styleCandidate(definition) {
  const candidate={style_id:definition.style_id,title:definition.title,summary:definition.summary,recommended:definition.recommended===true,tone:definition.tone,profile_version:STYLE_PROFILE_VERSION,prompt_contract:definition.prompt_contract};
  return {...candidate,candidate_sha256:sha256(canonical(candidate))};
}
function createStyleReview() {
  const candidates=STYLE_CANDIDATE_DEFINITIONS.map(styleCandidate),recommended=candidates.find(row=>row.recommended)||candidates[0];
  return{profile_version:STYLE_PROFILE_VERSION,status:'awaiting_confirmation',selected_style_id:recommended.style_id,selected_candidate_sha256:recommended.candidate_sha256,authority_event:null,candidates};
}
function ensureStyleReview(state) {
  if(!state.style_review||state.style_review.profile_version!==STYLE_PROFILE_VERSION)state.style_review=createStyleReview();
  return state.style_review;
}
function confirmedStyle(state) {
  const review=ensureStyleReview(state),candidate=review.candidates.find(row=>row.style_id===review.selected_style_id&&row.candidate_sha256===review.selected_candidate_sha256);
  return review.status==='confirmed'&&review.authority_event?.candidate_sha256===candidate?.candidate_sha256?candidate:null;
}
function requireConfirmedStyle(state) {
  const candidate=confirmedStyle(state);
  if(!candidate)throw codedError('STEP03_STYLE_CONFIRMATION_REQUIRED',409,'请先确认本批视觉风格');
  return candidate;
}
function stylePromptSuffix(state) {
  const candidate=requireConfirmedStyle(state);
  return '\n[已确认视觉风格] '+candidate.prompt_contract+' 风格权威版本：'+candidate.profile_version+'。';
}

function artifactExtension(mime) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  return '.png';
}
function validateArtifactKey(value) {
  const key=String(value||'');
  if(!key||path.isAbsolute(key)||key.includes('\\')||key.includes('\0')||path.posix.normalize(key)!==key||!/^artifacts\/ART-[a-f0-9]{24}\.(png|jpg|webp)$/.test(key))throw codedError('STEP03_ARTIFACT_KEY_INVALID',503,'图片存储键无效');
  return key;
}
function artifactPathFromKey(directory,key) {
  const validated=validateArtifactKey(key),filePath=path.resolve(directory,...validated.split('/')),artifactsRoot=path.resolve(directory,'artifacts');
  if(filePath===artifactsRoot||!filePath.startsWith(artifactsRoot+path.sep))throw codedError('STEP03_ARTIFACT_PATH_INVALID',503,'图片路径无效');
  return filePath;
}
async function resolveTaskArtifact({directory,task,verify=true}) {
  if(!task?.artifact_id||!task?.artifact_sha256||!Number.isSafeInteger(Number(task.artifact_bytes))||Number(task.artifact_bytes)<=0)throw codedError('STEP03_ARTIFACT_NOT_FOUND',404,'图片不存在');
  const key=task.artifact_key?validateArtifactKey(task.artifact_key):validateArtifactKey('artifacts/'+task.artifact_id+artifactExtension(task.artifact_mime));
  const filePath=artifactPathFromKey(directory,key),stats=await fsp.stat(filePath).catch(()=>null);
  if(!stats||!stats.isFile())throw codedError('STEP03_ARTIFACT_NOT_FOUND',404,'图片不存在');
  if(stats.size!==Number(task.artifact_bytes))throw codedError('STEP03_ARTIFACT_INTEGRITY_FAILED',503,'图片校验失败');
  let actualSha=task.artifact_sha256;
  if(verify){actualSha=sha256(await fsp.readFile(filePath));if(actualSha!==task.artifact_sha256)throw codedError('STEP03_ARTIFACT_INTEGRITY_FAILED',503,'图片校验失败');}
  return{path:filePath,key,bytes:stats.size,sha256:actualSha,mime:task.artifact_mime||'image/png',filename:task.artifact_id+artifactExtension(task.artifact_mime)};
}

async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath,'utf8')); }
async function atomicWriteJson(filePath, value, {exclusive = false} = {}) {
  await fsp.mkdir(path.dirname(filePath),{recursive:true});
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  try {
    if (exclusive) {
      try { await fsp.link(temporary,filePath); return true; }
      catch (error) { if (error.code === 'EEXIST') return false; throw error; }
      finally { await fsp.rm(temporary,{force:true}); }
    }
    for (let attempt=0;attempt<5;attempt+=1) {
      try { await fsp.rename(temporary,filePath); return true; }
      catch (error) {
        if (process.platform !== 'win32' || !['EEXIST','EPERM'].includes(error.code) || attempt === 4) throw error;
        await fsp.rm(filePath,{force:true});
      }
    }
  } catch (error) { await fsp.rm(temporary,{force:true}).catch(()=>{}); throw error; }
  return false;
}

function groupDuration(shots) { return Number((Number(shots.at(-1).end_sec) - Number(shots[0].start_sec)).toFixed(3)); }
function productionGroup(shots,index,reason,exceptionCode = null,exceptionReason = null) {
  return {
    group_id:'G' + String(index + 1).padStart(3,'0'), sequence:index + 1,
    source_shot_ids:shots.map(shot=>shot.shot_id), start_sec:Number(shots[0].start_sec), end_sec:Number(shots.at(-1).end_sec),
    duration_sec:groupDuration(shots), boundary_reason:reason, exception_code:exceptionCode, exception_reason:exceptionReason,
    dialogue_bindings:shots.flatMap(shot=>(shot.target_dialogue ? [{shot_id:shot.shot_id,text:shot.target_dialogue}] : [])),
    action_summary:shots.map(shot=>shot.action).filter(Boolean).join(' / ').slice(0,2400),
    asset_dependencies:[], difficulty_types:[], revision:1, status:'unprepared', invalidated_downstream_ids:[]
  };
}

function buildProductionGroups(sourceShots, options = {}) {
  if (!Array.isArray(sourceShots) || !sourceShots.length) throw codedError('STEP03_SOURCE_SHOTS_REQUIRED',422,'缺少源镜头');
  const shots = sourceShots.map((shot,index)=>({
    ...shot,shot_id:safeSegment(shot.shot_id,/^S\d{3}$/),start_sec:Number(shot.start_sec),end_sec:Number(shot.end_sec),_index:index
  }));
  if (shots.some((shot,index)=>!Number.isFinite(shot.start_sec)||!Number.isFinite(shot.end_sec)||shot.end_sec<=shot.start_sec||(index&&shot.start_sec<shots[index-1].end_sec-0.25))) throw codedError('STEP03_SOURCE_TIMELINE_INVALID',422,'源镜头时间线无效');
  const hard = new Set((options.hardBoundariesAfter || []).map(String));
  const groups = [];
  let cursor = 0;
  while (cursor < shots.length) {
    let end = cursor;
    let lastCandidate = null;
    let forced = null;
    while (end < shots.length) {
      const slice = shots.slice(cursor,end + 1);
      const duration = groupDuration(slice);
      if (hard.has(shots[end].shot_id)) { forced = {end,duration}; break; }
      if (duration >= 8 && duration <= 15) lastCandidate = end;
      if (duration > 15) break;
      end += 1;
    }
    if (forced) {
      const exception = forced.duration < 8 ? ['hard_boundary_before_min','硬边界早于 8 秒，保留短段'] : forced.duration > 15 ? ['hard_boundary_after_max','硬边界无法在 15 秒内完整收束'] : [null,null];
      const slice = shots.slice(cursor,forced.end + 1);
      groups.push(productionGroup(slice,groups.length,'hard_boundary',...exception));
      cursor = forced.end + 1;
      continue;
    }
    const chosen = lastCandidate ?? Math.max(cursor,Math.min(shots.length - 1,end - 1));
    const slice = shots.slice(cursor,chosen + 1);
    const duration = groupDuration(slice);
    groups.push(productionGroup(slice,groups.length,lastCandidate === null ? 'nearest_source_boundary' : 'latest_complete_boundary',duration < 8 ? 'short_segment_no_valid_boundary' : duration > 15 ? 'long_segment_no_valid_boundary' : null,duration < 8 ? '没有可用的 8–15 秒镜头边界' : duration > 15 ? '单个不可拆镜头超过 15 秒' : null));
    cursor = chosen + 1;
  }
  if (groups.length > 1 && groups.at(-1).duration_sec < 8) {
    const tail = groups.at(-1), previous = groups.at(-2);
    const combinedIds = [...previous.source_shot_ids,...tail.source_shot_ids];
    const combinedShots = combinedIds.map(id=>shots.find(shot=>shot.shot_id===id));
    const crossesHard = previous.source_shot_ids.some(id=>hard.has(id));
    if (!crossesHard && groupDuration(combinedShots) <= 15) {
      groups.splice(groups.length-2,2,productionGroup(combinedShots,groups.length-2,'tail_merged'));
    } else {
      tail.exception_code = 'tail_cannot_merge';
      tail.exception_reason = crossesHard ? '尾段前存在硬边界' : '向前合并会超过 15 秒';
    }
  }
  groups.forEach((group,index)=>{group.group_id='G'+String(index+1).padStart(3,'0');group.sequence=index+1;});
  const flattened = groups.flatMap(group=>group.source_shot_ids);
  if (flattened.length !== shots.length || flattened.some((id,index)=>id!==shots[index].shot_id) || new Set(flattened).size !== shots.length) throw codedError('STEP03_GROUP_COVERAGE_INVALID',500,'生产分组未完整覆盖源镜头');
  return groups;
}

function characterVisualLocks(character, assets = [], continuity = []) {
  const owns = asset => asset.owner_character_id === character.character_id || (asset.dependencies || []).includes(character.character_id);
  const wardrobe = assets.filter(asset => owns(asset) && (asset.canonical_type === 'wardrobe' || /wardrobe|vestuario|服装|换装|dress|vestido|traje|套装/i.test([asset.name,asset.description,asset.prompt].join(' '))));
  const props = assets.filter(asset => owns(asset) && ['prop','document','text-screen','phone-ui'].includes(asset.canonical_type));
  const evidence = continuity.filter(row => row.character_id === character.character_id).map(row => row.source_wardrobe_evidence || row.change_reason || '').filter(Boolean);
  const lockText = [...wardrobe.map(asset => [asset.name,asset.description].filter(Boolean).join('：')), ...evidence].filter(Boolean).join('；').slice(0,1200);
  const propText = props.map(asset => [asset.name,asset.description,asset.visible_text_localized].filter(Boolean).join('：')).filter(Boolean).join('；').slice(0,1600);
  const redLocked = /红|red|rojo|roja|carmes[ií]|granate|vino/i.test(lockText);
  const colorLocked = /红|白|黑|蓝|绿|黄|紫|粉|棕|灰|米|金|银|red|white|black|blue|green|yellow|purple|pink|brown|gray|grey|beige|gold|silver|rojo|roja|blanco|blanca|negro|negra|azul|verde|amarillo|amarilla|morado|morada|rosa|marr[oó]n|gris|dorado|dorada|plateado|plateada/i.test(lockText);
  return {wardrobe:lockText, props:propText, redLocked, colorLocked};
}

function isLikelyMale(character) {
  return /\b(hombre|masculino|var[oó]n|male|man|heredero|pretendiente)\b/i.test([character.target_casting,character.function,character.profession].filter(Boolean).join(' '));
}
function characterIdentityAnchors(character) {
  const base = '必须从已锁定选角事实中为 ' + character.localized_identity + ' 选择并固定三个角色专属锚点：脸部锚点（可记忆的脸型、眉眼关系、鼻唇或面部特征）；轮廓锚点（固定发型或胡须如适用、肩线、腰线/衣装结构、鞋型）；服装锚点（领口、袖型、腰线、面料或非剧情性个人配饰）。剧情道具的事实只供独立资产任务使用，绝不进入本人物总表。';
  const male = isLikelyMale(character);
  return base + (male
    ? '男性角色必须保留其成熟感、发型或胡须细节如适用、肩颈比例和正式服装轮廓；不得套用任何女性角色的长发、红裙、花束或婚姻票据。'
    : '女性角色必须保留其独立发型外轮廓、服装结构与随身物；不得套用其他女性角色的发型、红裙、花束或婚姻票据。');
}
function characterExpressionGrid(character) {
  const facts = [character.localized_identity,character.function,character.profession,character.relationship].filter(Boolean).join(' ');
  if (/rival|antagon|humilla|对手|rival/i.test(facts)) return '冷淡微笑、轻蔑观察、压迫性镇定、短暂意外';
  if (/registro|emplead|funcionari|administrativ|ventanilla|员工|职员/i.test(facts)) return '友善专业、制度化专注、清晰宣布、耐心解释';
  if (/hermana|juguetona|兄妹|sister/i.test(facts)) return '轻松自信、自然开心、好奇观察、瞬间收敛';
  if (isLikelyMale(character)) return '克制真诚、冷静判断、坚定邀请、短暂柔和';
  return '克制愤怒、质疑不解、冷静思考和隐忍克制';
}
function crossCharacterExclusions(character) {
  if (character.character_id === 'C001') return '';
  return '本角色不得复用 C001/Ruoruo 的红裙、花束、Turno 144、婚姻申请、16:50 锁屏、失败来电或 Shen Qingning 身份信息。人物总表不展示任何剧情道具；这些内容只允许由各自独立资产任务生成。';
}

function characterWardrobeDefault(character) {
  const facts = [character.localized_identity,character.function,character.profession,character.relationship].filter(Boolean).join(' ');
  if (/rival|antagon|humilla|对手|rival/i.test(facts)) return '烟灰黑与深墨绿的结构化套装，低调枪灰金属细节，形成冷峻压迫感；不得使用酒红、正红或 C001 的红色体系。';
  if (/registro|emplead|funcionari|administrativ|ventanilla|员工|职员/i.test(facts)) return '石墨黑制度化制服，深青蓝内搭或滚边，干净利落且可信；不得使用酒红、正红或派对化造型。';
  if (/hermana|juguetona|兄妹|sister/i.test(facts)) return '深钴蓝针织上衣与炭黑牛仔或简洁短外套，形成年轻、自在但有辨识度的日常轮廓；不得使用酒红、正红或 C001 的红色体系。';
  if (isLikelyMale(character)) return '石墨灰或深海军蓝的修身正式套装，克制的金属腕表或袖扣作为非剧情性个人配饰；不得使用酒红、棕红或无差别黑衬衫深色西装。';
  return '墨绿色、深海军蓝或石墨灰的结构化主造型，并用腰线、领口、肩线建立固定轮廓；不得使用酒红、正红、白裙、米白裙或无辨识度职业装。';
}

function characterPrompt(character, locale, locks = {}) {
  const market = LOCALES[locale];
  const lockedWardrobe = locks.wardrobe || '按原片连续性和第三步资产规划锁定基础服装';
  const identityAnchors = characterIdentityAnchors(character);
  const expressionGrid = characterExpressionGrid(character);
  const crossCharacterRule = crossCharacterExclusions(character);
  const wardrobeColorRule = locks.redLocked
    ? '基础服装必须是高辨识度红色系主造型，可为深红、酒红或正红短剧女主裙装/套装；不得生成白裙、米白裙或与红色无关的淡色主造型。'
    : locks.colorLocked
      ? '基础服装颜色必须服从锁定服装，不可自动改成无记忆点的白裙、米白裙或泛化职业装。'
      : '基础服装需要主动建立记忆点：' + characterWardrobeDefault(character);
  return [
    '[模板版本] ' + CHARACTER_AUTHORITY_PROMPT_VERSION + '。',
    '[场景身份] 这是一张用于真人海外短剧制作的人物视觉资产总表，只服务于一个角色的身份、体态、服装和表演连续性审核，不是海报，不是故事板，不是商品目录。剧情道具必须由独立资产任务生成，不能混入本图。',
    '[主体] 只允许一个角色：' + character.localized_identity + '。保持原片的年龄层、人物关系、阶层、职业功能和戏剧作用：' + character.function + '。选角：' + character.target_casting + '。年龄范围：' + character.age_band + '。人物关系：' + character.relationship + '。职业：' + character.profession + '。目标市场：' + market.label + '。',
    '[辨识度] 这个角色不能是平庸的泛美女脸或素材库模特，必须像可连续出演整集短剧的主角：清晰可记忆的脸部轮廓、坚定但受伤的眼神、自然不完美的皮肤细节、轻微不对称的真实五官、明确的发型轮廓和一眼能认出的服装色块。美感要商业化，但不能网红化、塑料化或过度精修。',
    '[人物签名] ' + identityAnchors + ' 每个锚点都要在主肖像、三视图、表情区、服装细节和肢体连续性区保持一致；不得临时添加手机、文件、花束、票据、钥匙、屏幕或手包。',
    '[锁定细节] 已锁定服装连续性：' + lockedWardrobe + '。' + wardrobeColorRule + ' 剧情道具/随身物只在独立资产图中生成；本人物总表中的人物保持自然空手，或仅使用无剧情含义的固定个人配饰。',
    '[情绪] 人物的默认表演底色必须体现其短剧功能；在右侧表情区展示同一人物的' + expressionGrid + '四种状态，除表情、视线和轻微头部角度外，不改变身份、发型/胡须如适用、年龄、服装或妆容。',
    '[光线] 干净的中性摄影棚背景，柔和主光从左前方进入，低反差补光，暖中性色温，真实皮肤细微色差、自然发丝、衣料张力和褶皱可见；不要磨皮、塑料皮肤、网红滤镜、夸张霓虹或时尚海报姿势。',
    '[镜头与版式] 16:9 横向，一张精致、克制的真人短剧角色总表，不是海报。不得生成任何装饰性标题、姓名、箭头、红线、标签、网格数字或说明文字。左侧只占约四分之一，是自然中近景主肖像：从发顶到上胸完整入画，人物四周尤其肩部、头顶、左右发丝与底部均保留至少一掌半宽的纯背景安全边距，人物不得接触、跨越或被任何画面边缘和分区线截断。中上区为同一人物的正面、侧面、背面三张完整全身视图，均从发顶到鞋底完整可见。右上区为正面、三分之四、侧面三张头肩细节特写，脸部完整且不贴边。右中区为四张小型表情状态图。中下区必须有五个彼此独立、可一眼区分的服装细节格：领口、袖口、腰部、背部、面料纤维微距；第五格必须明确呈现纤维、织纹或缝线而不是重复人物局部。右下区为六格肢体与造型连续性区，只展示同一角色的自然空手站姿、转身、手部、鞋履、发型后侧和非剧情性个人配饰细节；不得出现任何独立剧情道具、手机、文件、票据、花束、钥匙、屏幕、社交帖、姓名牌或可读文字。所有区域必须清晰分区、层级稳定、视觉上属于同一个专业人物资产总表。',
    '[细节与连续性] 所有视图必须是同一个人的多角度记录，而不是多人拼贴：脸型、眉眼距离、鼻梁、鼻尖、唇形、下颌、发际线、肤色、年龄感和身材比例完全一致。发型、胡须如适用、服装色彩、裁剪、肩腰轮廓、鞋履和非剧情性个人配饰必须完全一致，且必须服从本角色自己的锁定事实。可信的' + market.label + '本地影视选角，保持角色关系、阶层和职业功能；不得继承中国原演员面孔、东亚族裔外观、中国世界元素或中文可见文字。' + crossCharacterRule,
    '[修订依据] 以本角色锁定服装和角色戏剧功能建立记忆点；主肖像必须留出安全边距，右下六格只提供人物肢体与造型连续性。手机、文件、花束、票据、钥匙、屏幕和所有剧情物必须由独立资产任务生成。不得从其他人物板复制发型、服装、人物气质或剧情物。',
    '[负向约束] 不要无记忆点的浅色默认造型（女性角色不得默认白裙、米白裙；男性角色不得默认无差别白衬衫配深色西装），不要无记忆点职业装，不要第二个人、重复角色、多人拼贴、镜面倒影、画中画、额外肢体、错误手指、裁切的头顶下巴耳朵肩膀或鞋，不要手机、文件、票据、花束、钥匙、屏幕、社交帖、姓名牌、工作证、手包或任何独立剧情道具，不要可读文字、Logo、水印、标题、标签、箭头、红色批注、边框标题、海报化构图、乱码、中国元素、原演员身份泄漏、网红脸、塑料皮肤、低辨识度素材模特。'
  ].join('');
}

function hasCurrentCharacterAuthorityTemplate(task) {
  return String(task?.prompt || '').includes('[模板版本] ' + CHARACTER_AUTHORITY_PROMPT_VERSION);
}

function createPlanningResult(variant) {
  const map = Array.isArray(variant.global_context?.character_map) ? variant.global_context.character_map : [];
  const fallback = [...new Set((variant.shots||[]).map(shot=>shot.target_people_identity).filter(Boolean))].slice(0,8).map((identity,index)=>({source_identity:'原片角色'+(index+1),localized_identity:identity,function:'保持原片角色功能与关系'}));
  const rows = map.length ? map : fallback;
  const characters = rows.map((row,index)=>({
    character_id:'C'+String(index+1).padStart(3,'0'),source_identity:String(row.source_identity||'原片角色'+(index+1)).slice(0,500),localized_identity:String(row.localized_identity||row.source_identity||'角色'+(index+1)).slice(0,500),function:String(row.function||'保持原片角色功能').slice(0,900),
    importance:index===0?'lead':index<3?'important':'supporting',appearance_shot_ids:(variant.shots||[]).filter(shot=>String(shot.target_people_identity||'').includes(String(row.localized_identity||''))).map(shot=>shot.shot_id)
  }));
  if (!characters.length) characters.push({character_id:'C001',source_identity:'原片核心角色',localized_identity:LOCALES[variant.locale].label+'核心角色',function:'承载原片核心人物关系和行动',importance:'lead',appearance_shot_ids:(variant.shots||[]).map(shot=>shot.shot_id)});
  const sceneKeys = [];
  for (const shot of variant.shots||[]) {
    const key=String(shot.localized_setting||'目标地区主场景').trim();
    if (key&&!sceneKeys.includes(key)) sceneKeys.push(key);
  }
  return {characters,scenes:sceneKeys.slice(0,12).map((description,index)=>({asset_id:'A-SCENE-'+String(index+1).padStart(3,'0'),description,used_by_shots:(variant.shots||[]).filter(shot=>shot.localized_setting===description).map(shot=>shot.shot_id)}))};
}

function applyPlanningResult(state, rawResult, locale) {
  const result = validatePlanningResult(rawResult,{shots:state.source_shots,groups:state.groups,locale});
  ensureStyleReview(state);
  state.characters = result.characters.map(character=>({
    ...character,
    prompt:null,
    candidate_ids:[],
    selected_candidate_id:null,
    selected_artifact_sha256:null,
    status:'awaiting_candidates'
  }));
  state.continuity_ledger = result.continuity_ledger;
  state.assets = result.assets.map(asset=>{
    const usedByGroups=state.groups.filter(group=>group.source_shot_ids.some(id=>asset.used_by_shots.includes(id))).map(group=>group.group_id);
    const dependencies=[...new Set([...(asset.dependencies||[]),...(asset.owner_character_id?[asset.owner_character_id]:[])])];
    return {...asset,type:asset.canonical_type,purpose:'生产分组引用的'+asset.name,dependencies,used_by_groups:usedByGroups,attempts:[],prompt_revisions:[],accepted_artifact_sha256:null,status:dependencies.length?'blocked':'awaiting_generation'};
  });
  for(const character of state.characters) character.prompt=characterPrompt(character,locale,characterVisualLocks(character,state.assets,state.continuity_ledger));
  const annotations=new Map(result.group_annotations.map(row=>[row.group_id,row]));
  for(const group of state.groups){
    const annotation=annotations.get(group.group_id);
    group.difficulty_types=annotation?.difficulty_types||[];
    group.visual_goal=annotation?.visual_goal||group.action_summary;
    group.asset_dependencies=state.assets.filter(asset=>asset.used_by_groups.includes(group.group_id)).map(asset=>asset.asset_id);
  }
  state.firstframes=state.groups.map(group=>({group_id:group.group_id,candidate_ids:[],selected_candidate_id:null,selected_artifact_sha256:null,status:'awaiting_generation'}));
  state.status='character_review';
  state.substep='characters';
  state.error=null;
  state.planning_sha256=sha256(canonical(result));
  return result;
}

function publicTask(task) {
  return {task_id:task.task_id,item_id:task.item_id,type:task.type,purpose:task.purpose,status:task.status,attempt:task.attempt,resolution:task.resolution||'1k',artifact_id:task.artifact_id||null,qa:task.qa||null,error:task.error||null,template_current:task.type==='character'?hasCurrentCharacterAuthorityTemplate(task):undefined,created_at:task.created_at,updated_at:task.updated_at};
}

function canonicalContractsForPlan(plan = {}) {
  const revision=String(plan.analysis_run_id || '').trim() || null;
  const continuityReady=Boolean(plan.planning_sha256)&&Array.isArray(plan.continuity_ledger)&&!['planning','failed'].includes(plan.status);
  const compile=redrawCanonicalDag.resolveCanonicalState({legacy:{legacy_step_name:'Step03',subtype:'localization_compile'},authority_revision:revision,current_authority_revision:revision,input_contract:{S02_SOURCE_TIMELINE:Boolean(plan.step02_confirmed_sha256)},output_contract:{accepted:continuityReady,character_continuity_state_complete:continuityReady,artifact_ledger_verified:continuityReady}});
  const assets=Array.isArray(plan.assets)?plan.assets:[];
  const assetsReady=continuityReady&&assets.length>0&&assets.every(row=>row.status==='accepted'&&row.accepted_artifact_sha256);
  const support=redrawCanonicalDag.resolveCanonicalState({legacy:{legacy_step_name:'Step03',subtype:'support_asset'},authority_revision:revision,current_authority_revision:revision,input_contract:{S04_LOCALIZATION_COMPILE:compile.resolution_status==='resolved',dependency_closure:assetsReady},output_contract:{verified:assetsReady,artifact_ledger_verified:assetsReady}});
  const frames=Array.isArray(plan.firstframes)?plan.firstframes:[];
  const framesReady=continuityReady&&frames.length>0&&frames.every(row=>row.status==='confirmed'&&row.selected_artifact_sha256&&row.authority_event?.event_id);
  const firstframes=redrawCanonicalDag.resolveCanonicalState({legacy:{legacy_step_name:'Step03',subtype:'video_first_frame_anchor'},authority_revision:revision,current_authority_revision:revision,input_contract:{S04_LOCALIZATION_COMPILE:compile.resolution_status==='resolved',declared_S05A_dependencies:assetsReady},output_contract:{verified:framesReady,current_confirmation_bound:framesReady,artifact_ledger_verified:framesReady}});
  return {compile,support,firstframes,active:firstframes.resolution_status==='resolved'?firstframes:support.resolution_status==='resolved'?support:compile};
}

function createStep03Service(options) {
  const root = path.resolve(options.root);
  const evidenceRoot = options.evidenceRoot ? path.resolve(options.evidenceRoot) : null;
  const sourceLedgerOverlayRoot = path.resolve(options.step01SourceLedgerOverlayRoot || path.join(root,'step01-source-ledger-overlays'));
  const bundleRoot = options.bundleRoot ? path.resolve(options.bundleRoot) : null;
  const expected = options.expected;
  const step02Service = options.step02Service;
  const roleCardService = options.roleCardService || null;
  const roleCardRoot = options.roleCardRoot ? path.resolve(options.roleCardRoot) : null;
  const writeLocks = new Map();
  function ownerProjectRoot(ownerId) { return path.join(root,'v1','owners',sha256(String(ownerId)),'projects',safeSegment(expected.projectId,/^[A-Za-z0-9-]{8,80}$/)); }
  function plansRoot(ownerId) { return path.join(ownerProjectRoot(ownerId),'plans'); }
  function planRoot(ownerId,planId) { return path.join(plansRoot(ownerId),safeSegment(planId,/^S03-(es-MX|pt-BR|en-US)-[a-f0-9]{20}$/)); }
  function planEtag(plan,state) { return '"step03-' + sha256(canonical({plan_sha256:plan.plan_sha256,state})) + '"'; }
  async function withWriteLock(key,operation) { const previous=writeLocks.get(key)||Promise.resolve();let release;const turn=new Promise(resolve=>{release=resolve;});const tail=previous.then(()=>turn);writeLocks.set(key,tail);await previous;try{return await operation();}finally{release();if(writeLocks.get(key)===tail)writeLocks.delete(key);} }
  function validateProject(project) { if(!project||project.id!==expected.projectId||project.analysis?.runId!==expected.analysisRunId||project.source?.sha256!==expected.sourceSha256||Number(project.source?.bytes)!==Number(expected.sourceBytes)) throw codedError('STEP03_SOURCE_BINDING_MISMATCH',409,'项目、run 或源视频绑定不一致'); }
  function deriveTaskState(state,task){
    if(task.type==='planning'){
      if(task.status==='accepted'&&task.planning_result&&!state.planning_sha256)applyPlanningResult(state,task.planning_result,task.planning_input.locale);
      else if(task.status==='failed'){state.status='failed';state.error=task.error||{code:'STEP03_PLANNING_FAILED',message:'第三步视觉规划失败'};}
      return;
    }
    if(!task.artifact_id||!task.artifact_sha256)return;
    if(task.type==='asset'){
      const asset=state.assets.find(row=>row.asset_id===task.item_id);
      if(asset&&asset.attempts?.at(-1)===task.task_id&&['generating','rerolling','awaiting_generation'].includes(asset.status)){
        asset.accepted_artifact_sha256=null;
        asset.selected_candidate_id=null;
        asset.authority_event=null;
        asset.status=task.status==='accepted'?'awaiting_confirmation':task.status;
        task.downstream_consumable=false;
      }
      return;
    }
    if(task.type==='character'){
      const character=state.characters.find(row=>row.candidate_ids.includes(task.task_id));
      if(character&&task.status==='accepted'&&character.status==='generating'){
        if(character.importance==='supporting'){
          character.selected_candidate_id=task.task_id;character.selected_artifact_sha256=task.artifact_sha256;character.status='confirmed';
          character.authority_event={event_id:'CHARAUTH-AI-'+sha256([character.character_id,task.task_id,task.artifact_sha256].join(':')).slice(0,20),candidate_id:task.task_id,artifact_sha256:task.artifact_sha256,decision:'ai_default',note:'普通配角采用 QA 通过的默认候选',decided_at:task.qa_at||task.updated_at||now()};
          task.user_decision='ai_default';task.downstream_consumable=true;
        }else character.status='awaiting_confirmation';
      }
      return;
    }
    if(task.type==='firstframe'){
      const authority=state.firstframes.find(row=>row.candidate_ids.includes(task.task_id));
      if(authority&&authority.candidate_ids.at(-1)===task.task_id&&task.status==='accepted'&&authority.status==='generating')authority.status='awaiting_confirmation';
    }
  }
  async function loadState(directory){const state=await readJson(path.join(directory,'state.json')),eventsRoot=path.join(directory,'task-events'),names=(await fsp.readdir(eventsRoot).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error))).filter(name=>/^\d{13}-[a-f0-9]{16}\.json$/.test(name)).sort();for(const name of names){const event=await readJson(path.join(eventsRoot,name)),task=state.tasks.find(row=>row.task_id===event.task_id);if(!task||event.schema_version!=='niannian.step03_task_event.v1'||event.event_sha256!==sha256(canonical({task_id:event.task_id,patch:event.patch,created_at:event.created_at})))throw codedError('STEP03_TASK_EVENT_CORRUPT',503,'Worker 任务事件损坏');Object.assign(task,clone(event.patch));}for(const task of state.tasks)deriveTaskState(state,task);return state;}
  async function files(ownerId,planId) { const directory=planRoot(ownerId,planId);const plan=await readJson(path.join(directory,'plan.json')).catch(error=>{if(error.code==='ENOENT')throw codedError('STEP03_PLAN_NOT_FOUND',404,'第三步计划不存在');throw error;});const state=await loadState(directory);if(plan.plan_id!==planId||plan.plan_sha256!==sha256(canonical(Object.fromEntries(Object.entries(plan).filter(([key])=>key!=='plan_sha256')))))throw codedError('STEP03_PLAN_STORE_CORRUPT',503,'第三步计划身份损坏');return{directory,plan,state}; }
  async function assertUpstream(ownerId,project,plan) { const variant=await step02Service.getVariant({ownerId,project,variantId:plan.step02_variant_id});if(variant.status!=='confirmed'||variant.qa?.passed!==true||!variant.confirmed_sha256)throw codedError('STEP03_STEP02_NOT_CONFIRMED',409,'请先确认对应地区的第二步');if(variant.confirmed_sha256!==plan.step02_confirmed_sha256)throw codedError('STEP03_UPSTREAM_SUPERSEDED',409,'第二步版本已变化，请创建新的第三步计划');return variant; }
  async function assertSourceAuthorityCurrent(project,plan) {
    if (!evidenceRoot) return;
    if (!plan.step01_source_ledger_sha256) throw codedError('STEP03_SOURCE_AUTHORITY_REQUIRED',409,'第三步旧计划没有绑定原片权威时间轴，请基于最新账本创建新的第三步计划');
    const ledger = await step01SourceLedger.readLedger({evidenceRoot, overlayRoot:sourceLedgerOverlayRoot, project});
    if (ledger.snapshot_sha256 !== plan.step01_source_ledger_sha256) throw codedError('STEP03_SOURCE_AUTHORITY_SUPERSEDED',409,'Step01 原片权威时间轴已修订，请从最新账本创建新的第三步计划');
    if (!roleCardService || !roleCardRoot) return;
    if (!plan.step01_role_card_snapshot_sha256) throw codedError('STEP03_ROLE_AUTHORITY_REQUIRED',409,'第三步旧计划没有绑定人物权威角色卡，请基于最新人物卡创建新的第三步计划');
    const roleCards = await roleCardService.get({root:roleCardRoot, project});
    if (!roleCards || roleCards.snapshot_sha256 !== plan.step01_role_card_snapshot_sha256) throw codedError('STEP03_ROLE_AUTHORITY_SUPERSEDED',409,'Step01 人物权威已修订，请从最新角色卡创建新的第三步计划');
  }
  function requireIfMatch(ifMatch,etag) { if(!ifMatch)throw codedError('PRECONDITION_REQUIRED',428,'修改前必须读回当前版本');if(normalizeEtag(ifMatch)!==etag)throw codedError('STEP03_REVISION_CONFLICT',409,'第三步内容已变化，请刷新后重试'); }
  function requireKey(value) { if(!/^[A-Za-z0-9._:-]{12,180}$/.test(String(value||'')))throw codedError('IDEMPOTENCY_KEY_REQUIRED',428,'必须提供稳定的幂等键');return String(value); }
  async function loadBundle(){if(!bundleRoot)return{manifestSha256:options.bundleSha256||sha256(canonical({version:BUNDLE_VERSION,override:SKILL_OVERRIDE}))};const manifestPath=path.join(bundleRoot,'manifest.json'),bytes=await fsp.readFile(manifestPath),manifest=JSON.parse(bytes.toString('utf8'));if(manifest.schema_version!=='niannian.server_skill_bundle.v1'||manifest.bundle_version!==BUNDLE_VERSION||manifest.runtime_kind!=='shortdrama_visual_assets'||manifest.grouping_policy_version!==GROUPING_POLICY_VERSION||!Array.isArray(manifest.files)||!Array.isArray(manifest.source_skills))throw codedError('STEP03_SKILL_BUNDLE_INVALID',503,'Step03 Skill Bundle 身份无效');for(const file of manifest.files){const content=await fsp.readFile(path.join(bundleRoot,...file.path.split('/')));if(content.length!==file.bytes||sha256(content)!==file.sha256)throw codedError('STEP03_SKILL_BUNDLE_TAMPERED',503,'Step03 Skill Bundle 校验失败');}return{manifest,manifestSha256:sha256(bytes)};}

  function projectState(plan,state) {
    const styleReview=ensureStyleReview(state);
    const output={...clone(plan),status:state.status,substep:state.substep,error:state.error||null,style_review:clone(styleReview),review_policy:{max_first_round_candidates:11,confirmation_rounds:[['style','characters','scene','props'],['firstframe']],localization_default:'Mexico / Latin America'},characters:clone(state.characters||[]),continuity_ledger:clone(state.continuity_ledger||[]),assets:clone(state.assets||[]),groups:clone(state.groups||[]),firstframes:clone(state.firstframes||[]),tasks:(state.tasks||[]).map(publicTask),snapshot:state.snapshot||null,updated_at:state.updated_at};
    output.etag=planEtag(plan,state);output.progress={style_confirmed:styleReview.status==='confirmed',important_characters_total:output.characters.filter(row=>row.importance!=='supporting').length,important_characters_confirmed:output.characters.filter(row=>row.importance!=='supporting'&&row.status==='confirmed').length,assets_total:output.assets.length,assets_accepted:output.assets.filter(row=>row.status==='accepted').length,groups_total:output.groups.length,groups_confirmed:output.firstframes.filter(row=>row.status==='confirmed').length};
    output.public_stage=redrawCanonicalDag.publicProjection(canonicalContractsForPlan(output).active);
    return output;
  }

  function assertCanonicalNext(state,plan,nextNode) {
    const durable={...clone(plan),status:state.status,substep:state.substep,planning_sha256:state.planning_sha256||null,continuity_ledger:clone(state.continuity_ledger||[]),assets:clone(state.assets||[]),firstframes:clone(state.firstframes||[])};
    const contracts=canonicalContractsForPlan(durable);
    const upstream=nextNode==='S05A_SUPPORT_ASSETS'?contracts.compile:nextNode==='S05B_FIRST_FRAMES'?contracts.support:nextNode==='VIDEO_EXECUTION'?contracts.firstframes:null;
    if(!upstream)throw codedError('CANONICAL_DOWNSTREAM_NOT_DECLARED',409,'当前阶段尚未声明该下游操作');
    try{redrawCanonicalDag.assertDownstreamGate(upstream,nextNode,expected.analysisRunId);}
    catch(error){throw codedError(error.code||'CANONICAL_CONTRACT_BLOCKED',409,'当前阶段的权威输入或验收条件尚未满足');}
    return contracts;
  }

  async function createPlan({ownerId,project,locale,step02VariantId,idempotencyKey}) {
    validateProject(project);locale=safeSegment(locale,/^(es-MX|pt-BR|en-US)$/);requireKey(idempotencyKey);
    const variant=await step02Service.getVariant({ownerId,project,variantId:step02VariantId});
    if(variant.locale!==locale||variant.status!=='confirmed'||variant.qa?.passed!==true||!variant.confirmed_sha256)throw codedError('STEP03_STEP02_NOT_CONFIRMED',409,'必须选择已确认的对应地区版本');
    const bundle=await loadBundle();
    const sourceLedger=evidenceRoot?await step01SourceLedger.readLedger({evidenceRoot,overlayRoot:sourceLedgerOverlayRoot,project}):null;
    const roleCards=roleCardService&&roleCardRoot?await roleCardService.get({root:roleCardRoot,project}):null;
    if (roleCardService && !roleCards) throw codedError('STEP03_ROLE_AUTHORITY_REQUIRED',409,'请先建立 Step01 人物权威角色卡');
    const identity=sha256(canonical({project_id:project.id,variant_id:variant.variant_id,confirmed_sha256:variant.confirmed_sha256,bundle_sha256:bundle.manifestSha256,grouping:GROUPING_POLICY_VERSION,source_ledger_sha256:sourceLedger?.snapshot_sha256||null,role_card_snapshot_sha256:roleCards?.snapshot_sha256||null}));
    const planId='S03-'+locale+'-'+identity.slice(0,20),directory=planRoot(ownerId,planId),planPath=path.join(directory,'plan.json');
    let created=false;
    try {
      await fsp.access(planPath);
    } catch(error) {
      if(error.code!=='ENOENT')throw error;
      const base={schema_version:PLAN_SCHEMA,plan_id:planId,project_id:project.id,analysis_run_id:expected.analysisRunId,source_sha256:expected.sourceSha256,source_bytes:Number(expected.sourceBytes),step01_snapshot_id:variant.snapshot_id,step01_snapshot_sha256:variant.snapshot_sha256,step01_source_ledger_id:sourceLedger?.snapshot_id||null,step01_source_ledger_sha256:sourceLedger?.snapshot_sha256||null,step01_role_card_snapshot_id:roleCards?.snapshot_id||null,step01_role_card_snapshot_sha256:roleCards?.snapshot_sha256||null,step02_variant_id:variant.variant_id,step02_confirmed_sha256:variant.confirmed_sha256,locale,market:LOCALES[locale].market,language:LOCALES[locale].language,skill_bundle_version:BUNDLE_VERSION,skill_bundle_sha256:bundle.manifestSha256,grouping_policy_version:GROUPING_POLICY_VERSION,grouping_override:SKILL_OVERRIDE,created_at:now()};
      const plan={...base,plan_sha256:sha256(canonical(base))};
      created=await atomicWriteJson(planPath,plan,{exclusive:true});
      if(created){
        const groups=buildProductionGroups(variant.shots);
        const sourceShots=variant.shots.map(shot=>({shot_id:shot.shot_id,start_sec:shot.start_sec,end_sec:shot.end_sec,duration_sec:shot.duration_sec,target_people_identity:shot.target_people_identity||'',localized_setting:shot.localized_setting||'',target_dialogue:shot.target_dialogue||'',action:shot.action||'',expression_intent:shot.expression_intent||'',cultural_replacements:shot.cultural_replacements||[],continuity_requirements:shot.continuity_requirements||[]}));
        const sourceLedgerInput=sourceLedger?{snapshot_id:sourceLedger.snapshot_id,snapshot_sha256:sourceLedger.snapshot_sha256,counts:sourceLedger.counts,shots:sourceLedger.shots.map(shot=>({shot_id:shot.shot_id,start_sec:shot.start_sec,end_sec:shot.end_sec,duration_sec:shot.duration_sec,frame_evidence:shot.frame_evidence.map(frame=>({point:frame.point,time_sec:frame.time_sec,timecode:frame.timecode,relative_path:frame.relative_path,sha256:frame.sha256,bytes:frame.bytes,width:frame.width,height:frame.height})),dialogue_ids:shot.dialogue_ids,ocr_ids:shot.ocr_ids,source_visual_facts:shot.source_visual_facts,characters:shot.characters,wardrobe:shot.wardrobe,props:shot.props,action:shot.action,expression:shot.expression,continuity_block_id:shot.continuity_block_id})),dialogue_rows:sourceLedger.dialogue_rows,ocr_rows:sourceLedger.ocr_rows}:null;
        const planningInput={locale,market:LOCALES[locale].market,language:LOCALES[locale].language,global_context:variant.global_context||{},source_authority:sourceLedgerInput,shots:sourceShots,groups:groups.map(group=>({group_id:group.group_id,source_shot_ids:group.source_shot_ids,start_sec:group.start_sec,end_sec:group.end_sec,duration_sec:group.duration_sec,dialogue_bindings:group.dialogue_bindings,action_summary:group.action_summary}))};
        const planningIdentity=sha256(canonical({plan_id:planId,bundle_sha256:bundle.manifestSha256,input:planningInput}));
        const planningTask={task_id:'T03-PLAN-'+planningIdentity.slice(0,20),type:'planning',item_id:planId,purpose:'visual_asset_planning',provider:'krill',attempt:1,transaction_key:planningIdentity,status:'created',planning_input:planningInput,planning_result:null,error:null,created_at:now(),updated_at:now()};
        const state={schema_version:STATE_SCHEMA,status:'planning',substep:'planning',error:null,style_review:createStyleReview(),source_authority:sourceLedgerInput?{snapshot_id:sourceLedgerInput.snapshot_id,snapshot_sha256:sourceLedgerInput.snapshot_sha256,counts:sourceLedgerInput.counts}:null,source_shots:sourceShots,characters:[],continuity_ledger:[],assets:[],groups,firstframes:groups.map(group=>({group_id:group.group_id,candidate_ids:[],selected_candidate_id:null,selected_artifact_sha256:null,status:'awaiting_generation'})),tasks:[planningTask],snapshot:null,updated_at:now()};
        await atomicWriteJson(path.join(directory,'state.json'),state,{exclusive:true});
      }
    }
    const current=await files(ownerId,planId);return{created,plan:projectState(current.plan,current.state)};
  }

  async function listPlans({ownerId,project,locale}) { validateProject(project);if(locale&&!LOCALES[locale])throw codedError('STEP03_LOCALE_UNSUPPORTED',422,'地区不支持');const names=await fsp.readdir(plansRoot(ownerId)).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error));const rows=[];for(const name of names.filter(name=>/^S03-(es-MX|pt-BR|en-US)-[a-f0-9]{20}$/.test(name))){const current=await files(ownerId,name);if(!locale||current.plan.locale===locale)rows.push(projectPlanSummary(current.plan,current.state));}return{plans:rows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))}; }
  function projectPlanSummary(plan,state){return{plan_id:plan.plan_id,locale:plan.locale,market:plan.market,step01_source_ledger_id:plan.step01_source_ledger_id||null,step01_source_ledger_sha256:plan.step01_source_ledger_sha256||null,step02_variant_id:plan.step02_variant_id,step02_confirmed_sha256:plan.step02_confirmed_sha256,status:state.status,substep:state.substep,created_at:plan.created_at,updated_at:state.updated_at,etag:planEtag(plan,state)};}
  async function getPlan({ownerId,project:projectValue,planId}){validateProject(projectValue);const current=await files(ownerId,planId);if(current.plan.project_id!==projectValue.id)throw codedError('STEP03_PLAN_NOT_FOUND',404,'第三步计划不存在');try{await assertUpstream(ownerId,projectValue,current.plan);await assertSourceAuthorityCurrent(projectValue,current.plan);}catch(error){if(['STEP03_UPSTREAM_SUPERSEDED','STEP03_SOURCE_AUTHORITY_SUPERSEDED','STEP03_ROLE_AUTHORITY_SUPERSEDED','STEP03_ROLE_AUTHORITY_REQUIRED','STEP03_SOURCE_AUTHORITY_REQUIRED'].includes(error.code)&&current.state.status!=='confirmed')current.state.upstream_superseded=true;else if(error.code!=='STEP03_STEP02_NOT_CONFIRMED')throw error;}return projectState(current.plan,current.state);}

  function queueTask(state,{type,itemId,purpose,prompt,references=[],attempt=1,resolution='1k'}){resolution=normalizeImageResolution(resolution);const promptSha=sha256(prompt),transactionKey=sha256([state.plan_id||'',itemId,promptSha,'runninghub',purpose,attempt,resolution].join(':'));const existing=state.tasks.find(task=>task.transaction_key===transactionKey);if(existing)return existing;const task={task_id:'T03-'+transactionKey.slice(0,24),type,item_id:itemId,purpose,prompt,prompt_sha256:promptSha,references:clone(references),provider:'runninghub',aspect_ratio:type==='character'?'16:9':'9:16',resolution,attempt,transaction_key:transactionKey,status:'created',provider_task_id:null,artifact_id:null,qa:null,error:null,created_at:now(),updated_at:now()};state.tasks.push(task);return task;}
  async function mutate(ownerId,projectValue,planId,ifMatch,operation){return withWriteLock('plan:'+sha256(String(ownerId))+':'+planId,async()=>{const current=await files(ownerId,planId);validateProject(projectValue);await assertUpstream(ownerId,projectValue,current.plan);await assertSourceAuthorityCurrent(projectValue,current.plan);const etag=planEtag(current.plan,current.state);requireIfMatch(ifMatch,etag);if(current.state.status==='planning')throw codedError('STEP03_PLANNING_IN_PROGRESS',409,'第三步视觉规划尚未完成');if(current.state.status==='failed')throw codedError(current.state.error?.code||'STEP03_RUNTIME_FAILED',409,current.state.error?.message||'第三步运行失败');assertCanonicalNext(current.state,current.plan,'S05A_SUPPORT_ASSETS');current.state.plan_id=current.plan.plan_id;const result=await operation(current.state,current.plan,current.directory);current.state.updated_at=now();delete current.state.plan_id;await atomicWriteJson(path.join(current.directory,'state.json'),current.state);return{result,plan:projectState(current.plan,current.state)};});}

  function invalidateForStyleChange(state) {
    for(const task of state.tasks.filter(row=>row.type!=='planning')){task.downstream_consumable=false;task.user_decision='invalidated_by_style_change';}
    for(const character of state.characters){character.candidate_ids=[];character.selected_candidate_id=null;character.selected_artifact_sha256=null;character.authority_event=null;character.status='awaiting_candidates';}
    for(const entry of state.continuity_ledger)entry.identity_artifact_sha256=null;
    for(const asset of state.assets){asset.attempts=[];asset.selected_candidate_id=null;asset.accepted_artifact_sha256=null;asset.authority_event=null;asset.status=(asset.dependencies||[]).length?'blocked':'awaiting_generation';}
    for(const frame of state.firstframes){frame.candidate_ids=[];frame.selected_candidate_id=null;frame.selected_artifact_sha256=null;frame.authority_event=null;frame.status='awaiting_generation';}
    state.snapshot=null;state.status='character_review';state.substep='characters';
  }

  async function confirmStyle(args){return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan)=>{const review=ensureStyleReview(state),candidate=review.candidates.find(row=>row.style_id===args.styleId);if(!candidate)throw codedError('STEP03_STYLE_NOT_FOUND',404,'视觉风格候选不存在');if(candidate.candidate_sha256!==String(args.candidateSha256||''))throw codedError('STEP03_STYLE_CANDIDATE_STALE',409,'视觉风格候选已更新，请刷新后重试');const prior=confirmedStyle(state);if(prior&&prior.style_id!==candidate.style_id)invalidateForStyleChange(state);review.selected_style_id=candidate.style_id;review.selected_candidate_sha256=candidate.candidate_sha256;review.status='confirmed';review.authority_event={event_id:'STYLEAUTH-'+sha256([plan.plan_id,candidate.style_id,candidate.candidate_sha256].join(':')).slice(0,24),style_id:candidate.style_id,candidate_sha256:candidate.candidate_sha256,profile_version:candidate.profile_version,decision:'accept',decided_at:now()};for(const character of state.characters)character.prompt=characterPrompt(character,plan.locale,characterVisualLocks(character,state.assets,state.continuity_ledger))+stylePromptSuffix(state);return{style_id:candidate.style_id,candidate_sha256:candidate.candidate_sha256,authority_event_id:review.authority_event.event_id,invalidated_downstream:Boolean(prior&&prior.style_id!==candidate.style_id)};});}

  async function queueCharacterCandidates(args){requireKey(args.idempotencyKey);return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan)=>{requireConfirmedStyle(state);const character=state.characters.find(row=>row.character_id===args.characterId);if(!character)throw codedError('STEP03_CHARACTER_NOT_FOUND',404,'角色不存在');const requestedResolution=normalizeImageResolution(args.resolution),forceTemplateRefresh=args.forceTemplateRefresh===true;const legacyTasks=forceTemplateRefresh?[]:character.status==='confirmed'?[]:character.candidate_ids.map(candidateId=>state.tasks.find(row=>row.task_id===candidateId)).filter(task=>task&&!hasCurrentCharacterAuthorityTemplate(task));const activeLegacy=legacyTasks.filter(task=>['created','submitted','generating','qa_running'].includes(task.status));if(activeLegacy.length)return{queued:0,waiting_for_legacy_task_ids:activeLegacy.map(task=>task.task_id)};const legacyBoardReferences=[...new Set(legacyTasks.filter(task=>task?.status==='rejected'&&task.artifact_sha256).map(task=>task.artifact_sha256))];for(const task of legacyTasks){task.downstream_consumable=false;task.user_decision='superseded_template';}if(legacyTasks.length){character.candidate_ids=character.candidate_ids.filter(candidateId=>!legacyTasks.some(task=>task.task_id===candidateId));character.selected_candidate_id=null;character.selected_artifact_sha256=null;character.authority_event=null;character.status='awaiting_candidates';}const expectedCount=1,existingTasks=state.tasks.filter(row=>row.type==='character'&&String(row.item_id).startsWith(character.character_id+'-candidate-')),currentAuthorityBoard=/^character-authority-sheet-v3\./.test(CHARACTER_AUTHORITY_PROMPT_VERSION);let retryResolution=requestedResolution,retryPurpose=existingTasks.length?'character_candidate_reroll':'character_candidate',unusableIds=[];
    if(forceTemplateRefresh){
      for(const candidateId of character.candidate_ids){const previous=state.tasks.find(row=>row.task_id===candidateId);if(previous){previous.downstream_consumable=false;previous.user_decision='template_refresh_requested';}}
      character.candidate_ids=[];character.selected_candidate_id=null;character.selected_artifact_sha256=null;character.authority_event=null;character.status='awaiting_candidates';retryResolution=requestedResolution;retryPurpose='character_candidate_template_refresh';
      for(const entry of state.continuity_ledger.filter(row=>row.character_id===character.character_id))entry.identity_artifact_sha256=null;
      for(const asset of state.assets.filter(row=>(row.dependencies||[]).includes(character.character_id))){
        asset.accepted_artifact_sha256=null;
        asset.status='blocked';
        for(const taskId of asset.attempts||[]){const previous=state.tasks.find(task=>task.task_id===taskId);if(previous)previous.downstream_consumable=false;}
      }
      for(const group of state.groups.filter(row=>row.source_shot_ids.some(shotId=>character.appearance_shot_ids.includes(shotId)))){
        const authority=state.firstframes.find(row=>row.group_id===group.group_id);
        if(!authority)continue;
        for(const taskId of authority.candidate_ids||[]){const previous=state.tasks.find(task=>task.task_id===taskId);if(previous)previous.downstream_consumable=false;}
        authority.selected_candidate_id=null;authority.selected_artifact_sha256=null;authority.authority_event=null;authority.status='awaiting_generation';
      }
    }else
    if(character.status==='needs_reroll'){
      for(const candidateId of character.candidate_ids){const previous=state.tasks.find(row=>row.task_id===candidateId);if(previous)previous.downstream_consumable=false;}
      character.candidate_ids=[];character.selected_candidate_id=null;character.selected_artifact_sha256=null;character.authority_event=null;
    }else{
      const failedIds=character.candidate_ids.filter(candidateId=>state.tasks.some(row=>row.task_id===candidateId&&row.status==='failed'));
      const rejectedIds=character.candidate_ids.filter(candidateId=>state.tasks.some(row=>row.task_id===candidateId&&row.status==='rejected'));
      unusableIds=[...new Set([...failedIds,...rejectedIds])];
      if(!unusableIds.length&&character.candidate_ids.length>=expectedCount)return{queued:0,reused:true};
      for(const candidateId of unusableIds){const previous=state.tasks.find(row=>row.task_id===candidateId);if(previous)previous.downstream_consumable=false;}
      character.candidate_ids=character.candidate_ids.filter(candidateId=>!unusableIds.includes(candidateId));
      if(failedIds.length){retryResolution=requestedResolution;retryPurpose='character_candidate_retry';}
    }
    const previousBoardReferences=currentAuthorityBoard?[]:[...new Set([...legacyBoardReferences,...unusableIds.map(candidateId=>state.tasks.find(task=>task.task_id===candidateId)).filter(task=>task?.artifact_sha256).map(task=>task.artifact_sha256)])];
    const missing=Math.max(0,expectedCount-character.candidate_ids.length),startIndex=character.candidate_ids.length;
    const currentPrompt=characterPrompt(character,plan.locale,characterVisualLocks(character,state.assets,state.continuity_ledger))+stylePromptSuffix(state);character.prompt=currentPrompt;
    const references=previousBoardReferences.length?[{role:'previous_rejected_character_board_identity_and_layout',artifact_sha256s:previousBoardReferences}]:[];
    for(let offset=0;offset<missing;offset+=1){const candidateNumber=existingTasks.length+offset+1,itemId=character.character_id+'-candidate-'+candidateNumber;const task=queueTask(state,{type:'character',itemId,purpose:retryPurpose,prompt:currentPrompt,references,attempt:Math.floor(existingTasks.length/expectedCount)+1,resolution:retryResolution});character.candidate_ids.push(task.task_id);}
    character.status='generating';return{queued:missing,force_template_refresh:forceTemplateRefresh===true};});}
  async function decideCharacter(args){return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan,directory)=>{const character=state.characters.find(row=>row.character_id===args.characterId);if(!character)throw codedError('STEP03_CHARACTER_NOT_FOUND',404,'角色不存在');const task=state.tasks.find(row=>row.task_id===args.candidateId&&character.candidate_ids.includes(row.task_id));if(!task||task.status!=='accepted'||!task.artifact_sha256)throw codedError('STEP03_CHARACTER_CANDIDATE_NOT_ACCEPTED',409,'角色候选尚不可确认');if(!hasCurrentCharacterAuthorityTemplate(task))throw codedError('STEP03_CHARACTER_TEMPLATE_SUPERSEDED',409,'该候选来自旧人物图模板，不能作为当前人物身份源');if(args.decision==='reject'){task.user_decision='rejected';task.downstream_consumable=false;character.status='needs_reroll';return{decision:'reject'};}if(args.decision!=='accept')throw codedError('STEP03_DECISION_INVALID',422,'决定无效');await resolveTaskArtifact({directory,task,verify:true});for(const candidateId of character.candidate_ids){const candidate=state.tasks.find(row=>row.task_id===candidateId);if(candidate){candidate.user_decision=candidateId===task.task_id?'accepted':'superseded';candidate.downstream_consumable=candidateId===task.task_id;}}character.selected_candidate_id=task.task_id;character.selected_artifact_sha256=task.artifact_sha256;character.status='confirmed';character.authority_event={event_id:'CHARAUTH-'+sha256([state.plan_id,character.character_id,task.task_id,task.artifact_sha256].join(':')).slice(0,24),candidate_id:task.task_id,artifact_sha256:task.artifact_sha256,decision:'accept',note:String(args.note||'').slice(0,600),decided_at:now()};for(const entry of state.continuity_ledger.filter(row=>row.character_id===character.character_id))entry.identity_artifact_sha256=task.artifact_sha256;for(const asset of state.assets)if((asset.dependencies||[]).includes(character.character_id)&&asset.status==='blocked'&&asset.dependencies.every(id=>state.characters.some(row=>row.character_id===id&&row.status==='confirmed')))asset.status='awaiting_generation';return{decision:'accept',artifact_sha256:task.artifact_sha256,authority_event_id:character.authority_event.event_id};});}
  function assetReferences(state,asset){if(asset.reference_strategy!=='character_image_to_image')return[];return[{role:'confirmed_character_identity',artifact_sha256s:(asset.dependencies||[]).map(characterId=>state.characters.find(row=>row.character_id===characterId&&row.status==='confirmed')?.selected_artifact_sha256).filter(Boolean)}];}
  async function queueAssets(args){requireKey(args.idempotencyKey);return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan)=>{requireConfirmedStyle(state);assertCanonicalNext(state,plan,'S05A_SUPPORT_ASSETS');const resolution=normalizeImageResolution(args.resolution),ids=Array.isArray(args.assetIds)?args.assetIds:[];for(const id of ids){const asset=state.assets.find(row=>row.asset_id===id);if(!asset)throw codedError('STEP03_ASSET_NOT_FOUND',404,'资产不存在');if((asset.dependencies||[]).some(characterId=>!state.characters.some(row=>row.character_id===characterId&&row.status==='confirmed')))throw codedError('STEP03_ASSET_DEPENDENCY_BLOCKED',409,'请先确认依赖角色');const task=queueTask(state,{type:'asset',itemId:asset.asset_id,purpose:'asset_generation',prompt:asset.prompt+stylePromptSuffix(state),references:assetReferences(state,asset),attempt:asset.attempts.length+1,resolution});if(!asset.attempts.includes(task.task_id))asset.attempts.push(task.task_id);asset.status='generating';}state.substep='assets';state.status='asset_generation';return{queued:ids.length,resolution};});}

  async function decideAsset(args){return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan,directory)=>{requireConfirmedStyle(state);const asset=state.assets.find(row=>row.asset_id===args.assetId);if(!asset)throw codedError('STEP03_ASSET_NOT_FOUND',404,'资产不存在');const task=state.tasks.find(row=>row.task_id===args.candidateId&&asset.attempts.includes(row.task_id));if(!task||task.status!=='accepted'||!task.artifact_sha256)throw codedError('STEP03_ASSET_CANDIDATE_NOT_ACCEPTED',409,'场景或道具候选尚不可确认');if(args.decision==='reject'){task.user_decision='rejected';task.downstream_consumable=false;asset.selected_candidate_id=null;asset.accepted_artifact_sha256=null;asset.authority_event=null;asset.status='needs_reroll';return{decision:'reject'};}if(args.decision!=='accept')throw codedError('STEP03_DECISION_INVALID',422,'决定无效');await resolveTaskArtifact({directory,task,verify:true});for(const taskId of asset.attempts){const candidate=state.tasks.find(row=>row.task_id===taskId);if(candidate){candidate.user_decision=taskId===task.task_id?'accepted':'superseded';candidate.downstream_consumable=taskId===task.task_id;}}asset.selected_candidate_id=task.task_id;asset.accepted_artifact_sha256=task.artifact_sha256;asset.status='accepted';asset.authority_event={event_id:'ASSETAUTH-'+sha256([state.plan_id,asset.asset_id,task.task_id,task.artifact_sha256].join(':')).slice(0,24),candidate_id:task.task_id,artifact_sha256:task.artifact_sha256,decision:'accept',note:String(args.note||'').slice(0,600),decided_at:now()};return{decision:'accept',artifact_sha256:task.artifact_sha256,authority_event_id:asset.authority_event.event_id};});}
  async function rerollAsset(args){requireKey(args.idempotencyKey);return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan)=>{requireConfirmedStyle(state);assertCanonicalNext(state,plan,'S05A_SUPPORT_ASSETS');const resolution=normalizeImageResolution(args.resolution),asset=state.assets.find(row=>row.asset_id===args.assetId);if(!asset)throw codedError('STEP03_ASSET_NOT_FOUND',404,'资产不存在');const adjustment=String(args.adjustment||'').trim(),replacementPrompt=String(args.replacementPrompt||'').trim();if(!adjustment||adjustment.length>1200||replacementPrompt.length>8000)throw codedError('STEP03_ADJUSTMENT_INVALID',422,'调整要求无效');const prompt=(replacementPrompt||asset.prompt+'用户调整：'+adjustment)+stylePromptSuffix(state);asset.prompt_revisions=asset.prompt_revisions||[];asset.prompt_revisions.push({revision_id:safeSegment(args.promptRevisionId),adjustment,mode:replacementPrompt?'replacement':'append',replacement_prompt_sha256:replacementPrompt?sha256(replacementPrompt):null,created_at:now()});asset.selected_candidate_id=null;asset.accepted_artifact_sha256=null;asset.authority_event=null;for(const taskId of asset.attempts||[]){const previous=state.tasks.find(row=>row.task_id===taskId);if(previous)previous.downstream_consumable=false;}const task=queueTask(state,{type:'asset',itemId:asset.asset_id,purpose:'asset_reroll',prompt,references:assetReferences(state,asset),attempt:asset.attempts.length+1,resolution});asset.attempts.push(task.task_id);asset.status='rerolling';return{task_id:task.task_id,resolution};});}
  async function queueFirstFrames(args){
    requireKey(args.idempotencyKey);
    return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan)=>{
      requireConfirmedStyle(state);
      assertCanonicalNext(state,plan,'S05B_FIRST_FRAMES');
      const resolution=normalizeImageResolution(args.resolution),groupIds=Array.isArray(args.groupIds)?args.groupIds:[];
      const planning=state.tasks.find(row=>row.type==='planning'&&row.status==='accepted'&&row.planning_input?.source_authority?.shots);
      if(!planning)throw codedError('STEP03_SOURCE_AUTHORITY_REQUIRED',409,'首帧生成缺少当前原片权威时间轴');
      for(const id of groupIds){
        const group=state.groups.find(row=>row.group_id===id),authority=state.firstframes.find(row=>row.group_id===id);
        if(!group||!authority)throw codedError('STEP03_GROUP_NOT_FOUND',404,'生产分组不存在');
        const sourceShot=planning.planning_input.source_authority.shots.find(row=>row.shot_id===group.source_shot_ids[0]);
        const sourceFrame=sourceShot?.frame_evidence?.find(row=>row.point==='start');
        if(!sourceFrame?.relative_path||!/^[a-f0-9]{64}$/.test(String(sourceFrame.sha256||''))||!Number.isSafeInteger(Number(sourceFrame.bytes))||Number(sourceFrame.bytes)<=0)throw codedError('STEP03_SOURCE_AUTHORITY_REQUIRED',409,'首帧生成缺少已校验原片起始帧');
        const missingAssets=group.asset_dependencies.filter(assetId=>!state.assets.some(asset=>asset.asset_id===assetId&&asset.status==='accepted'));
        if(missingAssets.length)throw codedError('STEP03_FIRSTFRAME_ASSETS_BLOCKED',409,'生产分组仍缺少已通过资产');
        const groupAssets=state.assets.filter(row=>row.status==='accepted'&&row.used_by_groups.includes(id));
        const characterReferences=state.characters.filter(row=>row.status==='confirmed'&&row.appearance_shot_ids.some(shot=>group.source_shot_ids.includes(shot))).map(row=>row.selected_artifact_sha256).filter(Boolean).slice(0,2);
        const sceneReferences=groupAssets.filter(row=>row.canonical_type==='scene').map(row=>row.accepted_artifact_sha256).filter(Boolean).slice(0,1);
        const propReferences=groupAssets.filter(row=>['wardrobe','prop'].includes(row.canonical_type)).map(row=>row.accepted_artifact_sha256).filter(Boolean).slice(0,3);
        const documentReferences=groupAssets.filter(row=>['document','text-screen','phone-ui'].includes(row.canonical_type)).map(row=>row.accepted_artifact_sha256).filter(Boolean).slice(0,1);
        const references=[
          {role:'source_composition',shot_id:group.source_shot_ids[0],relative_path:sourceFrame.relative_path,sha256:sourceFrame.sha256,bytes:Number(sourceFrame.bytes)},
          {role:'confirmed_character_identity',artifact_sha256s:characterReferences},
          {role:'scene',artifact_sha256s:sceneReferences},
          {role:'props_and_wardrobe',artifact_sha256s:propReferences},
          {role:'document_and_screen',artifact_sha256s:documentReferences}
        ].filter(row=>row.shot_id||(row.artifact_sha256s||[]).length);
        const prompt='为生产分组 '+id+' 生成一张 9:16 海外短剧视频首帧。原片起始帧只控制机位、构图、人数、站位、动作和情绪；人物身份只服从已确认人物图；场景、服装、道具、文件和屏幕各自只服从同职责资产。镜头内容：'+(group.visual_goal||group.action_summary)+'。不得出现中国文字、中国场景元素、原演员面孔、字幕、标题或海报化构图。'+stylePromptSuffix(state);
        for(const candidateId of authority.candidate_ids){const previous=state.tasks.find(row=>row.task_id===candidateId);if(previous)previous.downstream_consumable=false;}
        authority.selected_candidate_id=null;authority.selected_artifact_sha256=null;authority.authority_event=null;
        const task=queueTask(state,{type:'firstframe',itemId:id,purpose:'video_first_frame',prompt,references,attempt:authority.candidate_ids.length+1,resolution});
        authority.candidate_ids.push(task.task_id);authority.status='generating';
      }
      state.substep='firstframes';state.status='firstframe_generation';return{queued:groupIds.length,resolution};
    });
  }
  async function decideFirstFrame(args){return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan,directory)=>{const authority=state.firstframes.find(row=>row.candidate_ids.includes(args.candidateId));const task=state.tasks.find(row=>row.task_id===args.candidateId);if(!authority||!task||task.status!=='accepted'||!task.artifact_sha256)throw codedError('STEP03_FIRSTFRAME_NOT_ACCEPTED',409,'首帧候选尚不可确认');if(args.decision==='reject'){task.user_decision='rejected';task.downstream_consumable=false;authority.status='needs_reroll';return{decision:'reject'};}if(args.decision!=='accept')throw codedError('STEP03_DECISION_INVALID',422,'决定无效');await resolveTaskArtifact({directory,task,verify:true});for(const candidateId of authority.candidate_ids){const candidate=state.tasks.find(row=>row.task_id===candidateId);if(candidate){candidate.user_decision=candidateId===task.task_id?'accepted':'superseded';candidate.downstream_consumable=candidateId===task.task_id;}}authority.selected_candidate_id=task.task_id;authority.selected_artifact_sha256=task.artifact_sha256;authority.status='confirmed';authority.authority_event={event_id:'FFAUTH-'+sha256([state.plan_id,authority.group_id,task.task_id,task.artifact_sha256].join(':')).slice(0,24),candidate_id:task.task_id,artifact_sha256:task.artifact_sha256,decision:'accept',note:String(args.note||'').slice(0,600),decided_at:now()};state.substep='confirmation';state.status='episode_review';return{decision:'accept',artifact_sha256:task.artifact_sha256,authority_event_id:authority.authority_event.event_id};});}
  async function reviseGroups(args){return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state)=>{const boundary=safeSegment(args.boundaryShotId,/^S\d{3}$/),operation=args.operation;if(!['split','merge'].includes(operation))throw codedError('STEP03_GROUP_OPERATION_INVALID',422,'分组操作无效');const index=state.groups.findIndex(group=>group.group_id===args.groupId);if(index<0)throw codedError('STEP03_GROUP_NOT_FOUND',404,'生产分组不存在');let affected=[];if(operation==='split'){const group=state.groups[index],at=group.source_shot_ids.indexOf(boundary);if(at<0||at===group.source_shot_ids.length-1)throw codedError('STEP03_GROUP_BOUNDARY_INVALID',422,'拆分点必须位于组内镜头边界');const leftShots=group.source_shot_ids.slice(0,at+1).map(id=>state.source_shots.find(shot=>shot.shot_id===id)),rightShots=group.source_shot_ids.slice(at+1).map(id=>state.source_shots.find(shot=>shot.shot_id===id));if(leftShots.some(row=>!row)||rightShots.some(row=>!row))throw codedError('STEP03_GROUP_SOURCE_MISSING',503,'分组源镜头缺失');const left=productionGroup(leftShots,index,'manual_split'),right=productionGroup(rightShots,index+1,'manual_split'),reason=String(args.reason||'').trim();left.group_id=group.group_id;right.group_id='G-'+sha256(group.group_id+':'+boundary+':'+group.revision).slice(0,8);for(const item of [left,right]){item.revision=group.revision+1;item.asset_dependencies=state.assets.filter(asset=>asset.used_by_shots?.some(id=>item.source_shot_ids.includes(id))).map(asset=>asset.asset_id);if(item.duration_sec<8||item.duration_sec>15){if(!reason)throw codedError('STEP03_GROUP_EXCEPTION_REASON_REQUIRED',422,'超出 8–15 秒时必须填写原因');item.exception_code='manual_out_of_range';item.exception_reason=reason.slice(0,500);}}state.groups.splice(index,1,left,right);affected=[group.group_id,right.group_id];state.firstframes=state.firstframes.filter(row=>row.group_id!==group.group_id);state.firstframes.splice(index,0,...[left,right].map(item=>({group_id:item.group_id,candidate_ids:[],selected_candidate_id:null,selected_artifact_sha256:null,status:'awaiting_generation'})));for(const asset of state.assets){if((asset.used_by_groups||[]).includes(group.group_id)){asset.used_by_groups=asset.used_by_groups.filter(id=>id!==group.group_id);for(const item of [left,right])if(asset.used_by_shots?.some(id=>item.source_shot_ids.includes(id)))asset.used_by_groups.push(item.group_id);}}}else{if(index>=state.groups.length-1)throw codedError('STEP03_GROUP_BOUNDARY_INVALID',422,'没有可合并的下一组');const first=state.groups[index],second=state.groups[index+1];const merged={...first,source_shot_ids:[...first.source_shot_ids,...second.source_shot_ids],end_sec:second.end_sec,duration_sec:Number((second.end_sec-first.start_sec).toFixed(3)),boundary_reason:'manual_merge',exception_code:null,exception_reason:null,dialogue_bindings:[...first.dialogue_bindings,...second.dialogue_bindings],asset_dependencies:[...new Set([...first.asset_dependencies,...second.asset_dependencies])],revision:Math.max(first.revision,second.revision)+1};if((merged.duration_sec<8||merged.duration_sec>15)&&!String(args.reason||'').trim())throw codedError('STEP03_GROUP_EXCEPTION_REASON_REQUIRED',422,'超出 8–15 秒时必须填写原因');if(merged.duration_sec<8||merged.duration_sec>15){merged.exception_code='manual_out_of_range';merged.exception_reason=String(args.reason).slice(0,500);}state.groups.splice(index,2,merged);affected=[first.group_id,second.group_id];state.firstframes=state.firstframes.filter(row=>!affected.includes(row.group_id));state.firstframes.splice(index,0,{group_id:merged.group_id,candidate_ids:[],selected_candidate_id:null,selected_artifact_sha256:null,status:'awaiting_generation'});for(const asset of state.assets)asset.used_by_groups=(asset.used_by_groups||[]).map(id=>affected.includes(id)?merged.group_id:id).filter((id,pos,array)=>array.indexOf(id)===pos);}state.groups.forEach((group,i)=>{group.sequence=i+1;});return{affected_group_ids:affected};});}
  async function rebuildGroups(args){requireKey(args.idempotencyKey);return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan)=>{const variant=await step02Service.getVariant({ownerId:args.ownerId,project:args.project,variantId:plan.step02_variant_id}),groups=buildProductionGroups(variant.shots,{hardBoundariesAfter:args.hardBoundariesAfter||[]}),oldById=new Map(state.groups.map(row=>[row.group_id,row])),changed=[];for(const group of groups){const previous=oldById.get(group.group_id);if(!previous||canonical(previous.source_shot_ids)!==canonical(group.source_shot_ids))changed.push(group.group_id);group.asset_dependencies=state.assets.filter(asset=>asset.used_by_shots?.some(id=>group.source_shot_ids.includes(id))).map(asset=>asset.asset_id);}state.groups=groups;state.firstframes=groups.map(group=>{const existing=state.firstframes.find(row=>row.group_id===group.group_id);return existing&&!changed.includes(group.group_id)?existing:{group_id:group.group_id,candidate_ids:[],selected_candidate_id:null,selected_artifact_sha256:null,status:'awaiting_generation'};});return{changed_group_ids:changed,groups:groups.length};});}
  async function confirmPlan(args){return mutate(args.ownerId,args.project,args.planId,args.ifMatch,async(state,plan,directory)=>{
    requireConfirmedStyle(state);
    const incomplete=[];
    for(const row of state.characters.filter(row=>row.importance!=='supporting'))if(row.status!=='confirmed'||!row.selected_artifact_sha256||!row.authority_event)incomplete.push(row.character_id);
    for(const row of state.assets)if(row.status!=='accepted'||!row.accepted_artifact_sha256)incomplete.push(row.asset_id);
    for(const row of state.firstframes)if(row.status!=='confirmed'||!row.selected_artifact_sha256||!row.authority_event)incomplete.push(row.group_id);
    if(incomplete.length)throw Object.assign(codedError('STEP03_CONFIRM_INCOMPLETE',409,'第三步仍有未确认项目'),{items:incomplete});
    assertCanonicalNext(state,plan,'VIDEO_EXECUTION');
    const authoritative=[];
    for(const row of state.characters){if(!row.selected_artifact_sha256)continue;const task=state.tasks.find(task=>task.task_id===row.selected_candidate_id&&task.artifact_sha256===row.selected_artifact_sha256);if(!task)throw codedError('STEP03_AUTHORITY_ARTIFACT_MISSING',503,'人物权威图片记录缺失');authoritative.push(task);}
    for(const row of state.assets){const task=state.tasks.find(task=>task.type==='asset'&&task.item_id===row.asset_id&&task.artifact_sha256===row.accepted_artifact_sha256);if(!task)throw codedError('STEP03_AUTHORITY_ARTIFACT_MISSING',503,'资产权威图片记录缺失');authoritative.push(task);}
    for(const row of state.firstframes){const task=state.tasks.find(task=>task.task_id===row.selected_candidate_id&&task.artifact_sha256===row.selected_artifact_sha256);if(!task)throw codedError('STEP03_AUTHORITY_ARTIFACT_MISSING',503,'首帧权威图片记录缺失');authoritative.push(task);}
    for(const task of authoritative)await resolveTaskArtifact({directory,task,verify:true});
    const transactions=state.tasks.filter(row=>['character','asset','firstframe'].includes(row.type)).map(row=>({task_id:row.task_id,type:row.type,item_id:row.item_id,purpose:row.purpose,attempt:row.attempt,transaction_key:row.transaction_key,provider:row.provider,provider_task_id:row.provider_task_id,status:row.status,prompt_sha256:row.prompt_sha256,artifact_id:row.artifact_id,artifact_sha256:row.artifact_sha256,artifact_bytes:row.artifact_bytes,artifact_mime:row.artifact_mime,qa:row.qa||null,user_decision:row.user_decision||null,downstream_consumable:row.downstream_consumable===true}));
    const content={schema_version:SNAPSHOT_SCHEMA,project_id:plan.project_id,plan_id:plan.plan_id,locale:plan.locale,market:plan.market,skill_bundle:{version:plan.skill_bundle_version,sha256:plan.skill_bundle_sha256},grouping_policy:{version:plan.grouping_policy_version,override:plan.grouping_override},upstream:{analysis_run_id:plan.analysis_run_id,source_sha256:plan.source_sha256,source_bytes:plan.source_bytes,step01_snapshot_id:plan.step01_snapshot_id,step01_snapshot_sha256:plan.step01_snapshot_sha256,step02_variant_id:plan.step02_variant_id,step02_confirmed_sha256:plan.step02_confirmed_sha256},planning_sha256:state.planning_sha256,characters:state.characters.map(row=>({character_id:row.character_id,source_identity:row.source_identity,localized_identity:row.localized_identity,importance:row.importance,artifact_sha256:row.selected_artifact_sha256,authority_event:row.authority_event||null})),continuity_ledger:state.continuity_ledger,assets:state.assets.map(row=>({asset_id:row.asset_id,canonical_type:row.canonical_type,dependencies:row.dependencies,used_by_shots:row.used_by_shots,used_by_groups:row.used_by_groups,artifact_sha256:row.accepted_artifact_sha256})),groups:state.groups,firstframes:state.firstframes.map(row=>({group_id:row.group_id,artifact_sha256:row.selected_artifact_sha256,authority_event:row.authority_event})),provider_transactions:transactions,confirmed_at:now(),confirmed_by:sha256(String(args.ownerId))};
    content.style_authority=clone(state.style_review.authority_event);
    for(const asset of content.assets){const source=state.assets.find(row=>row.asset_id===asset.asset_id);asset.authority_event=clone(source?.authority_event||null);}
    const snapshotSha=sha256(canonical(content)),snapshot={...content,snapshot_id:'S03SNAP-'+snapshotSha.slice(0,24),snapshot_sha256:snapshotSha,step04_eligible:true};
    const created=await atomicWriteJson(path.join(directory,'snapshots',snapshot.snapshot_id+'.json'),snapshot,{exclusive:true});if(!created){const existing=await readJson(path.join(directory,'snapshots',snapshot.snapshot_id+'.json'));if(existing.snapshot_sha256!==snapshot.snapshot_sha256)throw codedError('STEP03_SNAPSHOT_COLLISION',503,'第三步快照冲突');}
    state.snapshot={snapshot_id:snapshot.snapshot_id,snapshot_sha256:snapshot.snapshot_sha256,step04_eligible:true,confirmed_at:snapshot.confirmed_at};state.status='confirmed';state.substep='confirmation';return state.snapshot;
  });}

  async function claimNextTask({workerId}){
    workerId=safeSegment(workerId);
    const reclaimCreatedClaimAfterMs=Math.max(60000,Number(process.env.NIANNIAN_STEP03_CREATED_CLAIM_RECLAIM_MS||300000));
    const ownerEntries=await fsp.readdir(path.join(root,'v1','owners'),{withFileTypes:true}).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error));
    const candidates=[];
    for(const owner of ownerEntries.filter(row=>row.isDirectory())){
      const projectDir=path.join(root,'v1','owners',owner.name,'projects',expected.projectId,'plans');
      const planNames=await fsp.readdir(projectDir).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error));
      for(const planId of planNames){
        const directory=path.join(projectDir,planId),state=await loadState(directory).catch(()=>null);
        if(!state)continue;
        for(const task of state.tasks||[]){
          if(!['created','submitted','generating','qa_running'].includes(task.status))continue;
          // Never let a slow provider poll starve newly persisted planning or image work.
          candidates.push({owner_hash:owner.name,plan_id:planId,directory,task:clone(task),priority:task.status==='created'?0:1});
        }
      }
    }
    candidates.sort((left,right)=>left.priority-right.priority||String(left.task.created_at||'').localeCompare(String(right.task.created_at||''))||left.plan_id.localeCompare(right.plan_id)||left.task.task_id.localeCompare(right.task.task_id));
    for(const candidate of candidates){
      const {directory,task}=candidate,claimPath=path.join(directory,'claims',task.task_id+'.json'),claim={task_id:task.task_id,worker_id:workerId,claimed_at:now()};
      if(await atomicWriteJson(claimPath,claim,{exclusive:true}))return{...candidate,task};
      const existing=await readJson(claimPath).catch(()=>null);
      if(existing?.worker_id===workerId&&['created','submitted','generating','qa_running'].includes(task.status))return{...candidate,task};
      const age=Date.now()-Date.parse(existing?.claimed_at||'');
      const safelyReclaimable=task.status==='created'&&!task.provider_task_id&&Number.isFinite(age)&&age>=reclaimCreatedClaimAfterMs;
      if(safelyReclaimable){
        await fsp.rm(claimPath,{force:true});
        if(await atomicWriteJson(claimPath,claim,{exclusive:true}))return{...candidate,task};
      }
    }
    return null;
  }
  async function updateWorkerTask({directory,taskId,patch}){directory=path.resolve(directory);if(!directory.startsWith(root+path.sep))throw codedError('STEP03_WORKER_PATH_INVALID',403,'Worker 路径无效');const state=await loadState(directory),task=state.tasks.find(row=>row.task_id===taskId);if(!task)throw codedError('STEP03_TASK_NOT_FOUND',404,'任务不存在');const allowed=new Set(['status','submission_intent_sha256','provider_task_id','submitted_at','provider_contract','artifact_id','artifact_key','artifact_path','artifact_sha256','artifact_bytes','artifact_mime','downloaded_at','qa','qa_at','planning_result','error']);if(!patch||Object.keys(patch).some(key=>!allowed.has(key))||('planning_result'in patch&&task.type!=='planning'))throw codedError('STEP03_WORKER_PATCH_INVALID',422,'Worker 状态更新字段无效');if('artifact_key'in patch)validateArtifactKey(patch.artifact_key);const eventCore={task_id:taskId,patch:{...clone(patch),updated_at:now()},created_at:now()},event={schema_version:'niannian.step03_task_event.v1',...eventCore,event_sha256:sha256(canonical(eventCore))};await atomicWriteJson(path.join(directory,'task-events',String(Date.now()).padStart(13,'0')+'-'+crypto.randomBytes(8).toString('hex')+'.json'),event,{exclusive:true});Object.assign(task,event.patch);deriveTaskState(state,task);return publicTask(task);}
  async function getArtifact({ownerId,project:projectValue,planId,artifactId}){validateProject(projectValue);let current=null;if(planId)current=await files(ownerId,planId);else{const names=await fsp.readdir(plansRoot(ownerId)).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error));for(const name of names.filter(item=>/^S03-(es-MX|pt-BR|en-US)-[a-f0-9]{20}$/.test(item))){const candidate=await files(ownerId,name);if(candidate.state.tasks.some(row=>row.artifact_id===artifactId)){current=candidate;break;}}}if(!current)throw codedError('STEP03_ARTIFACT_NOT_FOUND',404,'图片不存在');const task=current.state.tasks.find(row=>row.artifact_id===artifactId);if(!task)throw codedError('STEP03_ARTIFACT_NOT_FOUND',404,'图片不存在');return resolveTaskArtifact({directory:current.directory,task,verify:true});}
  async function getVideoBatchAuthorityInput({ownerId,project:projectValue,planId}){validateProject(projectValue);const current=await files(ownerId,planId);if(current.plan.project_id!==projectValue.id)throw codedError('STEP03_PLAN_PROJECT_MISMATCH',409,'当前视频方案与项目不匹配');return{plan_id:current.plan.plan_id,groups:clone(current.state.groups||[])};}
  async function getStep04ReferenceRegistry({ownerId,project:projectValue,planId,authorityRevision,localizationRevision}){
    validateProject(projectValue);const current=await files(ownerId,planId),state=current.state,plan=current.plan,group=state.groups[0];
    if(!group)throw codedError('STEP05_MINIMAL_GROUP_REQUIRED',409,'第一条视频分组尚未准备好');
    const refs=[],supportKeys=[];
    for(const asset of state.assets){const task=latestTask(state.tasks,asset.attempts,'asset');if(!task||task.status!=='accepted'||!task.artifact_id)continue;const artifact=await resolveTaskArtifact({directory:current.directory,task,verify:true}),refKey='SUPPORT-'+asset.asset_id;supportKeys.push(refKey);refs.push({project_id:plan.project_id,ref_key:refKey,canonical_type:'support_asset_ref',required:false,authority_revision:authorityRevision,localization_revision:localizationRevision,authority_event_id:'S04-'+sha256(canonical({plan_id:planId,ref_key:refKey,artifact_sha256:artifact.sha256})).slice(0,24),authority_source:'step04_explicit_registration',reference_role_cn:'支撑当前视频组的场景、服装或道具一致性',video_group:'',purpose_cn:asset.description||asset.name||'视频支撑素材',source_fact_projection:{label:'地区改编资产职责'},related_support_ref_keys:[],locked_prompt_lineage:{prompt_revision:task.prompt_revision_id||task.task_id,prompt_sha:task.prompt_sha256},dependencies:clone(asset.dependencies||[]),readback:{bytes:artifact.bytes,content_type:artifact.mime},qa:{status:'pass',problem_cn:'',actions:[]},candidate:{candidate_revision:task.task_id,content_sha:artifact.sha256,public_candidate_url:'',artifact_id:task.artifact_id,plan_id:planId}});}
    const lead=state.characters.find(row=>row.importance==='lead')||state.characters.find(row=>row.importance==='important');
    const leadTask=lead&&latestTask(state.tasks,lead.candidate_ids,'character');
    if(!lead||!leadTask||leadTask.status!=='accepted'||!leadTask.artifact_id)throw codedError('STEP05_IDENTITY_REFERENCE_REQUIRED',409,'人物身份基准图尚未准备好');
    const leadArtifact=await resolveTaskArtifact({directory:current.directory,task:leadTask,verify:true}),identityKey='IDENTITY-'+lead.character_id;
    refs.push({project_id:plan.project_id,ref_key:identityKey,canonical_type:'video_upload_non_first_ref',required:true,authority_revision:authorityRevision,localization_revision:localizationRevision,authority_event_id:lead.authority_event?.event_id||'S04-'+sha256(canonical({plan_id:planId,ref_key:identityKey,artifact_sha256:leadArtifact.sha256})).slice(0,24),authority_source:'step04_explicit_registration',reference_role_cn:'锁定主角身份一致性',video_group:'V01',purpose_cn:(lead.localized_identity||'主角')+'身份基准图',source_fact_projection:{label:'地区改编人物职责'},related_support_ref_keys:supportKeys,locked_prompt_lineage:{prompt_revision:leadTask.task_id,prompt_sha:leadTask.prompt_sha256},dependencies:clone(lead.appearance_shot_ids||[]),readback:{bytes:leadArtifact.bytes,content_type:leadArtifact.mime},qa:{status:'pass',problem_cn:'',actions:[]},candidate:{candidate_revision:leadTask.task_id,content_sha:leadArtifact.sha256,public_candidate_url:'',artifact_id:leadTask.artifact_id,plan_id:planId}});
    const frame=state.firstframes.find(row=>row.group_id===group.group_id),frameTaskValue=frame&&latestTask(state.tasks,frame.candidate_ids,'firstframe');
    if(!frame||!frameTaskValue||frameTaskValue.status!=='accepted'||!frameTaskValue.artifact_id)throw codedError('STEP05_FIRST_FRAME_REFERENCE_REQUIRED',409,'第一条视频首帧尚未准备好');
    const frameArtifact=await resolveTaskArtifact({directory:current.directory,task:frameTaskValue,verify:true}),frameKey='FIRST-'+group.group_id;
    refs.push({project_id:plan.project_id,ref_key:frameKey,canonical_type:'video_first_frame_anchor',required:true,authority_revision:authorityRevision,localization_revision:localizationRevision,authority_event_id:frame.authority_event?.event_id||'S04-'+sha256(canonical({plan_id:planId,ref_key:frameKey,artifact_sha256:frameArtifact.sha256})).slice(0,24),authority_source:'step04_explicit_registration',reference_role_cn:'锁定 V01 开场构图与动作',video_group:'V01',purpose_cn:'V01 首帧',source_fact_projection:{label:'原片 V01 起始画面',start_sec:Number(group.start_sec||0)},related_support_ref_keys:supportKeys,locked_prompt_lineage:{prompt_revision:frameTaskValue.task_id,prompt_sha:frameTaskValue.prompt_sha256},dependencies:clone(group.asset_dependencies||[]),readback:{bytes:frameArtifact.bytes,content_type:frameArtifact.mime},qa:{status:'pass',problem_cn:'',actions:[]},candidate:{candidate_revision:frameTaskValue.task_id,content_sha:frameArtifact.sha256,public_candidate_url:'',artifact_id:frameTaskValue.artifact_id,plan_id:planId}});
    return{project_id:plan.project_id,authority_revision:authorityRevision,localization_revision:localizationRevision,authority_source:'step04_explicit_registry',delivery_target:'FIRST_REAL_VIDEO_PLAYABLE',execution_scope:{mode:'minimal_first_video',video_group_ids:['V01']},step04_registry_revision:'S04REG-'+sha256(canonical(refs.map(row=>({ref_key:row.ref_key,authority_event_id:row.authority_event_id,content_sha:row.candidate.content_sha})))).slice(0,24),references:refs};
  }
  return{createPlan,listPlans,getPlan,confirmStyle,queueCharacterCandidates,decideCharacter,queueAssets,decideAsset,rerollAsset,queueFirstFrames,decideFirstFrame,rebuildGroups,reviseGroups,confirmPlan,claimNextTask,updateWorkerTask,getArtifact,getVideoBatchAuthorityInput,getStep04ReferenceRegistry,resolveTaskArtifact:args=>resolveTaskArtifact(args),loadWorkerState:loadState,canonicalContractsForPlan,constants:{LOCALES,PLAN_SCHEMA,STATE_SCHEMA,SNAPSHOT_SCHEMA,BUNDLE_VERSION,GROUPING_POLICY_VERSION,CHARACTER_AUTHORITY_PROMPT_VERSION,STYLE_PROFILE_VERSION,STYLE_CANDIDATE_DEFINITIONS,SKILL_OVERRIDE}};
}

module.exports={createStep03Service,canonicalContractsForPlan,buildProductionGroups,createPlanningResult,characterPrompt,characterVisualLocks,canonical,sha256,codedError,normalizeImageResolution,validateArtifactKey,artifactPathFromKey,resolveTaskArtifact,LOCALES,BUNDLE_VERSION,GROUPING_POLICY_VERSION,CHARACTER_AUTHORITY_PROMPT_VERSION,STYLE_PROFILE_VERSION,STYLE_CANDIDATE_DEFINITIONS,SKILL_OVERRIDE};
