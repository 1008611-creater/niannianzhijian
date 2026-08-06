const crypto = require('crypto');

function extractText(value) {
  if (typeof value?.output_text === 'string') return value.output_text;
  for (const item of value?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  throw Object.assign(new Error('response text missing'), {code:'KRILL_STEP03_PROBE_TEXT_MISSING'});
}

function safeUpstreamError(value) {
  const source = value?.error && typeof value.error === 'object' ? value.error : value;
  const redact = input => String(input || '')
    .replace(/\b(?:sk|tp)-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/(authorization|cookie|api[_-]?key|token|secret)\s*[:=]\s*\S+/ig, '$1=[redacted]')
    .slice(0, 240);
  return {
    upstream_code:redact(source?.code || source?.type || 'unknown'),
    upstream_type:redact(source?.type || 'unknown'),
    upstream_message:redact(source?.message || 'request rejected')
  };
}

async function run() {
  const key = String(process.env.KRILL_CODEX_API_KEY || '').trim();
  const base = String(process.env.NIANNIAN_STEP03_GPT_API_BASE_URL || 'https://api.krill-ai.com/codex/v1').replace(/\/+$/, '');
  const responsePath = String(process.env.NIANNIAN_STEP03_GPT_RESPONSES_PATH || '/responses');
  const model = String(process.env.NIANNIAN_STEP03_GPT_MODEL || 'gpt-5.6-sol');
  if (!key || !/^https:\/\//.test(base) || !responsePath.startsWith('/')) {
    throw Object.assign(new Error('profile unavailable'), {code:'KRILL_STEP03_PROFILE_NOT_CONFIGURED'});
  }
  if (process.argv.includes('--models')) {
    const response = await fetch(base + '/models', {
      headers:{authorization:'Bearer ' + key},
      signal:AbortSignal.timeout(30000)
    });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error('HTTP ' + response.status), {code:'KRILL_STEP03_MODELS_HTTP_' + response.status,safe_upstream:safeUpstreamError(raw)});
    const ids = (Array.isArray(raw.data) ? raw.data : []).map(row => String(row?.id || '')).filter(id => /gpt|codex/i.test(id)).sort();
    process.stdout.write(JSON.stringify({ok:true,provider:'krill',models:ids,secret_exposed:false}) + '\n');
    return;
  }
  const schema = {
    type:'object',
    additionalProperties:false,
    required:['json_schema_passed','image_input_passed'],
    properties:{json_schema_passed:{type:'boolean'},image_input_passed:{type:'boolean'}}
  };
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const body = {
    model,
    store:false,
    instructions:'只返回符合 schema 的 JSON。确认你能读取图片输入，不描述图片内容。',
    input:[{role:'user',content:[{type:'input_text',text:'把两个布尔值都设为 true。'},{type:'input_image',image_url:image}]}],
    text:{format:{type:'json_schema',name:'niannian_step03_krill_probe_v1',strict:true,schema}}
  };
  let response;
  try {
    response = await fetch(base + responsePath, {
      method:'POST',
      headers:{authorization:'Bearer ' + key,'content-type':'application/json'},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(90000)
    });
  } catch {
    throw Object.assign(new Error('network failed'), {code:'KRILL_STEP03_PROBE_NETWORK_FAILED'});
  }
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error('HTTP ' + response.status), {code:'KRILL_STEP03_PROBE_HTTP_' + response.status,safe_upstream:safeUpstreamError(raw)});
  let result;
  try { result = JSON.parse(extractText(raw)); }
  catch { throw Object.assign(new Error('JSON invalid'), {code:'KRILL_STEP03_PROBE_JSON_INVALID'}); }
  if (result.json_schema_passed !== true || result.image_input_passed !== true) {
    throw Object.assign(new Error('capability rejected'), {code:'KRILL_STEP03_PROBE_CAPABILITY_REJECTED'});
  }
  process.stdout.write(JSON.stringify({
    ok:true,
    provider:'krill',
    wire_api:'responses',
    requested_model:model,
    response_model:typeof raw.model === 'string' ? raw.model : null,
    strict_json:true,
    image_input:true,
    request_sha256:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    secret_exposed:false
  }) + '\n');
}

run().catch(error => {
  process.stderr.write(JSON.stringify({ok:false,code:error.code || 'KRILL_STEP03_PROBE_FAILED',...(error.safe_upstream || {}),secret_exposed:false}) + '\n');
  process.exitCode = 1;
});
