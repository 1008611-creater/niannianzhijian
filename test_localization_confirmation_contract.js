'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLocalizationConfirmationStore, LocalizationConfirmationError } = require('./bridge/niannian_localization_confirmation');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-localization-confirmation-'));
const storePath = path.join(root, 'fixture', 'store.json');
const s02 = (project = 'A', authority = 'auth-1', identity = 'accept-1') => ({
  project_id: project,
  authority_revision: authority,
  acceptance_identity: identity,
  accepted: true,
  artifact_ledger_verified: true,
});
let tick = 0;
const now = () => `2026-07-27T00:00:${String(tick++).padStart(2, '0')}Z`;
const store = () => createLocalizationConfirmationStore({ filePath: storePath, namespace: 'fixture/test_only', now });

function expectError(fn, status, code) {
  assert.throws(fn, (error) => error instanceof LocalizationConfirmationError && error.status === status && error.code === code);
}

const content = {
  adaptation_summary: '一段可理解的中文剧情大纲',
  character_mappings: [{ source_identity: '原角色', localized_identity: '地区角色', story_function: '主角' }],
  localization_principles: ['关系不变'],
  continuity_rules: ['服装连续'],
  causality_notes: ['动机保持'],
  shots: [{ shot_label: '镜头一', time_range: '00:00-00:04', target_dialogue: '¿Qué pasó?', manual_notes: '待核对' }],
  qa_summary: { status_label: '需核对', findings: ['称呼待确认'] },
  provider: 'must-not-leak',
  internal_path: 'must-not-leak',
  raw_response: 'must-not-leak',
};

