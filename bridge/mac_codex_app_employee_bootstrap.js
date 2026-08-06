'use strict';

const childProcess = require('child_process');
const events = require('events');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const readline = require('readline');
const {activeProfile,appServerLaunchArgs}=require('./niannian_employee_model_profiles');

const PROJECT_ROOT = path.join(os.homedir(), 'AI-Brain', 'niannian-ai-canonical-local');
const CODEX_CANDIDATES=Object.freeze(['/Applications/ChatGPT.app/Contents/Resources/codex',path.join(os.homedir(),'Desktop','ChatGPT.app','Contents','Resources','codex'),path.join(os.homedir(),'.codex','packages','standalone','current','codex')]);
function resolveCodexPath(){if(process.platform!=='darwin')return path.join(os.homedir(),'.codex','packages','standalone','current','codex');for(const candidate of CODEX_CANDIDATES){try{const stats=fs.statSync(candidate);fs.accessSync(candidate,fs.constants.X_OK);if(stats.isFile())return candidate;}catch{}}throw new Error('mac_codex_executable_not_found');}
const CODEX_PATH = resolveCodexPath();
const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');
const EMPLOYEE_MODEL_CHANNEL = Object.freeze({channel_id:'niannian_employee_model_native_account_v1'});
const THREADS = Object.freeze([
  {employee:'01',title:'念念 AI · Mac 员工 01',thread_id:'019f6201-c013-7cf3-b155-61d2789085f4'},
  {employee:'02',title:'念念 AI · Mac 员工 02',thread_id:'019f6201-cb91-7cf0-819e-696eeabd9e78'},
  {employee:'03',title:'念念 AI · Mac 员工 03',thread_id:'019f6201-d5e8-7083-884d-c714eb1a78b0'},
  {employee:'04',title:'念念 AI · Mac 员工 04',thread_id:'019f6201-dff9-7f63-94d8-7f9020b3c223'},
  {employee:'05',title:'念念 AI · Mac 员工 05',thread_id:'019f6201-ea1b-7e22-9dd0-a3b851b15b69'}
]);

function bootstrapPrompt(employee) {
  return [
    `你是“${employee.title}”。这是零副作用 bootstrap/readiness turn，不是生产任务。`,
    '只读检查当前项目中的 AGENTS.md、bridge/mac-employee-training/route_matrix.json、bridge/mac-skill-bundles/niannian-mac-production-skills-v1.manifest.json 与 bridge/mac-employee-training/current_authority_checkpoint.json。',
    '只输出：员工角色、固定全链路路由、13-Skill bundle/manifest 读取状态、五项 strict capability 状态、Mimo N06 gate、provider/cost/deploy/local-image-edit 边界，以及当前 readiness 分级。',
    `把本员工训练命名空间写作 training-bootstrap-employee-${employee.employee}；不要领取真实 job_id。`,
    '禁止修改任何文件，禁止执行 provider 上传/生成/扣费，禁止 package/send、registry promotion、部署或生产数据写入，禁止读取或索取任何密码、Key、Token、Cookie 或浏览器数据。',
    '结论必须区分 structural / integrated / real_delivery；sidebar 可见性只认用户或支持的 App/UI 证据，pin 未由官方 App 能力证实时保持 threads_visible_pin_pending。'
  ].join('\n');
}

