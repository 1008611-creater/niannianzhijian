'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const KNOWN_CAPABILITIES = Object.freeze({
  'credential:mimo_asr': {
    classification:'provider_health_authorization_required',
    purpose:'Mimo ASR 是长期配置的 Mac 本机凭据。仅当新的 synthetic 健康请求客观返回认证、权限或服务端失败时，才需要处理。',
    official_url:null,
    retry_action:'在 Mac 本机检查 Provider 的实际失败原因；不得把凭据发送到聊天、网站或日志。'
  },
  'credential:paddle_ocr': {
    classification:'provider_health_authorization_required',
    purpose:'Paddle OCR 是长期配置的 Mac 本机凭据。仅当新的 synthetic 健康请求客观返回认证、权限或服务端失败时，才需要处理。',
    official_url:'https://aistudio.baidu.com/paddleocr',
    retry_action:'在 Mac 本机检查 Provider 的实际失败原因；不得把凭据发送到聊天、网站或日志。'
  },
  'runtime:transnetv2': {
    classification:'local_runtime_install_or_self_test_required',
    purpose:'Step01 已绑定 transnetv2-pytorch；需要在专用 Mac Python 环境完成安装、导入与模型构造自检。',
    official_url:null,
    retry_action:'运行受控的 Mac Step01 runtime 安装器与无 provider 自检；导入成功不等于真实视频分析已通过。'
  },
  'runtime:hq': {
    classification:'composite_profile_readiness_required',
    purpose:'hq 是 hq_full 复合编排能力，不是单独软件；只有 ASR、OCR、TransNetV2、ForcedAligner 与 profile 自检全部通过后才可 ready。',
    official_url:null,
    retry_action:'完成五项子能力并运行 build_audio_evidence.py --quality-profile hq_full 的无 provider 合同自检。'
  },
  'runtime:forced_aligner': {
    classification:'local_runtime_install_or_self_test_required',
    purpose:'Step01 已绑定 Qwen/Qwen3-ForcedAligner-0.6B 与 qwen-asr；需要在专用 Mac Python 环境完成安装和无真实媒体自检。',
    official_url:null,
    retry_action:'运行受控的 Mac Step01 runtime 安装器；仅记录导入/配置/模型可用性，不冒充真实音频对齐成功。'
  }
  ,'credential:mimo_8001_session': {classification:'user_login_required', purpose:'请仅在 Mac 本机安全对话框完成 Mimo 登录；系统只检查红绿状态，不读取、转发或显示本机登录数据。', official_url:'https://ai.mimo.fashion', retry_action:'双击“下载”中的 NianNian-Mimo-Session-Bridge.command；它只执行登录、auth/verify 与本机 Keychain。'}
  ,'channel:mimo_8001_nonbillable_preflight': {classification:'preflight_required', purpose:'需要在不上传、不生成、不扣费的前提下重新确认 Mimo 登录会话。', official_url:'https://ai.mimo.fashion', retry_action:'双击“下载”中的 NianNian-Mimo-Session-Bridge.command；成功登录后会自动执行一次 GET auth/verify。'}
  ,'adapter:mimo_8001_real_submit': {classification:'contract_gap', purpose:'网站内 Mimo adapter 仍需完成无网络的真实执行合同审计，当前不得提交 provider。', official_url:null}
});

