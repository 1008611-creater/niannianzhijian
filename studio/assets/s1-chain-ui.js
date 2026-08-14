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

  function projectListPath() {
    return projectKind() === 'script' ? '/api/script-projects' : '/api/projects';
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
      '#s1-chain-canvas[hidden]{display:none}#s1-chain-canvas .s1-chain-title{max-width:1360px;margin:0 auto 18px;padding:0 4px;color:#786958;pointer-events:none}#s1-chain-canvas .s1-eyebrow{font-size:10px;letter-spacing:.12em;color:#9a6a3c;font-weight:700}#s1-chain-canvas h2{margin:2px 0 0;color:#2a2118;font-size:18px;font-weight:750}',
      '#s1-chain-canvas .s1-chain-flow{position:relative;min-width:1360px;min-height:610px;margin:0 auto;padding:0 24px 60px;pointer-events:none}#s1-chain-canvas .s1-edge{position:absolute;height:2px;background:rgba(154,106,60,.58);transform-origin:0 50%;pointer-events:none;z-index:0}#s1-chain-canvas .s1-edge.dashed{background:repeating-linear-gradient(90deg,rgba(154,106,60,.58) 0 8px,transparent 8px 14px)}',
      '#s1-chain-canvas .s1-node{position:absolute;width:276px;min-height:212px;padding:15px;border:1px solid rgba(90,64,42,.2);border-radius:6px;background:rgba(255,252,246,.97);box-shadow:0 16px 36px rgba(42,33,24,.13);pointer-events:auto;z-index:1;touch-action:none}#s1-chain-canvas .s1-node[data-node=source]{z-index:4}#s1-chain-canvas .s1-node[data-node=step01]{z-index:3}#s1-chain-canvas .s1-node[data-node=step02]{z-index:2}#s1-chain-canvas .s1-node[data-status=blocked]{border-color:rgba(154,106,60,.26)}#s1-chain-canvas .s1-node[data-status=ready]{border-color:#5b8d6b}#s1-chain-canvas .s1-node h3{margin:4px 0 5px;font-size:15px;cursor:grab}#s1-chain-canvas .s1-node.s1-dragging h3{cursor:grabbing}#s1-chain-canvas .s1-node p{margin:0 0 12px;color:#786958;font-size:12px}',
      '#s1-chain-canvas .s1-meta{display:flex;justify-content:space-between;gap:8px;margin-bottom:10px;color:#8b7764;font-size:11px}#s1-chain-canvas .s1-status{margin-top:10px;padding:8px;border-radius:6px;background:#f4eee6;color:#5d4d3d;white-space:pre-wrap}#s1-chain-canvas .s1-status.error{background:#fff0ee;color:#a33b2d}#s1-chain-canvas .s1-assets{display:grid;gap:5px;margin:8px 0 10px}#s1-chain-canvas label.s1-asset{display:flex;gap:7px;align-items:center;padding:7px;border:1px solid rgba(90,64,42,.12);border-radius:6px;background:#fffaf3;cursor:pointer}#s1-chain-canvas .s1-asset-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#s1-chain-canvas .s1-row{display:flex;gap:7px;align-items:center;margin:7px 0}#s1-chain-canvas select{flex:1;min-width:0;padding:6px;border:1px solid rgba(90,64,42,.2);border-radius:6px;background:#fff}#s1-chain-canvas button{border:0;border-radius:6px;padding:7px 9px;background:#2a2118;color:#fff;cursor:pointer;font-weight:650;font-size:12px}#s1-chain-canvas button[disabled]{opacity:.45;cursor:default}#s1-chain-canvas .s1-secondary{background:#efe5d8;color:#4c3828}#s1-chain-canvas .s1-node small{color:#8b7764}#s1-chain-canvas .s1-contract{display:grid;gap:4px;margin:8px 0;color:#6d5c4a;font-size:11px}#s1-chain-canvas .s1-contract span{display:block;padding:5px 7px;border-radius:6px;background:#faf5ef}#s1-chain-canvas .s1-port-state{margin:7px 0 0;padding:6px 7px;border-radius:6px;background:#f4eee6;color:#5d4d3d;font-size:11px;line-height:1.35}#s1-chain-canvas .s1-port-state[data-state=ready]{background:#edf6ee;color:#376745}#s1-chain-canvas .s1-port-state[data-state=blocked]{background:#f8efe5;color:#785330}#s1-chain-canvas .s1-context-menu{position:absolute;z-index:20;display:grid;gap:4px;min-width:206px;padding:7px;border:1px solid rgba(90,64,42,.22);border-radius:6px;background:#fffdf9;box-shadow:0 14px 34px rgba(42,33,24,.2);pointer-events:auto}#s1-chain-canvas .s1-context-menu[hidden]{display:none}#s1-chain-canvas .s1-context-menu strong{padding:5px 7px;color:#8b6040;font-size:10px;letter-spacing:.08em}#s1-chain-canvas .s1-context-menu button{width:100%;text-align:left;background:transparent;color:#2a2118;font-weight:600}#s1-chain-canvas .s1-context-menu button:hover{background:#f3e9dc}#s1-chain-canvas .s1-skill-node{border-top:3px solid #9a6a3c}#s1-chain-canvas .s1-port-list{display:grid;gap:4px;margin:8px 0}#s1-chain-canvas .s1-port-list span{display:block;padding:5px 7px;border-radius:5px;background:#faf5ef;color:#6d5c4a;font-size:11px}',
      '[data-node-id^="nn-skill-"]{display:none!important}@media (max-width:900px){#s1-chain-canvas{padding:72px 14px 30px}#s1-chain-canvas .s1-chain-flow{min-width:1240px}}@media (max-width:600px){#s1-chain-canvas{padding-top:62px}#s1-chain-canvas .s1-chain-title{margin-bottom:12px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function mount(host) {
    if (!host || document.getElementById('s1-chain-canvas')) return false;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var panel = document.createElement('section');
    panel.id = 's1-chain-canvas';
    panel.setAttribute('aria-label', 'S1 原片到时间线');
    panel.hidden = true;
    panel.innerHTML = '<div class="s1-chain-title"><div class="s1-eyebrow">S1 → S2 CANVAS CHAIN</div><h2>原片到关键帧</h2></div><div class="s1-chain-flow"><div class="s1-edge" data-edge="source-step01"></div><div class="s1-edge" data-edge="step01-step02"></div><div class="s1-edge dashed" data-edge="step02-image2"></div><article class="s1-node" data-node="source" data-status="draft"><div class="s1-meta"><span>输入节点</span><small data-node-status>draft</small></div><h3>原片输入与权利确认</h3><p>上传原片，确认使用权并完成媒体预检。</p><div class="s1-contract"><span>输入：source_video · rights_declaration</span><span>输出：source_asset · preflight_report</span></div><div class="s1-assets" data-s1-assets><span>正在读取项目素材...</span></div><label class="s1-row"><input type="checkbox" data-s1-rights> 我确认拥有该原片的使用权</label><div class="s1-row"><span>媒体预检</span><select data-s1-preflight><option value="pending">未完成</option><option value="passed">已通过</option></select></div><div class="s1-row"><button type="button" data-s1-refresh class="s1-secondary">刷新素材</button><button type="button" data-s1-create disabled>创建节点链</button></div></article><article class="s1-node" data-node="step01" data-status="blocked"><div class="s1-meta"><span>Skill 节点 · mx-shortdrama-01</span><small data-node-status>blocked</small></div><h3>Step01 源片分析</h3><p>提取镜头、关键帧、对白、OCR 与证据清单。</p><div class="s1-contract"><span>输入：source_video</span><span>输出：evidence_manifest · shot_frames</span><span>参数：hq_full · 服务器证据门</span></div><div class="s1-status" data-s1-status>等待原片节点就绪。</div><div class="s1-row"><button type="button" data-s1-start disabled>开始 Step01 分析</button></div></article><article class="s1-node" data-node="step02" data-status="blocked"><div class="s1-meta"><span>Skill 节点 · mx-shortdrama-02</span><small data-node-status>blocked</small></div><h3>Step02 源片时间线</h3><p>只消费已验证的 Step01 证据，生成可确认时间线。</p><div class="s1-contract"><span>输入：evidence_manifest</span><span>输出：accepted_timeline</span><span>预览：时间线与镜头事实</span></div><div class="s1-status">等待 Step01 证据完成。</div></article><article class="s1-node" data-node="image2" data-status="draft"><div class="s1-meta"><span>Skill 节点 · image2-storyboard-video</span><small data-node-status>draft</small></div><h3>Image2 关键帧生成</h3><p>输入提示词和参考资产，生成可继续做视频的关键帧。</p><div class="s1-contract"><span>输入：prompt · reference_asset</span><span>输出：image_asset</span><span>结果：预览、尺寸、项目资产</span></div><div class="s1-assets" data-s2-assets><span>正在读取参考图...</span></div><label class="s1-row"><span>提示词</span><input data-s2-prompt placeholder="描述角色、场景和镜头" style="flex:1;min-width:0;padding:6px;border:1px solid rgba(90,64,42,.2);border-radius:7px"></label><div class="s1-row"><span>渠道</span><select data-s2-channel><option value="yunfei-gpt-image-2-1k">云飞 Image2 1K</option><option value="yunfei-gpt-image-2-hd">云飞 Image2 2K/4K</option><option value="runninghub-gpt-image-2">RunningHub Image2</option></select></div><div class="s1-row"><span>规格</span><select data-s2-resolution><option value="1k">1K</option><option value="2k">2K</option><option value="4k">4K</option></select><select data-s2-aspect><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option></select></div><div class="s1-contract"><span data-s2-output>输出尺寸将按渠道和比例校验</span></div><div class="s1-status" data-s2-status>未创建任务；先保存节点合同。</div><div class="s1-preview" data-s2-preview>结果预览：等待 Image2 产物</div><div class="s1-row"><button type="button" data-s2-create class="s1-secondary">保存 Image2 节点</button><button type="button" data-s2-dry disabled>准备任务</button></div></article><menu class="s1-context-menu" data-s1-context hidden><strong>添加编排节点</strong><button type="button" data-s1-add-skill="screenwriter">编剧 · Screenwriter</button><button type="button" data-s1-add-skill="chaoge-assets-trial">资产方案 · Chaoge</button><button type="button" data-s1-add-skill="shotlist-builder">分镜 · Shotlist Builder</button><button type="button" data-s1-add-skill="hell-grind">镜头提示 · Hell Grind</button></menu></div>';
    host.appendChild(panel);
    installStyles();
    function addPortState(nodeKey, portKey, initialText) {
      var node = panel.querySelector('[data-node="' + nodeKey + '"]');
      var contract = node && node.querySelector('.s1-contract');
      if (!contract || contract.querySelector('[data-s1-port="' + portKey + '"]')) return;
      var state = document.createElement('div');
      state.className = 's1-port-state';
      state.dataset.s1Port = portKey;
      state.dataset.state = 'blocked';
      state.textContent = initialText;
      contract.insertAdjacentElement('afterend', state);
    }
    addPortState('source', 'source-output', '输出 source_asset：等待原片绑定。');
    addPortState('step01', 'step01-input', '输入 source_video：等待 source_asset。');
    addPortState('step01', 'step01-output', '输出 evidence_manifest：等待分析。');
    addPortState('step02', 'step02-input', '输入 evidence_manifest：等待 Step01。');
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
    var nodeById = Object.create(null);
    var canvasDocument = {nodes:[], edges:[], viewport:{x:0,y:0,zoom:1}};
    var step01PollTimer = null;
    var nodeIds = {source:'s1-source-input',step01:'s1-step01-analysis',step02:'s1-step02-timeline',image2:'s2-image2-keyframe'};
    var championSpecs = {
      'screenwriter': {type:'text', version:'1.0.0', title:'剧本编排', note:'把故事或原始素材整理为剧本、梗概和设定集。', inputs:['story','source_material'], outputs:['screenplay','treatment','story_bible']},
      'chaoge-assets-trial': {type:'character', version:'1.3.0', title:'超哥资产方案', note:'从剧本和资产需求整理角色、道具与资产清单。', inputs:['screenplay','asset_requirements'], outputs:['character_assets','prop_assets','asset_manifest']},
      'shotlist-builder': {type:'shot', version:'1.0.0', title:'分镜规划', note:'把剧本、资产清单和风格参考编排为分镜与视频提示。', inputs:['screenplay','asset_manifest','style_reference'], outputs:['shotlist',{id:'video_prompt',type:'prompt'},'spatial_blocking']},
      'hell-grind': {type:'shot', version:'1.0.0', title:'镜头提示编译', note:'把分镜、参考资产和连续性约束编译为图像/视频提示词。', inputs:['shotlist','reference_assets','continuity_state'], outputs:[{id:'image_prompt',type:'prompt'},{id:'video_prompt',type:'prompt'},'continuity_locks']}
    };

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
    function positionOf(key) { var node = nodeById[nodeIds[key]]; return node && node.position || {x:key === 'source' ? 90 : key === 'step01' ? 400 : key === 'step02' ? 710 : 1020,y:150}; }
    function applyNodePositions() {
      ['source','step01','step02','image2'].forEach(function (key) { var card = panel.querySelector('[data-node="' + key + '"]'); var pos = positionOf(key); card.style.left = String(pos.x) + 'px'; card.style.top = String(pos.y) + 'px'; });
      panel.querySelectorAll('.s1-node[data-node-id]').forEach(function (card) {
        var node = nodeById[card.dataset.nodeId];
        if (!node || !node.position) return;
        card.style.left = String(node.position.x) + 'px';
        card.style.top = String(node.position.y) + 'px';
      });
      [['source','step01','source-step01'],['step01','step02','step01-step02'],['step02','image2','step02-image2']].forEach(function (item) {
        var a = positionOf(item[0]), b = positionOf(item[1]), edge = panel.querySelector('[data-edge="' + item[2] + '"]');
        var dx = b.x - a.x - 276, dy = b.y - a.y, width = Math.max(20, Math.sqrt(dx * dx + dy * dy));
        edge.style.left = String(a.x + 276) + 'px'; edge.style.top = String(a.y + 112) + 'px'; edge.style.width = String(width) + 'px'; edge.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
      });
    }
    async function saveLayout() {
      var positions = {};
      Object.keys(nodeById).forEach(function (id) { var pos = nodeById[id] && nodeById[id].position; if (pos) positions[id] = {x:pos.x,y:pos.y}; });
      var result = await api('/api/canvas/documents/' + encodeURIComponent(projectKind()) + '/' + encodeURIComponent(projectId()) + '/skill-node-layout', {method:'POST',headers:{'content-type':'application/json','if-match':'"canvas-rev-' + revision + '"'},body:JSON.stringify({positions:positions})});
      revision = Number(result.body.revision || revision);
      canvasDocument = result.body.document || canvasDocument;
      var nodes = canvasDocument.nodes || [];
      nodeById = Object.fromEntries(nodes.map(function (node) { return [node.id,node]; }));
      applyNodePositions();
    }
    function championSpecFor(node) { return championSpecs[node && node.skillKey] || championSpecs[node && node.data && node.data.skillKey] || null; }
    function championNodeMarkup(node, spec) {
      var inputs = (node.inputPorts || (node.data && node.data.inputPorts) || []).map(function (port) { return escapeHtml(port.id); }).join(' · ');
      var outputs = (node.outputPorts || (node.data && node.data.outputPorts) || []).map(function (port) { return escapeHtml(port.id); }).join(' · ');
      return '<article class="s1-node s1-skill-node" data-champion-node data-node-id="' + escapeHtml(node.id) + '" data-status="' + escapeHtml(node.status || 'draft') + '"><div class="s1-meta"><span>编排 Skill · ' + escapeHtml(node.skillKey) + '</span><small data-node-status>' + escapeHtml(node.status || 'draft') + '</small></div><h3>' + escapeHtml((node.data && node.data.title) || spec.title) + '</h3><p>' + escapeHtml((node.data && node.data.note) || spec.note) + '</p><div class="s1-port-list"><span>输入：' + (inputs || '等待连接') + '</span><span>输出：' + (outputs || '等待编译') + '</span></div><div class="s1-status">编排节点只输出计划、提示词或资产引用；图像和视频仍通过后续生成节点的服务器任务链。</div></article>';
    }
    function renderChampionNodes(nodes) {
      panel.querySelectorAll('[data-champion-node]').forEach(function (card) { card.remove(); });
      (Array.isArray(nodes) ? nodes : []).forEach(function (node) {
        var spec = championSpecFor(node);
        if (!spec) return;
        nodesEl.insertAdjacentHTML('beforeend', championNodeMarkup(node, spec));
      });
    }
    function nextChampionId(skillKey) { return 'skill-' + skillKey.replace(/[^A-Za-z0-9_-]/g, '-') + '-' + Date.now().toString(36); }
    async function createChampionNode(skillKey, position) {
      var spec = championSpecs[skillKey];
      if (!spec) return;
      var id = nextChampionId(skillKey);
      var portId = function (port) { return typeof port === 'string' ? port : port.id; };
      var portType = function (port) { return typeof port === 'string' ? port : port.type; };
      var ports = {inputPorts:spec.inputs.map(function (port, index) { return {id:portId(port),type:portType(port),required:index === 0}; }),outputPorts:spec.outputs.map(function (port) { return {id:portId(port),type:portType(port),required:false}; })};
      var parameters = {compiledOutputs:{}, providerSubmitRequested:false, gateState:'awaiting_inputs'};
      var node = {id:id,type:spec.type,kind:spec.type,status:'draft',skillKey:skillKey,skillVersion:spec.version,description:spec.note,inputPorts:ports.inputPorts,outputPorts:ports.outputPorts,parameters:parameters,assetRefs:[],taskRef:null,preview:null,recovery:{actions:['repair_input','retry'],lastAction:null},executionMode:'orchestration',position:{x:Math.max(0,Math.round(position.x)),y:Math.max(80,Math.round(position.y))},data:{title:spec.title,note:spec.note,status:'draft',skillKey:skillKey,skillVersion:spec.version,description:spec.note,inputPorts:ports.inputPorts,outputPorts:ports.outputPorts,parameters:parameters,assetRefs:[],taskRef:null,preview:null,recovery:{actions:['repair_input','retry'],lastAction:null},executionMode:'orchestration'}};
      canvasDocument.nodes = (canvasDocument.nodes || []).concat([node]);
      nodeById[id] = node;
      await persistRuntimeProjection();
      setStatus('已添加「' + spec.title + '」。拖动标题可调整位置；端口只能连接同类型输出。');
    }
    function installDragging() {
      panel.addEventListener('pointerdown', function (event) {
        var handle = event.target.closest('.s1-node h3');
        if (!handle || !panel.contains(handle)) return;
        var card = handle.closest('.s1-node'); var key = card.getAttribute('data-node'); var id = card.dataset.nodeId || nodeIds[key];
        if (!id) return;
        var current = nodeById[id] && nodeById[id].position;
        var start = current || positionOf(key); var baseX = event.clientX; var baseY = event.clientY;
        event.preventDefault(); card.classList.add('s1-dragging'); card.setPointerCapture && card.setPointerCapture(event.pointerId);
        function move(next) { nodeById[id] = Object.assign({}, nodeById[id] || {}, {position:{x:Math.max(0,Math.round(start.x + next.clientX - baseX)),y:Math.max(80,Math.round(start.y + next.clientY - baseY))}}); applyNodePositions(); }
        function end() { card.classList.remove('s1-dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); saveLayout().catch(function (error) { setStatus(error.message || '节点位置保存失败', true); }); }
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, {once:true});
      });
    }
    function renderImage2Assets() {
      var images = assets.filter(function (asset) { return String(asset.mimeType || '').startsWith('image/'); });
      image2AssetsEl.innerHTML = images.length ? images.map(function (asset) { return '<label class="s1-asset"><input type="checkbox" data-s2-asset value="' + escapeHtml(asset.id) + '"><span class="s1-asset-name">' + escapeHtml(asset.originalName || asset.id) + '</span></label>'; }).join('') : '<span>暂无参考图，可先在项目素材库上传。</span>';
    }
    function parametersOf(node) { return node && (node.parameters || (node.data && node.data.parameters)) || {}; }
    function bindingFor(node, field, portId) {
      var bindings = parametersOf(node)[field];
      return Array.isArray(bindings) ? bindings.find(function (binding) { return binding && binding.portId === portId; }) || null : null;
    }
    function assetLabel(assetId) {
      var asset = assets.find(function (item) { return item.id === assetId; });
      return asset && (asset.originalName || asset.id) || assetId;
    }
    function setPortState(portKey, state, text) {
      var element = panel.querySelector('[data-s1-port="' + portKey + '"]');
      if (!element) return;
      element.dataset.state = state || 'blocked';
      element.textContent = text;
    }
    function renderPortStates() {
      var source = nodeById['s1-source-input'];
      var step01 = nodeById['s1-step01-analysis'];
      var step02 = nodeById['s1-step02-timeline'];
      var sourceOutput = bindingFor(source, 'outputBindings', 'source_asset');
      var sourceIds = sourceOutput && Array.isArray(sourceOutput.assetIds) ? sourceOutput.assetIds : [];
      var sourceState = sourceOutput && sourceOutput.state || 'draft';
      setPortState('source-output', sourceState, sourceIds.length ? '输出 source_asset：' + sourceIds.map(assetLabel).join('、') + '。' : '输出 source_asset：等待原片绑定。');
      var step01Input = bindingFor(step01, 'inputBindings', 'source_video');
      var inputState = step01Input && step01Input.state || 'blocked';
      setPortState('step01-input', inputState, inputState === 'ready' ? '输入 source_video：已连接 原片输入.source_asset。' : '输入 source_video：等待 原片输入.source_asset。');
      var step01Output = bindingFor(step01, 'outputBindings', 'evidence_manifest');
      var outputState = step01Output && step01Output.state || 'blocked';
      setPortState('step01-output', outputState, outputState === 'ready' ? '输出 evidence_manifest：已生成，可传给 Step02。' : '输出 evidence_manifest：等待 Step01 分析。');
      var step02Input = bindingFor(step02, 'inputBindings', 'evidence_manifest');
      var timelineState = step02Input && step02Input.state || 'blocked';
      setPortState('step02-input', timelineState, timelineState === 'ready' ? '输入 evidence_manifest：已连接 Step01 输出。' : '输入 evidence_manifest：等待 Step01.evidence_manifest。');
    }
    function step01Projection(project) {
      var analysis = project && project.analysis;
      var runtimeStatus = String(analysis && analysis.status || '').toLowerCase();
      if (!runtimeStatus) return null;
      var queued = ['queued','capability_preflight','codex_dispatched','return_received','reducer_verifying','prepared'];
      var running = ['codex_running','running','running_step01'];
      var failed = ['infra_failed','blocked_contract','blocked_resource','blocked_quality','blocked_authorization','blocked_transport','failed'];
      if (runtimeStatus === 'evidence_ready' || runtimeStatus === 'step01_verified') return {status:'succeeded',note:'Step01 证据包已由服务器验证，可传给 Step02。',gateState:'step01_evidence_ready',blocker:null,outputState:'ready',timelineState:'ready'};
      if (running.includes(runtimeStatus)) return {status:'running',note:'Step01 正在服务器执行 hq_full 原片分析。',gateState:'step01_full_source_authority_running',blocker:null,outputState:'blocked',timelineState:'blocked'};
      if (queued.includes(runtimeStatus)) return {status:'queued',note:'Step01 已进入服务器队列，等待 hq_full 原片证据。',gateState:'step01_full_source_authority_queued',blocker:null,outputState:'blocked',timelineState:'blocked'};
      if (failed.includes(runtimeStatus)) return {status:'failed',note:'Step01 服务端未完成（状态：' + runtimeStatus + '），请按错误状态恢复。',gateState:'step01_full_source_authority_blocked',blocker:runtimeStatus,outputState:'blocked',timelineState:'blocked'};
      return {status:'blocked',note:'Step01 尚未开始真实服务器分析。',gateState:'step01_full_source_authority_blocked',blocker:runtimeStatus,outputState:'blocked',timelineState:'blocked'};
    }
    function setNodeRuntime(node, projection) {
      if (!node || !projection) return false;
      var params = parametersOf(node);
      var outputBindings = Array.isArray(params.outputBindings) ? params.outputBindings.map(function (binding) { return Object.assign({}, binding); }) : [];
      var evidence = outputBindings.find(function (binding) { return binding.portId === 'evidence_manifest'; });
      if (evidence) evidence.state = projection.outputState;
      var nextParams = Object.assign({}, params, {gateState:projection.gateState, blocker:projection.blocker, outputBindings:outputBindings});
      var nextData = Object.assign({}, node.data || {}, {status:projection.status, note:projection.note, parameters:nextParams});
      var changed = node.status !== projection.status || JSON.stringify(parametersOf(node)) !== JSON.stringify(nextParams) || (node.data && node.data.note) !== projection.note;
      node.status = projection.status;
      node.parameters = nextParams;
      node.data = nextData;
      return changed;
    }
    function setStep02EvidenceBinding(node, state) {
      if (!node) return false;
      var params = parametersOf(node);
      var bindings = Array.isArray(params.inputBindings) ? params.inputBindings.map(function (binding) { return Object.assign({}, binding); }) : [];
      var evidence = bindings.find(function (binding) { return binding.portId === 'evidence_manifest'; });
      if (!evidence || evidence.state === state) return false;
      evidence.state = state;
      var nextParams = Object.assign({}, params, {inputBindings:bindings, gateState:state === 'ready' ? 'step01_evidence_ready' : 'step01_evidence_required', blocker:state === 'ready' ? null : 'STEP01_EVIDENCE_REQUIRED'});
      var nextStatus = state === 'ready' ? 'ready' : 'blocked';
      node.parameters = nextParams;
      node.status = nextStatus;
      node.data = Object.assign({}, node.data || {}, {status:nextStatus, parameters:nextParams, note:state === 'ready' ? 'Step01 证据已验证，可确认源片时间线。' : '等待 Step01 证据完成。'});
      return true;
    }
    function updateRuntimeCards() {
      [['step01','s1-step01-analysis'],['step02','s1-step02-timeline']].forEach(function (item) {
        var card = panel.querySelector('[data-node="' + item[0] + '"]');
        var node = nodeById[item[1]];
        if (!card || !node) return;
        card.dataset.status = node.status;
        var status = card.querySelector('[data-node-status]');
        if (status) status.textContent = node.status;
        var detail = card.querySelector('[data-s1-status]');
        if (detail && item[0] === 'step01') detail.textContent = node.data && node.data.note || '等待服务器状态。';
        if (detail && item[0] === 'step02' && node.status === 'ready') detail.textContent = 'Step01 证据已连接，可继续生成时间线。';
      });
      renderPortStates();
    }
    async function persistRuntimeProjection() {
      canvasDocument.nodes = canvasDocument.nodes.map(function (node) { return nodeById[node.id] || node; });
      var result = await api('/api/canvas/documents/' + encodeURIComponent(projectKind()) + '/' + encodeURIComponent(projectId()), {method:'PUT', headers:{'content-type':'application/json','if-match':'"canvas-rev-' + revision + '"'}, body:JSON.stringify({document:canvasDocument})});
      revision = Number(result.body.revision || revision);
      canvasDocument = result.body.document || canvasDocument;
      renderNodes(canvasDocument.nodes);
    }
    async function syncStep01Runtime(project, persist) {
      var projection = step01Projection(project);
      if (!projection || !nodeById['s1-step01-analysis']) return;
      var changed = setNodeRuntime(nodeById['s1-step01-analysis'], projection);
      if (projection.status === 'succeeded') changed = setStep02EvidenceBinding(nodeById['s1-step02-timeline'], projection.timelineState) || changed;
      updateRuntimeCards();
      if (persist && changed) {
        try { await persistRuntimeProjection(); } catch (error) { setStatus(error.message || '服务器状态同步失败', true); }
      }
      scheduleStep01Poll(String(project && project.analysis && project.analysis.status || ''));
    }
    function scheduleStep01Poll(status) {
      clearTimeout(step01PollTimer);
      var active = ['queued','capability_preflight','codex_dispatched','codex_running','return_received','reducer_verifying','running','running_step01','prepared'].includes(String(status || '').toLowerCase());
      if (!active || !projectId()) return;
      step01PollTimer = setTimeout(async function () {
        try {
          var result = await api(projectListPath());
          var projects = Array.isArray(result.body.projects) ? result.body.projects : [];
          await syncStep01Runtime(projects.find(function (item) { return item && item.id === projectId(); }) || null, true);
        } catch (error) { setStatus(error.message || '读取 Step01 状态失败', true); }
      }, 3000);
    }
    function renderNodes(nodes) {
      canvasDocument.nodes = Array.isArray(nodes) ? nodes : [];
      nodeById = Object.fromEntries(canvasDocument.nodes.map(function (node) { return [node.id,node]; }));
      Object.keys(nodeIds).forEach(function (key) { var card = panel.querySelector('[data-node="' + key + '"]'); if (card) card.dataset.nodeId = nodeIds[key]; });
      var chainNodes = (Array.isArray(nodes) ? nodes : []).filter(function (node) { return /^s1-/.test(node.id); });
      chainReady = chainNodes.some(function (node) { return node.id === 's1-source-input' && node.status === 'ready'; });
      chainNodes.forEach(function (node) { var key = node.id === 's1-source-input' ? 'source' : node.id === 's1-step01-analysis' ? 'step01' : 'step02'; var card = panel.querySelector('[data-node="' + key + '"]'); if (!card) return; card.dataset.status = node.status; var status = card.querySelector('[data-node-status]'); if (status) status.textContent = node.status; });
      var source = nodeById['s1-source-input'];
      if (source) {
        var sourceData = source.data || source;
        var sourceParameters = sourceData.parameters || source.parameters || {};
        var sourceAssetIds = new Set([].concat(sourceData.assetIds || [], source.assetRefs || []).map(function (item) { return typeof item === 'string' ? item : item && item.assetId; }).filter(Boolean));
        panel.querySelectorAll('input[data-s1-asset]').forEach(function (input) { input.checked = sourceAssetIds.has(input.value); });
        rightsEl.checked = sourceParameters.rightsConfirmed === true;
        preflightEl.value = sourceParameters.preflightStatus === 'passed' ? 'passed' : 'pending';
      }
      var image2 = (Array.isArray(nodes) ? nodes : []).find(function (node) { return node.id === 's2-image2-keyframe'; });
      if (image2) { image2Card.dataset.status = image2.status; image2Card.querySelector('[data-node-status]').textContent = image2.status; image2Prompt.value = image2.data && image2.data.prompt || ''; image2Channel.value = image2.data && image2.data.imageChannel || image2Channel.value; image2Resolution.value = image2.data && image2.data.resolution || image2Resolution.value; image2Aspect.value = image2.data && image2.data.aspectRatio || image2Aspect.value; image2Status.textContent = '节点合同已保存；生成仍需通过画布生成授权。'; syncImage2Spec(); }
      renderChampionNodes(nodes);
      renderPortStates();
      applyNodePositions();
      syncButton();
    }
    function renderAssets() {
      var videos = assets.filter(function (asset) { return String(asset.mimeType || '').startsWith('video/'); });
      assetsEl.innerHTML = videos.length ? videos.map(function (asset) { return '<label class="s1-asset"><input type="checkbox" data-s1-asset value="' + escapeHtml(asset.id) + '"><span class="s1-asset-name">' + escapeHtml(asset.originalName || asset.id) + '</span></label>'; }).join('') : '<span>当前项目暂无视频素材，请先在素材库上传原片。</span>';
      panel.querySelectorAll('input[data-s1-asset]').forEach(function (input) { input.type = 'radio'; input.name = 's1-source-asset'; input.addEventListener('change', syncButton); });
      syncButton();
    }
    async function load() {
      var id = projectId();
      if (!id) { panel.hidden = true; return; }
      panel.hidden = false;
      try {
        var responses = await Promise.all([
          api('/api/canvas/documents/' + encodeURIComponent(projectKind()) + '/' + encodeURIComponent(id)),
          api(projectListPath()),
          api('/api/projects/' + encodeURIComponent(id) + '/assets', {headers: {'x-niannian-project-kind': projectKind()}})
        ]);
        var doc = responses[0];
        var projectState = responses[1];
        revision = Number(doc.body.revision || 0);
        var listed = responses[2];
        canvasDocument = doc.body.document || {nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}};
        assets = Array.isArray(listed.body.assets) ? listed.body.assets : [];
        renderAssets();
        renderImage2Assets();
        var existingNodes = canvasDocument.nodes || [];
        renderNodes(existingNodes);
        var listedProjects = Array.isArray(projectState.body.projects) ? projectState.body.projects : [];
        await syncStep01Runtime(listedProjects.find(function (item) { return item && item.id === id; }) || null, true);
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
        canvasDocument = result.body.document || canvasDocument;
        var nodes = canvasDocument.nodes || [];
        renderNodes(nodes);
        setStatus('已创建 3 个节点和 2 条依赖边。Step01 当前保持真实阻塞，不会提交 Provider。');
      } catch (error) { setStatus((error.code ? error.code + ': ' : '') + (error.message || '创建失败'), true); syncButton(); }
    }
    async function startStep01() {
      startBtn.disabled = true;
      setStatus('正在提交 Step01 原片分析...');
      try {
        var result = await api('/api/projects/' + encodeURIComponent(projectId()) + '/step01-analysis', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
        await syncStep01Runtime(result.body.project, true);
        setStatus(result.body.code === 'STEP01_ANALYSIS_QUEUED' ? 'Step01 已进入服务器队列，正在准备原片证据。' : (result.body.code || 'Step01 状态已更新'));
      } catch (error) { setStatus((error.code ? error.code + ': ' : '') + (error.message || 'Step01 启动失败'), true); syncButton(); }
    }
    async function createImage2() {
      image2Create.disabled = true; image2Status.textContent = '正在保存 Image2 节点合同...';
      try {
        var result = await api('/api/canvas/documents/' + encodeURIComponent(projectKind()) + '/' + encodeURIComponent(projectId()) + '/s2-image2', {method:'POST', headers:{'content-type':'application/json','if-match':'"canvas-rev-' + revision + '"'}, body:JSON.stringify({prompt:image2Prompt.value, imageChannel:image2Channel.value, resolution:image2Resolution.value, aspectRatio:image2Aspect.value, referenceAssetIds:selectedImage2Ids()})});
        revision = Number(result.body.revision || revision); canvasDocument = result.body.document || canvasDocument; renderNodes(canvasDocument.nodes || [result.body.node]); image2Card.dataset.status = result.body.node.status; image2Card.querySelector('[data-node-status]').textContent = result.body.node.status; image2Status.textContent = 'Image2 节点已保存。下一步只能由用户明确授权后准备并提交任务。'; image2Dry.disabled = false;
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
    var contextMenu = panel.querySelector('[data-s1-context]');
    var contextPoint = {x:120, y:360};
    function hideContextMenu() { contextMenu.hidden = true; }
    function showContextMenu(event) {
      event.preventDefault();
      var bounds = nodesEl.getBoundingClientRect();
      contextPoint = {x:Math.max(0,Math.round(event.clientX - bounds.left)),y:Math.max(80,Math.round(event.clientY - bounds.top))};
      contextMenu.style.left = String(contextPoint.x) + 'px';
      contextMenu.style.top = String(contextPoint.y) + 'px';
      contextMenu.hidden = false;
    }
    nodesEl.addEventListener('contextmenu', showContextMenu);
    contextMenu.addEventListener('click', function (event) {
      var button = event.target.closest('[data-s1-add-skill]');
      if (!button) return;
      var skillKey = button.getAttribute('data-s1-add-skill');
      hideContextMenu();
      createChampionNode(skillKey, contextPoint).catch(function (error) { setStatus((error.code ? error.code + ': ' : '') + (error.message || '添加节点失败'), true); });
    });
    panel.addEventListener('pointerdown', function (event) { if (!event.target.closest('[data-s1-context]')) hideContextMenu(); });
    panel.querySelector('[data-s1-refresh]').addEventListener('click', load);
    startBtn.addEventListener('click', startStep01);
    image2Create.addEventListener('click', createImage2); image2Dry.addEventListener('click', dryRunImage2);
    [image2Prompt,image2Channel,image2Resolution,image2Aspect].forEach(function (el) { el.addEventListener('input', syncImage2Spec); el.addEventListener('change', syncImage2Spec); });
    syncImage2Spec();
    rightsEl.addEventListener('change', syncButton); preflightEl.addEventListener('change', syncButton); createBtn.addEventListener('click', create);
    installDragging();
    load();
    window.addEventListener('hashchange', load);
    return true;
  }

  function mountIntoGenerationCanvas() {
    var host = document.querySelector('[aria-label="AI 影像创作画布"]');
    var canvas = document.getElementById('s1-chain-canvas');
    if (canvas && canvas.parentElement === host) return true;
    if (canvas) canvas.remove();
    return mount(host);
  }

  function observeGenerationCanvas() {
    mountIntoGenerationCanvas();
    var observer = new MutationObserver(function () { mountIntoGenerationCanvas(); });
    observer.observe(document.documentElement, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeGenerationCanvas, {once: true}); else observeGenerationCanvas();
}());
