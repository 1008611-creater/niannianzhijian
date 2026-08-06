'use strict';

// Local-only one-time relay. Secret values are sent over SSH stdin and are
// never written to local files, logs, command arguments, or HTML responses.
const crypto = require('node:crypto');
const http = require('node:http');
const {spawn} = require('node:child_process');

const host = '127.0.0.1';
const port = Number(process.env.HAIKA_WEB_MEDIA_COS_PORT || 8719);
const csrf = crypto.randomBytes(32).toString('hex');
let used = false;

function page(message = '') {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Haika 网站媒体 COS 配置</title><style>body{max-width:560px;margin:48px auto;font:16px system-ui;color:#16212b;padding:0 20px}label{display:block;margin:16px 0 6px;font-weight:600}input{box-sizing:border-box;width:100%;padding:10px;font:inherit;border:1px solid #9aa8b5;border-radius:4px}button{margin-top:24px;padding:11px 16px;font:inherit;background:#0b6b57;color:#fff;border:0;border-radius:4px;cursor:pointer}.note{color:#53616d;font-size:14px;line-height:1.5}.error{color:#a72222}</style><h1>配置网站媒体 COS</h1><p class="note">此页面只在本机运行。提交后，配置通过 SSH 标准输入写入 Haika 的 bridge.env，并重启服务。密钥不会保存到本机、网页、日志或命令行。</p>${message}<form method="post" action="/configure"><input type="hidden" name="csrf" value="${csrf}"><label>媒体 COS Endpoint</label><input name="endpoint" type="url" value="https://niannian-redraw-delivery-prod-1412440010.cos.ap-guangzhou.myqcloud.com" required><label>媒体 COS Bucket</label><input name="bucket" value="niannian-redraw-delivery-prod-1412440010" required><label>媒体 COS Region</label><input name="region" value="ap-guangzhou" required><label>SecretId</label><input name="secret_id" type="password" autocomplete="off" required><label>SecretKey</label><input name="secret_key" type="password" autocomplete="off" required><button type="submit">写入 Haika 并重启服务</button></form></html>`;
}

function parse(body) { return Object.fromEntries(new URLSearchParams(body)); }
function send(response, status, body) { response.writeHead(status, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}); response.end(body); }
function valid(value, max = 256) { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\r\n\0]/.test(value); }
function validEndpoint(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'; } catch { return false; } }
function validBucket(value) { return /^[a-z0-9][a-z0-9-]{2,95}$/.test(value); }
function validRegion(value) { return /^[a-z0-9-]{3,80}$/.test(value); }

function configure(values) {
  return new Promise((resolve, reject) => {
    const command = "python3 -c \"import os,sys,tempfile; p='/etc/niannian-ai/bridge.env'; updates={}; [updates.__setitem__(k,v) for k,v in (line.rstrip('\\n').split('=',1) for line in sys.stdin if '=' in line)]; existing=set(updates); old=open(p,encoding='utf-8').read().splitlines() if os.path.exists(p) else []; lines=[line for line in old if not line.split('=',1)[0].strip() in existing]; lines += [k+'='+v for k,v in updates.items()]; fd,tmp=tempfile.mkstemp(prefix='bridge.env.',dir='/etc/niannian-ai',text=True); os.fchmod(fd,0o600); os.write(fd,('\\n'.join(lines)+'\\n').encode()); os.close(fd); os.replace(tmp,p)\" && chmod 600 /etc/niannian-ai/bridge.env && systemctl restart niannian-ai.service && systemctl is-active --quiet niannian-ai.service";
    const child = spawn('ssh', ['haika-niannian', command], {stdio:['pipe','ignore','pipe'], windowsHide:true});
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(-1000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Haika 配置失败（服务未切换）：' + code + ' ' + stderr.replace(/[\r\n]+/g, ' ').slice(-400))));
    child.stdin.end([
      'NIANNIAN_WEB_MEDIA_COS_ENDPOINT=' + values.endpoint,
      'NIANNIAN_WEB_MEDIA_COS_BUCKET=' + values.bucket,
      'NIANNIAN_WEB_MEDIA_COS_REGION=' + values.region,
      'NIANNIAN_WEB_MEDIA_COS_SECRET_ID=' + values.secret_id,
      'NIANNIAN_WEB_MEDIA_COS_SECRET_KEY=' + values.secret_key,
      ''
    ].join('\n'));
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/') return send(response, 200, page());
  if (request.method !== 'POST' || request.url !== '/configure' || used) return send(response, 404, page('<p class="error">此一次性页面已失效。</p>'));
  let body = '';
  request.on('data', chunk => { body += String(chunk); if (body.length > 65536) request.destroy(); });
  request.once('end', async () => {
    const value = parse(body); body = '';
    const validInput = value.csrf === csrf && validEndpoint(value.endpoint) && validBucket(value.bucket) && validRegion(value.region) && valid(value.secret_id, 256) && valid(value.secret_key, 512);
    if (!validInput) return send(response, 400, page('<p class="error">配置项无效，请检查 Endpoint、Bucket、Region 和密钥。</p>'));
    try { await configure(value); used = true; send(response, 200, '<!doctype html><meta charset="utf-8"><title>已配置</title><p>Haika 网站媒体 COS 已写入，服务已重启并保持 active。此页面将在 3 秒后关闭。</p>'); setTimeout(() => server.close(), 3000); }
    catch (error) { send(response, 502, page('<p class="error">' + String(error.message).replace(/[<>]/g, '') + '</p>')); }
  });
});

server.listen(port, host, () => process.stdout.write('http://' + host + ':' + port + '/\n'));