function parseTomlScalar(raw) {
  const value = String(raw || '').trim();
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  const quoted = value.match(/^(["'])(.*)\1$/);
  return quoted ? quoted[2] : value;
}

const DIAGNOSTIC_SECRET_PATTERNS = Object.freeze([
  [/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/ig, '[private-key-redacted]'],
  [/\b(?:bearer|basic)\s+[A-Za-z0-9_./+=-]{8,}\b/ig, '$1 [redacted]'],
  [/(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie|authorization|KRILL_CODEX_API_KEY)\b\s*[:=]\s*)["']?[^\s,;"']+["']?/ig, '$1[redacted]'],
  [/\b(?:sk|pk|rk|tk)-[A-Za-z0-9_.-]{8,}\b/ig, '[credential-redacted]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[jwt-redacted]']
]);

function redactedDiagnosticText(value, maxLength = 1600) {
  let text;
  if (value && typeof value === 'object') {
    if (typeof value.message === 'string') text = value.message;
    else text = '[error-object keys=' + Object.keys(value).sort().join(',') + ']';
  } else text = String(value ?? 'unknown_error');
  for (const [pattern, replacement] of DIAGNOSTIC_SECRET_PATTERNS) text = text.replace(pattern, replacement);
  return text.slice(0, maxLength);
}

function redactedErrorSummary(error) { return redactedDiagnosticText(error, 1000); }

function safeErrorSummary(error) {
  const message = redactedDiagnosticText(error);
  const suppliedCode = error && typeof error === 'object' ? String(error.code || error.name || '') : '';
  const inferredCode = suppliedCode.match(/^[A-Za-z][A-Za-z0-9_.:-]{0,120}$/) ? suppliedCode : (message.match(/^([A-Za-z][A-Za-z0-9_.:-]{2,120})/) || [])[1] || 'unknown_error';
  const shape = error && typeof error === 'object' ? Object.keys(error).sort().slice(0, 32) : [typeof error];
  return {code:inferredCode,message,message_sha256:require('crypto').createHash('sha256').update(message,'utf8').digest('hex'),message_bytes:Buffer.byteLength(message,'utf8'),shape,secret_redacted:true};
}

function safeTurnFailureDiagnostic({stage, error, threadId = null, turnId = null, notification = null, readback = null} = {}) {
  const notificationShape = notification && typeof notification === 'object' ? {
    method:notification.method || null,
    param_keys:Object.keys(notification.params || {}).sort(),
    turn_id:notification.params?.turn?.id || notification.params?.turnId || null,
    turn_status:notification.params?.turn?.status ?? notification.params?.status ?? null,
    turn_error:safeErrorSummary(notification.params?.turn?.error ?? notification.params?.error ?? null)
  } : null;
  return {schema_version:'niannian_mac_app_turn_failure_diagnostic_v1',stage:String(stage || 'unknown').slice(0,120),thread_id:threadId ? String(threadId) : null,turn_id:turnId ? String(turnId) : null,error:safeErrorSummary(error),notification:notificationShape,readback:readback ? {
    latest_turn_id:readback.latest_turn_id || null,
    latest_turn_status:readback.latest_turn_status || null,
    latest_turn_error:readback.latest_turn_error ? safeErrorSummary(readback.latest_turn_error) : null,
    latest_completed_assistant_turn_id:readback.latest_completed_assistant_turn_id || null,
    turns:Number.isSafeInteger(readback.turns) ? readback.turns : null
  } : null,secret_redacted:true};
}

async function inspectEmployeeModelChannel(configPath = CODEX_CONFIG_PATH, profile = activeProfile()) {
  const source = await fsp.readFile(configPath, 'utf8');
  let section = 'root';
  const values = {root:{}};
  let forbiddenStaticFields = false;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      values[section] ||= {};
      continue;
    }
    const item = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (item) {
      values[section][item[1]] = parseTomlScalar(item[2]);
      if (section === `model_providers.${profile.config_provider_id}`
        && ['experimental_bearer_token','http_headers','http_headers_json','authorization'].includes(item[1])) forbiddenStaticFields = true;
    }
  }
  const providerId = String(values.root.model_provider || '');
  const provider = values['model_providers.' + providerId] || {};
  const nativeAccount=profile.credential_mode==='native_account';
  const contract = {
    channel_id:EMPLOYEE_MODEL_CHANNEL.channel_id,
    provider_id:profile.provider_id,
    provider_config_id:nativeAccount?profile.config_provider_id:providerId,
    provider_name:nativeAccount?profile.provider_name:String(provider.name || ''),
    launch_mode:nativeAccount?'native_account':'configured_provider',
    launch_override_applied:nativeAccount,
    launch_override_keys:nativeAccount?['model_provider']:[],
    credential_source:nativeAccount?'codex_home_account_session':'keychain_process_injection',
    env_key_names:[...profile.process_env_keys],
    wire_api:nativeAccount?profile.wire_api:String(provider.wire_api || ''),
    base_url:nativeAccount?null:String(provider.base_url || ''),
    requires_openai_auth:nativeAccount?true:provider.requires_openai_auth,
    observed_global_model_provider:providerId||null,
    observed_global_forbidden_static_fields:forbiddenStaticFields,
    static_experimental_bearer_token:false,
    static_http_headers:false,
    raw_auth_read:false,
    raw_secret_recorded:false
  };
  const root=values.root||{};
  const valid = nativeAccount ? profile.config_provider_id==='openai' && profile.requires_openai_auth===true && profile.process_env_keys.length===0 : !forbiddenStaticFields
    && contract.provider_config_id === profile.config_provider_id
    && contract.provider_name === profile.provider_name
    && contract.wire_api === profile.wire_api
    && contract.base_url === profile.base_url
    && contract.requires_openai_auth === profile.requires_openai_auth
    && (!profile.model || root.model===profile.model)
    && (!profile.review_model || root.review_model===profile.review_model)
    && (!profile.model_reasoning_effort || root.model_reasoning_effort===profile.model_reasoning_effort)
    && (profile.disable_response_storage===null || root.disable_response_storage===profile.disable_response_storage)
    && (!profile.network_access || root.network_access===profile.network_access);
  return {valid, contract, issue:valid ? null : 'employee_model_channel_contract_invalid'};
}

