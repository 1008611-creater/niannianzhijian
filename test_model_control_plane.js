'use strict';

const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {createModelControlPlane} = require('./bridge/niannian_model_control_plane');

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-model-control-'));
  const plane = createModelControlPlane({configPath:path.join(root, 'config.json'), ledgerPath:path.join(root, 'ledger.json')});
  const admin = {id:'USR-ADMIN', role:'admin', tenantId:'tenant-a'};
  const user = {id:'USR-1', tenantId:'tenant-a'};
  const other = {id:'USR-2', tenantId:'tenant-b'};
  await plane.upsertProvider(admin, {id:'yunwu-agent-vault', label:'云雾', kind:'image', enabled:true, baseUrl:'https://private.example', secretRef:'agent-vault://yunwu/image2'});
  await plane.upsertModel(admin, {id:'yunwu-gpt-image-2-c', label:'Image2', kind:'image', providerId:'yunwu-agent-vault', providerLabel:'云雾', tenantId:'tenant-a', enabled:true, priceCredits:10, resolutions:['4k'], aspectRatios:['9:16'], outputSizes:{'4k':'2160x3840'}});
  await plane.creditAdmin(admin, {tenantId:'tenant-a', userId:user.id, amount:20, reason:'test grant'});
  const catalog = await plane.publicCatalogForTenant('tenant-a');
  assert.equal(catalog.models[0].priceCredits, 10);
  assert.equal(Object.hasOwn(catalog, 'providers'), false);
  assert.equal(JSON.stringify(catalog).includes('private.example'), false);
  assert.equal(JSON.stringify(catalog).includes('agent-vault'), false);
  assert.equal((await plane.adminSnapshot(admin)).providers[0].secretRef, 'agent-vault://yunwu/image2');
  await assert.rejects(() => plane.adminSnapshot(user), error => error.code === 'ADMIN_REQUIRED');
  const reserved = await plane.reserveCredits({tenantId:user.tenantId, userId:user.id, jobId:'CGJ-1', idempotencyKey:'CGJ-1:reserve', amount:10});
  const reused = await plane.reserveCredits({tenantId:user.tenantId, userId:user.id, jobId:'CGJ-1', idempotencyKey:'CGJ-1:reserve', amount:10});
  assert.equal(reused.reservationId, reserved.reservationId);
  assert.equal(await plane.accountBalance(user.tenantId, user.id), 10);
  await plane.refundCredits({reservationId:reserved.reservationId, idempotencyKey:'CGJ-1:refund', reason:'provider_failed'});
  await plane.refundCredits({reservationId:reserved.reservationId, idempotencyKey:'CGJ-1:refund', reason:'provider_failed'});
  assert.equal(await plane.accountBalance(user.tenantId, user.id), 20);
  await assert.rejects(() => plane.reserveCredits({tenantId:other.tenantId, userId:other.id, jobId:'CGJ-2', idempotencyKey:'CGJ-2:reserve', amount:1}), error => error.code === 'CREDIT_INSUFFICIENT');

  const welcomePlane = createModelControlPlane({configPath:path.join(root, 'welcome-config.json'), ledgerPath:path.join(root, 'welcome-ledger.json'), welcomeCredits:30});
  assert.equal(await welcomePlane.accountBalance(other.tenantId, other.id), 30);
  const welcomeReservation = await welcomePlane.reserveCredits({tenantId:other.tenantId, userId:other.id, jobId:'CGJ-3', idempotencyKey:'CGJ-3:reserve', amount:20});
  assert.ok(welcomeReservation.reservationId);
  assert.equal(await welcomePlane.accountBalance(other.tenantId, other.id), 10);
  const welcomeAudit = await welcomePlane.auditCredits(admin, {tenantId:other.tenantId, userId:other.id});
  assert.equal(welcomeAudit.entries.filter(entry => entry.type === 'welcome_grant').length, 1);
  await fs.rm(root, {recursive:true, force:true});
  console.log('MODEL_CONTROL_PLANE_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
