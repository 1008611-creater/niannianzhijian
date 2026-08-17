(function () {
  'use strict';

  var providerList = document.getElementById('providerList');
  var modelList = document.getElementById('modelList');
  var providerTemplate = document.getElementById('providerTemplate');
  var modelTemplate = document.getElementById('modelTemplate');
  var planTemplate = document.getElementById('planTemplate');
  var teamTemplate = document.getElementById('teamTemplate');
  var planList = document.getElementById('planList');
  var teamList = document.getElementById('teamList');
  var ledgerList = document.getElementById('ledgerList');
  var jobList = document.getElementById('jobList');
  var saveState = document.getElementById('saveState');
  var creditAdjustmentForm = document.getElementById('creditAdjustmentForm');
  var state = {providers: [], models: [], plans: [], tenantPlans: [], ledger: {entries: [], accountBalances: {}}, jobs: []};

  function text(value) { return String(value == null ? '' : value); }
  function setStatus(message, tone) {
    saveState.textContent = message;
    saveState.dataset.tone = tone || '';
  }
  function request(path, options) {
    return fetch(path, Object.assign({credentials: 'same-origin', headers: {'content-type': 'application/json'}}, options || {})).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body.error || '服务器配置操作失败');
        return body;
      });
    });
  }
  function empty(container, message) {
    container.replaceChildren();
    var row = document.createElement('p');
    row.className = 'empty-row';
    row.textContent = message;
    container.appendChild(row);
  }
  function renderProviders() {
    if (!state.providers.length) return empty(providerList, '服务器尚未登记供应商。');
    providerList.replaceChildren();
    state.providers.forEach(function (provider) {
      var fragment = providerTemplate.content.cloneNode(true);
      var row = fragment.querySelector('.provider-row');
      row.querySelector('h3').textContent = text(provider.label || provider.id);
      row.querySelector('.provider-kind').textContent = provider.kind === 'video' ? '视频生成渠道' : '图像生成渠道';
      var credential = row.querySelector('.credential-state');
      credential.textContent = provider.credentialConfigured ? '已配置' : '未配置';
      credential.className = 'credential-state ' + (provider.credentialConfigured ? 'state-good' : 'state-warn');
      row.querySelector('.credential-storage').textContent = text(provider.credentialStorage || '服务器环境');
      var runtime = row.querySelector('.runtime-state');
      runtime.textContent = provider.submitEnabled ? '可提交生成' : '暂不可提交';
      runtime.className = 'runtime-state ' + (provider.submitEnabled ? 'state-good' : 'state-warn');
      var toggle = row.querySelector('input');
      toggle.checked = provider.enabled === true;
      toggle.addEventListener('change', function () {
        toggle.disabled = true;
        setStatus('正在保存供应商发布状态');
        request('/api/admin/model-config/provider', {method: 'PUT', body: JSON.stringify({id:provider.id, label:provider.label, kind:provider.kind, enabled:toggle.checked})})
          .then(function () { provider.enabled = toggle.checked; setStatus('供应商发布状态已保存', 'good'); })
          .catch(function (error) { toggle.checked = !toggle.checked; setStatus(error.message, 'error'); })
          .finally(function () { toggle.disabled = false; });
      });
      providerList.appendChild(fragment);
    });
  }
  function renderModels() {
    if (!state.models.length) return empty(modelList, '服务器尚未登记模型。');
    modelList.replaceChildren();
    state.models.forEach(function (model) {
      var fragment = modelTemplate.content.cloneNode(true);
      var row = fragment.querySelector('.model-row');
      row.querySelector('h3').textContent = text(model.label || model.id);
      row.querySelector('.model-row__identity p').textContent = model.kind === 'video' ? '视频生成模型' : '图像生成模型';
      var price = row.querySelector('.price-field input');
      price.value = String(Math.max(0, Number(model.priceCredits) || 0));
      var toggle = row.querySelector('.switch-control input');
      toggle.checked = model.enabled === true;
      var save = row.querySelector('.save-button');
      save.addEventListener('click', function () {
        var amount = Number(price.value);
        if (!Number.isInteger(amount) || amount < 0) { setStatus('积分价格必须是零或正整数', 'error'); price.focus(); return; }
        save.disabled = true;
        setStatus('正在保存模型发布与价格');
        request('/api/admin/model-config/model', {method: 'PUT', body: JSON.stringify({
          id:model.id, label:model.label, kind:model.kind, providerId:model.providerId, providerLabel:model.providerLabel,
          tenantId:model.tenantId || 'default', enabled:toggle.checked, priceCredits:amount,
          resolutions:model.resolutions || [], aspectRatios:model.aspectRatios || [], outputSizes:model.outputSizes || {}
        })}).then(function (response) {
          model.enabled = response.model.enabled;
          model.priceCredits = response.model.priceCredits;
          price.value = String(model.priceCredits);
          setStatus('模型目录已保存，用户下次读取画布目录时生效', 'good');
        }).catch(function (error) { setStatus(error.message, 'error'); }).finally(function () { save.disabled = false; });
      });
      modelList.appendChild(fragment);
    });
  }
  function planAssignment(tenantId) {
    return state.tenantPlans.find(function (item) { return item.tenantId === tenantId && item.status === 'active'; }) || null;
  }
  function renderPlans() {
    if (!state.plans.length) return empty(planList, '服务器尚未登记月度套餐。');
    planList.replaceChildren();
    state.plans.forEach(function (plan) {
      var fragment = planTemplate.content.cloneNode(true);
      var row = fragment.querySelector('.plan-row');
      row.querySelector('h3').textContent = text(plan.label || plan.id);
      row.querySelector('.plan-row__identity p').textContent = plan.audience === 'team' ? '小团队月度套餐' : '个人创作者月度套餐';
      var price = row.querySelector('.plan-price');
      var credits = row.querySelector('.plan-credits');
      var models = row.querySelector('.plan-models');
      var toggle = row.querySelector('.switch-control input');
      price.value = String(Math.max(0, Number(plan.monthlyPriceCny) || 0));
      credits.value = String(Math.max(0, Number(plan.monthlyCredits) || 0));
      models.value = Array.isArray(plan.modelIds) ? plan.modelIds.join(', ') : '';
      toggle.checked = plan.published === true;
      row.querySelector('.save-button').addEventListener('click', function () {
        var monthlyPriceCny = Number(price.value);
        var monthlyCredits = Number(credits.value);
        if (!Number.isFinite(monthlyPriceCny) || monthlyPriceCny < 0 || !Number.isInteger(monthlyCredits) || monthlyCredits < 0) {
          setStatus('月度价格和月度积分必须为非负数', 'error'); return;
        }
        var button = row.querySelector('.save-button');
        button.disabled = true;
        setStatus('正在保存月度套餐');
        request('/api/admin/commerce/plan', {method:'PUT', body:JSON.stringify({
          id:plan.id, label:plan.label, audience:plan.audience, monthlyPriceCny:monthlyPriceCny, monthlyCredits:monthlyCredits,
          modelIds:models.value.split(',').map(function (item) { return item.trim(); }).filter(Boolean), published:toggle.checked
        })}).then(function (response) {
          Object.assign(plan, response.plan);
          setStatus('月度套餐已保存', 'good');
        }).catch(function (error) { setStatus(error.message, 'error'); }).finally(function () { button.disabled = false; });
      });
      planList.appendChild(fragment);
    });
  }
  function renderTeams() {
    var balances = state.ledger && state.ledger.accountBalances ? state.ledger.accountBalances : {};
    var tenantIds = Object.keys(balances).sort();
    if (!tenantIds.length) return empty(teamList, '尚无团队积分账户。用户首次使用或运营发放积分后会显示在这里。');
    teamList.replaceChildren();
    tenantIds.forEach(function (tenantId) {
      var fragment = teamTemplate.content.cloneNode(true);
      var row = fragment.querySelector('.team-row');
      row.querySelector('.team-id').textContent = tenantId;
      row.querySelector('.team-balance').textContent = '可用积分 ' + String(Number(balances[tenantId]) || 0);
      var select = row.querySelector('select');
      var emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '未分配套餐';
      select.appendChild(emptyOption);
      state.plans.filter(function (plan) { return plan.published === true; }).forEach(function (plan) {
        var option = document.createElement('option');
        option.value = plan.id;
        option.textContent = plan.label;
        select.appendChild(option);
      });
      var current = planAssignment(tenantId);
      select.value = current ? current.planId : '';
      var button = row.querySelector('.save-button');
      button.addEventListener('click', function () {
        if (!select.value) { setStatus('请选择一个套餐后再保存', 'error'); select.focus(); return; }
        button.disabled = true;
        setStatus('正在保存团队套餐');
        request('/api/admin/commerce/tenant-plan', {method:'PUT', body:JSON.stringify({tenantId:tenantId, planId:select.value, status:'active'})})
          .then(function (response) {
            var index = state.tenantPlans.findIndex(function (item) { return item.tenantId === tenantId; });
            if (index < 0) state.tenantPlans.push(response.assignment); else state.tenantPlans[index] = response.assignment;
            setStatus('团队套餐已保存', 'good');
          }).catch(function (error) { setStatus(error.message, 'error'); }).finally(function () { button.disabled = false; });
      });
      teamList.appendChild(fragment);
    });
  }
  function traceRow(primary, secondary, amount, tone) {
    var row = document.createElement('article');
    row.className = 'trace-row';
    var content = document.createElement('div');
    var title = document.createElement('strong');
    title.textContent = primary;
    var detail = document.createElement('p');
    detail.textContent = secondary;
    content.append(title, detail);
    var value = document.createElement('span');
    value.className = 'trace-row__amount';
    value.dataset.tone = tone || 'neutral';
    value.textContent = amount;
    row.append(content, value);
    return row;
  }
  function renderTraces() {
    var entries = state.ledger && Array.isArray(state.ledger.entries) ? state.ledger.entries : [];
    if (!entries.length) empty(ledgerList, '尚无积分流水。');
    else {
      ledgerList.replaceChildren();
      entries.forEach(function (entry) {
        var isCredit = ['refund', 'welcome_grant', 'admin_adjustment'].includes(entry.type) && Number(entry.amount) > 0;
        var isDebit = entry.type === 'reserve';
        var prefix = isCredit ? '+' : (isDebit ? '-' : '');
        ledgerList.appendChild(traceRow(entry.type + ' · ' + text(entry.tenantId), text(entry.jobId || entry.reason || entry.createdAt), prefix + String(Number(entry.amount) || 0), isCredit ? 'credit' : (isDebit ? 'debit' : 'neutral')));
      });
    }
    if (!state.jobs.length) empty(jobList, '尚无生成任务。');
    else {
      jobList.replaceChildren();
      state.jobs.forEach(function (job) {
        var result = job.outputAssetIds && job.outputAssetIds.length ? '已登记 ' + job.outputAssetIds.length + ' 个项目素材' : (job.failureCategory || '等待结果');
        jobList.appendChild(traceRow(text(job.model || job.nodeType) + ' · ' + text(job.status), text(job.id) + ' · ' + result, String(Number(job.creditAmount) || 0) + ' 积分', job.creditState === 'refunded' ? 'credit' : (job.creditState === 'reserved' || job.creditState === 'settled' ? 'debit' : 'neutral')));
      });
    }
  }
  creditAdjustmentForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var values = new FormData(creditAdjustmentForm);
    var tenantId = text(values.get('tenantId')).trim();
    var amount = Number(values.get('amount'));
    var reason = text(values.get('reason')).trim();
    if (!tenantId || !reason || !Number.isInteger(amount) || amount === 0) {
      setStatus('请填写团队标识、非零整数积分和调整原因', 'error'); return;
    }
    var button = creditAdjustmentForm.querySelector('button');
    button.disabled = true;
    setStatus('正在记入团队积分');
    request('/api/admin/credits/adjust', {method:'POST', body:JSON.stringify({tenantId:tenantId, amount:amount, reason:reason})})
      .then(function () { creditAdjustmentForm.reset(); setStatus('团队积分已记入流水', 'good'); return load(); })
      .catch(function (error) { setStatus(error.message, 'error'); })
      .finally(function () { button.disabled = false; });
  });
  function load() {
    setStatus('正在读取服务器配置');
    request('/api/admin/commerce/summary', {method:'GET'}).then(function (summary) {
      state.providers = Array.isArray(summary.providers) ? summary.providers : [];
      state.models = Array.isArray(summary.models) ? summary.models : [];
      state.plans = Array.isArray(summary.plans) ? summary.plans : [];
      state.tenantPlans = Array.isArray(summary.tenantPlans) ? summary.tenantPlans : [];
      state.ledger = summary.ledger || {entries: [], accountBalances: {}};
      state.jobs = Array.isArray(summary.jobs) ? summary.jobs : [];
      renderProviders();
      renderModels();
      renderPlans();
      renderTeams();
      renderTraces();
      setStatus('服务器配置已读取', 'good');
    }).catch(function (error) {
      empty(providerList, '无法读取供应商状态。');
      empty(modelList, '无法读取模型目录。');
      empty(planList, '无法读取月度套餐。');
      empty(teamList, '无法读取团队账户。');
      empty(ledgerList, '无法读取积分流水。');
      empty(jobList, '无法读取生成任务。');
      setStatus(error.message, 'error');
    });
  }
  load();
}());
