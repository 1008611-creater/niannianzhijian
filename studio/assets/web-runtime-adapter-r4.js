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

  function providerModel(kind, status, imageChannel) {
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
    if (!video && imageChannel) {
      return {
        modelKey: imageChannel.id,
        modelAlias: 'gpt-image-2',
        vendorKey: imageChannel.provider,
        labelZh: imageChannel.label,
        kind: 'image',
        enabled: true,
        pricing: {cost: 0, enabled: imageChannel.submitEnabled === true, specCosts: []},
        meta: {
          transportTaskKind: 'image_edit',
          imageChannel: imageChannel.id,
          supportedResolutions: imageChannel.resolutions || [],
          supportedAspectRatios: imageChannel.aspectRatios || [],
          outputSizes: imageChannel.outputSizes || {}
        }
      };
    }
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
    (status.imageChannels || []).forEach(function (channel) {
      if (channel.provider === 'runninghub' || vendors.some(function (vendor) { return vendor.key === channel.provider; })) return;
      vendors.push({
        key: channel.provider,
        name: channel.provider === 'yunfei-1k' ? '云飞 Image2 1K' : '云飞 Image2 高清',
        enabled: true,
        hasApiKey: channel.submitEnabled === true,
        authType: 'bearer',
        baseUrlHint: null
      });
    });
    var models = [];
    (status.imageChannels || []).filter(function (channel) { return channel.submitEnabled === true; }).forEach(function (channel) {
      models.push(providerModel('image', status, channel));
    });
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
    var imageReady = Array.isArray(status.imageChannels)
      ? status.imageChannels.some(function (channel) { return channel.submitEnabled === true; })
      : status.credentialConfigured === true && status.imageSubmitEnabled === true;
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

  async function importProjectAsset(payload) {
    var input = payload && typeof payload === 'object' ? payload : {};
    var project = String(input.projectId || projectId()).trim();
    if (!project) throw new Error('请从念念项目中打开画布后再导入素材');
    var contentType = String(input.contentType || 'application/octet-stream').toLowerCase();
    var fieldName = contentType.startsWith('image/')
      ? 'referenceImage'
      : (contentType.startsWith('video/') ? 'referenceVideo' : (contentType.startsWith('audio/') ? 'referenceAudio' : ''));
    if (!fieldName) throw new Error('当前文件类型不能作为画布参考素材');
    var form = new FormData();
    form.append(fieldName, new Blob([input.bytes], {type: contentType}), String(input.fileName || 'reference-media'));
    var response = await api('/api/projects/' + encodeURIComponent(project) + '/assets', {
      method: 'POST',
      headers: {'x-niannian-project-kind': canvasProjectKind()},
      body: form
    });
    if (!response.asset || !response.asset.id || !response.asset.downloadUrl) throw new Error('服务器没有返回项目素材');
    return {
      id: response.asset.id,
      data: {url: response.asset.downloadUrl},
      raw: {asset: response.asset, idempotent: response.idempotent === true}
    };
  }

  function browserAssetFromProjectAsset(asset, fallbackProjectId) {
    if (!asset || typeof asset !== 'object' || !asset.id) return null;
    var assetProjectId = String(asset.projectId || fallbackProjectId || '').trim();
    if (!assetProjectId) return null;
    var contentType = String(asset.mimeType || '').toLowerCase();
    var mediaType = contentType.startsWith('image/')
      ? 'image'
      : (contentType.startsWith('video/') ? 'video' : (contentType.startsWith('audio/') ? 'audio' : ''));
    if (!mediaType) return null;
    return {
      id: String(asset.id),
      projectId: assetProjectId,
      name: String(asset.originalName || asset.id),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      data: {
        mediaType: mediaType,
        contentType: contentType,
        kind: String(asset.kind || 'project-asset'),
        title: String(asset.originalName || ''),
        relativePath: 'project-assets/' + String(asset.id),
        url: String(asset.downloadUrl || '')
      }
    };
  }

  async function listProjectAssets(payload) {
    var input = payload && typeof payload === 'object' ? payload : {};
    var project = String(input.projectId || projectId()).trim();
    if (!project) return {items: [], cursor: null};
    var response = await api('/api/projects/' + encodeURIComponent(project) + '/assets', {
      headers: {'x-niannian-project-kind': canvasProjectKind()}
    });
    var items = Array.isArray(response.assets)
      ? response.assets.map(function (asset) { return browserAssetFromProjectAsset(asset, project); }).filter(Boolean)
      : [];
    return {items: items, cursor: null};
  }

  function taskFromCanvasJob(job, project) {
    var type = job.nodeType === 'video' ? 'video' : 'image';
    var kind = type === 'video' ? 'text_to_video' : 'text_to_image';
    var assets = (job.outputAssetIds || []).map(function (assetId) {
      return {type: type, assetId: assetId, url: '/api/projects/' + encodeURIComponent(project) + '/assets/' + encodeURIComponent(assetId) + '/download'};
    });
    return {id: job.id, kind: kind, status: job.status === 'awaiting_authorization' ? 'queued' : job.status, assets: assets, raw: {jobId: job.id, imageChannel: job.imageChannel || null, outputSize: job.outputSize || null, aspectRatio: job.aspectRatio || null}, error: job.error || undefined};
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

  var webProjectsStorageKey = 'niannian-web-projects-v1';
  function readWebProjects() {
    try {
      var stored = window.localStorage.getItem(webProjectsStorageKey);
      var parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  function writeWebProjects(projects) {
    try { window.localStorage.setItem(webProjectsStorageKey, JSON.stringify(projects.slice(0, 100))); } catch (_) {}
  }
  function newWebProjectId() {
    var suffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : String(Date.now()) + Math.random().toString(16).slice(2);
    return 'NN-web-' + suffix.slice(0, 64);
  }
  var webProjects = readWebProjects();
  function projectSummary(record) {
    return {
      id: record.id,
      name: record.name || '未命名项目',
      createdAt: record.createdAt || Date.now(),
      updatedAt: record.updatedAt || record.createdAt || Date.now(),
      revision: Number(record.revision || 0),
      savedAt: record.savedAt || record.updatedAt || record.createdAt || Date.now(),
      canvasOnly: true
    };
  }
  var projectsApi = {
    list: function () {
      var listed = webProjects.slice().sort(function (a, b) { return Number(b.updatedAt || 0) - Number(a.updatedAt || 0); });
      var currentProjectId = projectId();
      if (currentProjectId && !listed.some(function (item) { return item.id === currentProjectId; })) {
        listed.unshift({id: currentProjectId, name: '未命名项目', canvasOnly: true});
      }
      return listed;
    },
    create: function (record) {
      var now = Date.now();
      var created = Object.assign({}, record || {}, {id: newWebProjectId(), createdAt: now, updatedAt: now, revision: 0, savedAt: now, canvasOnly: true});
      webProjects = [projectSummary(created)].concat(webProjects.filter(function (item) { return item.id !== created.id; }));
      writeWebProjects(webProjects);
      return created;
    },
    read: function (id) { return webProjects.find(function (item) { return item.id === id; }) || null; },
    save: function (id, record) {
      var next = projectSummary(Object.assign({}, record || {}, {id: id, updatedAt: Date.now()}));
      webProjects = [next].concat(webProjects.filter(function (item) { return item.id !== id; }));
      writeWebProjects(webProjects);
      return record;
    },
    delete: function (id) {
      webProjects = webProjects.filter(function (item) { return item.id !== id; });
      writeWebProjects(webProjects);
    }
  };

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

  // The Studio text runtime expects a stream-shaped bridge. The server currently
  // completes text jobs synchronously, but keeping the small in-memory stream
  // registry lets the browser use the same contract if a job remains running.
  var textStreams = new Map();
  var textStreamPollMs = 800;

  async function runTextStream(payload) {
    var envelope = payload && typeof payload === 'object' ? payload : {};
    var request = envelope.request && typeof envelope.request === 'object' ? envelope.request : {};
    var extras = request.extras && typeof request.extras === 'object' ? request.extras : {};
    var project = String(extras.projectId || projectId()).trim();
    if (!project) throw new Error('请从念念项目中打开画布后再生成');
    var nodeId = String(extras.nodeId || '').trim();
    if (!nodeId) throw new Error('画布节点尚未保存，请稍后重试');
    var response = await api('/api/projects/' + encodeURIComponent(project) + '/text/jobs', {
      method: 'POST',
      headers: {'content-type': 'application/json', 'idempotency-key': extras.idempotencyKey || idempotency('nomi-text')},
      body: JSON.stringify({
        projectKind: extras.projectKind || canvasProjectKind(),
        nodeId: nodeId,
        model: extras.modelKey || extras.modelAlias || request.model || envelope.vendor || '',
        prompt: request.prompt || ''
      })
    });
    if (!response.job) throw new Error('服务器没有返回文本任务');
    var streamId = String(response.job.id || '').trim();
    if (!streamId) throw new Error('服务器没有返回文本任务编号');
    textStreams.set(streamId, {
      project: project,
      projectKind: extras.projectKind || canvasProjectKind(),
      job: response.job,
      cancelled: false,
      timer: null
    });
    return {streamId: streamId};
  }

  function onTextEvent(streamId, callback) {
    var key = String(streamId || '').trim();
    var stream = textStreams.get(key);
    if (!stream || typeof callback !== 'function') return function () {};
    var stopped = false;
    var finish = function () {
      if (stream.timer) { clearTimeout(stream.timer); stream.timer = null; }
      textStreams.delete(key);
    };
    var poll = async function () {
      if (stopped || stream.cancelled) { finish(); return; }
      var job = stream.job;
      try {
        if (!job || !['succeeded', 'recoverable', 'failed'].includes(job.status)) {
          var result = await api('/api/projects/' + encodeURIComponent(stream.project) + '/text/jobs/' + encodeURIComponent(key)
            + '?projectKind=' + encodeURIComponent(stream.projectKind));
          job = result.job;
          stream.job = job;
        }
        if (stopped || stream.cancelled) { finish(); return; }
        if (job && job.status === 'succeeded') {
          callback({type: 'done', result: taskFromTextJob(job)});
          finish();
          return;
        }
        if (job && ['recoverable', 'failed'].includes(job.status)) {
          callback({type: 'error', message: job.error || '文本生成失败'});
          finish();
          return;
        }
        stream.timer = setTimeout(poll, textStreamPollMs);
      } catch (error) {
        if (stopped || stream.cancelled) { finish(); return; }
        callback({type: 'error', message: error instanceof Error && error.message ? error.message : '文本任务读取失败'});
        finish();
      }
    };
    poll();
    return function () {
      stopped = true;
      stream.cancelled = true;
      finish();
    };
  }

  function cancelTextStream(streamId) {
    var stream = textStreams.get(String(streamId || '').trim());
    if (!stream) return;
    stream.cancelled = true;
    if (stream.timer) clearTimeout(stream.timer);
    stream.timer = null;
    textStreams.delete(String(streamId || '').trim());
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
        model: video ? 'h3' : (extras.modelKey || extras.modelAlias || 'runninghub-gpt-image-2'),
        prompt: request.prompt || '',
        inputAssetIds: assetIds(extras),
        resolution: extras.resolution || '2k',
        aspectRatio: video
          ? (extras.aspectRatio && extras.aspectRatio !== '1:1' ? extras.aspectRatio : '9:16')
          : (extras.aspectRatio || '1:1'),
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
    return {vendor: response.job && response.job.imageChannel ? response.job.imageChannel : 'runninghub', result: taskFromCanvasJob(response.job, project)};
  }

  window.nomiDesktop = {
    platform: 'web',
    projects: projectsApi,
    assets: {importFile: importProjectAsset, list: listProjectAssets},
    modelCatalog: {listVendors: listVendors, listModels: listModels, health: health, listMappings: async function () { return []; }},
    tasks: {
      run: runTask,
      runTextStream: runTextStream,
      onTextEvent: onTextEvent,
      cancelTextStream: cancelTextStream,
      result: result,
      grantSpend: grantSpend
    },
    agents: {},
    window: {},
    app: {}
  };
  refreshCatalog().catch(function () {
    catalogState = {vendors: [], models: []};
  });
}());
