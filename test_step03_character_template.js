const assert = require('assert/strict');
const {characterPrompt,characterVisualLocks,CHARACTER_AUTHORITY_PROMPT_VERSION} = require('./bridge/niannian_step03_runtime');

function promptFor(character, assets, continuity) {
  return characterPrompt(character,'es-MX',characterVisualLocks(character,assets,continuity));
}

const characters = [
  {character_id:'C002',localized_identity:'La rival de Ruoruo',function:'Antagonista de la confrontación; humilla a Ruoruo.',target_casting:'Mujer mexicana de 25 a 30 años, sofisticada y de autoridad fría.',age_band:'25-30',relationship:'Rival amorosa',profession:'No especificada'},
  {character_id:'C003',localized_identity:'Empleada del Registro Civil',function:'Empleada que recibe formularios y anuncia el turno institucional.',target_casting:'Mujer mexicana de 35 a 45 años, profesional, amable y eficiente.',age_band:'35-45',relationship:'Funcionaria que atiende a Ruoruo',profession:'Servidora administrativa del Registro Civil'},
  {character_id:'C004',localized_identity:'La hermana consentida',function:'Figura de una publicación social con sus tres hermanos.',target_casting:'Joven mexicana de 20 a 25 años, carismática, juguetona y segura.',age_band:'20-25',relationship:'Hermana de tres hombres',profession:'No especificada'},
  {character_id:'C005',localized_identity:'Wang Moze',function:'Pretendiente inesperado que ofrece una salida romántica.',target_casting:'Hombre mexicano de 27 a 32 años, elegante, sereno y de presencia adinerada sin ostentación.',age_band:'27-32',relationship:'Posible nuevo pretendiente de Ruoruo',profession:'Heredero de la familia Wang'}
];
const assets = [
  {asset_id:'A-RIVAL-LOOK',canonical_type:'wardrobe',name:'Look sofisticado de la rival',description:'Conjunto oscuro estructurado y celular discreto.',owner_character_id:'C002',dependencies:['C002']},
  {asset_id:'A-EMPLOYEE-UNIFORM',canonical_type:'wardrobe',name:'Uniforme de Registro Civil',description:'Uniforme institucional y micrófono de ventanilla.',owner_character_id:'C003',dependencies:['C003']},
  {asset_id:'A-EMPLOYEE-MIC',canonical_type:'prop',name:'Micrófono de ventanilla',description:'Micrófono de escritorio institucional.',owner_character_id:'C003',dependencies:['C003']},
  {asset_id:'A-SISTER-LOOK',canonical_type:'wardrobe',name:'Look casual de la hermana',description:'Conjunto juvenil diferenciado y teléfono social.',owner_character_id:'C004',dependencies:['C004']},
  {asset_id:'A-SISTER-PHONE',canonical_type:'phone-ui',name:'Publicación con tres hermanos',description:'Publicación social.',visible_text_localized:'Con mis hermanos, este resfriadito no es nada.',owner_character_id:'C004',dependencies:['C004']},
  {asset_id:'A-WANG-SUIT',canonical_type:'wardrobe',name:'Traje claro de Wang Moze',description:'Traje claro bien cortado y documento matrimonial.',owner_character_id:'C005',dependencies:['C005']},
  {asset_id:'A-WANG-DOC',canonical_type:'document',name:'Solicitud de matrimonio civil',description:'Documento que sostiene Wang Moze.',visible_text_localized:'SOLICITUD DE MATRIMONIO CIVIL',owner_character_id:'C005',dependencies:['C005']}
];
const continuity = [
  {character_id:'C002',source_wardrobe_evidence:'Mismo peinado, maquillaje, celular y look sofisticado.',change_reason:'Confrontación continua.'},
  {character_id:'C003',source_wardrobe_evidence:'Vestuario administrativo y posición detrás de ventanilla.',change_reason:'Misma sesión de atención.'},
  {character_id:'C004',source_wardrobe_evidence:'Apariencia juvenil en la publicación social.',change_reason:'Solo publicación social.'},
  {character_id:'C005',source_wardrobe_evidence:'Mismo traje claro, peinado y documento.',change_reason:'Revelación y cierre continuo.'}
];

for (const character of characters) {
  const prompt = promptFor(character,assets,continuity);
  assert.ok(prompt.includes('[模板版本] '+CHARACTER_AUTHORITY_PROMPT_VERSION),character.character_id+':template-marker');
  for (const section of ['[场景身份]','[主体]','[辨识度]','[人物签名]','[锁定细节]','[情绪]','[镜头与版式]','[细节与连续性]','[负向约束]']) assert.ok(prompt.includes(section),character.character_id+':missing:'+section);
  assert.match(prompt,/正面、侧面、背面三张完整全身视图/);
  assert.match(prompt,/六格肢体与造型连续性区/);
  assert.doesNotMatch(prompt,/六格剧情道具区/);
  assert.match(prompt,/剧情道具必须由独立资产任务生成/);
  assert.match(prompt,/不得出现任何独立剧情道具、手机、文件、票据、花束、钥匙、屏幕/);
  assert.ok(prompt.includes(character.localized_identity),character.character_id+':identity-missing');
}

const rival = promptFor(characters[0],assets,continuity);
const employee = promptFor(characters[1],assets,continuity);
const sister = promptFor(characters[2],assets,continuity);
const wang = promptFor(characters[3],assets,continuity);
for (const prompt of [rival,employee,sister]) {
  assert.match(prompt,/不得复用 C001\/Ruoruo 的红裙、花束、Turno 144、婚姻申请、16:50 锁屏、失败来电或 Shen Qingning 身份信息/);
}
assert.match(rival,/冷淡微笑、轻蔑观察/);
assert.match(employee,/友善专业、制度化专注/);
assert.match(sister,/轻松自信、自然开心/);
assert.match(wang,/克制真诚、冷静判断/);
assert.match(wang,/男性角色必须保留/);
assert.doesNotMatch(wang,/中分、自然披散的深色微卷长发/);
assert.match(rival,/烟灰黑与深墨绿/);
assert.match(employee,/石墨黑制度化制服/);
assert.match(sister,/深钴蓝针织上衣/);
assert.match(wang,/石墨灰或深海军蓝/);
assert.doesNotMatch(rival,/手机界面为/);
assert.doesNotMatch(employee,/锁定道具与手机界面/);

process.stdout.write(JSON.stringify({ok:true,template:CHARACTER_AUTHORITY_PROMPT_VERSION,roles:characters.map(row=>row.character_id),layout_locked:true,plot_props_separate:true,c001_markers_not_reused:true})+'\n');