async function inspectNativeAccountRuntime(client,profile=activeProfile()){
  if(profile.credential_mode!=='native_account')throw new Error('employee_model_native_account_route_required');
  const result=await client.request('account/read',{refreshToken:false});
  const accountPresent=Boolean(result&&result.account);
  const requiresOpenaiAuth=result&&typeof result.requiresOpenaiAuth==='boolean'?result.requiresOpenaiAuth:null;
  if(!accountPresent||requiresOpenaiAuth!==true)throw new Error('employee_model_native_account_not_ready');
  const models=await client.request('model/list',{includeHidden:false,limit:100});const rows=Array.isArray(models?.data)?models.data:[],defaults=rows.filter(item=>item&&item.isDefault===true&&!item.hidden);if(defaults.length!==1)throw new Error('employee_model_native_default_model_ambiguous');const selected=defaults[0],defaultModel=String(selected?.model||'');if(!/^[A-Za-z0-9._-]{2,120}$/.test(defaultModel))throw new Error('employee_model_native_default_model_missing');
  return {launch_mode:'native_account',provider_config_id:'openai',account_present:true,requires_openai_auth:true,default_model:defaultModel,default_model_id:String(selected.id||defaultModel).slice(0,120),model_catalog_count:rows.length,executable_path:client.codexPath||null,launch_override_keys:['model_provider'],raw_auth_read:false,raw_auth_recorded:false};
}

function hasActiveTurn(summary) {
  const threadStatus = String(summary && summary.status && summary.status.type || '').toLowerCase();
  const turnStatus = String(summary && summary.latest_turn_status || '').toLowerCase();
  return ['active','running','inprogress','pending'].includes(threadStatus)
    || ['active','running','inprogress','pending'].includes(turnStatus);
}

function decideBootstrapAction(summary, appServerAuth, bootstrapMissing) {
  if (bootstrapMissing === false) return 'audit_only';
  if (summary.completed_assistant_turns > 0) return 'skipped_nonempty';
  if (hasActiveTurn(summary)) return 'skipped_active_turn';
  if (!appServerAuth.account_present && appServerAuth.requires_openai_auth === true) return 'blocked_standalone_auth_required';
  if (!appServerAuth.account_present && appServerAuth.requires_openai_auth !== false) return 'blocked_auth_contract_unknown';
  return 'start_read_only_bootstrap';
}

