(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  var existingBridge = window.nomiDesktop;
  var isWebOrigin = window.location && /^https?:$/.test(window.location.protocol);
  if (!isWebOrigin && existingBridge && existingBridge.platform
    && existingBridge.tasks && typeof existingBridge.tasks.run === 'function'
    && existingBridge.modelCatalog && typeof existingBridge.modelCatalog.listModels === 'function') return;

  function projectId() {
    var searches = [window.location.search];
    var hash = String(window.location.hash || '');
    var queryIndex = hash.indexOf('?');
    if (queryIndex >= 0) searches.push(hash.slice(queryIndex));
    for (var i = 0; i < searches.length; i += 1) {
      var value = new URLSearchParams(searches[i]).get('projectId');
      if (value && value.trim()) return value.trim();
    }
    return '';
  }

  function idempotency(prefix) {
    var suffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : String(Date.now()) + Math.random().toString(16).slice(2);
    return prefix + '-' + suffix;
  }

  function canvasProjectKind() {
    var searches = [window.location.search];
    var hash = String(window.location.hash || '');
    var queryIndex = hash.indexOf('?');
    if (queryIndex >= 0) searches.push(hash.slice(queryIndex));
    for (var i = 0; i < searches.length; i += 1) {
      var value = new URLSearchParams(searches[i]).get('projectKind');
      if (value && value.trim()) return value.trim();
    }
    return 'redraw';
  }

  async function api(path, init) {
    var response = await fetch(path, Object.assign({credentials: 'same-origin'}, init || {}));
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(typeof body.error === 'string' ? body.error : '服务请求失败');
      error.status = response.status;
      error.code = body.code;
      throw error;
    }
    return body;
  }

  function providerModel(kind, status) {
    if (kind === 'text') {
      var textStatus = status.text || {};
      return {
        modelKey: textStatus.model || 'asxs-text',
        modelAlias: textStatus.model || 'asxs-text',
        vendorKey: 'asxs',
        labelZh: textStatus.model || 'ASXS 文本模型',
        kind: 'text',
        enabled: true,
        pricing: {cost: 0, enabled: textStatus.submitEnabled === true, specCosts: []},
        meta: {transportTaskKind: 'chat'}
      };
    }
    var video = kind === 'video';
    var enabled = video ? status.videoSubmitEnabled : status.imageSubmitEnabled;
    return {
      modelKey: video ? 'minimax-h3' : 'runninghub-image2-image',
      modelAlias: video ? 'minimax-h3' : 'image2',
      vendorKey: 'runninghub',
      labelZh: video ? 'MiniMax H3 视频' : 'Image2 作图',
      kind: video ? 'video' : 'image',
      enabled: true,
      pricing: {cost: 0, enabled: enabled, specCosts: []},
      meta: {transportTaskKind: video ? 'text_to_video' : 'text_to_image'}
    };
  }

  async function providerStatus() {
    var response = await api('/api/canvas/provider-status');
    return response.providerStatus || {};
  }

  var catalogState = {vendors: [], models: []};

  function catalogForStatus(status) {
    var vendors = [
      {
        key: 'runninghub',
        name: 'RunningHub',
        enabled: true,
        hasApiKey: status.credentialConfigured === true,
        authType: 'bearer',
        baseUrlHint: status.baseUrl || null
      },
      {
        key: 'asxs',
        name: 'ASXS',
        enabled: true,
        hasApiKey: status.text?.credentialConfigured === true,
        authType: 'bearer',
        baseUrlHint: status.text?.baseUrl || null
      }
    ];
    var models = [];
    if (status.credentialConfigured === true && status.imageSubmitEnabled === true) models.push(providerModel('image', status));
    if (status.credentialConfigured === true && status.videoSubmitEnabled === true) models.push(providerModel('video', status));
    if (status.text?.credentialConfigured === true && status.text?.modelConfigured === true && status.text?.submitEnabled === true) models.push(providerModel('text', status));
    return {vendors: vendors, models: models};
  }

  async function refreshCatalog() {
    var next = catalogForStatus(await providerStatus());
    catalogState = next;
    if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('nomi-model-catalog-changed'));
    return next;
  }

  async function health() {
    var status = await providerStatus();
    var textReady = status.text?.credentialConfigured === true
      && status.text?.modelConfigured === true
      && status.text?.submitEnabled === true;
    var imageReady = status.credentialConfigured === true
      && status.imageSubmitEnabled === true;
    var videoReady = status.credentialConfigured === true
      && status.videoSubmitEnabled === true;
    var enabledKinds = [textReady, imageReady, videoReady].filter(Boolean).length;
    return {
      byKind: [
        {kind: 'text', enabledModels: textReady ? 1 : 0},
        {kind: 'image', enabledModels: imageReady ? 1 : 0},
        {kind: 'video', enabledModels: videoReady ? 1 : 0}
      ],
      issues: enabledKinds > 0 ? [] : [{code: 'catalog_empty', severity: 'error'}]
    };
  }

  function listVendors() {
    return catalogState.vendors.slice();
  }

  function listModels(params) {
    var requested = String(params && params.kind || '').trim();
    return catalogState.models.filter(function (model) {
      return !requested || requested === model.kind || (requested === 'imageEdit' && model.kind === 'image') || (requested === 'chat' && model.kind === 'text');
    });
  }

  function assetIds(extras) {
    var values = [];
    if (Array.isArray(extras && extras.referenceImages)) values = values.concat(extras.referenceImages);
    ['firstFrameUrl', 'lastFrameUrl'].forEach(function (key) {
      if (extras && typeof extras[key] === 'string') values.push(extras[key]);
    });
    return Array.from(new Set(values.map(function (value) {
      var match = /\/assets\/(CAS-[A-Za-z0-9-]+)\/download/.exec(String(value || ''));
      return match ? match[1] : (/^CAS-/.test(String(value || '')) ? String(value) : '');
    }).filter(Boolean)));
  }

  function taskFromCanvasJob(job, project) {
    var type = job.nodeType === 'video' ? 'video' : 'image';
    var kind = type === 'video' ? 'text_to_video' : 'text_to_image';
    var assets = (job.outputAssetIds || []).map(function (assetId) {
      return {type: type, assetId: assetId, url: '/api/projects/' + encodeURIComponent(project) + '/assets/' + encodeURIComponent(assetId) + '/download'};
    });
    return {id: job.id, kind: kind, status: job.status === 'awaiting_authorization' ? 'queued' : job.status, assets: assets, raw: {jobId: job.id}, error: job.error || undefined};
  }

  function taskFromTextJob(job) {
    return {
      id: job.id,
      kind: 'chat',
      status: job.status,
      raw: job.raw || (job.text ? {choices: [{message: {role: 'assistant', content: job.text}}], model: job.model, object: 'chat.completion'} : {}),
      error: job.error || undefined
    };
  }

  async function grantSpend(payload) {
    var project = projectId();
    if (!project) throw new Error('请从念念项目中打开画布后再生成');
    var result = await api('/api/studio/spend-grants', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({projectId: project, projectKind: canvasProjectKind(), nodeIds: payload && payload.nodeIds || []})
    });
    return {grantId: result.grantId};
  }

  async function runTask(payload) {
    var request = payload && payload.request || {};
    var project = projectId();
    if (!project) throw new Error('请从念念项目中打开画布后再生成');
    var extras = request.extras || {};
    var nodeId = String(extras.nodeId || '').trim();
    if (!nodeId) throw new Error('画布节点尚未保存，请稍后重试');
    if (request.kind === 'chat') {
      var textPrepared = await api('/api/projects/' + encodeURIComponent(project) + '/text/jobs', {
        method: 'POST',
        headers: {'content-type': 'application/json', 'idempotency-key': extras.idempotencyKey || idempotency('nomi-text')},
        body: JSON.stringify({
          projectKind: canvasProjectKind(),
          nodeId: nodeId,
          model: extras.modelKey || extras.modelAlias || '',
          prompt: request.prompt || ''
        })
      });
      if (!textPrepared.job) throw new Error('服务器没有返回文本任务');
      return taskFromTextJob(textPrepared.job);
    }
    var video = request.kind === 'text_to_video' || request.kind === 'image_to_video';
    var prepared = await api('/api/projects/' + encodeURIComponent(project) + '/canvas/jobs', {
      method: 'POST',
      headers: {'content-type': 'application/json', 'idempotency-key': extras.idempotencyKey || idempotency('nomi-canvas')},
      body: JSON.stringify({
        projectKind: canvasProjectKind(),
        nodeId: nodeId,
        model: video ? 'h3' : 'image2',
        prompt: request.prompt || '',
        inputAssetIds: assetIds(extras),
        resolution: extras.resolution || '2k',
        aspectRatio: extras.aspectRatio || '1:1',
        durationSeconds: extras.durationSeconds || 5
      })
    });
    var job = prepared.job;
    if (!job) throw new Error('服务器没有返回画布任务');
    var authorized = await api('/api/projects/' + encodeURIComponent(project) + '/canvas/jobs/' + encodeURIComponent(job.id) + '/authorize', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({projectKind: canvasProjectKind(), confirmProviderSpend: true})
    });
    return taskFromCanvasJob(authorized.job || job, project);
  }

  async function result(payload) {
    var project = projectId();
    if (payload && (payload.taskKind === 'chat' || payload.kind === 'chat')) {
      var textResponse = await api('/api/projects/' + encodeURIComponent(project) + '/text/jobs/' + encodeURIComponent(payload.taskId) + '?projectKind=' + encodeURIComponent(canvasProjectKind()));
      return {vendor: 'asxs', result: taskFromTextJob(textResponse.job)};
    }
    var response = await api('/api/projects/' + encodeURIComponent(project) + '/canvas/jobs/' + encodeURIComponent(payload.taskId) + '?projectKind=' + encodeURIComponent(canvasProjectKind()));
    return {vendor: 'runninghub', result: taskFromCanvasJob(response.job, project)};
  }

  window.nomiDesktop = {
    platform: 'web',
    modelCatalog: {listVendors: listVendors, listModels: listModels, health: health, listMappings: async function () { return []; }},
    tasks: {run: runTask, result: result, grantSpend: grantSpend},
    agents: {},
    window: {},
    app: {}
  };
  refreshCatalog().catch(function () {
    catalogState = {vendors: [], models: []};
  });
}());
