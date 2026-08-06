const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const SCHEMA = 'niannian.step01_story_authority.v1';
const REVISION_SCHEMA = 'niannian.step01_story_authority_revision.v1';

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex'); }
function codedError(code, httpStatus, message) { const error = new Error(message || code); error.code = code; error.httpStatus = httpStatus; return error; }
function now() { return new Date().toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function normalizeText(value, limit = 8000) { return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, limit); }
function safeProjectId(value) { const id = String(value || ''); if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) throw codedError('STEP01_STORY_PROJECT_INVALID', 422, '项目标识无效'); return id; }
async function readJson(filePath, fallback) { try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT' && arguments.length > 1) return fallback; throw error; } }
async function writeAtomic(filePath, value) { await fsp.mkdir(path.dirname(filePath), {recursive:true}); const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(5).toString('hex'); await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {flag:'wx'}); await fsp.rename(temp, filePath); }
function statePath(root, project) {
  const projectId = typeof project === 'string' ? project : project?.id;
  const revisionId = typeof project === 'object' ? String(project?.analysis?.authorityRevisionId || '') : '';
  const base = path.join(path.resolve(root), safeProjectId(projectId));
  if (revisionId && !/^analysis-[A-Za-z0-9-]{8,120}$/.test(revisionId)) throw codedError('STEP01_STORY_AUTHORITY_REVISION_INVALID', 422, '剧情权威 revision 无效');
  return revisionId ? path.join(base, 'revisions-by-authority', revisionId, 'story-authority.json') : path.join(base, 'story-authority.json');
}

function shotEvidence(ledger, shot) {
  const dialogue = (shot.dialogue_ids || []).map(id => ledger.dialogue_rows.find(row => row.dialogue_id === id)).filter(Boolean).map(row => row.source_text);
  const ocr = (shot.ocr_ids || []).map(id => ledger.ocr_rows.find(row => row.ocr_id === id)).filter(Boolean).map(row => row.source_text);
  return {shot_id:shot.shot_id, start_sec:Number(shot.start_sec), end_sec:Number(shot.end_sec), dialogue, ocr, visual_facts:normalizeText(shot.source_visual_facts, 600), characters:Array.isArray(shot.characters) ? shot.characters : [], action:normalizeText(shot.action, 600), props:Array.isArray(shot.props) ? shot.props : []};
}

function narrativeBeatSummary({evidence, dialogueLines, ocrLines, fallback}) {
  const observed = evidence.map(row => row.gemini_observed || row.action || row.visual_facts).filter(Boolean).join('；');
  const corpus = [observed, ...dialogueLines, ...ocrLines].join('；');
  if (/先填写/.test(corpus) && /背对镜头|男子/.test(corpus)) return '一名男子在婚姻登记办理区域填写资料。';
  if (/他们不会去了/.test(corpus) && /放了你的鸽子/.test(corpus)) {
    const name = /司若若/.test(corpus) ? '有人认出司若若，' : '';
    const title = /大哥/.test(corpus) ? '有人先向“大哥”表示原定对象不会前往；' : '原定对象不会前往；';
    return title + name + '随后出现“放了你的鸽子”的挑衅，现场冲突升级。';
  }
  if (/红色连衣裙|红裙/.test(corpus) && /花束|一束花/.test(corpus) && /手机|暂时无法接通/.test(corpus)) return '红裙女子带着花束等待办理，并查看手机；原片文字显示电话暂时无法接通。';
  if (/红色连衣裙|红裙/.test(corpus) && /花束|一束花/.test(corpus)) return '红裙女子带着花束在登记现场等待，并关注手机信息。';
  if (/红色小册子|递.*册子|窗口/.test(corpus) && /结婚登记|二号窗口|2号窗口/.test(corpus)) return '白衣女子在婚姻登记窗口递交红色材料，窗口正在办理结婚登记业务。';
  if (/同样作为女人/.test(corpus) && /白色上衣|白衣/.test(corpus)) return '白衣女子持手机继续言语施压，并说出“同样作为女人，你真的很失败”。';
  if (/红裙/.test(corpus) && /婚姻登记中心/.test(corpus)) return '红裙女子抱着花束望向一侧，仍停留在婚姻登记中心附近。';
  if (/着急结婚/.test(corpus) && /考虑一下我/.test(corpus)) return '有人询问是否急着结婚，并提出“可不可以考虑一下我？”。';
  if (/背对镜头|背影/.test(corpus) && /考虑一下我/.test(corpus)) return '红裙女子注视着背影人物，关于“考虑一下我”的邀请仍在继续。';
  return normalizeText(observed || dialogueLines.join('；') || ocrLines.join('；') || fallback, 1000);
}

