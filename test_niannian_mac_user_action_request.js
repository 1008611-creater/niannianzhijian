'use strict';

const assert = require('assert');
const {buildRequests} = require('./bridge/niannian_mac_user_action_request');

const requests = buildRequests({capabilities:{
  'credential:mimo_asr':{capability:'credential:mimo_asr',ready:false,status:'ready',reason:'health_proof_refresh_required',refresh_required:true,checked_at:'2026-07-13T00:00:00.000Z'},
  'credential:paddle_ocr':{capability:'credential:paddle_ocr',ready:false,status:'failed',reason:'synthetic_auth_failure',failure_class:'authentication_failed',checked_at:'2026-07-14T23:00:00.000Z'},
  'runtime:transnetv2':{ready:false,status:'missing',reason:'status_missing'},
  'credential:mimo_8001_session':{ready:false,status:'missing',reason:'status_missing'},
  'channel:mimo_8001_nonbillable_preflight':{status:'ready',expires_at:'2026-07-13T00:00:00.000Z'},
  'runtime:hq':{capability:'runtime:hq',ready:true,status:'ready',reason:null}
}}, {nowMs:Date.parse('2026-07-15T00:00:00.000Z')});
assert.equal(requests.length, 4);
assert.equal(requests[0].classification, 'provider_health_authorization_required');
assert(requests.some(request => request.capability === 'runtime:transnetv2'));
assert(requests.some(request => request.capability === 'runtime:transnetv2' && request.classification === 'local_runtime_install_or_self_test_required'));
assert(requests.some(request => request.capability === 'credential:mimo_8001_session' && request.official_url === 'https://ai.mimo.fashion'));
assert(requests.some(request => request.capability === 'channel:mimo_8001_nonbillable_preflight' && request.observed_status === 'expired' && request.observed_reason === 'capability_expired'));
assert(requests.some(request => request.capability === 'credential:mimo_8001_session' && request.retry_action.includes('NianNian-Mimo-Session-Bridge.command')));
assert.equal(requests.some(request => request.capability === 'credential:mimo_asr'), false);
assert(requests.some(request => request.capability === 'credential:paddle_ocr' && request.classification === 'provider_health_authorization_required'));
assert(requests.some(request => request.capability === 'credential:paddle_ocr' && request.observed_reason === 'synthetic_auth_failure'));
assert.equal(requests.find(request => request.capability === 'runtime:transnetv2').official_url, null);
assert.equal(requests[0].presentation.mac_native_notification, true);
assert.equal(requests[0].presentation.focus_application, 'ChatGPT');
assert.equal(requests[0].presentation.desktop_thread_delivery, 'unsupported_no_remote_control_plane_api');
assert.equal(requests[0].presentation.delivery_status, 'requires_mac_local_gui_bridge');
assert.equal(requests[0].presentation.local_action_card, true);
assert(requests.every(item => item.secret_handling.includes('不得')));
assert(requests.every(item => !/password|token|cookie|secret/i.test([item.action_id,item.capability,item.purpose,item.observed_status,item.observed_reason,item.retry_action].join(' '))));
process.stdout.write(JSON.stringify({ok:true,requests:requests.length,verified:['CLI execution surface','adapter-aware secure local action requests','no-secret request contract']}) + '\n');