try {
  const api = store();
  for (const bad of [null, { ...s02(), accepted: false }, { ...s02(), artifact_ledger_verified: false }, { ...s02(), acceptance_identity: '' }, { ...s02(), project_id: 'B' }]) {
    expectError(() => api.createCandidate({ projectId: 'A', acceptedStep02: bad, authorityRevision: 'auth-1', regionLabel: '墨西哥', languageLabel: '西班牙语', content }), 409, bad && bad.project_id === 'B' ? 'accepted_step02_invalid' : bad === null ? 'accepted_step02_required' : 'accepted_step02_invalid');
  }
  assert.strictEqual(fs.existsSync(storePath), false, 'invalid S02 must not mutate durable state');

  api.createCandidate({ projectId: 'A', acceptedStep02: s02(), authorityRevision: 'auth-1', localizationRevision: 'loc-A-1', regionLabel: '墨西哥', languageLabel: '西班牙语', content });
  let status = api.getStatus({ projectId: 'A', acceptedStep02: s02() });
  assert.match(status.etag, /^"[a-f0-9]{64}"$/);
  assert.strictEqual(status.public.confirmation_state, '可确认');
  assert.strictEqual(status.public.can_enter_assets_frames, false);
  const publicText = JSON.stringify(status.public);
  for (const secret of ['auth-1', 'loc-A-1', 'accept-1', 'must-not-leak', 'provider', 'internal_path', 'raw_response']) assert(!publicText.includes(secret));

  const beforeCasFailure = fs.readFileSync(storePath);
  expectError(() => api.confirm({ projectId: 'A', acceptedStep02: s02(), actorId: 'user-1' }), 428, 'if_match_required');
  for (const invalid of ['*', 'W/"abc"', 'garbage', '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"']) {
    expectError(() => api.confirm({ projectId: 'A', acceptedStep02: s02(), ifMatch: invalid, actorId: 'user-1' }), 412, invalid.length === 66 ? 'etag_stale' : 'if_match_invalid');
  }
  assert.deepStrictEqual(fs.readFileSync(storePath), beforeCasFailure, 'CAS failures must be byte-for-byte no-op');

  const confirmed = api.confirm({ projectId: 'A', acceptedStep02: s02(), ifMatch: status.etag, actorId: 'user-1' });
  assert.strictEqual(confirmed.idempotent, false);
  assert.strictEqual(confirmed.confirmation.confirmed_localization_etag, status.etag);
  assert.strictEqual(confirmed.public.confirmation_state, '已确认');
  const repeated = api.confirm({ projectId: 'A', acceptedStep02: s02(), ifMatch: status.etag, actorId: 'user-1' });
  assert.strictEqual(repeated.idempotent, true);
  assert.strictEqual(repeated.confirmation.confirmed_at, confirmed.confirmation.confirmed_at);
  assert.strictEqual(api._read().projects.A.confirmation_events.length, 1);

  for (const target of ['S05A_SUPPORT_ASSETS', 'S05B_FIRST_FRAMES', 'video_task_spec', 'provider_submit']) {
    const gate = api.requireDownstream({ projectId: 'A', acceptedStep02: s02(), target });
    assert.strictEqual(gate.localization_confirmation_passed, true);
    assert.strictEqual(gate.next_gate_required, true, 'confirmation must not bypass target-specific gates');
    assert.strictEqual(gate.confirmation_ref.confirmed_localization_etag, status.etag);
  }
  const oldTask={task_id:'TASK-1',transaction_key:'tx-1',type:'asset',item_id:'asset-1',purpose:'asset_generation',prompt_sha256:'a'.repeat(64),references:[],provider:'runninghub',aspect_ratio:'9:16',resolution:'1k',attempt:1};
  assert.deepStrictEqual(api.authorizeProviderTasks({projectId:'A',acceptedStep02:s02(),localizationRevision:'loc-A-1',tasks:[oldTask,oldTask]}),{authorized:1,reused:0,stale_skipped:0});
  assert.strictEqual(api.requireProviderTask({projectId:'A',acceptedStep02:s02(),taskId:'TASK-1',task:oldTask}).allowed,true);
  expectError(()=>api.requireProviderTask({projectId:'A',acceptedStep02:s02(),taskId:'TASK-1',task:{...oldTask,prompt_sha256:'b'.repeat(64)}}),409,'provider_task_input_binding_mismatch');
  expectError(()=>api.requireProviderTask({projectId:'A',acceptedStep02:s02(),taskId:'TASK-UNBOUND'}),409,'provider_task_localization_authority_required');

  const restarted = store();
  const afterRestart = restarted.reconcile({ projectId: 'A', acceptedStep02: s02() });
  assert.strictEqual(afterRestart.public.confirmation_state, '已确认');
  assert.strictEqual(afterRestart.public.confirmed_at, confirmed.confirmation.confirmed_at);

  const edited = restarted.mutateCandidate({
    projectId: 'A', acceptedStep02: s02(), ifMatch: afterRestart.etag, localizationRevision: 'loc-A-2',
    mutation: (candidate) => { candidate.content.adaptation_summary = '用户修改后的剧情大纲'; },
  });
  assert.notStrictEqual(edited.etag, afterRestart.etag);
  assert.strictEqual(edited.public.confirmation_state, '已失效');
  for (const target of ['S05A_SUPPORT_ASSETS', 'S05B_FIRST_FRAMES', 'video_task_spec', 'provider_submit']) {
    expectError(() => restarted.requireDownstream({ projectId: 'A', acceptedStep02: s02(), target }), 409, 'localization_confirmation_required');
  }
  expectError(()=>restarted.requireProviderTask({projectId:'A',acceptedStep02:s02(),taskId:'TASK-1'}),409,'localization_confirmation_required');
  expectError(() => restarted.confirm({ projectId: 'A', acceptedStep02: s02(), ifMatch: afterRestart.etag, actorId: 'user-1' }), 412, 'etag_stale');

  const newConfirmation = restarted.confirm({ projectId: 'A', acceptedStep02: s02(), ifMatch: edited.etag, actorId: 'user-1' });
  assert.strictEqual(newConfirmation.public.confirmation_state, '已确认');
  const newTask={...oldTask,task_id:'TASK-2',transaction_key:'tx-2',item_id:'asset-2',prompt_sha256:'c'.repeat(64)};
  assert.deepStrictEqual(restarted.authorizeProviderTasks({projectId:'A',acceptedStep02:s02(),localizationRevision:'loc-A-2',tasks:[oldTask,newTask]}),{authorized:1,reused:0,stale_skipped:1});
  expectError(()=>restarted.requireProviderTask({projectId:'A',acceptedStep02:s02(),taskId:'TASK-1',task:oldTask}),409,'provider_task_localization_authority_required');
  assert.strictEqual(restarted.requireProviderTask({projectId:'A',acceptedStep02:s02(),taskId:'TASK-2',task:newTask}).allowed,true);
  const authorityChanged = s02('A', 'auth-2', 'accept-2');
  const staleAuthority = restarted.getStatus({ projectId: 'A', acceptedStep02: authorityChanged });
  assert.strictEqual(staleAuthority.public.confirmation_state, '已失效');
  expectError(() => restarted.requireDownstream({ projectId: 'A', acceptedStep02: authorityChanged, target: 'S05A_SUPPORT_ASSETS' }), 409, 'localization_confirmation_required');

  const projectBPath = path.join(root, 'fixture', 'project-b.json');
  const projectB = createLocalizationConfirmationStore({ filePath: projectBPath, namespace: 'fixture/test_only', now });
  projectB.createCandidate({ projectId: 'B', acceptedStep02: s02('B', 'auth-B', 'accept-B'), authorityRevision: 'auth-B', localizationRevision: 'loc-B-1', regionLabel: '墨西哥', languageLabel: '西班牙语', content });
  expectError(() => projectB.confirm({ projectId: 'B', acceptedStep02: s02('B', 'auth-B', 'accept-B'), ifMatch: edited.etag, actorId: 'user-1' }), 412, 'etag_stale');
  const noCrossProjectRead = restarted.getStatus({ projectId: 'B', acceptedStep02: s02('B') });
  assert.strictEqual(noCrossProjectRead.public.confirmation_state, '未生成');
  assert.strictEqual(noCrossProjectRead.public.can_enter_assets_frames, false);

  restarted.setLegacyProjection({ projectId: 'A', legacy: { step02_completed: true, step03_completed: true, confirmed: true, confirmed_at: '2020-01-01' } });
  const legacyCannotUnlock = restarted.getStatus({ projectId: 'A', acceptedStep02: authorityChanged });
  assert.strictEqual(legacyCannotUnlock.public.can_enter_assets_frames, false);
  expectError(() => restarted.requireDownstream({ projectId: 'A', acceptedStep02: authorityChanged, target: 'provider_submit' }), 409, 'localization_confirmation_required');

  expectError(() => restarted.requireDownstream({ projectId: 'A', acceptedStep02: authorityChanged, target: 'S05A_SUPPORT_ASSETS', consumerNamespace: 'production' }), 409, 'namespace_mismatch');
  assert.strictEqual(api._read().namespace, 'fixture/test_only');
  console.log('PASS localization confirmation contract: strong CAS, durable idempotency, stale closure, downstream and legacy fail-close');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