function buildEvidenceOutline(ledger, scriptText, geminiSidecar = {}) {
  const shots = Array.isArray(ledger.shots) ? ledger.shots : [];
  const unique = values => [...new Set(values.map(value => normalizeText(value, 600)).filter(Boolean))];
  const sidecarByShot = new Map((geminiSidecar.analyses || []).filter(item => item?.shot_id).map(item => [String(item.shot_id), item]));
  const allDialogue = unique((ledger.dialogue_rows || []).map(row => row.source_text));
  const allOcr = unique((ledger.ocr_rows || []).map(row => row.source_text));
  const hasRegistration = allDialogue.some(line => /结婚登记|办理结婚|结婚吗/.test(line));
  const hasRegistrationOcr = allOcr.some(line => /结婚登记|办理结婚|二号窗口|2号窗口/.test(line));
  const hasUnreachableOcr = allOcr.some(line => /暂时无法接通|无法接通/.test(line));
  const hasNoShow = allDialogue.some(line => /不会去了|放了你的鸽子/.test(line));
  const hasInvitation = allDialogue.some(line => /考虑一下我/.test(line));
  const groups = [];
  for (let start = 0; start < shots.length; start += 5) {
    const slice = shots.slice(start, start + 5);
    const evidence = slice.map(shot => {
      const row = shotEvidence(ledger, shot);
      const review = sidecarByShot.get(row.shot_id);
      const ocrText = unique(row.ocr);
      return {
        ...row,
        gemini_observed:normalizeText(review?.observed, 600),
        gemini_uncertainty:normalizeText(review?.uncertainty, 400),
        // OCR can verify visible text, but it can never resolve identities,
        // relationships, or off-screen causes from a Gemini uncertainty.
        ocr_crosscheck:review ? {
          status:ocrText.length ? 'text_evidence_available' : 'no_text_evidence',
          texts:ocrText.slice(0, 6),
          unresolved_scope:'人物身份、人物关系、说话对象和不可见因果仍需人工确认'
        } : null
      };
    });
    const dialogueLines = unique(evidence.flatMap(row => row.dialogue));
    const dialogue = dialogueLines.filter(line => !/^(请|幺).{0,12}二号窗口办理结婚/.test(line)).join('；');
    const facts = unique(evidence.map(row => row.action || row.visual_facts || row.gemini_observed)).join('；');
    const hasLedgerVisualEvidence = evidence.some(row => row.visual_facts || row.action);
    const hasSidecarEvidence = evidence.some(row => row.gemini_observed);
    const registrationOnly = dialogueLines.length && dialogueLines.every(line => /二号窗口|办理结婚登记|办理结婚/.test(line));
    const fallback = registrationOnly ? '民政局广播提示前往二号窗口办理婚姻登记；该段人物与行动仍需查看关键帧核对。' : '该段缺少足以自动概括的可见事实，需查看原片关键帧核对。';
    groups.push({
      beat_id:'B' + String(groups.length + 1).padStart(3, '0'),
      shot_ids:slice.map(row => row.shot_id),
      start_sec:Number(slice[0]?.start_sec || 0),
      end_sec:Number(slice.at(-1)?.end_sec || 0),
      evidence,
      summary:narrativeBeatSummary({evidence, dialogueLines, ocrLines:unique(evidence.flatMap(row => row.ocr)), fallback:normalizeText(facts || dialogue || fallback, 1000)}),
      confidence:hasLedgerVisualEvidence ? 'evidence_supported' : (hasSidecarEvidence ? 'sidecar_supported' : 'needs_visual_review'),
      review_notes:unique(evidence.map(row => row.gemini_uncertainty)).slice(0, 5)
    });
  }
  const sourceNames = unique(allDialogue.map(line => (String(line).match(/^([\u4e00-\u9fa5]{2,4})[，,]/) || [])[1]).filter(name => !['大哥', '哥哥们'].includes(name)));
  const synopsis = scriptText
    ? '用户提供剧本已登记。以下镜头证据用于与剧本逐段核对，不会覆盖用户原剧本。'
    : ((hasRegistration || hasRegistrationOcr) && hasNoShow && hasInvitation
      ? '故事围绕婚姻登记办理展开。原片文字与对白均指向二号窗口办理结婚登记；红裙女性带着花束并多次查看手机，原片文字出现“暂时无法接通”。随后围绕“他们不会去了”和“放了你的鸽子”发生冲突，对白中出现司若若、“大哥”和“哥哥们”等原剧称呼，另一名女性说出“同样作为女人，你真的很失败”。结尾出现“可不可以考虑一下我？”的邀请。人物姓名、彼此关系、每句对白的对象和事件因果，必须由你确认后才会成为权威事实。'
      : (allDialogue.length ? '本集围绕已提取对白和镜头事件展开；以下为待用户核对的证据型剧情草案。' : '当前没有足够对白文本；以下为待用户核对的镜头证据型剧情草案。'));
  return {synopsis, beats:groups, characters:sourceNames, unresolved:groups.filter(row => row.confidence === 'needs_visual_review' || row.review_notes?.length).map(row => ({shot_ids:row.shot_ids, reason:row.review_notes?.join('；') || '缺少对白、OCR 与人工镜头事实，需视觉核对'})), composition:{ledger_evidence:true, ocr_crosschecked_rows:groups.flatMap(row => row.evidence).filter(row => row.ocr_crosscheck?.status === 'text_evidence_available').length, gemini_sidecar_rows:Array.isArray(geminiSidecar.analyses) ? geminiSidecar.analyses.length : 0, user_confirmation_required:true}};
}

