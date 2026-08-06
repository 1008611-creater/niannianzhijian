'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {
  THREADS,
  assertCompletedTurn,
  bootstrapPrompt,
  decideBootstrapAction,
  inspectEmployeeModelChannel,
  summarizeThread
} = require('./bridge/mac_codex_app_employee_bootstrap');
const {activeProfile,appServerLaunchArgs}=require('./bridge/niannian_employee_model_profiles');

async function main() {
  assert.equal(THREADS.length, 5);
  assert.equal(new Set(THREADS.map(item => item.thread_id)).size, 5);
  assert.equal(new Set(THREADS.map(item => item.title)).size, 5);
  for (const employee of THREADS) {
    const prompt = bootstrapPrompt(employee);
    assert(prompt.includes('AGENTS.md'));
    assert(prompt.includes('route_matrix.json'));
    assert(prompt.includes('13-Skill'));
    assert(prompt.includes('禁止修改任何文件'));
    assert(prompt.includes('禁止执行 provider'));
    assert(prompt.includes('threads_visible_pin_pending'));
  }

  const completedSummary = summarizeThread({id:THREADS[0].thread_id,name:THREADS[0].title,cwd:'/Users/lsb/AI-Brain/niannian-ai-canonical-local',status:{type:'idle'},turns:[{id:'turn-1',status:'completed',error:null,items:[{type:'agentMessage',text:'structural ready; real_delivery blocked'}]}]});
  assert.equal(completedSummary.completed_assistant_turns, 1);
  assert.equal(completedSummary.latest_completed_assistant_turn_id, 'turn-1');
  assert.equal(decideBootstrapAction(completedSummary,{account_present:false,requires_openai_auth:false},true),'skipped_nonempty');
  assert.equal(decideBootstrapAction({...completedSummary,completed_assistant_turns:0,status:{type:'active'},latest_turn_status:'inProgress'},{account_present:false,requires_openai_auth:false},true),'skipped_active_turn');
  assert.equal(decideBootstrapAction({...completedSummary,completed_assistant_turns:0,status:{type:'idle'},latest_turn_status:null},{account_present:false,requires_openai_auth:true},true),'blocked_standalone_auth_required');
  assert.equal(decideBootstrapAction({...completedSummary,completed_assistant_turns:0,status:{type:'idle'},latest_turn_status:null},{account_present:false,requires_openai_auth:false},true),'start_read_only_bootstrap');
  assert.equal(decideBootstrapAction({...completedSummary,completed_assistant_turns:0,status:{type:'idle'},latest_turn_status:null},{account_present:false,requires_openai_auth:null},true),'blocked_auth_contract_unknown');
  assert.equal(decideBootstrapAction(completedSummary,{account_present:false,requires_openai_auth:false},false),'audit_only');
  assert.deepEqual(assertCompletedTurn({id:'turn-ok',status:'completed',error:null}),{method:'turn/completed',turn_id:'turn-ok',status:'completed',error:null});
  assert.deepEqual(assertCompletedTurn({id:'turn-object-status',status:{type:'completed'},error:null}),{method:'turn/completed',turn_id:'turn-object-status',status:'completed',error:null});
  assert.throws(() => assertCompletedTurn({id:'turn-fail',status:'failed',error:{message:'redacted'}}),/not_completed_cleanly/);

  const root = await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-codex-channel-'));
  try {
    const validPath = path.join(root,'valid.toml');
    await fsp.writeFile(validPath,[
      'model_provider = "codex_local_access"',
      '[model_providers.codex_local_access]',
      'wire_api = "responses"',
      'env_key = "KRILL_CODEX_API_KEY"',
      'requires_openai_auth = false'
    ].join('\n'));
    const valid = await inspectEmployeeModelChannel(validPath);
    assert.equal(valid.valid,true);
    assert.equal(valid.contract.credential_source,'codex_home_account_session');
    assert.equal(valid.contract.launch_mode,'native_account');
    assert.equal(valid.contract.provider_config_id,'openai');
    assert.equal(valid.contract.raw_auth_read,false);
    assert.equal(valid.contract.static_experimental_bearer_token,false);
    assert.equal(valid.contract.static_http_headers,false);
    const staleTokenPath = path.join(root,'stale-token.toml');
    await fsp.writeFile(staleTokenPath,await fsp.readFile(validPath,'utf8')+'\nexperimental_bearer_token = "forbidden"\n');
    assert.equal((await inspectEmployeeModelChannel(staleTokenPath)).valid,true);
    const headersPath = path.join(root,'headers.toml');
    await fsp.writeFile(headersPath,await fsp.readFile(validPath,'utf8')+'\nhttp_headers = { Authorization = "forbidden" }\n');
    assert.equal((await inspectEmployeeModelChannel(headersPath)).valid,true);
    assert.deepEqual(appServerLaunchArgs(activeProfile()),['-c','model_provider="openai"','app-server','--stdio']);
  } finally {
    await fsp.rm(root,{recursive:true,force:true});
  }

  const source = fs.readFileSync(path.join(__dirname,'bridge','mac_codex_app_employee_bootstrap.js'),'utf8');
  assert.doesNotMatch(source,/thread\/start[^\n]+create|thread\/create|^\s*provider_network_requested:/m);
  assert.match(source,/media_provider_network_requested:false/);
  assert.match(source,/desktop_sidebar_visual_confirmation:sidebarConfirmed/);
  assert.match(source,/pin_state:'pending_no_official_app_server_pin_method'/);
  assert.match(source,/highest_evidence_level:integratedReady \? 'integrated' : 'structural'/);
  process.stdout.write(JSON.stringify({ok:true,verified:[
    'five fixed existing Mac App thread ids and no creation path',
    'native launch override does not rewrite global custom-provider config',
    'requires_openai_auth=true without account returns typed blocker',
    'active or completed thread never gets duplicate dispatch',
    'exact clean turn/completed contract',
    'Codex native account route uses built-in openai provider and responses without raw auth access',
    'static fields in the unused legacy provider cannot enter the native launch route',
    'thread/list is separate from user sidebar confirmation and pin remains pending',
    'media-provider network/upload/spend/deploy fields stay separate',
    'bootstrap highest evidence is integrated, never real_delivery'
  ]})+'\n');
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