function assertCompletedTurn(turn) {
  const status = typeof turn?.status === 'string' ? turn.status : turn?.status?.type;
  const error = turn?.error ?? null;
  if (!turn || status !== 'completed' || error !== null) {
    const statusShape = typeof turn?.status === 'object' && turn?.status ? Object.keys(turn.status).sort().join(',') : typeof turn?.status;
    const errorShape = typeof turn?.error === 'object' && turn?.error ? Object.keys(turn.error).sort().join(',') : String(turn?.error ?? null);
    throw new Error(`mac_employee_bootstrap_turn_not_completed_cleanly:status=${String(status)}:status_shape=${statusShape}:error_shape=${errorShape}:error_message=${redactedErrorSummary(turn?.error)}`);
  }
  return {method:'turn/completed',turn_id:String(turn.id || ''),status:'completed',error:null};
}

function summarizeThread(thread) {
  const turns = Array.isArray(thread && thread.turns) ? thread.turns : [];
  const latest = turns.length ? turns[turns.length - 1] : null;
  const assistantMessages = latest && Array.isArray(latest.items)
    ? latest.items.filter(item => item && item.type === 'agentMessage').map(item => String(item.text || '')).filter(Boolean)
    : [];
  const completedAssistantTurns = turns.filter(turn => turn && turn.status === 'completed' && Array.isArray(turn.items) && turn.items.some(item => item && item.type === 'agentMessage' && String(item.text || '').trim())).length;
  const latestCompletedAssistantTurn = [...turns].reverse().find(turn => turn && turn.status === 'completed' && !turn.error && Array.isArray(turn.items) && turn.items.some(item => item && item.type === 'agentMessage' && String(item.text || '').trim())) || null;
  return {
    thread_id:String(thread && thread.id || ''),
    title:String(thread && (thread.name || thread.title) || ''),
    cwd:String(thread && thread.cwd || ''),
    status:thread && thread.status || null,
    turns:turns.length,
    completed_assistant_turns:completedAssistantTurns,
    latest_completed_assistant_turn_id:latestCompletedAssistantTurn && latestCompletedAssistantTurn.id || null,
    latest_turn_id:latest && latest.id || null,
    latest_turn_status:latest && latest.status || null,
    latest_turn_error:latest && latest.error ? safeErrorSummary(latest.error) : null,
    latest_assistant_text:assistantMessages.join('\n').slice(0, 12000) || null,
    turn_summaries:turns.slice(-8).map(turn => ({
      id:turn.id,
      status:turn.status,
      error:turn.error ? safeErrorSummary(turn.error) : null,
      item_types:Array.isArray(turn.items) ? turn.items.map(item => item && item.type).filter(Boolean) : []
    }))
  };
}

class AppServerClient extends events.EventEmitter {
  constructor(codexPath = CODEX_PATH, transport = 'stdio', profile = activeProfile()) {
    super();
    this.codexPath = codexPath;
    this.nextId = 1;
    this.pending = new Map();
    this.child = null;
    this.transport = transport;
    this.profile = profile;
    this.launchArgs = appServerLaunchArgs(profile,transport);
  }
  async start() {
    this.child = childProcess.spawn(this.codexPath, this.launchArgs, {stdio:['pipe','pipe','pipe']});
    readline.createInterface({input:this.child.stdout}).on('line', line => this.handleLine(line));
    readline.createInterface({input:this.child.stderr}).on('line', line => this.emit('diagnostic', String(line).slice(0, 1000)));
    this.child.once('exit', code => {
      const error = new Error('mac_codex_app_server_exited:' + code);
      for (const {reject} of this.pending.values()) reject(error);
      this.pending.clear();
    });
    await this.request('initialize', {clientInfo:{name:'niannian-mac-employee-bootstrap',version:'1.0'},capabilities:{experimentalApi:true}});
    this.notify('initialized');
  }
  handleLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error('app_server_request_failed:' + JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (message.method) this.emit('notification', message);
  }
  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {resolve,reject});
      this.child.stdin.write(JSON.stringify({id,method,params}) + '\n');
    });
  }
  notify(method, params) {
    this.child.stdin.write(JSON.stringify(params === undefined ? {method} : {method,params}) + '\n');
  }
  async waitForTurn(threadId, turnId, timeoutMs = 900000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('mac_employee_bootstrap_turn_timeout')); }, timeoutMs);
      const onNotification = message => {
        if (message.method === 'turn/completed' && message.params && message.params.threadId === threadId && message.params.turn && message.params.turn.id === turnId) {
          cleanup();
          resolve(message.params.turn);
        }
      };
      const cleanup = () => { clearTimeout(timer); this.off('notification', onNotification); };
      this.on('notification', onNotification);
    });
  }
  close() {
    if (this.child && !this.child.killed) {
      this.child.stdin.end();
      this.child.kill('SIGTERM');
    }
  }
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temp = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temp, filePath);
}