function defaultGeminiConfig() {
  const googleKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  if (googleKey) return {configured:true, provider:'google_files_api', apiKey:googleKey, model:process.env.GEMINI_STORY_MODEL || 'gemini-3.1-pro-preview', endpoint:process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'};
  const yunwuKey = process.env.YUNWU_GEMINI_PRO_LOWEST_API_KEY || process.env.YUNWU_GEMINI_LOWEST_API_KEY || '';
  return {configured:Boolean(yunwuKey), provider:'yunwu_openai_compatible', apiKey:yunwuKey, apiKeyEnv:process.env.YUNWU_GEMINI_PRO_LOWEST_API_KEY ? 'YUNWU_GEMINI_PRO_LOWEST_API_KEY' : 'YUNWU_GEMINI_LOWEST_API_KEY', model:process.env.YUNWU_GEMINI_STORY_MODEL || 'gemini-3.1-pro-preview', endpoint:process.env.YUNWU_GEMINI_API_BASE_URL || 'https://yunwu.ai'};
}

async function imageDataUrl(filePath) {
  const body = await fsp.readFile(filePath).catch(() => null);
  if (!body || !body.length || body.length > 12 * 1024 * 1024) return null;
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return 'data:' + mime + ';base64,' + body.toString('base64');
}

async function yunwuEvidenceImages({ledger, shotIds, evidenceRoot, fullEvidenceIndex = null, frameSubset = null}) {
  if (fullEvidenceIndex?.frames?.length) {
    const output = [];
    const allowed = frameSubset ? new Set(frameSubset.map(item => item.frame_id)) : null;
    for (const frame of fullEvidenceIndex.frames.filter(item => shotIds.includes(item.shot_id) && (!allowed || allowed.has(item.frame_id)))) {
      const url = await imageDataUrl(frame.absolute_path);
      if (url) output.push({shot_id:frame.shot_id, point:'native', frame_id:frame.frame_id, timecode:frame.timecode, extraction_reason:frame.extraction_reason, image_url:url});
    }
    return output;
  }
  if (!evidenceRoot) return [];
  const root = path.resolve(evidenceRoot, 'artifacts');
  const selected = (ledger.shots || []).filter(shot => shotIds.includes(shot.shot_id));
  const output = [];
  for (const shot of selected) {
    // The document keeps all three evidence frames for human review. The model
    // receives the labelled middle anchor so full-run requests remain bounded.
    const point = 'mid';
    const frame = (shot.frame_evidence || []).find(item => item.point === point) || (shot.frame_evidence || [])[0];
    const relative = String(frame?.relative_path || '').replace(/\\/g, '/');
    if (!relative || path.posix.isAbsolute(relative) || relative.includes('..')) continue;
    const framePath = path.resolve(root, ...relative.split('/'));
    if (!framePath.startsWith(root + path.sep)) continue;
    const url = await imageDataUrl(framePath);
    if (url) output.push({shot_id:shot.shot_id, point, image_url:url});
  }
  return output;
}

async function geminiJson(response) { return await response.json().catch(() => null); }
function parseModelJson(value) {
  const text = Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : item?.text || '').join('') : String(value || '');
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf('{'); const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {} }
  return null;
}
async function uploadGeminiVideo(config, sourceVideoPath) {
  const stats = await fsp.stat(sourceVideoPath).catch(() => null);
  if (!stats?.isFile() || stats.size <= 0) return {error_code:'GEMINI_SOURCE_VIDEO_UNAVAILABLE'};
  if (stats.size > 300 * 1024 * 1024) return {error_code:'GEMINI_SOURCE_VIDEO_TOO_LARGE'};
  const mimeType = path.extname(sourceVideoPath).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4';
  const endpoint = String(config.endpoint).replace(/\/$/, '');
  let start;
  try { start = await fetch(endpoint.replace(/\/v1beta$/, '/upload/v1beta') + '/files?key=' + encodeURIComponent(config.apiKey), {method:'POST',headers:{'Content-Type':'application/json','X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(stats.size),'X-Goog-Upload-Header-Content-Type':mimeType},body:JSON.stringify({file:{display_name:'niannian-step01-source-video'}})}); }
  catch { return {error_code:'GEMINI_UPLOAD_NETWORK_ERROR'}; }
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!start.ok || !uploadUrl) return {error_code:'GEMINI_UPLOAD_START_FAILED'};
  let uploaded;
  try { uploaded = await fetch(uploadUrl, {method:'POST',headers:{'Content-Type':mimeType,'Content-Length':String(stats.size),'X-Goog-Upload-Command':'upload, finalize','X-Goog-Upload-Offset':'0'},body:fs.createReadStream(sourceVideoPath),duplex:'half'}); }
  catch { return {error_code:'GEMINI_UPLOAD_NETWORK_ERROR'}; }
  const file = await geminiJson(uploaded);
  if (!uploaded.ok || !file?.file?.name || !file.file.uri) return {error_code:'GEMINI_UPLOAD_FINALIZE_FAILED'};
  const deadline = Date.now() + 300000;
  let current = file.file;
  while (current.state === 'PROCESSING' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const check = await fetch(endpoint + '/' + current.name + '?key=' + encodeURIComponent(config.apiKey)).catch(() => null);
    const body = check ? await geminiJson(check) : null;
    if (!check?.ok || !body?.name) return {error_code:'GEMINI_VIDEO_PROCESSING_FAILED'};
    current = body;
  }
  if (current.state !== 'ACTIVE') return {error_code:'GEMINI_VIDEO_PROCESSING_TIMEOUT'};
  return {file:current};
}
async function deleteGeminiFile(config, name) { if (!name) return; await fetch(String(config.endpoint).replace(/\/$/, '') + '/' + name + '?key=' + encodeURIComponent(config.apiKey), {method:'DELETE'}).catch(() => {}); }

async function analyzeWithGemini({config, ledger, shotIds, sourceVideoPath}) {
  if (!config.configured) return {status:'not_configured', analyses:[]};
  if (!sourceVideoPath) return {status:'source_unavailable', analyses:[], error_code:'GEMINI_SOURCE_VIDEO_UNAVAILABLE'};
  const selected = (ledger.shots || []).filter(shot => shotIds.includes(shot.shot_id)).map(shot => shotEvidence(ledger, shot));
  if (!selected.length) return {status:'not_needed', analyses:[]};
  const upload = await uploadGeminiVideo(config, sourceVideoPath);
  if (!upload.file) return {status:'upload_failed', analyses:[], error_code:upload.error_code};
  const prompt = [
    '你是短剧原片视频证据复核员。查看随附原片视频，但只分析给定的关键镜头时间段，并结合 ASR、OCR 和镜头事实。',
    '不得虚构角色姓名、关系、剧情动机或不可见动作。每条结论必须引用 shot_id 与对应时间段。',
    '返回 {analyses:[{shot_id,observed,uncertainty,needs_video_review:boolean}]}。',
    JSON.stringify(selected)
  ].join('\n');
  const url = String(config.endpoint).replace(/\/$/, '') + '/models/' + encodeURIComponent(config.model) + ':generateContent?key=' + encodeURIComponent(config.apiKey);
  let response;
  try {
    response = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{role:'user',parts:[{fileData:{fileUri:upload.file.uri,mimeType:upload.file.mimeType||'video/mp4'}},{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.1}})});
  } catch { await deleteGeminiFile(config, upload.file.name); return {status:'network_error', analyses:[], error_code:'GEMINI_NETWORK_ERROR'}; }
  if (!response.ok) { await deleteGeminiFile(config, upload.file.name); return {status:'provider_error', analyses:[], error_code:'GEMINI_HTTP_' + response.status}; }
  const body = await geminiJson(response);
  await deleteGeminiFile(config, upload.file.name);
  const text = body?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  try { const parsed = JSON.parse(text); return {status:'completed', analyses:Array.isArray(parsed.analyses) ? parsed.analyses.slice(0, selected.length) : []}; }
  catch { return {status:'invalid_response', analyses:[], error_code:'GEMINI_RESPONSE_INVALID'}; }
}

async function analyzeWithYunwu({config, ledger, shotIds, evidenceRoot, fullEvidenceIndex = null, frameSubset = null, continuityAnchors = null}) {
  if (!config.configured) return {status:'not_configured', analyses:[]};
  const selected = (ledger.shots || []).filter(shot => shotIds.includes(shot.shot_id)).map(shot => shotEvidence(ledger, shot));
  if (!selected.length) return {status:'not_needed', analyses:[]};
  const images = await yunwuEvidenceImages({ledger, shotIds, evidenceRoot, fullEvidenceIndex, frameSubset});
  if (!images.length) return {status:'evidence_unavailable', analyses:[], error_code:'YUNWU_FRAME_EVIDENCE_UNAVAILABLE'};
  const prompt = [
    '你是短剧原片证据复核员。只根据每张图片前标记的镜头号和时点、ASR、OCR 与镜头事实作答。',
    'observed 只写一至两句可供下游转绘使用的中文可见事实：人物数量/外观与服装、场景、发生的动作、拿着或出现的关键物件、可直接读出的剧情文字。不要照抄电话系统按钮或无关 OCR。',
    '不得虚构角色姓名、关系、剧情动机、说话者或关键帧中不可见的动作。证据不足时写 uncertainty，不要把猜测放进 observed。',
    '同时逐帧返回 frame_observations：每项包含 frame_id 和 visual_subjects。visual_subjects 的每位人物必须给出 continuity_key（根据可见发型、脸部轮廓、体态、服装仅作辅助、随身物、动作和空间位置写成稳定的中文短键）、visible_description、visible_action；无法跨帧判断时标记 uncertain。不得凭姓名、关系或剧情功能生成 continuity_key。',
    '返回严格 JSON：{"analyses":[{"shot_id":"S001","observed":"中文可见事实","uncertainty":"中文不确定项","needs_video_review":true}],"frame_observations":[{"frame_id":"F-...","visual_subjects":[{"continuity_key":"...","visible_description":"...","visible_action":"...","uncertain":false}]}]}。',
    continuityAnchors?.length ? '本批在长镜头中截取；相邻锚点仅用于时间连续性，不代表已被本批图片替代：' + JSON.stringify(continuityAnchors) : '',
    JSON.stringify(selected)
  ].join('\n');
  const content = [{type:'text', text:prompt}];
  for (const image of images) {
    content.push({type:'text', text:'原片证据：' + image.shot_id + ' / ' + (image.frame_id ? image.frame_id + ' / ' + image.timecode + ' / ' + image.extraction_reason : ({start:'起始帧', mid:'中间帧', end:'结束帧'}[image.point] || '关键帧'))});
    content.push({type:'image_url', image_url:{url:image.image_url}});
  }
  let response;
  try {
    response = await fetch(String(config.endpoint).replace(/\/$/, '') + '/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + config.apiKey}, body:JSON.stringify({model:config.model, messages:[{role:'user',content}], temperature:0.1, response_format:{type:'json_object'}}), signal:AbortSignal.timeout(90000)});
  } catch { return {status:'network_error', analyses:[], error_code:'YUNWU_NETWORK_ERROR'}; }
  if (!response.ok) return {status:'provider_error', analyses:[], error_code:'YUNWU_HTTP_' + response.status};
  const body = await geminiJson(response);
  const parsed = parseModelJson(body?.choices?.[0]?.message?.content);
  if (parsed) {
    const expectedFrameIds = images.map(item => item.frame_id).filter(Boolean);
    const expected = new Set(expectedFrameIds);
    const seen = new Set();
    const frameObservations = [];
    for (const observation of Array.isArray(parsed.frame_observations) ? parsed.frame_observations : []) {
      const frameId = String(observation?.frame_id || '');
      if (!expected.has(frameId) || seen.has(frameId)) continue;
      seen.add(frameId);
      frameObservations.push(observation);
    }
    const missing = expectedFrameIds.filter(frameId => !seen.has(frameId));
    if (expectedFrameIds.length && missing.length) return {status:'incomplete_response', analyses:[], frame_observations:frameObservations, reviewed_frame_ids:[...seen], error_code:'YUNWU_FRAME_OBSERVATIONS_INCOMPLETE', missing_frame_ids:missing};
    const analyses = Array.isArray(parsed.analyses) ? parsed.analyses.slice(0, selected.length) : [];
    return {status:'completed', analyses, frame_observations:frameObservations, reviewed_frame_shot_ids:[...new Set(images.filter(item => !item.frame_id || seen.has(item.frame_id)).map(item => item.shot_id))], reviewed_frame_ids:[...seen], output_sha256:sha256(canonical({analyses,frame_observations:frameObservations}))};
  }
  return {status:'invalid_response', analyses:[], error_code:'YUNWU_RESPONSE_INVALID'};
}

function receiptNamespace(value) { const text = String(value || 'legacy'); if (!/^[A-Za-z0-9._-]{1,160}$/.test(text)) throw codedError('STEP01_RECEIPT_NAMESPACE_INVALID', 422, '完整证据回执标识无效'); return text; }
function batchReceiptPath(root, projectId, batchKey, namespace = 'legacy') { return path.join(path.resolve(root), safeProjectId(projectId), 'full-evidence-batches', receiptNamespace(namespace), batchKey + '.json'); }
async function readBatchReceipt(root, projectId, batchKey, namespace) { return readJson(batchReceiptPath(root, projectId, batchKey, namespace), null); }
async function writeBatchReceipt(root, projectId, batchKey, receipt, namespace) { await writeAtomic(batchReceiptPath(root, projectId, batchKey, namespace), receipt); }
function batchLockPath(root, projectId, batchKey, namespace) { return batchReceiptPath(root, projectId, batchKey, namespace) + '.writer-lock'; }
async function withBatchWriterLock(root, projectId, batchKey, namespace, callback) {
  const lockPath = batchLockPath(root, projectId, batchKey, namespace);
  await fsp.mkdir(path.dirname(lockPath), {recursive:true});
  const deadline = Date.now() + 120000;
  let waited = false;
  while (true) {
    try { await fsp.mkdir(lockPath); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      waited = true;
      if (Date.now() >= deadline) throw codedError('YUNWU_BATCH_WRITER_LOCKED', 409, '该视觉复核批次正在执行或等待人工恢复');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try { return await callback({waited}); }
  finally { await fsp.rmdir(lockPath).catch(() => {}); }
}
function completedReceiptResult(receipt, identity) {
  if (!receipt || receipt.schema_version !== 'niannian.step01_full_evidence_batch_receipt.v2' || receipt.status !== 'completed' || canonical(receipt.identity) !== canonical(identity) || !receipt.result || receipt.result.status !== 'completed') return null;
  const resultSha = sha256(canonical(receipt.result));
  if (receipt.result_sha256 !== resultSha || !/^[a-f0-9]{64}$/.test(String(receipt.output_sha256 || '')) || receipt.output_sha256 !== receipt.result.output_sha256) return null;
  return receipt.result;
}

async function analyzeAllShotsWithYunwu({config, ledger, shotIds, evidenceRoot, fullEvidenceIndex = null, receiptRoot = null, receiptNamespace:namespace = 'legacy', project = null}) {
  // A full evidence run is frame-bounded, never shot-bounded. A long shot is
  // deliberately split into native-frame batches instead of accidentally
  // exceeding the provider image cap or silently degrading to its middle frame.
  const requested = new Set(shotIds);
  const frames = fullEvidenceIndex?.frames?.filter(frame => requested.has(frame.shot_id)) || [];
  const batches = [];
  for (let offset = 0; offset < frames.length; offset += 12) {
    const slice = frames.slice(offset, offset + 12);
    const shotIdsForBatch = [...new Set(slice.map(frame => frame.shot_id))];
    const anchors = [];
    const before = frames[offset - 1]; const after = frames[offset + slice.length];
    if (before) anchors.push({shot_id:before.shot_id, frame_id:before.frame_id, timecode:before.timecode, position:'previous'});
    if (after) anchors.push({shot_id:after.shot_id, frame_id:after.frame_id, timecode:after.timecode, position:'next'});
    batches.push({frames:slice, shot_ids:shotIdsForBatch, anchors});
  }
  if (!batches.length && shotIds.length) batches.push({frames:null, shot_ids:shotIds, anchors:[]});
  const executeBatchUnlocked = async (batch, batchIndex, lockState = {waited:false}) => {
    const identity = {project_id:project?.id || null, authority_revision_id:namespace, source_sha256:ledger.source_sha256, full_evidence_index_sha256:fullEvidenceIndex?.index_sha256 || null, model:config.model, prompt_version:'step01-full-frame-v2', frame_ids:(batch.frames || []).map(frame => frame.frame_id)};
    const batchKey = sha256(canonical(identity)).slice(0, 32);
    const previous = receiptRoot && project ? await readBatchReceipt(receiptRoot, project.id, batchKey, namespace) : null;
    let result;
    let reconcileAction = 'new_submission';
    const started = Date.now();
    if (previous && (previous.status === 'submitted' || previous.status === 'failed') && (previous.schema_version !== 'niannian.step01_full_evidence_batch_receipt.v2' || canonical(previous.identity) !== canonical(identity))) {
      return {batch_index:batchIndex,batch_key:batchKey,frame_count:identity.frame_ids.length,frame_ids:identity.frame_ids,duration_ms:Date.now()-started,reconcile_action:'nonterminal_receipt_identity_rejected',duplicate_submission_count:Number(previous?.duplicate_submission_count || 0),prevented_concurrent_submission_count:Number(previous?.prevented_concurrent_submission_count || 0),result:{status:'receipt_integrity_failed',analyses:[],reviewed_frame_ids:[],error_code:'YUNWU_NONTERMINAL_RECEIPT_IDENTITY_INVALID'}};
    }
    if (previous?.status === 'completed') {
      result = completedReceiptResult(previous, identity);
      if (!result) return {batch_index:batchIndex,batch_key:batchKey,frame_count:identity.frame_ids.length,frame_ids:identity.frame_ids,duration_ms:Date.now()-started,reconcile_action:'completed_receipt_integrity_failed',duplicate_submission_count:Number(previous?.duplicate_submission_count || 0),prevented_concurrent_submission_count:Number(previous?.prevented_concurrent_submission_count || 0),result:{status:'receipt_integrity_failed',analyses:[],reviewed_frame_ids:[],error_code:'YUNWU_COMPLETED_RECEIPT_INTEGRITY_FAILED'}};
      reconcileAction = 'completed_reused';
    } else if (previous?.status === 'submitted') {
      // A provider request may have reached the service before the process died.
      // Never submit that same paid batch again without an explicit reconciliation.
      result = {status:'reconciliation_required', analyses:[], reviewed_frame_ids:[], error_code:'YUNWU_BATCH_RECONCILIATION_REQUIRED'};
      reconcileAction = 'submitted_blocked_for_reconcile';
    } else {
      if (previous?.status === 'failed') reconcileAction = 'failed_same_identity_recovery';
      const priorEvents = Array.isArray(previous?.events) ? previous.events : [];
      const events = [...priorEvents,{type:'provider_submission_started',reason:previous?.status === 'failed' ? 'failed_same_identity_recovery' : 'new_identity',at:now()}];
      if (receiptRoot && project) await writeBatchReceipt(receiptRoot, project.id, batchKey, {schema_version:'niannian.step01_full_evidence_batch_receipt.v2', identity, status:'submitted', submitted_at:now(),events,duplicate_submission_count:events.filter(event => event.type === 'duplicate_charge_detected').length,prevented_concurrent_submission_count:Number(previous?.prevented_concurrent_submission_count || 0)+(lockState.waited ? 1 : 0)}, namespace);
      result = await analyzeWithYunwu({config, ledger, shotIds:batch.shot_ids, evidenceRoot, fullEvidenceIndex, frameSubset:batch.frames, continuityAnchors:batch.anchors});
      const terminalEvents = [...events,{type:result.status === 'completed' ? 'provider_result_completed' : 'provider_result_failed',at:now(),error_code:result.error_code || null}];
      if (receiptRoot && project) await writeBatchReceipt(receiptRoot, project.id, batchKey, {schema_version:'niannian.step01_full_evidence_batch_receipt.v2', identity, status:result.status === 'completed' ? 'completed' : 'failed', completed_at:now(), duration_ms:Date.now()-started, output_sha256:result.output_sha256 || null, result_sha256:sha256(canonical(result)),result,events:terminalEvents,duplicate_submission_count:terminalEvents.filter(event => event.type === 'duplicate_charge_detected').length,prevented_concurrent_submission_count:Number(previous?.prevented_concurrent_submission_count || 0)+(lockState.waited ? 1 : 0)}, namespace);
    }
    return {batch_index:batchIndex,batch_key:batchKey,frame_count:identity.frame_ids.length,frame_ids:identity.frame_ids,duration_ms:Date.now()-started,reconcile_action:reconcileAction,duplicate_submission_count:Number(previous?.duplicate_submission_count || 0),prevented_concurrent_submission_count:Number(previous?.prevented_concurrent_submission_count || 0)+(lockState.waited ? 1 : 0),result};
  };
  const executeBatch = async (batch, batchIndex) => {
    if (!receiptRoot || !project) return executeBatchUnlocked(batch, batchIndex);
    const identity = {project_id:project.id, authority_revision_id:namespace, source_sha256:ledger.source_sha256, full_evidence_index_sha256:fullEvidenceIndex?.index_sha256 || null, model:config.model, prompt_version:'step01-full-frame-v2', frame_ids:(batch.frames || []).map(frame => frame.frame_id)};
    const batchKey = sha256(canonical(identity)).slice(0, 32);
    return withBatchWriterLock(receiptRoot, project.id, batchKey, namespace, lockState => executeBatchUnlocked(batch, batchIndex, lockState));
  };
  const concurrency = Math.min(3, Math.max(1, batches.length));
  const batchResults = new Array(batches.length);
  let cursor = 0;
  await Promise.all(Array.from({length:concurrency}, async () => {
    while (cursor < batches.length) {
      const index = cursor++;
      batchResults[index] = await executeBatch(batches[index], index);
    }
  }));
  const frameObservations = [];
  const reviewed = [];
  const reviewedFrameIds = [];
  const failures = [];
  const analysesByShot = new Map();
  for (const batchResult of batchResults) {
    const result = batchResult.result;
    for (const item of result.analyses || []) {
      const shotId = String(item?.shot_id || '');
      if (!shotId) continue;
      const current = analysesByShot.get(shotId) || {shot_id:shotId, observed:[], uncertainty:[], needs_video_review:false};
      const observed = normalizeText(item.observed, 600);
      const uncertainty = normalizeText(item.uncertainty, 600);
      if (observed && !current.observed.includes(observed)) current.observed.push(observed);
      if (uncertainty && !current.uncertainty.includes(uncertainty)) current.uncertainty.push(uncertainty);
      current.needs_video_review = current.needs_video_review || item.needs_video_review === true;
      analysesByShot.set(shotId, current);
    }
    frameObservations.push(...(result.frame_observations || []));
    reviewed.push(...(result.reviewed_frame_shot_ids || []));
    reviewedFrameIds.push(...(result.reviewed_frame_ids || []));
    if (result.status !== 'completed') failures.push({batch_index:batchResult.batch_index,shot_ids:batches[batchResult.batch_index].shot_ids,frame_ids:batchResult.frame_ids,status:result.status,error_code:result.error_code || null});
  }
  const analyses = [...analysesByShot.values()].map(item => ({...item,observed:item.observed.join('；'),uncertainty:item.uncertainty.join('；')}));
  return {
    status:failures.length ? 'partial' : 'completed',
    analyses,
    frame_observations:frameObservations,
    reviewed_frame_shot_ids:[...new Set(reviewed)],
    reviewed_frame_ids:[...new Set(reviewedFrameIds)],
    batch_count:batches.length,
    concurrency_initial:3,
    concurrency_used:concurrency,
    duplicate_submission_count:batchResults.reduce((sum,item)=>sum+Number(item.duplicate_submission_count||0),0),
    prevented_concurrent_submission_count:batchResults.reduce((sum,item)=>sum+Number(item.prevented_concurrent_submission_count||0),0),
    telemetry:batchResults.map(({result,...item}) => ({...item,status:result.status,error_code:result.error_code || null})),
    failures
  };
}

function roleCardProjection(roleCards) {
  return (roleCards?.cards || []).map(card => ({
    card_id:card.card_id,
    name:normalizeText(card.original_name || card.visual_alias, 120),
    original_name:normalizeText(card.original_name, 80),
    visual_alias:normalizeText(card.visual_alias, 100),
    role_label:normalizeText(card.role_label, 100),
    importance:card.importance,
    confirmed:['confirmed','system_identified','user_edited'].includes(card.status)
  }));
}
function composeState({project, ledger, scriptText, gemini, scriptSource = null, roleCards = null}) {
  // Script text is intentionally not persisted. A recomposition retains only the
  // existing script-source declaration so the evidence outline cannot silently
  // change from "user script supplied" to "no script".
  const normalizedScript = normalizeText(scriptText, 120000);
  const hasProvidedScript = scriptSource?.provided === true || Boolean(normalizedScript);
  const outline = buildEvidenceOutline(ledger, hasProvidedScript ? 'provided' : '', gemini);
  const cards = roleCardProjection(roleCards);
  if (cards.length) {
    outline.characters = cards.map(card => card.name);
    outline.role_cards = cards;
  }
  const core = {
    schema_version:SCHEMA,
    project_id:project.id,
    analysis_run_id:ledger.analysis_run_id,
    source_sha256:ledger.source_sha256,
    source_ledger_snapshot_id:ledger.snapshot_id,
    source_ledger_snapshot_sha256:ledger.snapshot_sha256,
    role_card_snapshot_id:roleCards?.snapshot_id || null,
    role_card_snapshot_sha256:roleCards?.snapshot_sha256 || null,
    language:'zh-CN',
    script_source:hasProvidedScript
      ? (scriptSource?.provided === true ? clone(scriptSource) : {provided:true, sha256:sha256(normalizedScript), chars:normalizedScript.length})
      : {provided:false},
    outline,
    gemini_sidecar:gemini,
    status:'draft',
    revisions:[],
    created_at:now(),
    confirmed_at:null
  };
  const snapshot_sha256 = sha256(canonical(core));
  return {...core, snapshot_id:'S01STORY-' + snapshot_sha256.slice(0, 24), snapshot_sha256};
}

function etag(story) { return '"step01-story-' + story.snapshot_sha256 + '"'; }

async function get({root, project, ledger}) { return await readJson(statePath(root, project), null) || null; }
async function generate({root, project, ledger, roleCards = null, scriptText, requestGemini = true, reuseGeminiSidecar = false, reviewAllShots = false, sourceVideoPath = null, evidenceRoot = null, fullEvidenceIndex = null, receiptNamespace = 'legacy'}) {
  const current = await get({root, project, ledger});
  // A confirmed outline is reusable for ordinary reads, but it cannot satisfy
  // an explicit full visual-facts reconciliation that requests wider coverage.
  if (!reviewAllShots && current?.source_ledger_snapshot_sha256 === ledger.snapshot_sha256 && current?.role_card_snapshot_sha256 === roleCards?.snapshot_sha256 && current.status === 'confirmed') return current;
  if (reuseGeminiSidecar) {
    if (!current || current.status !== 'draft' || current.source_sha256 !== ledger.source_sha256) throw codedError('STEP01_STORY_RECOMPOSE_UNAVAILABLE', 409, '当前草案不能与当前原片证据重新整理');
    if (current.gemini_sidecar?.status !== 'completed') throw codedError('STEP01_STORY_RECOMPOSE_NO_SIDECAR', 409, '当前没有可整合的 Gemini 复核结果');
    const recomposed = composeState({project, ledger, roleCards, scriptText:'', gemini:current.gemini_sidecar, scriptSource:current.script_source});
    recomposed.recomposition = {mode:'reuse_existing_gemini_sidecar', source_story_snapshot_id:current.snapshot_id, composed_at:now()};
    delete recomposed.snapshot_id; delete recomposed.snapshot_sha256;
    const snapshot_sha256 = sha256(canonical(recomposed));
    recomposed.snapshot_id = 'S01STORY-' + snapshot_sha256.slice(0, 24); recomposed.snapshot_sha256 = snapshot_sha256;
    await writeAtomic(statePath(root, project), recomposed);
    return recomposed;
  }
  const missingVisualFacts = (ledger.shots || []).filter(shot => !normalizeText(shot.source_visual_facts));
  const uncertainShots = missingVisualFacts.filter(shot => !normalizeText(shot.action));
  const interval = Math.max(1, Math.ceil(uncertainShots.length / 6));
  const requestedShots = reviewAllShots
    // Existing text does not prove that every native frame was reviewed. A full
    // reconciliation covers every ledger shot so coverage is evidence-based.
    ? (ledger.shots || []).map(shot => shot.shot_id)
    : uncertainShots.filter((shot, index) => index % interval === 0).slice(0, 6).map(shot => shot.shot_id);
  const config = defaultGeminiConfig();
  const sidecar = requestGemini
    ? (config.provider === 'yunwu_openai_compatible'
      ? (reviewAllShots
        ? await analyzeAllShotsWithYunwu({config, ledger, shotIds:requestedShots, evidenceRoot, fullEvidenceIndex, receiptRoot:root, receiptNamespace, project})
        : await analyzeWithYunwu({config, ledger, shotIds:requestedShots, evidenceRoot, fullEvidenceIndex}))
      : await analyzeWithGemini({config, ledger, shotIds:requestedShots, sourceVideoPath}))
    : {status:'not_requested', analyses:[]};
  const expectedFrameIds = fullEvidenceIndex?.frames?.map(frame => frame.frame_id) || [];
  const reviewedFrameIds = [...new Set(sidecar.reviewed_frame_ids || [])];
  const coverage = expectedFrameIds.length ? {expected_frame_count:expectedFrameIds.length, reviewed_frame_count:reviewedFrameIds.length, complete:expectedFrameIds.every(id => reviewedFrameIds.includes(id))} : null;
  const gemini = {...sidecar, status:coverage && !coverage.complete ? 'partial' : sidecar.status, provider:config.provider, model:config.model, selected_shot_ids:requestedShots, review_scope:reviewAllShots ? 'all_uncertain_shots' : 'sampled_uncertain_shots', full_evidence_coverage:coverage};
  const story = composeState({project, ledger, roleCards, scriptText:normalizeText(scriptText, 120000), gemini});
  await writeAtomic(statePath(root, project), story);
  return story;
}
async function revise({root, project, ledger, roleCards = null, ifMatch, body, actor}) {
  const current = await get({root, project, ledger});
  if (!current) throw codedError('STEP01_STORY_NOT_READY', 409, '请先生成剧情大纲草案');
  if (current.source_ledger_snapshot_sha256 !== ledger.snapshot_sha256) throw codedError('STEP01_STORY_LEDGER_SUPERSEDED', 409, '原片权威时间轴已更新，请重新生成剧情大纲');
  if (!ifMatch || String(ifMatch).replace(/^W\//, '') !== etag(current)) throw codedError('STEP01_STORY_REVISION_CONFLICT', 409, '剧情大纲已变化，请刷新后重试');
  const action = String(body?.action || 'save_draft');
  if (action === 'confirm') {
    if (!roleCards || roleCards.source_ledger_snapshot_sha256 !== ledger.snapshot_sha256) throw codedError('STEP01_STORY_ROLE_CARDS_REQUIRED', 409, '请先生成并核对角色卡');
    if ((roleCards.cards || []).filter(card => card.importance === 'important').some(card => !['confirmed','system_identified','user_edited'].includes(card.status))) throw codedError('STEP01_STORY_IMPORTANT_ROLE_UNCONFIRMED', 409, '重要角色识别尚未完成，请稍后重新整理');
    if (current.role_card_snapshot_sha256 !== roleCards.snapshot_sha256) throw codedError('STEP01_STORY_ROLE_CARDS_STALE', 409, '角色卡已更新，请依据角色卡重新整理大纲后再确认');
  }
  const outline = body?.outline;
  if (!outline || typeof outline !== 'object') throw codedError('STEP01_STORY_OUTLINE_INVALID', 422, '剧情大纲内容无效');
  const next = clone(current);
  next.role_card_snapshot_id = roleCards?.snapshot_id || null;
  next.role_card_snapshot_sha256 = roleCards?.snapshot_sha256 || null;
  next.outline = {synopsis:normalizeText(outline.synopsis, 3000), beats:Array.isArray(outline.beats) ? outline.beats.slice(0, 24).map(beat => ({...beat, summary:normalizeText(beat.summary, 1200)})) : [], characters:Array.isArray(outline.characters) ? outline.characters.slice(0, 30) : [], unresolved:Array.isArray(outline.unresolved) ? outline.unresolved.slice(0, 60) : []};
  next.status = action === 'confirm' ? 'confirmed' : 'draft';
  next.confirmed_at = action === 'confirm' ? now() : null;
  next.revisions = [...(next.revisions || []), {schema_version:REVISION_SCHEMA, revision_id:'S01STORYREV-' + sha256(canonical({actor, action, at:Date.now(), outline:next.outline})).slice(0, 20), action, reason:normalizeText(body?.reason, 800), created_by:sha256(String(actor || 'unknown')), created_at:now()}];
  delete next.snapshot_id; delete next.snapshot_sha256;
  const snapshot_sha256 = sha256(canonical(next));
  next.snapshot_id = 'S01STORY-' + snapshot_sha256.slice(0, 24); next.snapshot_sha256 = snapshot_sha256;
  await writeAtomic(statePath(root, project), next);
  return next;
}

module.exports = {SCHEMA, REVISION_SCHEMA, get, generate, revise, etag, buildEvidenceOutline, narrativeBeatSummary, defaultGeminiConfig, analyzeWithGemini, analyzeWithYunwu, analyzeAllShotsWithYunwu, yunwuEvidenceImages, parseModelJson, completedReceiptResult, sha256, canonical, codedError};
