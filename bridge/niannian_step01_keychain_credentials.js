'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const crypto = require('crypto');
const {activeProfile,safeProfile,selectProfile}=require('./niannian_employee_model_profiles');

const CREDENTIALS = Object.freeze({
  'credential:mcgrox_employee_model': Object.freeze({
    service:'fun.cauai.niannian.employee-model.mcgrox',
    account:'mcgrox-responses-api-key',
    label:'NianNian Employee McGrox Responses',
    contract_identity:'mcgrox_responses_keychain_first_v1',
    expiry_policy:'provider_managed',
    base_url:'https://www.mcgrox.top'
  }),
  'credential:asxs_employee_model': Object.freeze({
    service:'fun.cauai.niannian.employee-model.asxs',
    account:'asxs-responses-api-key',
    label:'NianNian Employee ASXS Responses',
    contract_identity:'asxs_responses_keychain_first_v1',
    expiry_policy:'provider_managed',
    base_url:'https://api.asxs.top/v1'
  }),
  'credential:mimo_asr': Object.freeze({
    service:'fun.cauai.niannian.step01.mimo-asr',
    account:'mimo-asr-api-key',
    label:'NianNian Step01 Mimo ASR',
    contract_identity:'mimo_asr_official_auto_v1',
    expiry_policy:'provider_managed'
  }),
  'credential:paddle_ocr': Object.freeze({
    service:'fun.cauai.niannian.step01.paddle-ocr',
    account:'paddle-ocr-api-token',
    label:'NianNian Step01 Paddle OCR',
    contract_identity:'paddle_ocr_async_jobs_v2',
    expiry_policy:'daily_asia_shanghai'
  })
});

function credentialContract(capability) {
  if (String(capability)==='credential:employee_model_active') {
    const profile=activeProfile();
    return {service:profile.keychain_service,account:profile.keychain_account,label:'NianNian Employee '+profile.display_name,contract_identity:'employee_model_profile_'+profile.provider_id+'_keychain_v1',expiry_policy:'provider_managed',base_url:profile.base_url};
  }
  const contract = CREDENTIALS[String(capability || '')];
  if (!contract) throw new Error('step01_credential_capability_rejected');
  return contract;
}

function baseUrlSha256(contract) {
  return contract.base_url ? crypto.createHash('sha256').update(contract.base_url, 'utf8').digest('hex') : null;
}

function validateSecret(value) {
  const secret = String(value || '').replace(/[\r\n]+$/, '');
  if (secret.length < 8 || secret.length > 4096 || /[\r\n\0]/.test(secret)) {
    throw new Error('step01_credential_input_invalid');
  }
  return secret;
}

function runSecurity(args, input, options = {}) {
  const securityBin = options.securityBin || '/usr/bin/security';
  const spawnImpl = options.spawnImpl || spawn;
  return new Promise((resolve, reject) => {
    const child = spawnImpl(securityBin, args, {stdio:['pipe', 'ignore', 'ignore']});
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve();
    };
    child.once('error', () => finish(new Error('step01_keychain_command_start_failed')));
    child.once('exit', code => code === 0 ? finish() : finish(new Error('step01_keychain_command_failed')));
    if (input === null || input === undefined) return child.stdin.end();
    const isConfirmation = input && typeof input === 'object' && !Buffer.isBuffer(input) && Object.prototype.hasOwnProperty.call(input, 'secret');
    const confirmations = isConfirmation ? Number(input.confirmations || 1) : 1;
    if (!Number.isInteger(confirmations) || confirmations < 1 || confirmations > 3) return finish(new Error('step01_keychain_confirmation_count_invalid'));
    const value = isConfirmation ? String(input.secret) : String(input);
    const payload = Buffer.from(Array.from({length:confirmations}, () => value).join('\n') + '\n', 'utf8');
    child.stdin.end(payload, () => payload.fill(0));
  });
}

