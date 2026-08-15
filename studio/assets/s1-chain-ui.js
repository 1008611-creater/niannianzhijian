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
      '#s1-chain-canvas .s1-chain-flow{position:relative;min-width:1680px;min-height:610px;margin:0 auto;padding:0 24px 60px;pointer-events:none}#s1-chain-canvas .s1-edge{position:absolute;height:2px;background:rgba(154,106,60,.58);transform-origin:0 50%;pointer-events:none;z-index:0}#s1-chain-canvas .s1-edge.dashed{background:repeating-linear-gradient(90deg,rgba(154,106,60,.58) 0 8px,transparent 8px 14px)}#s1-chain-canvas .s1-typed-edge{height:2px;background:#426f83;z-index:1}',
      '#s1-chain-canvas .s1-node{position:absolute;width:276px;min-height:212px;padding:15px;border:1px solid rgba(90,64,42,.2);border-radius:6px;background:rgba(255,252,246,.97);box-shadow:0 16px 36px rgba(42,33,24,.13);pointer-events:auto;z-index:1;touch-action:none}#s1-chain-canvas .s1-node[data-node=source]{z-index:4}#s1-chain-canvas .s1-node[data-node=step01]{z-index:3}#s1-chain-canvas .s1-node[data-node=step02]{z-index:2}#s1-chain-canvas .s1-node[data-status=blocked]{border-color:rgba(154,106,60,.26)}#s1-chain-canvas .s1-node[data-status=ready]{border-color:#5b8d6b}#s1-chain-canvas .s1-node h3{margin:4px 0 5px;font-size:15px;cursor:grab}#s1-chain-canvas .s1-node.s1-dragging h3{cursor:grabbing}#s1-chain-canvas .s1-node p{margin:0 0 12px;color:#786958;font-size:12px}',
      '#s1-chain-canvas .s1-meta{display:flex;justify-content:space-between;gap:8px;margin-bottom:10px;color:#8b7764;font-size:11px}#s1-chain-canvas .s1-status{margin-top:10px;padding:8px;border-radius:6px;background:#f4eee6;color:#5d4d3d;white-space:pre-wrap}#s1-chain-canvas .s1-status.error{background:#fff0ee;color:#a33b2d}#s1-chain-canvas .s1-assets{display:grid;gap:5px;margin:8px 0 10px}#s1-chain-canvas label.s1-asset{display:flex;gap:7px;align-items:center;padding:7px;border:1px solid rgba(90,64,42,.12);border-radius:6px;background:#fffaf3;cursor:pointer}#s1-chain-canvas .s1-asset-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#s1-chain-canvas .s1-row{display:flex;gap:7px;align-items:center;margin:7px 0}#s1-chain-canvas select{flex:1;min-width:0;padding:6px;border:1px solid rgba(90,64,42,.2);border-radius:6px;background:#fff}#s1-chain-canvas button{border:0;border-radius:6px;padding:7px 9px;background:#2a2118;color:#fff;cursor:pointer;font-weight:650;font-size:12px}#s1-chain-canvas button[disabled]{opacity:.45;cursor:default}#s1-chain-canvas .s1-secondary{background:#efe5d8;color:#4c3828}#s1-chain-canvas .s1-node small{color:#8b7764}#s1-chain-canvas .s1-contract{display:grid;gap:4px;margin:8px 0;color:#6d5c4a;font-size:11px}#s1-chain-canvas .s1-contract span{display:block;padding:5px 7px;border-radius:6px;background:#faf5ef}#s1-chain-canvas .s1-port-state{margin:7px 0 0;padding:6px 7px;border-radius:6px;background:#f4eee6;color:#5d4d3d;font-size:11px;line-height:1.35}#s1-chain-canvas .s1-port-state[data-state=ready]{background:#edf6ee;color:#376745}#s1-chain-canvas .s1-port-state[data-state=blocked]{background:#f8efe5;color:#785330}#s1-chain-canvas .s1-context-menu{position:absolute;z-index:20;display:grid;gap:4px;min-width:206px;padding:7px;border:1px solid rgba(90,64,42,.22);border-radius:6px;background:#fffdf9;box-shadow:0 14px 34px rgba(42,33,24,.2);pointer-events:auto}#s1-chain-canvas .s1-context-menu[hidden]{display:none}#s1-chain-canvas .s1-context-menu strong{padding:5px 7px;color:#8b6040;font-size:10px;letter-spacing:.08em}#s1-chain-canvas .s1-context-menu button{width:100%;text-align:left;background:transparent;color:#2a2118;font-weight:600}#s1-chain-canvas .s1-context-menu button:hover{background:#f3e9dc}#s1-chain-canvas .s1-skill-node{border-top:3px solid #9a6a3c}#s1-chain-canvas .s1-port-list{display:grid;gap:4px;margin:8px 0}#s1-chain-canvas .s1-port-list span{display:block;padding:5px 7px;border-radius:5px;background:#faf5ef;color:#6d5c4a;font-size:11px}#s1-chain-canvas .s1-ports{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}#s1-chain-canvas .s1-port-group{display:grid;gap:4px;color:#8b7764;font-size:10px}#s1-chain-canvas .s1-port-group.output{text-align:right}#s1-chain-canvas .s1-port-handle{display:block;width:100%;padding:5px 7px;border:1px solid #cdbca8;border-radius:5px;background:#fff8ef;color:#4b3829;text-align:left;cursor:crosshair}#s1-chain-canvas .s1-port-group.output .s1-port-handle{text-align:right}#s1-chain-canvas .s1-input-port{border-color:#89a8b5}#s1-chain-canvas .s1-output-port{border-color:#b68d63}#s1-chain-canvas .s1-port-handle.s1-connecting{background:#dcecf1;border-color:#426f83}',
      '[data-node-id^="nn-skill-"]{display:none!important}@media (max-width:900px){#s1-chain-canvas{padding:72px 14px 30px}#s1-chain-canvas .s1-chain-flow{min-width:1680px}}@media (max-width:600px){#s1-chain-canvas{padding-top:62px}#s1-chain-canvas .s1-chain-title{margin-bottom:12px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function installBackButton() {
    var appbarLeft = document.querySelector('.nomi-appbar__left');
    if (!appbarLeft || document.getElementById('s1-chain-back')) return;
    var style = document.createElement('style');
    style.id = 's1-chain-back-style';
    style.textContent = '#s1-chain-back{display:inline-flex;align-items:center;height:30px;padding:0 10px;border:1px solid rgba(90,64,42,.16);border-radius:7px;background:transparent;color:var(--nomi-ink-60,#6d5947);cursor:pointer;font:500 13px/1 Inter,system-ui,sans-serif;white-space:nowrap}#s1-chain-back:hover{background:var(--nomi-ink-05,rgba(90,64,42,.07));color:var(--nomi-ink,#2a2118)}@media(max-width:700px){#s1-chain-back{padding:0 7px;font-size:12px}}';
    document.head.appendChild(style);
    var backButton = document.createElement('button');
    backButton.id = 's1-chain-back';
    backButton.type = 'button';
    backButton.textContent = '返回项目库';
    backButton.setAttribute('aria-label', '返回项目库');
    backButton.title = '返回项目库';
    backButton.addEventListener('click', function () { window.location.assign('/studio/#/studio'); });
    appbarLeft.insertBefore(backButton, appbarLeft.firstChild);
  }

  function installStudioLibraryNavigation() {
    if (window.__s1StudioLibraryNavigationInstalled) return;
    window.__s1StudioLibraryNavigationInstalled = true;
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('.nomi-appbar__breadcrumb-seg--lib') : null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign('/studio/#/studio');
    }, true);
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
    function installH3NodeCard() {
      if (panel.querySelector('[data-node="h3"]')) return;
      var card = document.createElement('article');
      card.className = 's1-node'; card.dataset.node = 'h3'; card.dataset.status = 'draft';
      card.innerHTML = '<div class="s1-meta"><span>Skill 节点 · minimaxh3skill</span><small data-node-status>draft</small></div><h3>H3 生视频</h3><p>接收视频提示词与关键帧参考，生成任务始终由念念服务端创建、轮询并回库。</p><div class="s1-ports"><div class="s1-port-group input"><small>输入</small><button type="button" class="s1-port-handle s1-input-port" data-s1-input-node="s3-h3-video" data-s1-input-port="prompt" title="拖入 prompt 输出">prompt</button><button type="button" class="s1-port-handle s1-input-port" data-s1-input-node="s3-h3-video" data-s1-input-port="image_asset" title="拖入 image_asset 输出">image_asset</button></div><div class="s1-port-group output"><small>输出</small><button type="button" class="s1-port-handle s1-output-port" data-s1-output-node="s3-h3-video" data-s1-output-port="video_asset" title="从此端口拖到兼容输入">video_asset</button></div></div><div class="s1-assets" data-s3-assets><span>正在读取关键帧参考...</span></div><label class="s1-row"><span>提示词</span><input data-s3-prompt placeholder="描述镜头运动和画面连续性" style="flex:1;min-width:0;padding:6px;border:1px solid rgba(90,64,42,.2);border-radius:7px"></label><div class="s1-row"><span>规格</span><select data-s3-aspect><option value="9:16">9:16</option><option value="16:9">16:9</option></select><select data-s3-duration><option value="5">5 秒</option><option value="10">10 秒</option><option value="15">15 秒</option></select></div><div class="s1-status" data-s3-status>未创建任务；先保存 H3 节点合同。</div><div class="s1-preview" data-s3-preview>结果预览：等待 H3 产物</div><div class="s1-row"><button type="button" data-s3-create class="s1-secondary">保存 H3 节点</button><button type="button" data-s3-dry disabled>准备任务</button></div>';
      nodesEl.insertBefore(card, panel.querySelector('[data-s1-context]'));
      var menu = panel.querySelector('[data-s1-context]');
      if (menu && !menu.querySelector('[data-s1-add-generation="h3"]')) {
        var h3Button = document.createElement('button');
        h3Button.type = 'button'; h3Button.dataset.s1AddGeneration = 'h3'; h3Button.textContent = '生成节点 · H3 生视频';
        menu.appendChild(h3Button);
      }
    }
    installH3NodeCard();
    var h3Card = panel.querySelector('[data-node="h3"]');
    var h3Prompt = panel.querySelector('[data-s3-prompt]');
    var h3Aspect = panel.querySelector('[data-s3-aspect]');
    var h3Duration = panel.querySelector('[data-s3-duration]');
    var h3Status = panel.querySelector('[data-s3-status]');
    var h3Create = panel.querySelector('[data-s3-create]');
    var h3Dry = panel.querySelector('[data-s3-dry]');
    var h3AssetsEl = panel.querySelector('[data-s3-assets]');
    var h3JobId = null;
    var revision = 0;
    var assets = [];
    var chainReady = false;
    var nodeById = Object.create(null);
    var canvasDocument = {nodes:[], edges:[], viewport:{x:0,y:0,zoom:1}};
    var step01PollTimer = null;
    var nodeIds = {source:'s1-source-input',step01:'s1-step01-analysis',step02:'s1-step02-timeline',image2:'s2-image2-keyframe',h3:'s3-h3-video'};
    var championSpecs = {
      'screenwriter': {type:'text', version:'1.0.0', title:'剧本编排', note:'把故事或原始素材整理为剧本、梗概和设定集。', inputs:['story','source_material'], outputs:['screenplay','treatment','story_bible']},
      'chaoge-assets-trial': {type:'character', version:'1.3.0', title:'超哥资产方案', note:'从剧本和资产需求整理角色、道具与资产清单。', inputs:['screenplay','asset_requirements'], outputs:['character_assets','prop_assets','asset_manifest']},
      'shotlist-builder': {type:'shot', version:'1.0.0', title:'分镜规划', note:'把剧本、资产清单和风格参考编排为分镜与视频提示。', inputs:['screenplay','asset_manifest','style_reference'], outputs:['shotlist',{id:'video_prompt',type:'prompt'},'spatial_blocking']},
      'hell-grind': {type:'shot', version:'1.0.0', title:'镜头提示编译', note:'把分镜、参考资产和连续性约束编译为图像/视频提示词。', inputs:['shotlist','reference_assets','continuity_state'], outputs:[{id:'image_prompt',type:'prompt'},{id:'video_prompt',type:'prompt'},'continuity_locks']}
    };

    function installImage2PromptPort() {
      var row = image2Prompt.closest('.s1-row');
      if (!row || row.querySelector('[data-s1-input-node="s2-image2-keyframe"]')) return;
      var port = document.createElement('button');
      port.type = 'button'; port.className = 's1-port-handle s1-input-port';
      port.dataset.s1InputNode = 's2-image2-keyframe'; port.dataset.s1InputPort = 'prompt';
      port.setAttribute('aria-label', 'Image2 prompt 输入端口'); port.title = '拖入 prompt 输出'; port.textContent = 'prompt';
      row.insertBefore(port, image2Prompt);
    }
    installImage2PromptPort();

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
    function selectedH3Ids() { return Array.prototype.slice.call(panel.querySelectorAll('input[data-s3-asset]:checked')).map(function (input) { return input.value; }); }
    function syncH3Spec() { h3Create.disabled = false; h3Dry.disabled = !nodeById['s3-h3-video']; }
    function positionOf(key) { var node = nodeById[nodeIds[key]]; return node && node.position || {x:key === 'source' ? 90 : key === 'step01' ? 400 : key === 'step02' ? 710 : key === 'image2' ? 1020 : 1320,y:150}; }
    function applyNodePositions() {
      ['source','step01','step02','image2','h3'].forEach(function (key) { var card = panel.querySelector('[data-node="' + key + '"]'); var pos = positionOf(key); card.style.left = String(pos.x) + 'px'; card.style.top = String(pos.y) + 'px'; });
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
      window.requestAnimationFrame(renderTypedEdges);
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
    function nodePortButtons(node, direction) {
      var ports = node[direction + 'Ports'] || (node.data && node.data[direction + 'Ports']) || [];
      return ports.map(function (port) { return '<button type="button" class="s1-port-handle s1-' + direction + '-port" data-s1-' + direction + '-node="' + escapeHtml(node.id) + '" data-s1-' + direction + '-port="' + escapeHtml(port.id) + '" title="' + (direction === 'output' ? '从此端口拖到兼容输入' : '接收兼容输出') + '">' + escapeHtml(port.id) + '</button>'; }).join('') || '<span>等待连接</span>';
    }
    function championPrimaryPort(spec) { var port = spec.inputs[0]; return typeof port === 'string' ? port : port.id; }
    function championInputValue(node, portId) { return node && node.parameters && node.parameters.inputs && node.parameters.inputs[portId] || ''; }
    function championNodeMarkup(node, spec) {
      var primaryPort = championPrimaryPort(spec);
      return '<article class="s1-node s1-skill-node" data-champion-node data-node-id="' + escapeHtml(node.id) + '" data-status="' + escapeHtml(node.status || 'draft') + '"><div class="s1-meta"><span>编排 Skill · ' + escapeHtml(node.skillKey) + '</span><small data-node-status>' + escapeHtml(node.status || 'draft') + '</small></div><h3>' + escapeHtml((node.data && node.data.title) || spec.title) + '</h3><p>' + escapeHtml((node.data && node.data.note) || spec.note) + '</p><div class="s1-ports"><div class="s1-port-group input"><small>输入</small>' + nodePortButtons(node, 'input') + '</div><div class="s1-port-group output"><small>输出</small>' + nodePortButtons(node, 'output') + '</div></div><label class="s1-row" style="align-items:flex-start"><span>核心输入 · ' + escapeHtml(primaryPort) + '</span><textarea data-champion-input data-champion-port="' + escapeHtml(primaryPort) + '" placeholder="填写内容或从左侧端口连接上游输出" style="flex:1;min-width:0;min-height:54px;padding:6px;border:1px solid rgba(90,64,42,.2);border-radius:6px;font:inherit">' + escapeHtml(championInputValue(node, primaryPort)) + '</textarea></label><div class="s1-status" data-champion-readiness>保存后可检查当前节点是否具备编排输入。</div><div class="s1-row"><button type="button" class="s1-secondary" data-champion-save>保存参数</button><button type="button" data-champion-check>检查输入</button><button type="button" data-champion-run>运行编排（MCGrox）</button></div><div class="s1-status">编排节点只输出计划、提示词或资产引用；图像和视频仍通过后续生成节点的服务器任务链。</div></article>';
    }
    function renderChampionNodes(nodes) {
      panel.querySelectorAll('[data-champion-node]').forEach(function (card) { card.remove(); });
      (Array.isArray(nodes) ? nodes : []).forEach(function (node) {
        var spec = championSpecFor(node);
        if (!spec) return;
        nodesEl.insertAdjacentHTML('beforeend', championNodeMarkup(node, spec));
      });
    }
    function portDefinitionFor(nodeId, direction, portId) {
      var node = nodeById[nodeId];
      var ports = node && (node[direction + 'Ports'] || (node.data && node.data[direction + 'Ports'])) || [];
      return ports.find(function (port) { return port && port.id === portId; }) || null;
    }
    function portElement(direction, nodeId, portId) {
      return Array.prototype.slice.call(panel.querySelectorAll('[data-s1-' + direction + '-port]')).find(function (element) {
        return element.dataset['s1' + direction[0].toUpperCase() + direction.slice(1) + 'Node'] === nodeId && element.dataset['s1' + direction[0].toUpperCase() + direction.slice(1) + 'Port'] === portId;
      }) || null;
    }
    function renderTypedEdges() {
      nodesEl.querySelectorAll('.s1-typed-edge').forEach(function (edge) { edge.remove(); });
      var bounds = nodesEl.getBoundingClientRect();
      (canvasDocument.edges || []).filter(function (edge) { return edge && edge.sourcePort && edge.targetPort; }).forEach(function (edge) {
        var source = portElement('output', edge.source, edge.sourcePort);
        var target = portElement('input', edge.target, edge.targetPort);
        if (!source || !target) return;
        var a = source.getBoundingClientRect(); var b = target.getBoundingClientRect();
        var startX = a.right - bounds.left; var startY = a.top + a.height / 2 - bounds.top;
        var endX = b.left - bounds.left; var endY = b.top + b.height / 2 - bounds.top;
        var dx = endX - startX; var dy = endY - startY;
        var line = document.createElement('div');
        line.className = 's1-edge s1-typed-edge'; line.dataset.edgeId = edge.id;
        line.style.left = String(startX) + 'px'; line.style.top = String(startY) + 'px';
        line.style.width = String(Math.max(12, Math.sqrt(dx * dx + dy * dy))) + 'px';
        line.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
        nodesEl.insertBefore(line, nodesEl.firstChild);
      });
    }
    async function connectPorts(sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
      if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId || sourceNodeId === targetNodeId) return;
      var output = portDefinitionFor(sourceNodeId, 'output', sourcePortId);
      var input = portDefinitionFor(targetNodeId, 'input', targetPortId);
      if (!output || !input) throw new Error('端口不存在或节点尚未保存');
      if (output.type !== input.type) throw new Error('端口类型不兼容：' + output.type + ' 不能连接到 ' + input.type);
      if ((canvasDocument.edges || []).some(function (edge) { return edge.source === sourceNodeId && edge.sourcePort === sourcePortId && edge.target === targetNodeId && edge.targetPort === targetPortId; })) return;
      var previousEdges = canvasDocument.edges || [];
      canvasDocument.edges = previousEdges.concat([{id:'edge-port-' + Date.now().toString(36),source:sourceNodeId,target:targetNodeId,sourcePort:sourcePortId,targetPort:targetPortId,kind:'depends_on'}]);
      try {
        await persistRuntimeProjection();
        setStatus('已连接 ' + sourcePortId + ' → ' + targetPortId + '。');
      } catch (error) {
        canvasDocument.edges = previousEdges;
        renderTypedEdges();
        throw error;
      }
    }
    function nextChampionId(skillKey) { return 'skill-' + skillKey.replace(/[^A-Za-z0-9_-]/g, '-') + '-' + Date.now().toString(36); }
    function freeChampionPosition(position) {
      var occupied = Object.keys(nodeById).map(function (id) { return nodeById[id] && nodeById[id].position; }).filter(Boolean);
      for (var index = 0; index < 32; index += 1) {
        var candidate = {x:Math.max(0,Math.round(position.x + (index % 3) * 320)),y:Math.max(80,Math.round(position.y + Math.floor(index / 3) * 460))};
        if (!occupied.some(function (item) { return Math.abs(item.x - candidate.x) < 300 && Math.abs(item.y - candidate.y) < 430; })) return candidate;
      }
      return {x:Math.max(0,Math.round(position.x + 960)),y:Math.max(80,Math.round(position.y + 1380))};
    }
    async function createChampionNode(skillKey, position) {
      var spec = championSpecs[skillKey];
      if (!spec) return;
      var id = nextChampionId(skillKey);
      var nodePosition = freeChampionPosition(position);
      var portId = function (port) { return typeof port === 'string' ? port : port.id; };
      var portType = function (port) { return typeof port === 'string' ? port : port.type; };
      var ports = {inputPorts:spec.inputs.map(function (port, index) { return {id:portId(port),type:portType(port),required:index === 0}; }),outputPorts:spec.outputs.map(function (port) { return {id:portId(port),type:portType(port),required:false}; })};
      var parameters = {compiledOutputs:{}, providerSubmitRequested:false, gateState:'awaiting_inputs'};
      var node = {id:id,type:spec.type,kind:spec.type,status:'draft',skillKey:skillKey,skillVersion:spec.version,description:spec.note,inputPorts:ports.inputPorts,outputPorts:ports.outputPorts,parameters:parameters,assetRefs:[],taskRef:null,preview:null,recovery:{actions:['repair_input','retry'],lastAction:null},executionMode:'orchestration',position:nodePosition,data:{title:spec.title,note:spec.note,status:'draft',skillKey:skillKey,skillVersion:spec.version,description:spec.note,inputPorts:ports.inputPorts,outputPorts:ports.outputPorts,parameters:parameters,assetRefs:[],taskRef:null,preview:null,recovery:{actions:['repair_input','retry'],lastAction:null},executionMode:'orchestration'}};
      canvasDocument.nodes = (canvasDocument.nodes || []).concat([node]);
      nodeById[id] = node;
      await persistRuntimeProjection();
      setStatus('已添加「' + spec.title + '」。拖动标题可调整位置；端口只能连接同类型输出。');
    }
    async function saveChampionInput(card) {
      var node = nodeById[card && card.dataset.nodeId];
      var input = card && card.querySelector('[data-champion-input]');
      if (!node || !input) return;
      var parameters = Object.assign({}, node.parameters || {}, {inputs:Object.assign({}, node.parameters && node.parameters.inputs || {})});
      parameters.inputs[input.dataset.championPort] = input.value.trim();
      node.parameters = parameters;
      node.data = Object.assign({}, node.data || {}, {parameters:parameters});
      await persistRuntimeProjection();
      setStatus('已保存「' + (node.data && node.data.title || node.skillKey) + '」的核心输入。');
    }
    async function checkChampionReadiness(card) {
      var node = nodeById[card && card.dataset.nodeId];
      var status = card && card.querySelector('[data-champion-readiness]');
      if (!node || !status) return;
      status.textContent = '正在检查服务端输入合同...';
      try {
        var result = await api('/api/projects/' + encodeURIComponent(projectId()) + '/canvas/skill-nodes/' + encodeURIComponent(node.id) + '/readiness?projectKind=' + encodeURIComponent(projectKind()));
        var readiness = result.body.readiness || {};
        status.textContent = readiness.ready ? '核心输入已齐全，可在文本模型配置完成后请求编排。' : '尚缺：' + (readiness.blockers || []).map(function (blocker) { return blocker.portId + (blocker.reason === 'upstream_output_missing' ? '（等待上游输出）' : '（需要输入）'); }).join('、');
      } catch (error) { status.textContent = (error.code ? error.code + ': ' : '') + (error.message || '输入检查失败'); }
    }
    async function runChampionNode(card) {
      var node = nodeById[card && card.dataset.nodeId];
      var status = card && card.querySelector('[data-champion-readiness]');
      if (!node || !status) return;
      status.textContent = '正在检查 MCGrox 编排任务...';
      var endpoint = '/api/projects/' + encodeURIComponent(projectId()) + '/canvas/skill-nodes/' + encodeURIComponent(node.id) + '/compile';
      try {
        var dry = await api(endpoint, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectKind:projectKind()})});
        if (!dry.body.providerSubmitEnabled) {
          status.textContent = 'MCGrox 服务端执行器未就绪；节点输入已保留，可在服务恢复后重试。';
          return;
        }
        status.textContent = '正在运行编排；完成后输出会回写到此节点。';
        var result = await api(endpoint, {method:'POST',headers:{'content-type':'application/json','if-match':'"canvas-rev-' + revision + '"','idempotency-key':'canvas-compiler-' + node.id + '-' + Date.now()},body:JSON.stringify({projectKind:projectKind(),confirmProviderCall:true})});
        revision = Number(result.body.revision || revision);
        canvasDocument.nodes = (canvasDocument.nodes || []).map(function (item) { return item.id === node.id ? result.body.node : item; });
        renderNodes(canvasDocument.nodes);
        setStatus('「' + (node.data && node.data.title || node.skillKey) + '」已完成编排，输出已回写到画布端口。');
      } catch (error) {
        status.textContent = (error.code ? error.code + ': ' : '') + (error.message || '编排任务失败，可检查输入后重试');
      }
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
    function installPortConnections() {
      var selected = null;
      function clearSelected() {
        if (selected && selected.element) selected.element.classList.remove('s1-connecting');
        selected = null;
      }
      panel.addEventListener('pointerdown', function (event) {
        var source = event.target.closest('[data-s1-output-port]');
        if (!source || !panel.contains(source)) return;
        event.preventDefault(); event.stopPropagation();
        source.classList.add('s1-connecting');
        var sourceNodeId = source.dataset.s1OutputNode;
        var sourcePortId = source.dataset.s1OutputPort;
        function finish(next) {
          source.classList.remove('s1-connecting');
          var target = document.elementFromPoint(next.clientX, next.clientY);
          var input = target && target.closest && target.closest('[data-s1-input-port]');
          if (!input || !panel.contains(input)) return;
          connectPorts(sourceNodeId, sourcePortId, input.dataset.s1InputNode, input.dataset.s1InputPort).catch(function (error) {
            setStatus(error.message || '端口连接失败', true);
          });
        }
        window.addEventListener('pointerup', finish, {once:true});
      });
      panel.addEventListener('click', function (event) {
        var output = event.target.closest('[data-s1-output-port]');
        if (output && panel.contains(output)) {
          event.preventDefault(); event.stopPropagation();
          if (selected && selected.element === output) { clearSelected(); return; }
          clearSelected();
          selected = {element:output,nodeId:output.dataset.s1OutputNode,portId:output.dataset.s1OutputPort};
          output.classList.add('s1-connecting');
          setStatus('已选择输出端口；点击兼容输入端完成连接。');
          return;
        }
        var input = event.target.closest('[data-s1-input-port]');
        if (!input || !selected || !panel.contains(input)) return;
        var source = selected;
        clearSelected();
        connectPorts(source.nodeId, source.portId, input.dataset.s1InputNode, input.dataset.s1InputPort).catch(function (error) {
          setStatus(error.message || '端口连接失败', true);
        });
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
      var h3 = (Array.isArray(nodes) ? nodes : []).find(function (node) { return node.id === 's3-h3-video'; });
      if (h3) { h3Card.dataset.status = h3.status; h3Card.querySelector('[data-node-status]').textContent = h3.status; h3Prompt.value = h3.data && h3.data.prompt || ''; h3Aspect.value = h3.data && h3.data.aspectRatio || h3Aspect.value; h3Duration.value = String(h3.data && h3.data.durationSeconds || h3Duration.value); h3Status.textContent = '节点合同已保存；任务会先进入等待授权状态。'; }
      syncH3Spec();
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
    function renderH3Assets() {
      var images = assets.filter(function (asset) { return asset.kind === 'reference_image' || asset.kind === 'generated_image'; });
      h3AssetsEl.innerHTML = images.length ? images.map(function (asset) { return '<label class="s1-asset"><input type="checkbox" data-s3-asset value="' + escapeHtml(asset.id) + '"><span class="s1-asset-name">' + escapeHtml(asset.originalName || asset.id) + '</span></label>'; }).join('') : '<span>暂无可用关键帧；可先连接 Image2.image_asset 或在素材库上传图片。</span>';
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
        renderH3Assets();
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
    async function createH3() {
      h3Create.disabled = true; h3Status.textContent = '正在保存 H3 节点合同...';
      try {
        var result = await api('/api/canvas/documents/' + encodeURIComponent(projectKind()) + '/' + encodeURIComponent(projectId()) + '/s3-h3', {method:'POST',headers:{'content-type':'application/json','if-match':'"canvas-rev-' + revision + '"'},body:JSON.stringify({prompt:h3Prompt.value,aspectRatio:h3Aspect.value,durationSeconds:Number(h3Duration.value),referenceAssetIds:selectedH3Ids()})});
        revision = Number(result.body.revision || revision); canvasDocument.nodes = (canvasDocument.nodes || []).filter(function (node) { return node.id !== 's3-h3-video'; }).concat([result.body.node]); renderNodes(canvasDocument.nodes); h3Status.textContent = 'H3 节点已保存。下一步只能准备服务端候选，提交仍需明确授权。';
      } catch (error) { h3Status.textContent = (error.code ? error.code + ': ' : '') + (error.message || '保存失败'); }
      syncH3Spec();
    }
    async function dryRunH3() {
      h3Dry.disabled = true; h3Status.textContent = '正在建立 H3 候选并执行 dry-run（不提交 Provider）...';
      try {
        var prepared = await api('/api/projects/' + encodeURIComponent(projectId()) + '/canvas/jobs', {method:'POST',headers:{'content-type':'application/json','idempotency-key':'s3-h3-' + Date.now()},body:JSON.stringify({projectKind:projectKind(),nodeId:'s3-h3-video',model:'h3',prompt:h3Prompt.value,aspectRatio:h3Aspect.value,durationSeconds:Number(h3Duration.value),inputAssetIds:selectedH3Ids()})});
        h3JobId = prepared.body.job && prepared.body.job.id;
        if (!h3JobId) throw new Error('服务器没有返回 H3 候选任务');
        var dry = await api('/api/projects/' + encodeURIComponent(projectId()) + '/canvas/jobs/' + encodeURIComponent(h3JobId) + '/dry-run', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectKind:projectKind()})});
        h3Status.textContent = dry.body.dryRun && dry.body.dryRun.providerSubmitEnabled ? '规格检查通过；提交前仍需明确授权。' : '规格检查通过；当前仅建立候选，Provider 未启用或未授权。';
      } catch (error) {
        h3Status.textContent = error.code === 'CANVAS_SKILL_COMPILED_PROMPT_REQUIRED'
          ? '等待 Hell Grind 完成 video_prompt 编译后再准备 H3 任务。'
          : (error.code ? error.code + ': ' : '') + (error.message || '准备失败');
      }
      syncH3Spec();
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
    // The shipped Studio canvas owns the blank-surface context menu. Register on
    // its root during capture so Skill nodes use the same right-click entry point
    // without editing the hashed Studio bundle or intercepting node controls.
    function showCanvasSkillMenu(event) {
      if (event.target.closest('#s1-chain-canvas')) return;
      if (event.target.closest('button,input,textarea,select,a,[role="menu"]')) return;
      showContextMenu(event);
      event.stopPropagation();
    }
    host.addEventListener('contextmenu', showCanvasSkillMenu, true);
    contextMenu.addEventListener('click', function (event) {
      var button = event.target.closest('[data-s1-add-skill]');
      var generation = event.target.closest('[data-s1-add-generation]');
      if (!button && !generation) return;
      hideContextMenu();
      if (generation) { createH3().catch(function (error) { setStatus((error.code ? error.code + ': ' : '') + (error.message || '添加节点失败'), true); }); return; }
      var skillKey = button.getAttribute('data-s1-add-skill');
      createChampionNode(skillKey, contextPoint).catch(function (error) { setStatus((error.code ? error.code + ': ' : '') + (error.message || '添加节点失败'), true); });
    });
    panel.addEventListener('pointerdown', function (event) { if (!event.target.closest('[data-s1-context]')) hideContextMenu(); });
    panel.addEventListener('click', function (event) {
      var card = event.target.closest('[data-champion-node]');
      if (!card) return;
      if (event.target.closest('[data-champion-save]')) saveChampionInput(card).catch(function (error) { setStatus(error.message || '参数保存失败', true); });
      if (event.target.closest('[data-champion-check]')) checkChampionReadiness(card);
      if (event.target.closest('[data-champion-run]')) runChampionNode(card);
    });
    panel.querySelector('[data-s1-refresh]').addEventListener('click', load);
    startBtn.addEventListener('click', startStep01);
    image2Create.addEventListener('click', createImage2); image2Dry.addEventListener('click', dryRunImage2);
    h3Create.addEventListener('click', createH3); h3Dry.addEventListener('click', dryRunH3);
    [image2Prompt,image2Channel,image2Resolution,image2Aspect].forEach(function (el) { el.addEventListener('input', syncImage2Spec); el.addEventListener('change', syncImage2Spec); });
    [h3Prompt,h3Aspect,h3Duration].forEach(function (el) { el.addEventListener('input', syncH3Spec); el.addEventListener('change', syncH3Spec); });
    syncImage2Spec();
    syncH3Spec();
    rightsEl.addEventListener('change', syncButton); preflightEl.addEventListener('change', syncButton); createBtn.addEventListener('click', create);
    installDragging();
    installPortConnections();
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
    installStudioLibraryNavigation();
    installBackButton();
    mountIntoGenerationCanvas();
    var observer = new MutationObserver(function () { installBackButton(); mountIntoGenerationCanvas(); });
    observer.observe(document.documentElement, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeGenerationCanvas, {once: true}); else observeGenerationCanvas();
}());
