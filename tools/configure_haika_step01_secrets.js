'use strict';

// Local-only, one-time secret relay. Values are never written to disk or logs.
const crypto = require('crypto');
const http = require('http');
const {spawn} = require('child_process');

const host = '127.0.0.1';
const port = Number(process.env.HAIKA_STEP01_SECRET_PORT || 8718);
const csrf = crypto.randomBytes(32).toString('hex');
let used = false;

function page(message = '') {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Haika Step01 配置</title><style>body{max-width:520px;margin:48px auto;font:16px system-ui;color:#16212b;padding:0 20px}label{display:block;margin:18px 0 6px;font-weight:600}input{box-sizing:border-box;width:100%;padding:10px;font:inherit;border:1px solid #9aa8b5;border-radius:4px}button{margin-top:24px;padding:11px 16px;font:inherit;background:#0b6b57;color:#fff;border:0;border-radius:4px;cursor:pointer}.note{color:#53616d;font-size:14px;line-height:1.5}.error{color:#a72222}</style><h1>配置完整原片视觉分析</h1><p class="note">此页面只在本机运行。它只更新 GPT 上游配置，保留 Haika 现有的 Mimo 与 Paddle 配置；提交内容不会保存到本机文件、网站数据或日志。候选服务将在受控验证步骤中重载，生产服务不会重启。</p>${message}<form method="post" action="/configure"><input type="hidden" name="csrf" value="${csrf}"><label>GPT Responses API Base URL</label><input name="gpt_base" type="url" placeholder="https://.../v1" autocomplete="off" required><label>GPT API Key</label><input name="gpt" type="password" autocomplete="off" required><label>模型名</label><input name="gpt_model" value="gpt-5.6-sol" autocomplete="off" required><button type="submit">保存候选配置</button></form></html>`;
}
function parse(body) { return Object.fromEntries(new URLSearchParams(body)); }
function send(response, status, body) { response.writeHead(status, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}); response.end(body); }
function valid(value) { return typeof value === 'string' && value.length >= 8 && value.length <= 16384 && !/[\r\n\0]/.test(value); }
function configure(values) {
  return new Promise((resolve, reject) => {
    const command = "set -eu; install -d -m 700 /etc/niannian-ai; umask 077; target=/etc/niannian-ai/step01-hq.env; temporary=$(mktemp /etc/niannian-ai/step01-hq.env.XXXXXX); { if test -f \"$target\"; then grep -Ev '^(NIANNIAN_STEP01_GPT_API_BASE_URL|NIANNIAN_STEP01_GPT_API_KEY|NIANNIAN_STEP01_GPT_MODEL)=' \"$target\" || true; fi; cat; } > \"$temporary\"; chmod 600 \"$temporary\"; mv \"$temporary\" \"$target\"";
    const child = spawn('ssh', ['haika-niannian', command], {stdio:['pipe','ignore','pipe'],windowsHide:true});
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(-1000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('ssh configuration failed: ' + code + ' ' + stderr.replace(/[\r\n]+/g, ' ').slice(-600))));
    child.stdin.end([
      'NIANNIAN_STEP01_HQ_PYTHON=/opt/niannian-step01-venv/bin/python',
      'NIANNIAN_STEP01_HQ_RUNNER=/opt/niannian-ai/bridge/niannian_step01_hq_runner.py',
      'NIANNIAN_STEP01_HQ_STEP01_SKILL_ROOT=/opt/niannian-step01-skills/mx-shortdrama-01-frame-extract',
      'NIANNIAN_STEP01_HQ_STEP02_SKILL_ROOT=/opt/niannian-step01-skills/mx-shortdrama-02-source-timeline',
      'NIANNIAN_STEP01_GPT_API_BASE_URL=' + values.gpt_base,
      'NIANNIAN_STEP01_GPT_API_KEY=' + values.gpt,
      'NIANNIAN_STEP01_GPT_MODEL=' + values.gpt_model,
      ''
    ].join('\n'));
  });
}
const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/') return send(response, 200, page());
  if (request.method !== 'POST' || request.url !== '/configure' || used) return send(response, 404, page('<p class="error">此一次性页面已失效。</p>'));
  let body = '';
  request.on('data', chunk => { body += chunk; if (body.length > 65536) request.destroy(); });
  request.once('end', async () => {
    const value = parse(body); body = '';
    if (value.csrf !== csrf || !valid(value.gpt) || !valid(value.gpt_base) || !valid(value.gpt_model) || !/^https:\/\/.+/.test(value.gpt_base)) return send(response, 400, page('<p class="error">请完整填写三项，并使用 HTTPS API 地址。</p>'));
    try { await configure(value); used = true; send(response, 200, '<!doctype html><meta charset="utf-8"><title>已保存</title><p>候选配置已写入。生产服务未重启；下一步会只重载 Step01 候选并验证文本推理。</p>'); setTimeout(() => server.close(), 3000); }
    catch (error) { send(response, 502, page('<p class="error">配置未完成：' + String(error.message).replace(/[<>]/g, '') + '</p>')); }
  });
});
server.listen(port, host, () => process.stdout.write('http://' + host + ':' + port + '/\n'));