async function run(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const outputPath = path.resolve(options.outputPath || path.join(os.homedir(), '.config', 'ai-brain', 'mac-codex-five-employee-bootstrap-receipt.json'));
  const profile=activeProfile();
  const client = options.client || new AppServerClient(options.codexPath || CODEX_PATH, options.transport || profile.app_server_transport,profile);
  const ownsClient = !options.client;
  const receipts = [];
  try {
    if (ownsClient) await client.start();
    const modelChannel = await inspectEmployeeModelChannel(options.configPath || CODEX_CONFIG_PATH);
    if (!modelChannel.valid) throw new Error(modelChannel.issue);
    const accountResult = await client.request('account/read', {refreshToken:false}).catch(error => ({error:String(error.message || error)}));
    const appServerAuth = {
      account_present:!!(accountResult && accountResult.account),
      requires_openai_auth:accountResult && typeof accountResult.requiresOpenaiAuth === 'boolean' ? accountResult.requiresOpenaiAuth : null,
      read_error:accountResult && accountResult.error ? String(accountResult.error).slice(0, 500) : null
    };
    if(profile.credential_mode==='native_account'&&(!appServerAuth.account_present||appServerAuth.requires_openai_auth!==true))throw new Error('employee_model_native_account_not_ready');
    const nativeRuntime=await inspectNativeAccountRuntime(client,profile);
    for (const employee of THREADS) {
      const before = (await client.request('thread/read', {threadId:employee.thread_id,includeTurns:true})).thread;
      const beforeSummary = summarizeThread(before);
      if (beforeSummary.cwd !== projectRoot) throw new Error('mac_employee_project_root_mismatch:' + employee.employee);
      if (beforeSummary.title !== employee.title) throw new Error('mac_employee_title_mismatch:' + employee.employee);
      let action = decideBootstrapAction(beforeSummary, appServerAuth, options.bootstrapMissing);
      let startedTurn = null;
      let completionEvent = null;
      if (action === 'start_read_only_bootstrap') {
        if (beforeSummary.status && beforeSummary.status.type === 'notLoaded') {
          await client.request('thread/resume', {threadId:employee.thread_id,cwd:projectRoot,approvalPolicy:'never',excludeTurns:true,modelProvider:nativeRuntime.provider_config_id,model:nativeRuntime.default_model});
        }
        const response = await client.request('turn/start', {
          threadId:employee.thread_id,
          cwd:projectRoot,
          approvalPolicy:'never',
          sandboxPolicy:{type:'readOnly',networkAccess:false},
          model:nativeRuntime.default_model,
          input:[{type:'text',text:bootstrapPrompt(employee),text_elements:[]}]
        });
        startedTurn = response.turn;
        action = beforeSummary.turns === 0 ? 'bootstrap_started_empty_thread' : 'bootstrap_started_after_interrupted_empty_turns';
        completionEvent = assertCompletedTurn(await client.waitForTurn(employee.thread_id, startedTurn.id));
      }
      const after = (await client.request('thread/read', {threadId:employee.thread_id,includeTurns:true})).thread;
      const afterSummary = summarizeThread(after);
      if (!completionEvent && afterSummary.latest_completed_assistant_turn_id && options.verifiedCompletionEvents === true) {
        completionEvent = {
          method:'turn/completed',
          turn_id:afterSummary.latest_completed_assistant_turn_id,
          status:'completed',
          error:null,
          source:'prior_verified_notification_plus_current_thread_readback'
        };
      }
      receipts.push({employee:employee.employee,expected_title:employee.title,action,before:beforeSummary,after:afterSummary,bootstrap_turn_id:startedTurn && startedTurn.id || null,success_event:completionEvent});
    }
    const listed = (await client.request('thread/list', {cwd:projectRoot,limit:100,sortKey:'updated_at',sortDirection:'desc'})).data || [];
    const listedIds = new Set(listed.map(item => item.id));
    const integratedReady = receipts.every(item => item.after.completed_assistant_turns > 0 && listedIds.has(item.after.thread_id) && item.success_event && item.success_event.status === 'completed' && item.success_event.error === null);
    const sidebarConfirmed = options.sidebarConfirmed === true;
    const payload = {
      schema_version:'niannian_mac_codex_five_employee_bootstrap_receipt_v2',
      status:integratedReady ? (sidebarConfirmed ? 'five_threads_integrated_readiness_completed_sidebar_confirmed_pin_pending' : 'five_threads_integrated_readiness_completed_app_server_listed_pin_pending') : 'bootstrap_incomplete',
      project_root:projectRoot,
      app_server_transport:options.transport || profile.app_server_transport,
      app_server_auth:appServerAuth,
      employee_model_channel:{
        ...modelChannel.contract,
        requested:integratedReady || receipts.some(item => item.action.startsWith('bootstrap_started_')),
        used:integratedReady,
        evidence:'five exact read-only bootstrap turns completed and current thread/read matches',
        media_provider_authority_granted:false
      },
      employees:receipts,
      app_server_listed_thread_ids:THREADS.filter(item => listedIds.has(item.thread_id)).map(item => item.thread_id),
      pin_state:'pending_no_official_app_server_pin_method',
      desktop_sidebar_visual_confirmation:sidebarConfirmed,
      desktop_sidebar_status:sidebarConfirmed ? 'user_confirmed_visible_pin_pending' : 'app_server_listed_visual_confirmation_pending',
      highest_evidence_level:integratedReady ? 'integrated' : 'structural',
      real_delivery:false,
      media_provider_network_requested:false,
      media_provider_submit_requested:false,
      media_provider_upload_requested:false,
      spend_requested:false,
      package_send_requested:false,
      registry_promotion_requested:false,
      deployment_requested:false,
      source_code_write_requested:false,
      created_at:new Date().toISOString()
    };
    await writeJson(outputPath, payload);
    return payload;
  } finally {
    if (ownsClient) client.close();
  }
}

