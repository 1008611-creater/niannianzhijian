(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var activeProject = null;
  var objectUrl = '';

  function projectsApi() {
    return window.nomiDesktop && window.nomiDesktop.projects;
  }

  function projectName(card) {
    var candidates = card.querySelectorAll('div');
    for (var i = candidates.length - 1; i >= 0; i -= 1) {
      var node = candidates[i];
      if (node.children.length === 0 && /text-body-sm/.test(node.className || '')) return String(node.textContent || '').trim();
    }
    return '';
  }

  function installStyles() {
    if (document.getElementById('niannian-project-library-management-style')) return;
    var style = document.createElement('style');
    style.id = 'niannian-project-library-management-style';
    style.textContent = [
      '.niannian-project-edit{position:absolute;top:9px;left:9px;z-index:4;display:grid;place-items:center;width:32px;height:32px;padding:0;border:1px solid rgba(42,33,24,.14);border-radius:6px;background:rgba(255,253,249,.94);box-shadow:0 2px 8px rgba(42,33,24,.08);color:#594737;cursor:pointer;font:600 17px/1 Inter,system-ui,sans-serif;opacity:.78;transition:opacity 150ms,background 150ms,color 150ms}',
      '[data-project-card]:hover .niannian-project-edit,.niannian-project-edit:focus-visible{opacity:1}.niannian-project-edit:hover{background:#2a2118;color:#fff}.niannian-project-edit:focus-visible{outline:2px solid #426f83;outline-offset:2px}',
      '[data-project-card=true]>.aspect-video[data-niannian-cover-presentation=thumbnail]{position:relative!important;display:block!important;background:#f4f1ec;isolation:isolate}',
      '[data-project-card=true]>.aspect-video[data-niannian-cover-presentation=thumbnail]>img{position:absolute!important;inset:50% auto auto 50%!important;transform:translate(-50%,-50%)!important;display:block!important;width:clamp(84px,48%,112px)!important;height:clamp(58px,64%,78px)!important;max-width:calc(100% - 28px);max-height:calc(100% - 20px);object-fit:contain!important;border-radius:5px;background:#ebe7e0;box-shadow:0 5px 16px rgba(42,33,24,.14)}',
      '[data-project-card=true]>.aspect-video[data-niannian-cover-presentation=thumbnail]>[data-niannian-cover-fallback=video]{position:absolute!important;inset:50% auto auto 50%!important;transform:translate(-50%,-50%)!important;display:grid!important;place-items:center;width:92px!important;height:66px!important;border:1px solid rgba(42,33,24,.12);border-radius:5px;background:#ebe7e0;color:#796c5d;font:600 12px/1 Inter,system-ui,sans-serif;box-shadow:0 5px 16px rgba(42,33,24,.08)}',
      '[data-project-card=true]>.aspect-video[data-niannian-cover-presentation=thumbnail]>[data-niannian-cover-fallback=video]::before{content:"视频素材"}',
      '.niannian-cover-switch{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:space-between;padding:0 7px;pointer-events:none}.niannian-cover-switch button{pointer-events:auto;display:grid;place-items:center;width:26px;height:32px;padding:0;border:1px solid rgba(42,33,24,.14);border-radius:5px;background:rgba(255,253,249,.9);box-shadow:0 2px 7px rgba(42,33,24,.1);color:#594737;cursor:pointer;font:600 20px/1 system-ui}.niannian-cover-switch button:hover{background:#2a2118;color:#fff}.niannian-cover-switch button:focus-visible{outline:2px solid #426f83;outline-offset:2px}.niannian-cover-switch span{position:absolute;left:50%;bottom:7px;transform:translateX(-50%);padding:2px 6px;border-radius:999px;background:rgba(42,33,24,.68);color:#fff;font:600 11px/1 system-ui;pointer-events:none}',
      '#niannian-project-editor{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:18px;background:rgba(42,33,24,.28);font:13px/1.45 Inter,system-ui,sans-serif;color:#2a2118}',
      '#niannian-project-editor[hidden]{display:none}#niannian-project-editor form{width:min(460px,calc(100vw - 28px));padding:20px;border:1px solid rgba(42,33,24,.15);border-radius:8px;background:#fffdf9;box-shadow:0 24px 70px rgba(42,33,24,.22)}',
      '#niannian-project-editor header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}#niannian-project-editor h2{margin:0;font:500 20px/1.2 Georgia,"Songti SC",serif}#niannian-project-editor [data-project-editor-close]{width:30px;height:30px;padding:0;border:0;border-radius:6px;background:transparent;color:#6f6256;cursor:pointer;font-size:20px}',
      '#niannian-project-editor label{display:grid;gap:7px;margin-top:14px;color:#6f6256;font-size:12px}#niannian-project-editor input[type=text]{height:38px;padding:0 11px;border:1px solid rgba(42,33,24,.18);border-radius:6px;background:#fff;color:#2a2118;font:500 14px Inter,system-ui,sans-serif}',
      '#niannian-project-editor fieldset{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:15px 0 0;padding:0;border:0}#niannian-project-editor fieldset label{display:flex;align-items:center;gap:7px;margin:0;padding:10px;border:1px solid rgba(42,33,24,.14);border-radius:6px;background:#faf7f2;color:#493a2d;cursor:pointer}',
      '#niannian-project-cover-preview{position:relative;aspect-ratio:16/9;margin-top:12px;overflow:hidden;border:1px solid rgba(42,33,24,.12);border-radius:6px;background:#f2eee7;display:grid;place-items:center;color:#8a7c6d}#niannian-project-cover-preview img{width:100%;height:100%;display:block;object-fit:contain;background:#f2eee7}#niannian-project-cover-preview [data-cover-navigator]{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:0 12px;pointer-events:none}#niannian-project-cover-preview [data-cover-navigator][hidden]{display:none}#niannian-project-cover-preview [data-cover-navigator] button{pointer-events:auto;display:grid;place-items:center;width:34px;height:36px;padding:0;border:1px solid rgba(42,33,24,.15);border-radius:5px;background:rgba(255,253,249,.9);color:#493a2d;box-shadow:0 2px 8px rgba(42,33,24,.12);font:600 24px/1 system-ui;cursor:pointer}#niannian-project-cover-preview [data-cover-navigator] button:disabled{visibility:hidden}#niannian-project-cover-counter{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);padding:3px 7px;border-radius:999px;background:rgba(42,33,24,.7);color:#fff;font:600 11px/1 system-ui}',
      '#niannian-project-editor [data-custom-cover-row][hidden]{display:none}#niannian-project-editor input[type=file]{padding:9px;border:1px dashed rgba(42,33,24,.22);border-radius:6px;background:#faf7f2;color:#5e5145}',
      '#niannian-project-editor footer{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}#niannian-project-editor footer button{height:34px;padding:0 14px;border:1px solid rgba(42,33,24,.16);border-radius:6px;background:#fffdf9;color:#493a2d;cursor:pointer;font-weight:650}#niannian-project-editor footer button[type=submit]{border-color:#2a2118;background:#2a2118;color:#fff}#niannian-project-editor footer button[disabled]{opacity:.45;cursor:default}',
      '#niannian-project-editor [data-project-editor-error]{min-height:18px;margin:9px 0 0;color:#a33b2d;font-size:12px}@media(max-width:560px){#niannian-project-editor form{padding:16px}#niannian-project-editor fieldset{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(style);
  }

  function installDialog() {
    if (document.getElementById('niannian-project-editor')) return;
    var dialog = document.createElement('div');
    dialog.id = 'niannian-project-editor';
    dialog.hidden = true;
    dialog.innerHTML = '<form><header><h2>编辑项目</h2><button type="button" data-project-editor-close aria-label="关闭">×</button></header><label>项目名称<input type="text" name="projectName" maxlength="80" autocomplete="off" required></label><fieldset aria-label="项目封面"><label><input type="radio" name="coverMode" value="auto" checked>画布节点封面</label><label><input type="radio" name="coverMode" value="custom">自定义封面</label></fieldset><div id="niannian-project-cover-preview"><span>画布节点</span><div data-cover-navigator hidden><button type="button" data-cover-direction="-1" aria-label="上一张封面">‹</button><span id="niannian-project-cover-counter"></span><button type="button" data-cover-direction="1" aria-label="下一张封面">›</button></div></div><label data-custom-cover-row hidden>上传封面<input type="file" name="coverFile" accept="image/png,image/jpeg,image/webp"></label><p data-project-editor-error role="alert"></p><footer><button type="button" data-project-editor-close>取消</button><button type="submit">保存</button></footer></form>';
    document.body.appendChild(dialog);
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog || event.target.closest('[data-project-editor-close]')) closeDialog();
    });
    dialog.querySelectorAll('input[name=coverMode]').forEach(function (input) {
      input.addEventListener('change', updateCoverControls);
    });
    dialog.querySelectorAll('[data-cover-direction]').forEach(function (button) {
      button.addEventListener('click', function () { shiftDialogCover(Number(button.dataset.coverDirection || 0)); });
    });
    dialog.querySelector('input[name=coverFile]').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return updateCoverPreview();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      updateCoverPreview(objectUrl);
    });
    dialog.querySelector('form').addEventListener('submit', saveProject);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !dialog.hidden) closeDialog();
    });
  }

  function applyThumbnailPresentation(card, index) {
    var preview = card.querySelector(':scope > .aspect-video');
    if (!preview) return;
    preview.dataset.niannianCoverPresentation = 'thumbnail';
    var failedCover = preview.querySelector(':scope > [title^="图片加载失败"]');
    if (failedCover) {
      failedCover.dataset.niannianCoverFallback = 'video';
      failedCover.removeAttribute('title');
      failedCover.setAttribute('role', 'img');
      failedCover.setAttribute('aria-label', '视频素材封面');
      failedCover.textContent = '';
    }
    var image = preview.querySelector(':scope > img');
    if (!image) return;
    image.loading = index < 6 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.setAttribute('fetchpriority', index < 6 ? 'high' : 'low');
    image.alt = '项目封面缩略图';
  }

  function autoCoverUrl(project) {
    var urls = Array.isArray(project && project.autoThumbnailUrls) ? project.autoThumbnailUrls : [];
    if (!urls.length) return '';
    var index = Number.isInteger(Number(project.autoCoverIndex)) ? Number(project.autoCoverIndex) : 0;
    return urls[Math.max(0, Math.min(urls.length - 1, index))] || '';
  }

  function setCardCover(card, project, index) {
    var preview = card.querySelector(':scope > .aspect-video');
    if (!preview) return;
    var url = project.coverMode === 'custom' ? project.customCoverUrl : autoCoverUrl(project);
    var image = preview.querySelector(':scope > img');
    if (url && !image) {
      image = document.createElement('img');
      preview.appendChild(image);
    }
    if (url && image) {
      image.src = url;
      applyThumbnailPresentation(card, index);
    }
    var navigator = preview.querySelector('[data-card-cover-navigator]');
    var urls = project.coverMode === 'auto' && Array.isArray(project.autoThumbnailUrls) ? project.autoThumbnailUrls : [];
    if (urls.length < 2) { if (navigator) navigator.remove(); return; }
    if (!navigator) {
      navigator = document.createElement('div');
      navigator.className = 'niannian-cover-switch';
      navigator.dataset.cardCoverNavigator = 'true';
      navigator.innerHTML = '<button type="button" data-card-cover-direction="-1" aria-label="上一张项目封面">‹</button><span></span><button type="button" data-card-cover-direction="1" aria-label="下一张项目封面">›</button>';
      preview.appendChild(navigator);
      navigator.querySelectorAll('[data-card-cover-direction]').forEach(function (button) {
        button.addEventListener('click', async function (event) {
          event.preventDefault();
          event.stopPropagation();
          var currentUrls = project.coverMode === 'auto' && Array.isArray(project.autoThumbnailUrls) ? project.autoThumbnailUrls : [];
          if (currentUrls.length < 2) return;
          var before = Number(project.autoCoverIndex || 0);
          var next = (before + Number(button.dataset.cardCoverDirection || 0) + currentUrls.length) % currentUrls.length;
          project.autoCoverIndex = next;
          project.thumbnail = autoCoverUrl(project);
          setCardCover(card, project, index);
          try {
            var saved = await projectsApi().updateMetadata(project.id, {autoCoverIndex:next});
            if (saved) { project = saved; setCardCover(card, project, index); }
          } catch (_) {
            project.autoCoverIndex = before;
            setCardCover(card, project, index);
          }
        });
      });
    }
    navigator.querySelector('span').textContent = (Number(project.autoCoverIndex || 0) + 1) + ' / ' + urls.length;
  }

  async function hydrateCardCover(card, project, index) {
    setCardCover(card, project, index);
    var api = projectsApi();
    if (!api || typeof api.refreshCoverCandidates !== 'function') return;
    try { setCardCover(card, await api.refreshCoverCandidates(project.id), index); } catch (_) {}
  }

  function closeDialog() {
    var dialog = document.getElementById('niannian-project-editor');
    if (dialog) dialog.hidden = true;
    activeProject = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }

  function coverMode() {
    return document.querySelector('#niannian-project-editor input[name=coverMode]:checked').value;
  }

  function updateCoverControls() {
    var custom = coverMode() === 'custom';
    document.querySelector('#niannian-project-editor [data-custom-cover-row]').hidden = !custom;
    updateCoverPreview();
  }

  function updateCoverPreview(override) {
    var preview = document.getElementById('niannian-project-cover-preview');
    if (!preview || !activeProject) return;
    var mode = coverMode();
    var autoUrl = autoCoverUrl(activeProject);
    var url = override || (mode === 'custom' ? activeProject.customCoverUrl : autoUrl) || '';
    var image = preview.querySelector(':scope > img');
    var placeholder = preview.querySelector(':scope > span');
    if (url) {
      if (!image) { image = document.createElement('img'); image.alt = '项目封面预览'; preview.insertBefore(image, preview.firstChild); }
      image.src = url;
      if (placeholder) placeholder.remove();
    } else {
      if (image) image.remove();
      if (!placeholder) { placeholder = document.createElement('span'); preview.insertBefore(placeholder, preview.firstChild); }
      placeholder.textContent = mode === 'custom' ? '选择一张封面图片' : '暂无媒体节点，生成后自动显示';
    }
    var navigator = preview.querySelector('[data-cover-navigator]');
    var count = mode === 'auto' && Array.isArray(activeProject.autoThumbnailUrls) ? activeProject.autoThumbnailUrls.length : 0;
    navigator.hidden = count < 2;
    if (count >= 2) navigator.querySelector('#niannian-project-cover-counter').textContent = (Number(activeProject.autoCoverIndex || 0) + 1) + ' / ' + count;
  }

  function shiftDialogCover(delta) {
    if (!activeProject || coverMode() !== 'auto') return;
    var urls = Array.isArray(activeProject.autoThumbnailUrls) ? activeProject.autoThumbnailUrls : [];
    if (urls.length < 2) return;
    activeProject.autoCoverIndex = (Number(activeProject.autoCoverIndex || 0) + delta + urls.length) % urls.length;
    updateCoverPreview();
  }

  async function openDialog(id) {
    var api = projectsApi();
    var project = api && api.read(id);
    if (!project) return;
    if (typeof api.refreshCoverCandidates === 'function') {
      try { project = await api.refreshCoverCandidates(id); } catch (_) {}
    }
    activeProject = project;
    var dialog = document.getElementById('niannian-project-editor');
    dialog.querySelector('input[name=projectName]').value = project.name || '未命名项目';
    var mode = project.coverMode === 'custom' ? 'custom' : 'auto';
    dialog.querySelector('input[name=coverMode][value=' + mode + ']').checked = true;
    dialog.querySelector('input[name=coverFile]').value = '';
    dialog.querySelector('[data-project-editor-error]').textContent = '';
    dialog.hidden = false;
    updateCoverControls();
    dialog.querySelector('input[name=projectName]').focus();
  }

  async function saveProject(event) {
    event.preventDefault();
    if (!activeProject) return;
    var api = projectsApi();
    var form = event.currentTarget;
    var submit = form.querySelector('button[type=submit]');
    var error = form.querySelector('[data-project-editor-error]');
    var name = form.elements.projectName.value.trim();
    var mode = coverMode();
    var assetId = activeProject.customCoverAssetId || '';
    var customCoverUrl = activeProject.customCoverUrl || '';
    if (!name) { error.textContent = '请输入项目名称'; return; }
    submit.disabled = true;
    error.textContent = '';
    try {
      var file = form.elements.coverFile.files && form.elements.coverFile.files[0];
      if (mode === 'custom' && file) {
        var imported = await window.nomiDesktop.assets.importFile({projectId:activeProject.id,fileName:file.name,contentType:file.type,bytes:await file.arrayBuffer()});
        assetId = imported && imported.raw && imported.raw.asset && imported.raw.asset.id || imported.id;
        customCoverUrl = imported && imported.raw && imported.raw.asset && imported.raw.asset.downloadUrl || imported.data && imported.data.url || '';
      }
      if (mode === 'custom' && !assetId) throw new Error('请先选择一张自定义封面');
      await api.updateMetadata(activeProject.id, {name:name,coverMode:mode,coverAssetId:mode === 'custom' ? assetId : null,customCoverUrl:mode === 'custom' ? customCoverUrl : '',autoCoverIndex:mode === 'auto' ? activeProject.autoCoverIndex || 0 : undefined});
      window.location.reload();
    } catch (saveError) {
      error.textContent = saveError && saveError.message ? saveError.message : '项目信息保存失败';
      submit.disabled = false;
    }
  }

  function bindCards() {
    var api = projectsApi();
    var page = document.querySelector('.nomi-library-page');
    if (!api || typeof api.list !== 'function' || !page) return;
    installStyles();
    installDialog();
    var queues = new Map();
    api.list().forEach(function (project) {
      var key = String(project.name || '未命名项目');
      if (!queues.has(key)) queues.set(key, []);
      queues.get(key).push(project);
    });
    page.querySelectorAll('[data-project-card=true]').forEach(function (card, index) {
      applyThumbnailPresentation(card, index);
      if (card.querySelector('.niannian-project-edit')) return;
      var queue = queues.get(projectName(card)) || [];
      var project = queue.shift();
      if (!project) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'niannian-project-edit';
      button.dataset.projectEdit = project.id;
      button.setAttribute('aria-label', '编辑项目 ' + project.name);
      button.title = '重命名与封面';
      button.textContent = '✎';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openDialog(project.id);
      });
      card.querySelector('.aspect-video')?.appendChild(button);
      hydrateCardCover(card, project, index);
    });
  }

  var scheduled = false;
  function scheduleBind() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () { scheduled = false; bindCards(); });
  }
  new MutationObserver(scheduleBind).observe(document.documentElement, {subtree:true,childList:true});
  window.addEventListener('load', scheduleBind);
  scheduleBind();
}());
