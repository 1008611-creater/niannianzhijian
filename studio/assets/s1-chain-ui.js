(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function projectId() {
    var sources = [window.location.search, String(window.location.hash || '').split('?')[1] || ''];
    for (var i = 0; i < sources.length; i += 1) {
      var value = new URLSearchParams(sources[i]).get('projectId');
      if (value) return value.trim();
    }
    return '';
  }

  function projectKind() {
    var sources = [window.location.search, String(window.location.hash || '').split('?')[1] || ''];
    for (var i = 0; i < sources.length; i += 1) {
      var value = new URLSearchParams(sources[i]).get('projectKind');
      if (value === 'script' || value === 'redraw') return value;
    }
    return 'redraw';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  async function api(path, init) {
    var response = await fetch(path, Object.assign({credentials: 'same-origin'}, init || {}));
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(body.error || '请求失败');
      error.status = response.status;
      error.code = body.code;
      throw error;
    }
    return {body: body, headers: response.headers};
  }

  function installStyles() {
    if (document.getElementById('s1-chain-ui-styles')) return;
    var style = document.createElement('style');
    style.id = 's1-chain-ui-styles';
    style.textContent = [
      '#s1-chain-canvas{position:absolute;inset:0;z-index:18;overflow:auto;padding:88px 28px 40px;color:#2a2118;font:13px/1.45 Inter,system-ui,sans-serif;pointer-events:none}',
      '#s1-chain-canvas[hidden]{display:none}#s1-chain-canvas .s1-chain-title{max-width:1080px;margin:0 auto 18px;padding:0 4px;color:#786958}#s1-chain-canvas .s1-eyebrow{font-size:10px;letter-spacing:.12em;color:#9a6a3c;font-weight:700}#s1-chain-canvas h2{margin:2px 0 0;color:#2a2118;font-size:18px;font-weight:750}',
      '#s1-chain-canvas .s1-chain-flow{position:relative;display:grid;grid-template-columns:repeat(4,minmax(230px,300px));gap:58px;align-items:start;justify-content:center;min-width:1160px;padding:0 24px 60px}',
      '#s1-chain-canvas .s1-edge{position:absolute;top:122px;height:2px;background:rgba(154,106,60,.48);width:76px;transform:translateX(-50%);pointer-events:none}#s1-chain-canvas .s1-edge.one{left:calc(33.333% + 4px)}#s1-chain-canvas .s1-edge.two{left:calc(66.666% - 4px)}#s1-chain-canvas .s1-node{position:relative;min-height:212px;padding:15px;border:1px solid rgba(90,64,42,.2);border-radius:14px;background:rgba(255,252,246,.97);box-shadow:0 16px 36px rgba(42,33,24,.13);pointer-events:auto}#s1-chain-canvas .s1-node[data-status=blocked]{border-color:rgba(154,106,60,.26)}#s1-chain-canvas .s1-node[data-status=ready]{border-color:#5b8d6b}#s1-chain-canvas .s1-node h3{margin:4px 0 5px;font-size:15px}#s1-chain-canvas .s1-node p{margin:0 0 12px;color:#786958;font-size:12px}',
      '#s1-chain-canvas .s1-meta{display:flex;justify-content:space-between;gap:8px;margin-bottom:10px;color:#8b7764;font-size:11px}#s1-chain-canvas .s1-status{margin-top:10px;padding:8px;border-radius:8px;background:#f4eee6;color:#5d4d3d;white-space:pre-wrap}#s1-chain-canvas .s1-status.error{background:#fff0ee;color:#a33b2d}#s1-chain-canvas .s1-assets{display:grid;gap:5px;margin:8px 0 10px}#s1-chain-canvas label.s1-asset{display:flex;gap:7px;align-items:center;padding:7px;border:1px solid rgba(90,64,42,.12);border-radius:8px;background:#fffaf3;cursor:pointer}#s1-chain-canvas .s1-asset-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#s1-chain-canvas .s1-row{display:flex;gap:7px;align-items:center;margin:7px 0}#s1-chain-canvas select{flex:1;min-width:0;padding:6px;border:1px solid rgba(90,64,42,.2);border-radius:7px;background:#fff}#s1-chain-canvas button{border:0;border-radius:7px;padding:7px 9px;background:#2a2118;color:#fff;cursor:pointer;font-weight:650;font-size:12px}#s1-chain-canvas button[disabled]{opacity:.45;cursor:default}#s1-chain-canvas .s1-secondary{background:#efe5d8;color:#4c3828}#s1-chain-canvas .s1-node small{color:#8b7764}#s1-chain-canvas .s1-contract{display:grid;gap:4px;margin:8px 0;color:#6d5c4a;font-size:11px}#s1-chain-canvas .s1-contract span{display:block;padding:5px 7px;border-radius:6px;background:#faf5ef}',
      '@media (max-width:900px){#s1-chain-canvas{padding:72px 14px 30px}#s1-chain-canvas .s1-chain-flow{justify-content:start;min-width:840px}}@media (max-width:600px){#s1-chain-canvas{padding-top:62px}#s1-chain-canvas .s1-chain-title{margin-bottom:12px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function mount() {
    if (document.getElementById('s1-chain-canvas')) return;
    var host = document.querySelector('[aria-label="AI 影像创作画布"]') || document.body;
    if (host !== document.body && getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var panel = document.createElement('section');
    panel.id = 's1-chain-canvas';
    panel.setAttribute('aria-label', 'S1 原片到时间线');
    panel.hidden = true;
    panel.innerHTML = '<div class="s1-chain-title"><div class="s1-eyebrow">S1 → S2 CANVAS CHAIN</div><h2>原片到关键帧</h2></div><div class="s1-chain-flow"><div class="s1-edge one"></div><div class="s1-edge two"></div><article class="s1-node" data-node="source" data-status="draft"><div class="s1-meta"><span>输入节点</span><small data-node-status>draft</small></div><h3>原片输入与权利确认</h3><p>上传原片，确认使用权并完成媒体预检。</p><div class="s1-contract"><span>输入：source_video · rights_declaration</span><span>输出：source_asset · preflight_report</span></div><div class="s1-assets" data-s1-assets><span>正在读取项目素材...</span></div><label class="s1-row"><input type="checkbox" data-s1-rights> 我确认拥有该原片的使用权</label><div class="s1-row"><span>媒体预检</span><select data-s1-preflight><option value="pending">未完成</option><option value="passed">已通过</option></select></div><div class="s1-row"><button type="button" data-s1-refresh class="s1-secondary">刷新素材</button><button type="button" data-s1-create disabled>创建节点链</button></div></article><article class="s1-node" data-node="step01" data-status="blocked"><div class="s1-meta"><span>Skill 节点 · mx-shortdrama-01</span><small data-node-status>blocked</small></div><h3>Step01 源片分析</h3><p>提取镜头、关键帧、对白、OCR 与证据清单。</p><div class="s1-contract"><span>输入：source_video</span><span>输出：evidence_manifest · shot_frames</span><span>参数：hq_full · 服务器证据门</span></div><div class="s1-status" data-s1-status>等待原片节点就绪。</div><div class="s1-row"><button type="button" data-s1-start disabled>开始 Step01 分析</button></div></article><article class="s1-node" data-node="step02" data-status="blocked"><div class="s1-meta"><span>Skill 节点 · mx-shortdrama-02</span><small data-node-status>blocked</small></div><h3>Step02 源片时间线</h3><p>只消费已验证的 Step01 证据，生成可确认时间线。</p><div class="s1-contract"><span>输入：evidence_manifest</span><span>输出：accepted_timeline</span><span>预览：时间线与镜头事实</span></div><div class="s1-status">等待 Step01 证据完成。</div></article><article class="s1-node" data-node="image2" data-status="draft"><div class="s1-meta"><span>Skill 节点 · image2-storyboard-video</span><small data-node-status>draft</small></div><h3>Image2 关键帧生成</h3><p>输入提示词和参考资产，生成可继续做视频的关键帧。</p><div class="s1-contract"><span>输入：prompt · reference_asset</span><span>输出：image_asset</span><span>结果：预览、尺寸、项目资产</span></div><div class="s1-assets" data-s2-assets><span>正在读取参考图...</span></div><label class="s1-row"><span>提示词</span><input data-s2-prompt placeholder="描述角色、场景和镜头" style="flex:1;min-width:0;padding:6px;border:1px solid rgba(90,64,42,.2);border-radius:7px"></label><div class="s1-row"><span>渠道</span><select data-s2-channel><option value="yunfei-gpt-image-2-1k">云飞 Image2 1K</option><option value="yunfei-gpt-image-2-hd">云飞 Image2 2K/4K</option><option value="runninghub-gpt-image-2">RunningHub Image2</option></select></div><div class="s1-row"><span>规格</span><select data-s2-resolution><option value="1k">1K</option><option value="2k">2K</option><option value="4k">4K</option></select><select data-s2-aspect><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option></select></div><div class="s1-contract"><span data-s2-output>输出尺寸将按渠道和比例校验</span></div><div class="s1-status" data-s2-status>未创建任务；先保存节点合同。</div><div class="s1-preview" data-s2-preview>结果预览：等待 Image2 产物</div><div class="s1-row"><button type="button" data-s2-create class="s1-secondary">保存 Image2 节点</button><button type="button" data-s2-dry disabled>准备任务</button></div></article></div>';
    host.appendChild(panel);
    installStyles();
    var assetsEl = panel.querySelector('[data-s1-assets]');
    var statusEl = panel.querySelector('[data-s1-status]');
    var nodesEl = panel.querySelector('.s1-chain-flow');
    var createBtn = panel.querySelector('[data-s1-create]');
    var startBtn = panel.querySelector('[data-s1-start]');
    var rightsEl = panel.querySelector('[data-s1-rights]');
    var preflightEl = panel.querySelector('[data-s1-preflight]');
    var image2Card = panel.querySelector('[data-node="image2"]');
    var image2Prompt = panel.querySelector('[data-s2-prompt]');
    var image2Channel = panel.querySelector('[data-s2-channel]');
    var image2Resolution = panel.querySelector('[data-s2-resolution]');
    var image2Aspect = panel.querySelector('[data-s2-aspect]');
    var image2Status = panel.querySelector('[data-s2-status]');
    var image2Output = panel.querySelector('[data-s2-output]');
    var image2Create = panel.querySelector('[data-s2-create]');
    var image2Dry = panel.querySelector('[data-s2-dry]');
    var image2AssetsEl = panel.querySelector('[data-s2-assets]');
    var image2PreviewEl = panel.querySelector('[data-s2-preview]');
    var image2JobId = null;
    var revision = 0;
    var assets = [];
    var chainReady = false;

    function setStatus(message, error) { statusEl.textContent = message; statusEl.classList.toggle('error', Boolean(error)); }
    function selectedIds() { return Array.prototype.slice.call(panel.querySelectorAll('input[data-s1-asset]:checked')).map(function (input) { return input.value; }); }
    function syncButton() { createBtn.disabled = selectedIds().length === 0 || !rightsEl.checked || preflightEl.value !== 'passed'; startBtn.disabled = !chainReady || selectedIds().length === 0 || !rightsEl.checked || preflightEl.value !== 'passed'; }
    function syncImage2Spec() {
      var channel = image2Channel.value; var resolution = image2Resolution.value; var aspect = image2Aspect.value;
      var valid = (channel === 'yunfei-gpt-image-2-1k' && resolution === '1k' && aspect === '1:1') || (channel === 'yunfei-gpt-image-2-hd' && (resolution === '2k' || resolution === '4k') && aspect === '16:9') || (channel === 'runninghub-gpt-image-2');
      image2Output.textContent = valid ? ((channel === 'yunfei-gpt-image-2-1k' ? '1024x1024' : channel === 'yunfei-gpt-image-2-hd' ? (resolution === '2k' ? '2048x1152' : '3840x2160') : '由 RunningHub 返回尺寸') + ' · 未授权不提交 Provider') : '当前渠道不支持该分辨率/比例组合';
      image2Create.disabled = !image2Prompt.value.trim() || !valid;
      image2Dry.disabled = image2Create.disabled;
    }
    function selectedImage2Ids() { return Array.prototype.slice.call(panel.querySelectorAll('input[data-s2-asset]:checked')).map(function (input) { return input.value; }); }
    function renderImage2Assets() {
      var images = assets.filter(function (asset) { return String(asset.mimeType || '').startsWith('image/'); });
      image2AssetsEl.innerHTML = images.length ? images.map(function (asset) { return '<label class="s1-asset"><input type="checkbox" data-s2-asset value="' + escapeHtml(asset.id) + '"><span class="s1-asset-name">' + escapeHtml(asset.originalName || asset.id) + '</span></label>'; }).join('') : '<span>暂无参考图，可先在项目素材库上传。</span>';
    }
    function renderNodes(nodes) {
      var chainNodes = (Array.isArray(nodes) ? nodes : []).filter(function (node) { return /^s1-/.test(node.id); });
      chainReady = chainNodes.some(function (node) { return node.id === 's1-source-input' && node.status === 'ready'; });
      chainNodes.forEach(function (node) { var key = node.id === 's1-source-input' ? 'source' : node.id === 's1-step01-analysis' ? 'step01' : 'step02'; var card = panel.querySelector('[data-node="' + key + '"]'); if (!card) return; card.dataset.status = node.status; var status = card.querySelector('[data-node-status]'); if (status) status.textContent = node.status; });
      var image2 = (Array.isArray(nodes) ? nodes : []).find(function (node) { return node.id === 's2-image2-keyframe'; });
      if (image2) { image2Card.dataset.status = image2.status; image2Card.querySelector('[data-node-status]').textContent = image2.status; image2Prompt.value = image2.data && image2.data.prompt || ''; image2Channel.value = image2.data && image2.data.imageChannel || image2Channel.value; image2Resolution.value = image2.data && image2.data.resolution || image2Resolution.value; image2Aspect.value = image2.data && image2.data.aspectRatio || image2Aspect.value; image2Status.textContent = '节点合同已保存；生成仍需通过画布生成授权。'; syncImage2Spec(); }
      syncButton();
    }
    function renderAssets() {
      var videos = assets.filter(function (asset) { return String(asset.mimeType || '').startsWith('video/'); });
      assetsEl.innerHTML = videos.length ? videos.map(function (asset) { return '<label class="s1-asset"><input type="checkbox" data-s1-asset value="' + escapeHtml(asset.id) + '"><span class="s1-asset-name">' + escapeHtml(asset.originalName || asset.id) + '</span></label>'; }).join('') : '<span>当前项目暂无视频素材，请先在素材库上传原片。</span>';
      panel.querySelectorAll('input[data-s1-asset]').forEach(function (input) { input.addEventListener('change', syncButton); });
      syncButton();
    }
    async function load() {
      var id = projectId();
      if (!id) { panel.hidden = true; return; }
      panel.hidden = false;
      try {
        var doc = await api('/api/canvas/documents/' + encodeURIComponent(projectKind()) + '/' + encodeURIComponent(id));
        revision = Number(doc.body.revision || 0);
        var listed = await api('/api/projects/' + encodeURIComponent(id) + '/assets', {headers: {'x-niannian-project-kind': projectKind()}});
        assets = Array.isArray(listed.body.assets) ? listed.body.assets : [];
        renderAssets();
        renderImage2Assets();
        var existingNodes = doc.body.document && doc.body.document.nodes || [];
        renderNodes(existingNodes);
        var existingChain = existingNodes.some(function (node) { return node.id === 's1-source-input'; });
        if (existingChain) setStatus('S1 节点链已存在，可继续在画布中编辑。');
      } catch (error) { setStatus(error.message || '读取项目状态失败', true); }
    }
    async function create() {
      createBtn.disabled = true;
      setStatus('正在保存 S1 节点链...');
      try {
        var id = projectId();
        var result = await api('/api/canvas/documents/' + encodeURIComponent(projectKind()) + '/' + encodeURIComponent(id) + '/s1-chain', {method: 'POST', headers: {'content-type': 'application/json', 'if-match': '"canvas-rev-' + revision + '"'}, body: JSON.stringify({sourceAssetIds: selectedIds(), rightsConfirmed: rightsEl.checked, preflightStatus: preflightEl.value})});
        revision = Number(result.body.revision || revision);
        var nodes = result.body.document && result.body.document.nodes || [];
        renderNodes(nodes);
        setStatus('已创建 3 个节点和 2 条依赖边。Step01 当前保持真实阻塞，不会提交 Provider。');
      } catch (error) { setStatus((error.code ? error.code + ': ' : '') + (error.message || '创建失败'), true); syncButton(); }
    }
    async function startStep01() {
      startBtn.disabled = true;
      setStatus('正在提交 Step01 原片分析...');
      try {
        var result = await api('/api/projects/' + encodeURIComponent(projectId()) + '/step01-analysis', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
        setStatus(result.body.code === 'STEP01_ANALYSIS_QUEUED' ? 'Step01 已进入服务器队列，正在准备原片证据。' : (result.body.code || 'Step01 状态已更新'));
      } catch (error) { setStatus((error.code ? error.code + ': ' : '') + (error.message || 'Step01 启动失败'), true); syncButton(); }
    }
    async function createImage2() {
      image2Create.disabled = true; image2Status.textContent = '正在保存 Image2 节点合同...';
      try {
        var result = await api('/api/canvas/documents/' + encodeURIComponent(projectKind()) + '/' + encodeURIComponent(projectId()) + '/s2-image2', {method:'POST', headers:{'content-type':'application/json','if-match':'"canvas-rev-' + revision + '"'}, body:JSON.stringify({prompt:image2Prompt.value, imageChannel:image2Channel.value, resolution:image2Resolution.value, aspectRatio:image2Aspect.value, referenceAssetIds:selectedImage2Ids()})});
        revision = Number(result.body.revision || revision); image2Card.dataset.status = result.body.node.status; image2Card.querySelector('[data-node-status]').textContent = result.body.node.status; image2Status.textContent = 'Image2 节点已保存。下一步只能由用户明确授权后准备并提交任务。'; image2Dry.disabled = false;
      } catch (error) { image2Status.textContent = (error.code ? error.code + ': ' : '') + (error.message || '保存失败'); image2Create.disabled = false; }
    }
    async function dryRunImage2() {
      image2Dry.disabled = true; image2Status.textContent = '正在建立 Image2 候选并执行 dry-run（不提交 Provider）...';
      try {
        var prepared = await api('/api/projects/' + encodeURIComponent(projectId()) + '/canvas/jobs', {method:'POST', headers:{'content-type':'application/json','idempotency-key':'s2-image2-' + Date.now()}, body:JSON.stringify({projectKind:projectKind(),nodeId:'s2-image2-keyframe',model:image2Channel.value,prompt:image2Prompt.value,resolution:image2Resolution.value,aspectRatio:image2Aspect.value,inputAssetIds:[]})});
        image2JobId = prepared.body.job && prepared.body.job.id;
        if (!image2JobId) throw new Error('服务器没有返回 Image2 候选任务');
        var dry = await api('/api/projects/' + encodeURIComponent(projectId()) + '/canvas/jobs/' + encodeURIComponent(image2JobId) + '/dry-run', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({projectKind:projectKind()})});
        image2Status.textContent = dry.body.dryRun && dry.body.dryRun.providerSubmitEnabled ? '规格检查通过；提交前仍需明确授权。' : '规格检查通过；当前仅建立候选，Provider 未启用或未授权。';
      } catch (error) { image2Status.textContent = (error.code ? error.code + ': ' : '') + (error.message || '准备失败'); image2Dry.disabled = false; }
    }
    panel.querySelector('[data-s1-refresh]').addEventListener('click', load);
    startBtn.addEventListener('click', startStep01);
    image2Create.addEventListener('click', createImage2); image2Dry.addEventListener('click', dryRunImage2);
    [image2Prompt,image2Channel,image2Resolution,image2Aspect].forEach(function (el) { el.addEventListener('input', syncImage2Spec); el.addEventListener('change', syncImage2Spec); });
    syncImage2Spec();
    rightsEl.addEventListener('change', syncButton); preflightEl.addEventListener('change', syncButton); createBtn.addEventListener('click', create);
    load();
    window.addEventListener('hashchange', load);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true}); else mount();
}());
