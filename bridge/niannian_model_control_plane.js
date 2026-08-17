'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

function clean(value, limit = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim().slice(0, limit);
}

function controlError(code, message, httpStatus = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function tenantForUser(user) {
  return clean(user?.tenantId || user?.tenant_id || user?.id, 120) || 'tenant-unknown';
}

function isAdmin(user, env = process.env) {
  if (!user) return false;
  if (String(user.role || '').toLowerCase() === 'admin') return true;
  const ids = String(env.NIANNIAN_ADMIN_USER_IDS || '').split(',').map(item => item.trim()).filter(Boolean);
  return ids.includes(String(user.id));
}

function requireAdmin(user, env = process.env) {
  if (!isAdmin(user, env)) throw controlError('ADMIN_REQUIRED', '仅服务器管理员可维护模型配置', 403);
}

function atomicStore(filePath, initialValue) {
  let writeTail = Promise.resolve();
  async function ensure() {
    await fsp.mkdir(path.dirname(filePath), {recursive: true});
    try { await fsp.access(filePath); } catch { await fsp.writeFile(filePath, JSON.stringify(initialValue, null, 2) + '\n', {flag: 'wx'}); }
  }
  async function read() {
    await ensure();
    const value = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    return value;
  }
  async function write(value) {
    await ensure();
    const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(5).toString('hex');
    await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
    await fsp.rename(temp, filePath);
  }
  async function withLock(fn) {
    const previous = writeTail;
    let release;
    writeTail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await fn(); } finally { release(); }
  }
  return {read, write, withLock, filePath};
}

function redactedProvider(provider) {
  return {
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    enabled: provider.enabled === true,
    baseUrlConfigured: Boolean(provider.baseUrl),
    updatedAt: provider.updatedAt || null
  };
}

function publicCatalog(models, providers, tenantId, allowedModelIds = []) {
  const enabledProviderIds = new Set((providers || []).filter(item => item.enabled === true).map(item => item.id));
  const allowed = new Set((allowedModelIds || []).filter(Boolean));
  return {
    schemaVersion: 'niannian.canvas_model_catalog.v2',
    tenantId,
    models: models.filter(item => (item.tenantId === tenantId || item.tenantId === 'default') && item.enabled === true && enabledProviderIds.has(item.providerId) && (!allowed.size || allowed.has(item.id))).map(item => ({
      id: item.id,
      label: item.label,
      kind: item.kind,
      providerKey: item.providerId,
      providerLabel: item.providerLabel,
      // A public catalog contains only enabled model/provider pairs. Preserve
      // that fact for every consumer that performs a submit-time guard.
      enabled: true,
      priceCredits: Number(item.priceCredits),
      resolutions: item.resolutions || [],
      aspectRatios: item.aspectRatios || [],
      outputSizes: item.outputSizes || {}
    }))
  };
}

function normalizePlan(input) {
  const id = clean(input?.id, 120);
  if (!id) throw controlError('PLAN_ID_REQUIRED', '套餐标识不能为空', 422);
  const modelIds = [...new Set((Array.isArray(input.modelIds) ? input.modelIds : []).map(item => clean(item, 120)).filter(Boolean))].slice(0, 80);
  const monthlyCredits = Math.max(0, Math.floor(Number(input.monthlyCredits || 0)) || 0);
  const monthlyPriceCny = Math.max(0, Number(input.monthlyPriceCny || 0) || 0);
  return {
    id,
    label: clean(input.label || id, 160),
    audience: clean(input.audience || 'creator', 40),
    monthlyCredits,
    monthlyPriceCny,
    modelIds,
    published: input.published === true,
    updatedAt: new Date().toISOString()
  };
}

function tenantPlanFor(config, tenantId) {
  const assignments = Array.isArray(config.tenantPlans) ? config.tenantPlans : [];
  const assignment = assignments.find(item => item.tenantId === tenantId && item.status === 'active') || null;
  if (!assignment) return null;
  const plan = (config.plans || []).find(item => item.id === assignment.planId) || null;
  return plan ? {assignment, plan} : null;
}

function teamAccountKey(tenantId) {
  return clean(tenantId, 120);
}

function normalizeLedger(ledger) {
  if (ledger.schemaVersion === 'niannian.credit_ledger.v2') return false;
  const sharedAccounts = {};
  for (const [key, value] of Object.entries(ledger.accounts || {})) {
    const tenantId = String(key).split(':')[0];
    sharedAccounts[tenantId] = Number(sharedAccounts[tenantId] || 0) + Number(value || 0);
  }
  ledger.schemaVersion = 'niannian.credit_ledger.v2';
  ledger.accounts = sharedAccounts;
  return true;
}

