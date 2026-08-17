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
  assert.equal(catalog.models[0].providerKey, 'yunwu-agent-vault');
  assert.equal(Object.hasOwn(catalog, 'providers'), false);
  assert.equal(JSON.stringify(catalog).includes('private.example'), false);
  assert.equal(JSON.stringify(catalog).includes('agent-vault://'), false);
  const adminSnapshot = await plane.adminSnapshot(admin);
  assert.equal(JSON.stringify(adminSnapshot).includes('agent-vault://yunwu/image2'), false);
  assert.equal(Object.hasOwn(adminSnapshot.providers[0], 'secretRef'), false);
  await assert.rejects(() => plane.adminSnapshot(user), error => error.code === 'ADMIN_REQUIRED');
  const reserved = await plane.reserveCredits({tenantId:user.tenantId, userId:user.id, jobId:'CGJ-1', idempotencyKey:'CGJ-1:reserve', amount:10});
  const reused = await plane.reserveCredits({tenantId:user.tenantId, userId:user.id, jobId:'CGJ-1', idempotencyKey:'CGJ-1:reserve', amount:10});
  assert.equal(reused.reservationId, reserved.reservationId);
  assert.equal(await plane.accountBalance(user.tenantId, user.id), 10);
  await plane.refundCredits({reservationId:reserved.reservationId, idempotencyKey:'CGJ-1:refund', reason:'provider_failed'});
  await plane.refundCredits({reservationId:reserved.reservationId, idempotencyKey:'CGJ-1:refund', reason:'provider_failed'});
  assert.equal(await plane.accountBalance(user.tenantId, user.id), 20);
  const shared = await plane.reserveCredits({tenantId:user.tenantId, userId:'USR-TEAMMATE', jobId:'CGJ-SHARED', idempotencyKey:'CGJ-SHARED:reserve', amount:7});
  assert.equal(await plane.accountBalance(user.tenantId, user.id), 13, 'team members must spend from one shared tenant balance');
  await plane.refundCredits({reservationId:shared.reservationId, idempotencyKey:'CGJ-SHARED:refund', reason:'test'});
  const settled = await plane.reserveCredits({tenantId:user.tenantId, userId:user.id, jobId:'CGJ-SETTLED', idempotencyKey:'CGJ-SETTLED:reserve', amount:5});
  await plane.settleCredits({reservationId:settled.reservationId, idempotencyKey:'CGJ-SETTLED:settle'});
  await assert.rejects(() => plane.refundCredits({reservationId:settled.reservationId, idempotencyKey:'CGJ-SETTLED:late-refund'}), error => error.code === 'CREDIT_RESERVATION_FINALIZED');
  await assert.rejects(() => plane.reserveCredits({tenantId:other.tenantId, userId:other.id, jobId:'CGJ-2', idempotencyKey:'CGJ-2:reserve', amount:1}), error => error.code === 'CREDIT_INSUFFICIENT');
  const usage = await plane.usageSummary(admin);
  assert.equal(usage.unit, 'NN_CREDIT');
  assert.equal(usage.pendingReservations, 0);
  assert.ok(usage.refundedCredits >= 17);

  const welcomePlane = createModelControlPlane({configPath:path.join(root, 'welcome-config.json'), ledgerPath:path.join(root, 'welcome-ledger.json'), welcomeCredits:30});
  assert.equal(await welcomePlane.accountBalance(other.tenantId, other.id), 30);
  const welcomeReservation = await welcomePlane.reserveCredits({tenantId:other.tenantId, userId:other.id, jobId:'CGJ-3', idempotencyKey:'CGJ-3:reserve', amount:20});
  assert.ok(welcomeReservation.reservationId);
  assert.equal(await welcomePlane.accountBalance(other.tenantId, other.id), 10);
  const welcomeAudit = await welcomePlane.auditCredits(admin, {tenantId:other.tenantId, userId:other.id});
  assert.equal(welcomeAudit.entries.filter(entry => entry.type === 'welcome_grant').length, 1);

  const subscriptionPlane = createModelControlPlane({configPath:path.join(root, 'subscription-config.json'), ledgerPath:path.join(root, 'subscription-ledger.json')});
  await subscriptionPlane.upsertProvider(admin, {id:'yunwu-agent-vault', label:'云雾', kind:'image', enabled:true});
  await subscriptionPlane.upsertModel(admin, {id:'image-basic', label:'基础生图', kind:'image', providerId:'yunwu-agent-vault', providerLabel:'云雾', enabled:true, priceCredits:8});
  await subscriptionPlane.upsertModel(admin, {id:'image-hidden', label:'隐藏生图', kind:'image', providerId:'yunwu-agent-vault', providerLabel:'云雾', enabled:true, priceCredits:12});
  await assert.rejects(() => subscriptionPlane.upsertPlan(admin, {id:'bad-plan', label:'错误套餐', modelIds:['not-registered'], published:true}), error => error.code === 'PLAN_MODEL_NOT_FOUND');
  await subscriptionPlane.upsertPlan(admin, {id:'creator-plan', label:'个人套餐', audience:'creator', monthlyCredits:30, monthlyPriceCny:39, modelIds:['image-basic'], published:true});
  await subscriptionPlane.upsertPlan(admin, {id:'draft-plan', label:'草稿套餐', modelIds:['image-basic'], published:false});
  await assert.rejects(() => subscriptionPlane.assignTenantPlan(admin, {tenantId:'tenant-sub', planId:'draft-plan', status:'active'}), error => error.code === 'PLAN_NOT_PUBLISHED');
  await subscriptionPlane.assignTenantPlan(admin, {tenantId:'tenant-sub', planId:'creator-plan', status:'active'});
  const subscriber = {id:'USR-SUB', tenantId:'tenant-sub'};
  const firstAccount = await subscriptionPlane.tenantAccount(subscriber);
  const secondAccount = await subscriptionPlane.tenantAccount(subscriber);
  assert.equal(firstAccount.balance, 30);
  assert.equal(secondAccount.balance, 30, '同一自然月套餐积分只能发放一次');
  const subscriberCatalog = await subscriptionPlane.publicCatalogForTenant('tenant-sub');
  assert.deepEqual(subscriberCatalog.models.map(model => model.id), ['image-basic']);
  const subscriptionAudit = await subscriptionPlane.auditCredits(admin, {tenantId:'tenant-sub'});
  assert.equal(subscriptionAudit.entries.filter(entry => entry.type === 'monthly_plan_grant').length, 1);
  await fs.rm(root, {recursive:true, force:true});
  console.log('MODEL_CONTROL_PLANE_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
