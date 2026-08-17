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

  // 批量拖入时限制并发，避免浏览器同时打开大量上传连接导致中途丢失；
  // 只对网络错误、限流和服务端暂时性错误重试，客户端校验错误立即返回。
  var assetUploadActive = 0;
  var assetUploadQueue = [];
  function enqueueAssetUpload(task) {
    return new Promise(function (resolve, reject) {
      assetUploadQueue.push({task: task, resolve: resolve, reject: reject});
      drainAssetUploadQueue();
    });
  }
  function drainAssetUploadQueue() {
    while (assetUploadActive < 2 && assetUploadQueue.length) {
      var item = assetUploadQueue.shift();
      assetUploadActive += 1;
      Promise.resolve().then(item.task).then(item.resolve, item.reject).finally(function () {
        assetUploadActive -= 1;
        drainAssetUploadQueue();
      });
    }
  }
  function isRetryableAssetUploadError(error) {
    var status = Number(error && error.status);
    return !status || status === 408 || status === 429 || status >= 500;
  }
  function waitBeforeAssetUploadRetry(attempt) {
    return new Promise(function (resolve) { setTimeout(resolve, attempt === 1 ? 250 : 750); });
  }
  async function uploadAssetWithRetry(path, init) {
    var lastError;
    for (var attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await api(path, init);
      } catch (error) {
        lastError = error;
        if (attempt >= 3 || !isRetryableAssetUploadError(error)) throw error;
        await waitBeforeAssetUploadRetry(attempt);
      }
    }
    throw lastError || new Error('项目素材上传失败');
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

  function providerAnimateModel(status, route) {
    var aiApp = route === 'ai-app';
    return {
      modelKey: aiApp ? 'runninghub-animate-ai-app' : 'runninghub-animate-motion-transfer',
      modelAlias: aiApp ? 'runninghub-animate-ai-app' : 'runninghub-animate-motion-transfer',
      vendorKey: 'runninghub',
      labelZh: aiApp ? '动作迁移（AI 应用）' : '动作迁移（工作流）',
      kind: 'video',
      enabled: true,
      pricing: {cost: 0, enabled: status.animateSubmitEnabled === true, specCosts: []},
      meta: {transportTaskKind: 'image_to_video', archetype: {id: 'happyhorse', modeId: 'edit'}}
    };
  }

  async function providerStatus() {
    var response = await api('/api/canvas/provider-status');
    return response.providerStatus || {};
  }

  var catalogState = {vendors: [], models: []};

  function catalogForStatus(status) {
    // Server model catalog is the only browser-facing configuration surface.
    // It contains enabled models and prices, never provider URLs or credentials.
    if (status.modelCatalog && Array.isArray(status.modelCatalog.models)) {
      var catalogModels = status.modelCatalog.models.filter(function (item) { return item && item.enabled !== false; });
      var catalogVendors = [];
      var catalogModelsPublic = catalogModels.map(function (item) {
        // The node stores providerKey, while providerLabel is display-only and may be non-ASCII.
        // Keep the server key so model selection and generation preflight address the same vendor.
        var providerKey = typeof item.providerKey === 'string' ? item.providerKey.trim() : '';
        var vendorKey = providerKey || String(item.providerLabel || 'server').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'server';
        if (!catalogVendors.some(function (vendor) { return vendor.key === vendorKey; })) catalogVendors.push({key: vendorKey, name: item.providerLabel || '已接入模型', enabled: true, authType: 'none', hasApiKey: true});
        return {
          modelKey: item.id,
          modelAlias: item.id,
          vendorKey: vendorKey,
          labelZh: item.label || item.id,
          kind: item.kind,
          enabled: true,
          pricing: {cost: Number(item.priceCredits || 0), enabled: true, specCosts: []},
          meta: {
            transportTaskKind: item.kind === 'video' ? 'text_to_video' : 'image_edit',
            supportedResolutions: item.resolutions || [],
            supportedAspectRatios: item.aspectRatios || [],
            outputSizes: item.outputSizes || {},
            ...(item.kind === 'video' ? {
              videoOptions: {
                sizeOptions: (item.aspectRatios || []).map(function (value) { return {value: String(value), label: String(value)}; }),
                resolutionOptions: (item.resolutions || []).map(function (value) { return {value: String(value), label: String(value).toUpperCase()}; }),
                defaultSize: item.aspectRatios?.[0],
                defaultResolution: item.resolutions?.[0],
                controls: [
                  {key: 'aspect_ratio', label: '比例', binding: 'size', optionSource: 'sizeOptions'},
                  {key: 'resolution', label: '大小', binding: 'resolution', optionSource: 'resolutionOptions'}
                ]
              }
            } : {
              imageOptions: {
                aspectRatioOptions: (item.aspectRatios || []).map(function (value) { return {value: String(value), label: String(value)}; }),
                imageSizeOptions: Object.entries(item.outputSizes || {}).map(function (entry) { return {value: String(entry[1]), label: String(entry[1]) + '（' + String(entry[0]).toUpperCase() + '）'}; }),
                resolutionOptions: (item.resolutions || []).map(function (value) { return {value: String(value), label: String(value).toUpperCase()}; }),
                defaultAspectRatio: item.aspectRatios?.[0],
                defaultImageSize: Object.values(item.outputSizes || {})[0],
                defaultResolution: item.resolutions?.[0],
                controls: [
                  {key: 'aspect_ratio', label: '比例', binding: 'aspectRatio', optionSource: 'aspectRatioOptions'},
                  {key: 'outputSize', label: '大小', binding: 'imageSize', optionSource: 'imageSizeOptions'},
                  {key: 'resolution', label: '清晰度', binding: 'resolution', optionSource: 'resolutionOptions'}
                ]
              }
            })
          }
        };
      });
      if (status.text && status.text.submitEnabled === true && status.text.modelConfigured === true) {
        catalogModelsPublic.push(providerModel('text', status));
        if (!catalogVendors.some(function (vendor) { return vendor.key === 'asxs'; })) catalogVendors.push({key: 'asxs', name: 'ASXS'});
      }
      return {vendors: catalogVendors, models: catalogModelsPublic};
    }
    var vendors = [
      {
        key: 'runninghub',
        name: 'RunningHub',
        enabled: true,
        hasApiKey: status.credentialConfigured === true || status.animateSubmitEnabled === true,
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
    if (status.animateSubmitEnabled === true) {
      models.push(providerAnimateModel(status, 'workflow'));
      models.push(providerAnimateModel(status, 'ai-app'));
    }
    if (status.text?.credentialConfigured === true && status.text?.modelConfigured === true && status.text?.submitEnabled === true) models.push(providerModel('text', status));
    return {vendors: vendors, models: models};
  }

  var catalogRefreshPromise = null;

  function waitForCatalogRetry(delay) {
    return new Promise(function (resolve) { setTimeout(resolve, delay); });
  }

  async function refreshCatalog() {
    if (catalogRefreshPromise) return catalogRefreshPromise;
    catalogRefreshPromise = (async function () {
      var lastError = null;
      for (var attempt = 0; attempt < 3; attempt += 1) {
        try {
          var next = catalogForStatus(await providerStatus());
          if (next.models.length > 0 || attempt === 2) {
            catalogState = next;
            if (typeof window.dispatchEvent === 'function') {
              window.dispatchEvent(new CustomEvent('nomi-model-catalog-changed'));
              window.dispatchEvent(new CustomEvent('nomi-models-refresh'));
            }
            return next;
          }
        } catch (error) {
          lastError = error;
          if (attempt === 2) throw error;
        }
        await waitForCatalogRetry(300 * (attempt + 1));
      }
      throw lastError || new Error('model_catalog_refresh_failed');
    }()).finally(function () { catalogRefreshPromise = null; });
    return catalogRefreshPromise;
  }

  async function health() {
    var status = await providerStatus();
    var textReady = status.text?.credentialConfigured === true
      && status.text?.modelConfigured === true
      && status.text?.submitEnabled === true;
    var imageReady = Array.isArray(status.imageChannels)
      ? status.imageChannels.some(function (channel) { return channel.submitEnabled === true; })
      : status.credentialConfigured === true && status.imageSubmitEnabled === true;
    var videoReady = (status.credentialConfigured === true && status.videoSubmitEnabled === true)
      || status.animateSubmitEnabled === true;
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

  async function listVendors() {
    if (!catalogState.models.length) await refreshCatalog();
    return catalogState.vendors.slice();
  }

  async function listModels(params) {
    if (!catalogState.models.length) await refreshCatalog();
    var requested = String(params && params.kind || '').trim();
    return catalogState.models.filter(function (model) {
      return !requested || requested === model.kind || (requested === 'imageEdit' && model.kind === 'image') || (requested === 'chat' && model.kind === 'text');
    });
  }

  function assetId(value) {
    var normalized = String(value || '');
    var match = /\/assets\/(CAS-[A-Za-z0-9-]+)\/download/.exec(normalized);
    return match ? match[1] : (/^CAS-/.test(normalized) ? normalized : '');
  }

  function uniqueAssetIds(values) {
    return Array.from(new Set(values.map(assetId).filter(Boolean)));
  }

  function assetIds(extras) {
    var values = [];
    if (Array.isArray(extras && extras.referenceImages)) values = values.concat(extras.referenceImages);
    ['firstFrameUrl', 'lastFrameUrl'].forEach(function (key) {
      if (extras && typeof extras[key] === 'string') values.push(extras[key]);
    });
    return uniqueAssetIds(values);
  }

  function isAnimateTransfer(extras) {
    return [extras && extras.modelKey, extras && extras.modelAlias].some(function (value) {
      return ['runninghub-animate-motion-transfer','runninghub-animate-ai-app'].includes(String(value || '').trim().toLowerCase());
    });
  }

  function animateModel(extras) {
    var values = [extras && extras.modelKey, extras && extras.modelAlias].map(function (value) { return String(value || '').trim().toLowerCase(); });
    return values.includes('runninghub-animate-ai-app') ? 'runninghub-animate-ai-app' : 'runninghub-animate-motion-transfer';
  }

  function animateAssetIds(extras) {
    var imageValues = Array.isArray(extras && extras.referenceImages) ? extras.referenceImages.slice() : [];
    ['firstFrameUrl', 'lastFrameUrl'].forEach(function (key) {
      if (extras && typeof extras[key] === 'string') imageValues.push(extras[key]);
    });
    var videoValues = Array.isArray(extras && extras.referenceVideos) ? extras.referenceVideos.slice() : [];
    ['sourceVideoUrl', 'relayFromVideoUrl'].forEach(function (key) {
      if (extras && typeof extras[key] === 'string') videoValues.push(extras[key]);
    });
    var archetypeInput = extras && extras.archetypeInput;
    if (archetypeInput && typeof archetypeInput === 'object') {
      if (typeof archetypeInput.reference_image === 'string') imageValues.push(archetypeInput.reference_image);
      if (Array.isArray(archetypeInput.reference_image)) imageValues = imageValues.concat(archetypeInput.reference_image);
      if (typeof archetypeInput.video_url === 'string') videoValues.push(archetypeInput.video_url);
      if (Array.isArray(archetypeInput.video_url)) videoValues = videoValues.concat(archetypeInput.video_url);
    }
    var imageId = uniqueAssetIds(imageValues)[0];
    var videoId = uniqueAssetIds(videoValues)[0];
    if (!imageId || !videoId) throw new Error('动作迁移需要同一项目中的 1 张图片和 1 个视频');
    return [imageId, videoId];
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
    var response = await enqueueAssetUpload(function () {
      return uploadAssetWithRetry('/api/projects/' + encodeURIComponent(project) + '/assets', {
        method: 'POST',
        headers: {'x-niannian-project-kind': canvasProjectKind()},
        body: form
      });
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

  async function downloadProjectAsset(payload) {
    var input = payload && typeof payload === 'object' ? payload : {};
    var requestedUrl = String(input.url || '').trim();
    if (!requestedUrl) throw new Error('没有可下载的素材地址');
    var locationHref = String(window.location && window.location.href || 'http://localhost/');
    var resolvedUrl;
    try {
      resolvedUrl = new URL(requestedUrl, locationHref);
    } catch (_) {
      throw new Error('素材下载地址无效');
    }
    if (!/^https?:$/.test(resolvedUrl.protocol)) throw new Error('素材下载地址无效');
    if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') {
      throw new Error('当前环境不支持下载素材');
    }
    var suggestedName = String(input.suggestedName || 'niannian-asset').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 180) || 'niannian-asset';
    var anchor = document.createElement('a');
    anchor.href = resolvedUrl.href;
    anchor.download = suggestedName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try {
      anchor.click();
      return {ok: true, canceled: false};
    } finally {
      if (anchor.parentNode === document.body) document.body.removeChild(anchor);
    }
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
  function projectThumbnailUrl(value) {
    return String(value || '').replace(/(\/api\/projects\/[^/]+\/assets\/CAS-[A-Za-z0-9-]+)\/download(?:\?[^#]*)?$/, '$1/thumbnail');
  }
  function projectThumbnailUrls(record) {
    var values = Array.isArray(record && record.thumbnailUrls) ? record.thumbnailUrls.slice() : [];
    if (!values.length && record && typeof record.thumbnail === 'string') values.push(record.thumbnail);
    return Array.from(new Set(values.filter(function (value) { return typeof value === 'string' && value.length > 4; }).map(projectThumbnailUrl))).slice(0, 5);
  }
  function projectAutoCoverIndex(value, count) {
    var index = Number.isInteger(Number(value)) ? Number(value) : 0;
    return Math.max(0, Math.min(Math.max(0, count - 1), index));
  }
  function projectSummary(record, previous) {
    var prior = previous && typeof previous === 'object' ? previous : {};
    var incomingUrls = projectThumbnailUrls(record);
    var coverMode = record && ['auto','custom'].includes(record.coverMode) ? record.coverMode : (prior.coverMode || 'auto');
    var customCoverUrl = projectThumbnailUrl(String(record && record.customCoverUrl || prior.customCoverUrl || '').trim());
    var customCoverAssetId = String(record && record.customCoverAssetId || prior.customCoverAssetId || '').trim();
    var autoThumbnailUrls = incomingUrls.length && !(coverMode === 'custom' && incomingUrls[0] === customCoverUrl)
      ? incomingUrls
      : projectThumbnailUrls({thumbnailUrls:prior.autoThumbnailUrls});
    var autoCoverIndex = projectAutoCoverIndex(record && record.autoCoverIndex !== undefined ? record.autoCoverIndex : prior.autoCoverIndex, autoThumbnailUrls.length);
    var visibleUrls = coverMode === 'custom' && customCoverUrl ? [customCoverUrl] : autoThumbnailUrls;
    var selectedThumbnail = coverMode === 'custom' && customCoverUrl ? customCoverUrl : (autoThumbnailUrls[autoCoverIndex] || undefined);
    return {
      id: record.id,
      name: record.name || '未命名项目',
      createdAt: record.createdAt || Date.now(),
      updatedAt: record.updatedAt || record.createdAt || Date.now(),
      revision: Number(record.revision || 0),
      savedAt: record.savedAt || record.updatedAt || record.createdAt || Date.now(),
      canvasOnly: true,
      projectKind: record.projectKind || prior.projectKind || canvasProjectKind(),
      coverMode: coverMode,
      customCoverUrl: customCoverUrl || undefined,
      customCoverAssetId: customCoverAssetId || undefined,
      autoThumbnailUrls: autoThumbnailUrls,
      autoCoverIndex: autoCoverIndex,
      thumbnailUrls: visibleUrls,
      thumbnail: selectedThumbnail,
      thumbStyle: record.thumbStyle || prior.thumbStyle || undefined,
      metadataSynced: prior.metadataSynced === true
    };
  }
  webProjects = webProjects.map(function (record) { return projectSummary(record, record); });
  writeWebProjects(webProjects);
  function projectMetadataPayload(record) {
    return {
      name: record.name,
      coverMode: record.coverMode || 'auto',
      coverAssetId: record.coverMode === 'custom' ? record.customCoverAssetId : null,
      autoCoverIndex: record.coverMode === 'auto' ? record.autoCoverIndex || 0 : undefined
    };
  }
  function projectMetadataSignature(record) {
    return JSON.stringify(projectMetadataPayload(record));
  }
  async function persistProjectMetadata(record) {
    var response = await api('/api/studio/projects/' + encodeURIComponent(record.id), {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(projectMetadataPayload(record))
    });
    return response.project || null;
  }
  async function refreshProjectCoverCandidates(id) {
    var previous = webProjects.find(function (item) { return item.id === id; });
    if (!previous) throw new Error('项目不存在或尚未载入');
    // A newly created browser project can be rendered before its first canvas save
    // reaches the server. Keep its local preview and wait for the next normal refresh.
    if (previous.metadataSynced !== true) return previous;
    var response = await api('/api/studio/projects/' + encodeURIComponent(id));
    var remote = response && response.project || {};
    var cover = remote.cover && typeof remote.cover === 'object' ? remote.cover : {};
    var urls = Array.isArray(cover.candidates) ? cover.candidates.map(function (item) { return item && item.thumbnailUrl; }) : [];
    var next = projectSummary(Object.assign({}, previous, {
      name: remote.name || previous.name,
      coverMode: cover.mode || previous.coverMode,
      customCoverAssetId: cover.assetId || previous.customCoverAssetId,
      customCoverUrl: cover.imageUrl || previous.customCoverUrl,
      autoCoverIndex: cover.autoIndex === undefined ? previous.autoCoverIndex : cover.autoIndex,
      thumbnailUrls: urls.length ? urls : previous.autoThumbnailUrls,
      updatedAt: remote.updatedAt || previous.updatedAt
    }), previous);
    webProjects = [next].concat(webProjects.filter(function (item) { return item.id !== id; }));
    writeWebProjects(webProjects);
    return next;
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
      webProjects = [projectSummary(created, null)].concat(webProjects.filter(function (item) { return item.id !== created.id; }));
      writeWebProjects(webProjects);
      return created;
    },
    read: function (id) { return webProjects.find(function (item) { return item.id === id; }) || null; },
    save: function (id, record) {
      var previous = webProjects.find(function (item) { return item.id === id; }) || null;
      var next = projectSummary(Object.assign({}, record || {}, {id: id, updatedAt: Date.now()}), previous);
      webProjects = [next].concat(webProjects.filter(function (item) { return item.id !== id; }));
      writeWebProjects(webProjects);
      if (!previous || previous.metadataSynced !== true || projectMetadataSignature(previous) !== projectMetadataSignature(next)) {
        next.metadataSynced = false;
        writeWebProjects(webProjects);
        persistProjectMetadata(next).then(function () {
          var current = webProjects.find(function (item) { return item.id === id; });
          if (!current || projectMetadataSignature(current) !== projectMetadataSignature(next)) return;
          current.metadataSynced = true;
          writeWebProjects(webProjects);
        }).catch(function (error) {
          window.dispatchEvent(new CustomEvent('niannian-project-metadata-error', {detail:{projectId:id,message:error.message || '项目信息保存失败'}}));
        });
      }
      return record;
    },
    updateMetadata: async function (id, metadata) {
      var previous = webProjects.find(function (item) { return item.id === id; });
      if (!previous) throw new Error('项目不存在或尚未载入');
      var requested = metadata && typeof metadata === 'object' ? metadata : {};
      var candidate = projectSummary(Object.assign({}, previous, {
        id: id,
        name: requested.name === undefined ? previous.name : String(requested.name || '').trim(),
        coverMode: requested.coverMode === undefined ? previous.coverMode : requested.coverMode,
        customCoverUrl: requested.customCoverUrl === undefined ? previous.customCoverUrl : requested.customCoverUrl,
        customCoverAssetId: requested.coverAssetId === undefined ? previous.customCoverAssetId : requested.coverAssetId,
        autoCoverIndex: requested.autoCoverIndex === undefined ? previous.autoCoverIndex : requested.autoCoverIndex,
        updatedAt: Date.now()
      }), previous);
      var saved = await persistProjectMetadata(candidate);
      if (saved && saved.cover) {
        candidate.coverMode = saved.cover.mode || candidate.coverMode;
        candidate.customCoverAssetId = saved.cover.assetId || undefined;
        candidate.customCoverUrl = projectThumbnailUrl(saved.cover.imageUrl || '');
        if (Array.isArray(saved.cover.candidates) && saved.cover.candidates.length) candidate.autoThumbnailUrls = projectThumbnailUrls({thumbnailUrls:saved.cover.candidates.map(function (item) { return item && item.thumbnailUrl; })});
        candidate.autoCoverIndex = projectAutoCoverIndex(saved.cover.autoIndex, candidate.autoThumbnailUrls.length);
        candidate.thumbnailUrls = candidate.coverMode === 'custom' && candidate.customCoverUrl ? [candidate.customCoverUrl] : candidate.autoThumbnailUrls;
        candidate.thumbnail = candidate.coverMode === 'custom' ? candidate.customCoverUrl : candidate.autoThumbnailUrls[candidate.autoCoverIndex] || undefined;
      }
      candidate.metadataSynced = true;
      webProjects = [candidate].concat(webProjects.filter(function (item) { return item.id !== id; }));
      writeWebProjects(webProjects);
      return candidate;
    },
    refreshCoverCandidates: refreshProjectCoverCandidates,
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
    var animateTransfer = video && isAnimateTransfer(extras);
    var prepared = await api('/api/projects/' + encodeURIComponent(project) + '/canvas/jobs', {
      method: 'POST',
      headers: {'content-type': 'application/json', 'idempotency-key': extras.idempotencyKey || idempotency('nomi-canvas')},
      body: JSON.stringify({
        projectKind: canvasProjectKind(),
        nodeId: nodeId,
        model: animateTransfer ? animateModel(extras) : (video ? 'h3' : (extras.modelKey || extras.modelAlias || 'runninghub-gpt-image-2')),
        prompt: request.prompt || '',
        inputAssetIds: animateTransfer ? animateAssetIds(extras) : assetIds(extras),
        resolution: extras.resolution || '2k',
        outputSize: extras.outputSize || extras.imageSize || null,
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
    assets: {importFile: importProjectAsset, list: listProjectAssets, download: downloadProjectAsset},
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
  if (typeof window.addEventListener === 'function') {
    var refreshOnActivation = function () { refreshCatalog().catch(function () {}); };
    window.addEventListener('focus', refreshOnActivation);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refreshOnActivation();
      });
    }
  }
}());