function safeText(value, limit) { return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, limit); }
function stableId(capability) { return 'uar-' + crypto.createHash('sha256').update(capability).digest('hex').slice(0, 16); }
function readiness(item, nowMs = Date.now()) {
  const expiresAt = Date.parse(String(item && item.expires_at || ''));
  const expired = Number.isFinite(expiresAt) && expiresAt <= nowMs;
  const ready = item && item.status === 'ready' && item.ready !== false && !expired;
  return {ready, expired};
}
function persistentAnalysisCredential(capability) {
  return capability === 'credential:mimo_asr' || capability === 'credential:paddle_ocr';
}
function objectiveSyntheticFailure(item, nowMs = Date.now()) {
  const checkedAt = Date.parse(String(item && item.checked_at || ''));
  const failureClass = safeText(item && (item.failure_class || item.reason), 120).toLowerCase();
  return item && item.status === 'failed' && Number.isFinite(checkedAt) && checkedAt <= nowMs + 5 * 60 * 1000 && nowMs - checkedAt <= 24 * 60 * 60 * 1000 && /(?:auth|authori[sz]|permission|provider_service|server)/.test(failureClass);
}
function buildRequests(audit, options = {}) {
  const capabilities = audit && audit.capabilities && typeof audit.capabilities === 'object' ? audit.capabilities : {};
  return Object.entries(capabilities)
    .filter(([capabilityKey, item]) => {
      if (!item || readiness(item, options.nowMs).ready) return false;
      const capability = safeText(item.capability || capabilityKey, 120);
      return !persistentAnalysisCredential(capability) || objectiveSyntheticFailure(item, options.nowMs);
    })
    .map(([capabilityKey, item]) => {
      const capability = safeText(item.capability || capabilityKey, 120);
      const known = KNOWN_CAPABILITIES[capability] || {classification:'contract_gap', purpose:'该 capability 没有受控安装或官方登录入口定义。', official_url:null};
      const state = readiness(item, options.nowMs);
      const configuredOnly = state.expired === false && item.status === 'configured_unverified' && capability.startsWith('credential:');
      return {
        action_id:stableId(capability),
        capability,
        classification:configuredOnly ? 'provider_health_authorization_required' : known.classification,
        official_url:known.official_url,
        purpose:configuredOnly ? '凭据已存在于 Mac 登录钥匙串，但尚未运行真实 Provider 健康检查；配置完成不等于能力 ready。' : known.purpose,
        observed_status:state.expired ? 'expired' : safeText(item.status, 40),
        observed_reason:state.expired ? 'capability_expired' : safeText(item.reason, 120),
        retry_action:configuredOnly ? '等待具体任务级健康检查授权；不要重复粘贴凭据，也不要把凭据发送到聊天、网站或日志。' : (known.retry_action || '在 Mac 本机完成受控配置后，重新运行 ai-brain-relay status。'),
        presentation:{
          mac_native_notification:true,
          focus_application:'ChatGPT',
          local_action_card:true,
          desktop_thread_delivery:'unsupported_no_remote_control_plane_api',
          delivery_status:'requires_mac_local_gui_bridge',
          gui_bridge_bootstrap:'The signed-in Mac-local bridge must be ready before CLI requests can produce visible prompts.'
        },
        secret_handling:'不得在本请求、日志、网站或回执中输入、读取、传输或回显密码、Key、Token、Cookie 或浏览器数据。'
      };
    });
}
async function writeRequests(auditPath, outputPath, extraAuditPath = null) {
  const audit = JSON.parse(await fsp.readFile(auditPath, 'utf8'));
  const extraAudit = extraAuditPath ? JSON.parse(await fsp.readFile(extraAuditPath, 'utf8')) : null;
  const requests = buildRequests(audit).concat(extraAudit ? buildRequests(extraAudit) : []);
  const deduplicated = [...new Map(requests.map(request => [request.action_id, request])).values()];
  const payload = {
    schema_version:'niannian_user_action_request_v1',
    execution_surface:'codex_cli',
    mac_app_required:false,
    staged_only:false,
    requests:deduplicated,
    generated_at:new Date().toISOString()
  };
  await fsp.mkdir(path.dirname(outputPath), {recursive:true});
  await fsp.writeFile(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}
function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
async function main() {
  const auditPath = option(process.argv.slice(2), '--audit');
  const extraAuditPath = option(process.argv.slice(2), '--extra-audit');
  const outputPath = option(process.argv.slice(2), '--out');
  if (!auditPath || !outputPath) throw new Error('usage: --audit <capability-audit.json> --out <user-action-requests.json>');
  const payload = await writeRequests(path.resolve(auditPath), path.resolve(outputPath), extraAuditPath ? path.resolve(extraAuditPath) : null);
  process.stdout.write(JSON.stringify({ok:true,requests:payload.requests.length,staged_only:false}) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; });
module.exports = { buildRequests, objectiveSyntheticFailure, persistentAnalysisCredential, readiness, writeRequests };