function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
if (require.main === module) {
  run({
    ...(option(process.argv.slice(2), '--project-root') ? {projectRoot:option(process.argv.slice(2), '--project-root')} : {}),
    ...(option(process.argv.slice(2), '--out') ? {outputPath:option(process.argv.slice(2), '--out')} : {}),
    bootstrapMissing:!process.argv.slice(2).includes('--audit-only'),
    transport:process.argv.slice(2).includes('--proxy') ? 'proxy' : 'stdio',
    sidebarConfirmed:process.argv.slice(2).includes('--user-confirmed-sidebar'),
    verifiedCompletionEvents:process.argv.slice(2).includes('--verified-completion-events')
  }).then(result => process.stdout.write(JSON.stringify({ok:result.status.startsWith('five_threads'),status:result.status,employees:result.employees.map(item => ({employee:item.employee,action:item.action,turns:item.after.turns,turn_status:item.after.latest_turn_status})),pin_state:result.pin_state,desktop_sidebar_status:result.desktop_sidebar_status}) + '\n'))
    .catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
}

module.exports = {AppServerClient,CODEX_CANDIDATES,CODEX_CONFIG_PATH,CODEX_PATH,EMPLOYEE_MODEL_CHANNEL,PROJECT_ROOT,THREADS,assertCompletedTurn,bootstrapPrompt,decideBootstrapAction,hasActiveTurn,inspectEmployeeModelChannel,inspectNativeAccountRuntime,redactedDiagnosticText,redactedErrorSummary,resolveCodexPath,run,safeErrorSummary,safeTurnFailureDiagnostic,summarizeThread};
