'use strict';

const crypto = require('crypto');
const {spawn} = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SENSITIVE = /(?:password|token|cookie|secret|private[ _-]?key|authorization)/i;

function safeText(value, limit) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, limit);
}

function escapeHtml(value) {
  return safeText(value, 800).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

function assertBridgeReceipt(receipt) {
  if (!receipt || receipt.schema_version !== 'niannian_mac_gui_bridge_receipt_v1' || receipt.bridge_ready !== true || receipt.prompt_seen_confirmed_by_user !== true || receipt.secrets_collected !== false || receipt.system_wide_remote_control !== false) {
    throw new Error('mac_gui_bridge_receipt_not_ready');
  }
}

function visibleRequests(payload) {
  if (!payload || payload.schema_version !== 'niannian_user_action_request_v1' || payload.execution_surface !== 'codex_cli' || !Array.isArray(payload.requests)) {
    throw new Error('mac_user_action_request_contract_invalid');
  }
  return payload.requests.map(request => {
    const visible = {
      action_id:safeText(request.action_id, 80),
      capability:safeText(request.capability, 120),
      classification:safeText(request.classification, 40),
      official_url:safeText(request.official_url, 240),
      purpose:safeText(request.purpose, 500),
      observed_status:safeText(request.observed_status, 40),
      observed_reason:safeText(request.observed_reason, 160),
      retry_action:safeText(request.retry_action, 240)
    };
    if (!visible.action_id || !visible.capability || (visible.official_url && !/^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^\s]*)?$/.test(visible.official_url)) || SENSITIVE.test(Object.values(visible).join(' '))) {
      throw new Error('mac_user_action_request_sensitive_or_invalid');
    }
    return visible;
  });
}

function actionCardHtml(requests) {
  const items = requests.map(request => `<li><strong>${escapeHtml(request.capability)}</strong><br>${escapeHtml(request.purpose)}<br><small>${escapeHtml(request.observed_status)}: ${escapeHtml(request.observed_reason)}</small><br>${escapeHtml(request.retry_action)}${request.official_url ? `<br><a href="${escapeHtml(request.official_url)}">Open official local page</a>` : ''}</li>`).join('');
  return '<!doctype html><meta charset="utf-8"><title>NianNian AI Mac Actions</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:760px;margin:40px auto;padding:0 22px;line-height:1.55;color:#17211e}li{margin:16px 0;padding:14px;border:1px solid #ccd8d1;border-radius:8px}small{color:#52635a}</style><h1>NianNian AI Mac Actions</h1><p>These requests contain no passwords, keys, cookies, tokens, or browser data.</p><ul>' + (items || '<li>No pending action.</li>') + '</ul>';
}

async function atomicWrite(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temporary, content, 'utf8');
  await fsp.rename(temporary, filePath);
}

function runNotifier(notifierPath, requestsPath, actionCardPath) {
  return new Promise((resolve, reject) => {
    const shell = process.env.NIANNIAN_MAC_ACTION_SHELL || '/bin/bash';
    const child = spawn(shell, [notifierPath, requestsPath], {env:{...process.env, NIANNIAN_MAC_ACTION_CARD:actionCardPath}, stdio:'ignore'});
    child.once('error', () => reject(new Error('mac_user_action_notifier_start_failed')));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('mac_user_action_notifier_failed:' + code)));
  });
}

async function runBridge(options) {
  const receipt = await readJson(options.receiptPath);
  assertBridgeReceipt(receipt);
  const payload = await readJson(options.requestsPath);
  const requests = visibleRequests(payload);
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(requests)).digest('hex');
  await atomicWrite(options.actionCardPath, actionCardHtml(requests));
  let previous = null;
  try { previous = await readJson(options.statePath); } catch {}
  if (previous && previous.request_hash === requestHash) return {ok:true, notified:false, requests:requests.length, reason:'unchanged'};
  if (requests.length) await runNotifier(options.notifierPath, options.requestsPath, options.actionCardPath);
  await atomicWrite(options.statePath, JSON.stringify({schema_version:'niannian_mac_user_action_bridge_state_v1', request_hash:requestHash, updated_at:new Date().toISOString()}, null, 2) + '\n');
  return {ok:true, notified:requests.length > 0, requests:requests.length, action_card:options.actionCardPath};
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    requestsPath:option(args, '--requests'), receiptPath:option(args, '--receipt'), statePath:option(args, '--state'), actionCardPath:option(args, '--action-card'), notifierPath:option(args, '--notifier')
  };
  if (Object.values(options).some(value => !value)) throw new Error('usage: --requests <path> --receipt <path> --state <path> --action-card <path> --notifier <path>');
  process.stdout.write(JSON.stringify(await runBridge(options)) + '\n');
}

if (require.main === module) main().catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; });

module.exports = {actionCardHtml, assertBridgeReceipt, runBridge, visibleRequests};