async function keychainPresent(capability, options = {}) {
  const contract = credentialContract(capability);
  try {
    await (options.securityExecutor || runSecurity)([
      'find-generic-password', '-a', contract.account, '-s', contract.service
    ], null, options);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOr(filePath, fallback) {
  try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function atomicWrite(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {encoding:'utf8', mode:0o600});
  await fsp.rename(temporary, filePath);
}

async function configureCredential(capability, rawSecret, options = {}) {
  const contract = credentialContract(capability);
  const secret = validateSecret(rawSecret);
  const checkedAt = new Date(options.nowMs || Date.now()).toISOString();
  const statusPath = path.resolve(options.statusPath || path.join(os.homedir(), '.config', 'ai-brain', 'runtime_capability_status.json'));
  const receiptPath = path.resolve(options.receiptPath || path.join(os.homedir(), '.config', 'ai-brain', 'step01-credential-bootstrap-receipt.json'));
  const securityExecutor = options.securityExecutor || runSecurity;

  await securityExecutor([
    'add-generic-password', '-U', '-a', contract.account, '-s', contract.service,
    '-l', contract.label, '-w'
  ], {secret, confirmations:2}, options);
  const present = await keychainPresent(capability, {...options, securityExecutor});
  if (!present) throw new Error('step01_keychain_presence_verification_failed');

  const status = await readJsonOr(statusPath, {schema_version:'niannian_runtime_capability_status_v1', capabilities:{}});
  if (status.schema_version !== 'niannian_runtime_capability_status_v1' || !status.capabilities || typeof status.capabilities !== 'object') {
    throw new Error('step01_capability_status_contract_invalid');
  }
  status.updated_at = checkedAt;
  status.capabilities[capability] = {
    status:'configured_unverified',
    checked_at:checkedAt,
    evidence:{
      method:'mac_keychain_presence_only',
      summary:'Credential is present in the Mac login Keychain. Provider health is not verified and no provider request was made.'
    }
  };
  status.capabilities['runtime:hq'] = {
    status:'missing',
    checked_at:checkedAt,
    evidence:{
      method:'hq_full_composite_gate',
      summary:'hq_full remains blocked until both provider credentials have authorized health evidence and the composite profile validation passes.'
    }
  };
  await atomicWrite(statusPath, status);

  const receipt = {
    schema_version:'niannian_step01_credential_bootstrap_receipt_v1',
    capability,
    status:'configured_unverified',
    keychain:{
      service:contract.service,
      account:contract.account,
      present:true,
      secret_exported:false,
      secret_in_process_argv:false
    },
    contract_identity:contract.contract_identity,
    expiry_policy:contract.expiry_policy,
    base_url_sha256:baseUrlSha256(contract),
    health_verified:false,
    health_reason:'provider_health_probe_not_authorized',
    provider_network_requested:false,
    provider_job_created:false,
    provider_upload_requested:false,
    spend_requested:false,
    raw_credential_recorded:false,
    checked_at:checkedAt
  };
  await atomicWrite(receiptPath, receipt);
  return receipt;
}

async function reconcilePresence(options = {}) {
  const checkedAt = new Date(options.nowMs || Date.now()).toISOString();
  const statusPath = path.resolve(options.statusPath || path.join(os.homedir(), '.config', 'ai-brain', 'runtime_capability_status.json'));
  const receiptPath = path.resolve(options.receiptPath || path.join(os.homedir(), '.config', 'ai-brain', 'step01-credential-presence-reconciliation-receipt.json'));
  const securityExecutor = options.securityExecutor || runSecurity;
  const capabilities = {};
  for (const capability of ['credential:mimo_asr','credential:paddle_ocr']) {
    const contract = credentialContract(capability);
    const present = await keychainPresent(capability, {...options, securityExecutor});
    capabilities[capability] = {
      status:present ? 'configured_unverified' : 'missing',
      present,
      keychain:{service:contract.service,account:contract.account},
      base_url_sha256:baseUrlSha256(contract),
      health_verified:false,
      health_context:capability === 'credential:mimo_asr'
        ? 'prior_official_models_auth_12_of_12_http_200_no_fee_reported_separately_not_reverified'
        : 'current_day_token_present_provider_health_unverified_no_job',
      checked_at:checkedAt
    };
  }
  const status = await readJsonOr(statusPath, {schema_version:'niannian_runtime_capability_status_v1', capabilities:{}});
  if (status.schema_version !== 'niannian_runtime_capability_status_v1' || !status.capabilities || typeof status.capabilities !== 'object') throw new Error('step01_capability_status_contract_invalid');
  status.updated_at = checkedAt;
  for (const [capability, result] of Object.entries(capabilities)) {
    status.capabilities[capability] = {
      status:result.status,
      checked_at:checkedAt,
      evidence:{
        method:'mac_keychain_presence_only_reconciliation',
        summary:result.present
          ? 'Credential is present in the Mac login Keychain. Provider health was not performed by reconciliation.'
          : 'Credential is absent from the Mac login Keychain.'
      }
    };
  }
  status.capabilities['runtime:hq'] = {
    status:'missing',
    checked_at:checkedAt,
    evidence:{method:'hq_full_composite_gate',summary:'Presence reconciliation cannot promote runtime:hq; fresh provider health and the receipt-bound composite are still required.'}
  };
  await atomicWrite(statusPath, status);
  const receipt = {
    schema_version:'niannian_step01_credential_presence_reconciliation_receipt_v1',
    status:Object.values(capabilities).every(item => item.present) ? 'configured_unverified' : 'missing_credentials',
    capabilities,
    runtime_hq_ready:false,
    secret_read:false,
    secret_exported:false,
    secret_in_process_argv:false,
    provider_network_requested:false,
    provider_job_created:false,
    provider_upload_requested:false,
    provider_submit_requested:false,
    spend_requested:false,
    real_project_media_processed:false,
    checked_at:checkedAt
  };
  await atomicWrite(receiptPath, receipt);
  return receipt;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function readStdin(maxBytes = 8192) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('step01_credential_input_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--active-profile')) { process.stdout.write(JSON.stringify(safeProfile(activeProfile()))+'\n'); return; }
  if (option(args,'--select-active-profile')) { process.stdout.write(JSON.stringify(selectProfile(option(args,'--select-active-profile')))+'\n'); return; }
  if (args.includes('--reconcile-presence')) {
    const receipt = await reconcilePresence({
      ...(option(args, '--status-path') ? {statusPath:option(args, '--status-path')} : {}),
      ...(option(args, '--receipt-path') ? {receiptPath:option(args, '--receipt-path')} : {})
    });
    process.stdout.write(JSON.stringify({ok:true,status:receipt.status,runtime_hq_ready:false,capabilities:Object.fromEntries(Object.entries(receipt.capabilities).map(([key,value]) => [key,{present:value.present,status:value.status}]))}) + '\n');
    if (!Object.values(receipt.capabilities).every(item => item.present)) process.exitCode = 2;
    return;
  }
  const capability = args.includes('--configure-active-employee-model') ? 'credential:employee_model_active' : (option(args, '--configure') || option(args, '--presence'));
  if (!capability) throw new Error('usage: --configure <capability> [--status-path <path>] [--receipt-path <path>] | --presence <capability>');
  if (option(args, '--presence')) {
    const present = await keychainPresent(capability);
    process.stdout.write(JSON.stringify({ok:true, capability, present}) + '\n');
    if (!present) process.exitCode = 2;
    return;
  }
  const receipt = await configureCredential(capability, await readStdin(), {
    ...(option(args, '--status-path') ? {statusPath:option(args, '--status-path')} : {}),
    ...(option(args, '--receipt-path') ? {receiptPath:option(args, '--receipt-path')} : {})
  });
  process.stdout.write(JSON.stringify({ok:true, capability:receipt.capability, status:receipt.status, health_verified:false}) + '\n');
}

if (require.main === module) main().catch(error => {
  process.stderr.write(String(error.message || error) + '\n');
  process.exitCode = 1;
});

module.exports = {
  CREDENTIALS,
  atomicWrite,
  baseUrlSha256,
  configureCredential,
  credentialContract,
  keychainPresent,
  reconcilePresence,
  runSecurity,
  validateSecret
};
