(function () {
  'use strict';

  var providerList = document.getElementById('providerList');
  var modelList = document.getElementById('modelList');
  var providerTemplate = document.getElementById('providerTemplate');
  var modelTemplate = document.getElementById('modelTemplate');
  var saveState = document.getElementById('saveState');
  var state = {providers: [], models: []};

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
  function load() {
    setStatus('正在读取服务器配置');
    request('/api/admin/commerce/summary', {method:'GET'}).then(function (summary) {
      state.providers = Array.isArray(summary.providers) ? summary.providers : [];
      state.models = Array.isArray(summary.models) ? summary.models : [];
      renderProviders();
      renderModels();
      setStatus('服务器配置已读取', 'good');
    }).catch(function (error) {
      empty(providerList, '无法读取供应商状态。');
      empty(modelList, '无法读取模型目录。');
      setStatus(error.message, 'error');
    });
  }
  load();
}());