function createModelControlPlane(options = {}) {
  const configStore = atomicStore(path.resolve(options.configPath), {schemaVersion: 'niannian.model_control_config.v2', providers: [], models: [], plans: [], tenantPlans: []});
  const ledgerStore = atomicStore(path.resolve(options.ledgerPath), {schemaVersion: 'niannian.credit_ledger.v2', accounts: {}, entries: []});
  const welcomeCredits = Math.max(0, Math.min(100000, Math.floor(Number(options.welcomeCredits || 0)) || 0));

  function ensureTeamAccount(ledger, tenantId, userId) {
    const accountKey = teamAccountKey(tenantId);
    if (Object.hasOwn(ledger.accounts, accountKey)) return {accountKey, created:false, balance:Number(ledger.accounts[accountKey] || 0)};
    ledger.accounts[accountKey] = welcomeCredits;
    if (welcomeCredits > 0) {
      ledger.entries.push({id:'LE-' + crypto.randomBytes(10).toString('hex'), type:'welcome_grant', tenantId, userId, amount:welcomeCredits, reason:'configured_welcome_credits', createdAt:new Date().toISOString()});
    }
    return {accountKey, created:true, balance:welcomeCredits};
  }

  async function ensureDefaults() {
    await configStore.withLock(async () => {
      const config = await configStore.read();
      let changed = false;
      if (config.schemaVersion !== 'niannian.model_control_config.v2') { config.schemaVersion = 'niannian.model_control_config.v2'; changed = true; }
      if (!Array.isArray(config.providers)) config.providers = [];
      if (!Array.isArray(config.models)) config.models = [];
      if (!Array.isArray(config.plans)) { config.plans = []; changed = true; }
      if (!Array.isArray(config.tenantPlans)) { config.tenantPlans = []; changed = true; }
      const provider = config.providers.find(item => item.id === 'yunwu-agent-vault');
      if (!provider) { config.providers.push({id: 'yunwu-agent-vault', label: '云雾', kind: 'image', enabled: false, secretRef: 'agent-vault://yunwu/image2', baseUrl: '', updatedAt: new Date().toISOString()}); changed = true; }
      const h3Provider = config.providers.find(item => item.id === 'runninghub-consumer');
      if (!h3Provider) { config.providers.push({id: 'runninghub-consumer', label: 'RunningHub', kind: 'video', enabled: false, secretRef: 'agent-vault://runninghub/h3', baseUrl: '', updatedAt: new Date().toISOString()}); changed = true; }
      const dolaProvider = config.providers.find(item => item.id === 'dola-desktop-api');
      if (!dolaProvider) { config.providers.push({id: 'dola-desktop-api', label: 'Dola', kind: 'video', enabled: false, secretRef: 'env://NIANNIAN_DOLA_API_KEY', baseUrl: '', updatedAt: new Date().toISOString()}); changed = true; }
      const compilerProvider = config.providers.find(item => item.id === 'mcgrox-server');
      if (!compilerProvider) { config.providers.push({id: 'mcgrox-server', label: 'MCGrox 编排服务', kind: 'text', enabled: false, secretRef: 'agent-vault://mcgrox/compiler', baseUrl: '', updatedAt: new Date().toISOString()}); changed = true; }
      const defaults = [
        {id: 'yunwu-gpt-image-2-c', label: '云雾 Image2 竖版 4K', kind: 'image', providerId: 'yunwu-agent-vault', providerLabel: '云雾', priceCredits: 10, resolutions: ['4k'], aspectRatios: ['9:16'], outputSizes: {'4k': '2160x3840'}},
        {id: 'yunwu-gpt-image-2-c-edit', label: '云雾 Image2 图改图 4K', kind: 'image', providerId: 'yunwu-agent-vault', providerLabel: '云雾', priceCredits: 12, resolutions: ['4k'], aspectRatios: ['16:9'], outputSizes: {'4k': '3840x2160'}},
        {id: 'minimax-h3', label: 'H3 生视频', kind: 'video', providerId: 'runninghub-consumer', providerLabel: 'RunningHub', priceCredits: 20, resolutions: ['2k'], aspectRatios: ['9:16', '16:9', '1:1'], outputSizes: {}},
        {id: 'dola-seedance-2-5', label: 'Dola Seedance 2.5（30秒）', kind: 'video', providerId: 'dola-desktop-api', providerLabel: 'Dola', priceCredits: 0, resolutions: ['720p'], aspectRatios: ['9:16', '16:9', '1:1', '4:3', '3:4'], outputSizes: {}},
        {id: 'mcgrox-compiler', label: 'MCGrox 编排模型', kind: 'text', providerId: 'mcgrox-server', providerLabel: 'MCGrox', priceCredits: 1, resolutions: [], aspectRatios: [], outputSizes: {}}
      ];
      for (const item of defaults) {
        if (!config.models.some(model => model.id === item.id)) { config.models.push({...item, tenantId: 'default', enabled: false, updatedAt: new Date().toISOString()}); changed = true; }
      }
      const plans = [
        {id:'creator-monthly', label:'个人创作者月度套餐', audience:'creator', monthlyCredits:0, monthlyPriceCny:0, modelIds:[], published:false},
        {id:'team-monthly', label:'小团队月度套餐', audience:'team', monthlyCredits:0, monthlyPriceCny:0, modelIds:[], published:false}
      ];
      for (const plan of plans) {
        if (!config.plans.some(item => item.id === plan.id)) { config.plans.push({...plan, updatedAt:new Date().toISOString()}); changed = true; }
      }
      if (changed) await configStore.write(config);
    });
  }

  async function publicCatalogForTenant(tenantId) {
    await ensureDefaults();
    const config = await configStore.read();
    const plan = tenantPlanFor(config, tenantId);
    if (plan) await grantMonthlyPlanCredits(tenantId, plan.plan);
    return publicCatalog(config.models, config.providers, tenantId, plan?.plan?.modelIds || []);
  }

  async function adminSnapshot(user, env = process.env) {
    requireAdmin(user, env);
    await ensureDefaults();
    const config = await configStore.read();
    // Provider credentials are server-only. The administrator UI receives a
    // configuration state, never a secret name, reference, or credential value.
    return {
      schemaVersion: config.schemaVersion,
      providers: config.providers.map(redactedProvider),
      models: config.models.map(item => ({...item, secretRef: undefined})),
      plans: config.plans.map(item => ({...item})),
      tenantPlans: config.tenantPlans.map(item => ({...item}))
    };
  }

  async function upsertModel(user, input, env = process.env) {
    requireAdmin(user, env);
    const id = clean(input.id, 120);
    if (!id) throw controlError('MODEL_ID_REQUIRED', '模型标识不能为空', 422);
    const tenantId = clean(input.tenantId || 'default', 120);
    const model = {id, label: clean(input.label || id, 160), kind: clean(input.kind, 30), providerId: clean(input.providerId, 120), providerLabel: clean(input.providerLabel, 80), priceCredits: Math.max(0, Number(input.priceCredits || 0)), resolutions: Array.isArray(input.resolutions) ? input.resolutions.map(item => clean(item, 20)).filter(Boolean).slice(0, 8) : [], aspectRatios: Array.isArray(input.aspectRatios) ? input.aspectRatios.map(item => clean(item, 20)).filter(Boolean).slice(0, 8) : [], outputSizes: input.outputSizes && typeof input.outputSizes === 'object' ? input.outputSizes : {}, tenantId, enabled: input.enabled === true, updatedAt: new Date().toISOString()};
    await configStore.withLock(async () => {
      const config = await configStore.read();
      const index = config.models.findIndex(item => item.id === id && item.tenantId === tenantId);
      if (index < 0) config.models.push(model); else config.models[index] = {...config.models[index], ...model};
      await configStore.write(config);
    });
    return model;
  }

  async function upsertProvider(user, input, env = process.env) {
    requireAdmin(user, env);
    const id = clean(input.id, 120);
    if (!id) throw controlError('PROVIDER_ID_REQUIRED', '供应商标识不能为空', 422);
    let saved = null;
    await configStore.withLock(async () => {
      const config = await configStore.read();
      const index = config.providers.findIndex(item => item.id === id);
      const existing = index < 0 ? {} : config.providers[index];
      // Keep protected server-side fields when the browser only changes a
      // provider's release state. Missing fields must never erase a vault map.
      const provider = {
        ...existing,
        id,
        label: input.label === undefined ? clean(existing.label || id, 160) : clean(input.label || id, 160),
        kind: input.kind === undefined ? clean(existing.kind, 30) : clean(input.kind, 30),
        enabled: input.enabled === undefined ? existing.enabled === true : input.enabled === true,
        baseUrl: input.baseUrl === undefined ? clean(existing.baseUrl, 500) : clean(input.baseUrl, 500),
        secretRef: input.secretRef === undefined ? clean(existing.secretRef, 300) : clean(input.secretRef, 300),
        updatedAt: new Date().toISOString()
      };
      if (index < 0) config.providers.push(provider); else config.providers[index] = provider;
      await configStore.write(config);
      saved = provider;
    });
    return redactedProvider(saved);
  }

  async function upsertPlan(user, input, env = process.env) {
    requireAdmin(user, env);
    const plan = normalizePlan(input);
    await configStore.withLock(async () => {
      const config = await configStore.read();
      if (!Array.isArray(config.plans)) config.plans = [];
      const knownModelIds = new Set((config.models || []).map(item => item.id));
      if (plan.modelIds.some(modelId => !knownModelIds.has(modelId))) {
        throw controlError('PLAN_MODEL_NOT_FOUND', '套餐包含未登记的模型', 422);
      }
      const index = config.plans.findIndex(item => item.id === plan.id);
      if (index < 0) config.plans.push(plan); else config.plans[index] = {...config.plans[index], ...plan};
      await configStore.write(config);
    });
    return plan;
  }

  async function assignTenantPlan(user, input, env = process.env) {
    requireAdmin(user, env);
    const tenantId = clean(input.tenantId, 120);
    const planId = clean(input.planId, 120);
    if (!tenantId || !planId) throw controlError('TENANT_PLAN_INVALID', '团队和套餐不能为空', 422);
    let assignment;
    await configStore.withLock(async () => {
      const config = await configStore.read();
      const plan = (config.plans || []).find(item => item.id === planId);
      if (!plan) throw controlError('PLAN_NOT_FOUND', '套餐不存在', 404);
      const status = input.status === 'inactive' ? 'inactive' : 'active';
      if (status === 'active' && plan.published !== true) throw controlError('PLAN_NOT_PUBLISHED', '只有已发布套餐可以分配给用户', 422);
      if (!Array.isArray(config.tenantPlans)) config.tenantPlans = [];
      assignment = {tenantId, planId, status, updatedAt:new Date().toISOString()};
      const index = config.tenantPlans.findIndex(item => item.tenantId === tenantId);
      if (index < 0) config.tenantPlans.push(assignment); else config.tenantPlans[index] = assignment;
      await configStore.write(config);
    });
    return assignment;
  }

  async function accountBalance(tenantId, userId) {
    return ledgerStore.withLock(async () => {
      const ledger = await ledgerStore.read();
      const migrated = normalizeLedger(ledger);
      const account = ensureTeamAccount(ledger, tenantId, userId);
      if (migrated || account.created) await ledgerStore.write(ledger);
      return account.balance;
    });
  }

  function currentBillingPeriod() {
    return new Date().toISOString().slice(0, 7);
  }

  async function grantMonthlyPlanCredits(tenantId, plan) {
    const amount = Math.max(0, Math.floor(Number(plan?.monthlyCredits || 0)) || 0);
    if (!amount || plan?.published !== true) return null;
    const period = currentBillingPeriod();
    const idempotencyKey = `monthly-plan:${tenantId}:${plan.id}:${period}`;
    return ledgerStore.withLock(async () => {
      const ledger = await ledgerStore.read();
      normalizeLedger(ledger);
      const existing = ledger.entries.find(item => item.type === 'monthly_plan_grant' && item.idempotencyKey === idempotencyKey);
      const account = ensureTeamAccount(ledger, tenantId, 'SYSTEM-PLAN');
      if (existing) {
        if (account.created) await ledgerStore.write(ledger);
        return {idempotent:true, amount:existing.amount, period, balance:Number(ledger.accounts[account.accountKey] || 0)};
      }
      ledger.accounts[account.accountKey] = Number(ledger.accounts[account.accountKey] || 0) + amount;
      ledger.entries.push({id:'LE-' + crypto.randomBytes(10).toString('hex'), type:'monthly_plan_grant', tenantId, userId:'SYSTEM-PLAN', amount, planId:plan.id, period, idempotencyKey, reason:'monthly_plan_entitlement', createdAt:new Date().toISOString()});
      await ledgerStore.write(ledger);
      return {idempotent:false, amount, period, balance:ledger.accounts[account.accountKey]};
    });
  }

  async function tenantAccount(user) {
    const tenantId = tenantForUser(user);
    await ensureDefaults();
    const config = await configStore.read();
    const currentPlan = tenantPlanFor(config, tenantId);
    if (currentPlan) await grantMonthlyPlanCredits(tenantId, currentPlan.plan);
    const balance = await accountBalance(tenantId, user.id);
    return {
      tenantId,
      balance,
      plan:currentPlan ? {id:currentPlan.plan.id, label:currentPlan.plan.label, audience:currentPlan.plan.audience, monthlyCredits:currentPlan.plan.monthlyCredits} : null
    };
  }

  async function reserveCredits(input) {
    const tenantId = clean(input.tenantId, 120); const userId = clean(input.userId, 120); const jobId = clean(input.jobId, 160); const idempotencyKey = clean(input.idempotencyKey, 240); const amount = Math.max(0, Math.ceil(Number(input.amount)));
    if (!tenantId || !userId || !jobId || !idempotencyKey || !Number.isFinite(amount)) throw controlError('CREDIT_RESERVATION_INVALID', '积分预留参数无效', 422);
    return ledgerStore.withLock(async () => {
      const ledger = await ledgerStore.read();
      normalizeLedger(ledger);
      const existing = ledger.entries.find(item => item.type === 'reserve' && item.idempotencyKey === idempotencyKey && item.userId === userId && item.tenantId === tenantId);
      const account = ensureTeamAccount(ledger, tenantId, userId);
      const accountKey = account.accountKey; const balance = account.balance;
      if (existing) {
        if (account.created) await ledgerStore.write(ledger);
        return {reservationId: existing.reservationId, idempotent: true, balance};
      }
      if (balance < amount) throw controlError('CREDIT_INSUFFICIENT', '积分余额不足', 402);
      ledger.accounts[accountKey] = balance - amount;
      const reservationId = 'CR-' + crypto.randomBytes(12).toString('hex');
      ledger.entries.push({id: 'LE-' + crypto.randomBytes(10).toString('hex'), type: 'reserve', reservationId, tenantId, userId, jobId, idempotencyKey, amount, createdAt: new Date().toISOString()});
      await ledgerStore.write(ledger);
      return {reservationId, idempotent: false, balance: ledger.accounts[accountKey]};
    });
  }

  async function settleOrRefund(input, type) {
    const reservationId = clean(input.reservationId, 160); const key = clean(input.idempotencyKey || (reservationId + ':' + type), 240);
    return ledgerStore.withLock(async () => {
      const ledger = await ledgerStore.read();
      normalizeLedger(ledger);
      const reservation = ledger.entries.find(item => item.type === 'reserve' && item.reservationId === reservationId);
      if (!reservation) throw controlError('CREDIT_RESERVATION_NOT_FOUND', '积分预留不存在', 404);
      const existing = ledger.entries.find(item => item.idempotencyKey === key && item.reservationId === reservationId && item.type === type);
      const accountKey = ensureTeamAccount(ledger, reservation.tenantId, reservation.userId).accountKey;
      if (existing) return {idempotent: true, balance: Number(ledger.accounts[accountKey] || 0)};
      const finalized = ledger.entries.find(item => item.reservationId === reservationId && ['settle','refund'].includes(item.type));
      if (finalized) throw controlError('CREDIT_RESERVATION_FINALIZED', '积分预留已完成结算，不能重复变更', 409);
      const amount = type === 'refund' ? reservation.amount : Math.max(0, Math.ceil(Number(input.amount ?? reservation.amount)));
      if (type === 'settle' && amount < reservation.amount) ledger.accounts[accountKey] = Number(ledger.accounts[accountKey] || 0) + (reservation.amount - amount);
      if (type === 'settle' && amount > reservation.amount) throw controlError('CREDIT_SETTLE_OVER_RESERVATION', '结算积分不能超过预留积分', 409);
      if (type === 'refund') ledger.accounts[accountKey] = Number(ledger.accounts[accountKey] || 0) + amount;
      ledger.entries.push({id: 'LE-' + crypto.randomBytes(10).toString('hex'), type, reservationId, tenantId: reservation.tenantId, userId: reservation.userId, jobId: reservation.jobId, idempotencyKey: key, amount, reason: clean(input.reason, 240), createdAt: new Date().toISOString()});
      await ledgerStore.write(ledger);
      return {idempotent: false, balance: ledger.accounts[accountKey]};
    });
  }

  async function creditAdmin(user, input, env = process.env) {
    requireAdmin(user, env);
    const tenantId = clean(input.tenantId, 120); const userId = clean(input.userId || 'SYSTEM-ADMIN', 120); const amount = Math.floor(Number(input.amount));
    if (!tenantId || !userId || !Number.isFinite(amount) || amount === 0) throw controlError('CREDIT_ADJUSTMENT_INVALID', '积分调整参数无效', 422);
    return ledgerStore.withLock(async () => {
      const ledger = await ledgerStore.read(); normalizeLedger(ledger); const key = ensureTeamAccount(ledger, tenantId, userId).accountKey;
      const nextBalance = Number(ledger.accounts[key] || 0) + amount;
      if (nextBalance < 0) throw controlError('CREDIT_ADJUSTMENT_INSUFFICIENT', '调整后团队积分不能小于零', 409);
      ledger.accounts[key] = nextBalance;
      ledger.entries.push({id: 'LE-' + crypto.randomBytes(10).toString('hex'), type: 'admin_adjustment', tenantId, userId, amount, reason: clean(input.reason, 240), createdAt: new Date().toISOString()}); await ledgerStore.write(ledger); return {tenantId, userId, balance: ledger.accounts[key]};
    });
  }

  async function auditCredits(user, filters = {}, env = process.env) {
    requireAdmin(user, env);
    const ledger = await ledgerStore.read();
    normalizeLedger(ledger);
    const tenantId = clean(filters.tenantId, 120);
    const userId = clean(filters.userId, 120);
    const entries = ledger.entries.filter(item => (!tenantId || item.tenantId === tenantId) && (!userId || item.userId === userId)).map(item => ({...item}));
    return {schemaVersion:ledger.schemaVersion, entries, accountBalances:Object.fromEntries(Object.entries(ledger.accounts).filter(([key]) => !tenantId || key === tenantId))};
  }

  async function usageSummary(user, env = process.env) {
    requireAdmin(user, env);
    const ledger = await ledgerStore.read();
    normalizeLedger(ledger);
    const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
    const finalByReservation = new Map();
    for (const entry of entries) {
      if (entry.reservationId && (entry.type === 'settle' || entry.type === 'refund')) finalByReservation.set(entry.reservationId, entry);
    }
    const reservations = entries.filter(entry => entry.type === 'reserve');
    const pendingReservations = reservations.filter(entry => !finalByReservation.has(entry.reservationId));
    const sum = (items, predicate = () => true) => items.reduce((total, item) => predicate(item) ? total + Math.max(0, Number(item.amount) || 0) : total, 0);
    const positiveGrants = entries.filter(entry => ['welcome_grant', 'monthly_plan_grant', 'admin_adjustment'].includes(entry.type) && Number(entry.amount) > 0);
    const settled = entries.filter(entry => entry.type === 'settle');
    const refunded = entries.filter(entry => entry.type === 'refund');
    const anomalies = [];
    for (const reservation of reservations) {
      const finals = entries.filter(entry => entry.reservationId === reservation.reservationId && ['settle', 'refund'].includes(entry.type));
      if (finals.length > 1) anomalies.push({reservationId: reservation.reservationId, reason: '重复结算'});
      if (Number(reservation.amount) < 0) anomalies.push({reservationId: reservation.reservationId, reason: '负数预留'});
    }
    return {
      unit: 'NN_CREDIT',
      accountCount: Object.keys(ledger.accounts || {}).length,
      availableCredits: Object.values(ledger.accounts || {}).reduce((total, value) => total + (Number(value) || 0), 0),
      grantedCredits: sum(positiveGrants),
      reservedCredits: sum(pendingReservations),
      settledCredits: sum(settled),
      refundedCredits: sum(refunded),
      pendingReservations: pendingReservations.length,
      anomalies
    };
  }

  return {ensureDefaults, publicCatalogForTenant, adminSnapshot, upsertModel, upsertProvider, upsertPlan, assignTenantPlan, accountBalance, tenantAccount, reserveCredits, settleCredits: input => settleOrRefund(input, 'settle'), refundCredits: input => settleOrRefund(input, 'refund'), creditAdmin, auditCredits, usageSummary, isAdmin, requireAdmin, constants: {configPath: configStore.filePath, ledgerPath: ledgerStore.filePath, welcomeCredits}};
}

module.exports = {createModelControlPlane, tenantForUser, isAdmin, requireAdmin};
