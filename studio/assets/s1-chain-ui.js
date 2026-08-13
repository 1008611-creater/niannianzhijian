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
      '#s1-chain-panel{position:fixed;left:18px;top:72px;z-index:120;width:min(360px,calc(100vw - 36px));max-height:calc(100vh - 96px);overflow:auto;padding:16px;color:#2a2118;background:rgba(255,252,246,.96);border:1px solid rgba(90,64,42,.18);border-radius:12px;box-shadow:0 18px 50px rgba(42,33,24,.16);font:13px/1.45 Inter,system-ui,sans-serif;backdrop-filter:blur(14px)}',
      '#s1-chain-panel[hidden]{display:none}#s1-chain-panel h2{margin:0;font-size:16px;font-weight:700}#s1-chain-panel p{margin:5px 0 12px;color:#786958}#s1-chain-panel .s1-eyebrow{font-size:10px;letter-spacing:.12em;color:#9a6a3c;font-weight:700}#s1-chain-panel .s1-assets{display:grid;gap:6px;margin:10px 0 12px}',
      '#s1-chain-panel label.s1-asset{display:flex;gap:8px;align-items:center;padding:8px;border:1px solid rgba(90,64,42,.12);border-radius:8px;background:#fffaf3;cursor:pointer}#s1-chain-panel label.s1-asset:hover{border-color:#b78455}#s1-chain-panel .s1-asset-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#s1-chain-panel .s1-row{display:flex;gap:8px;align-items:center;margin:8px 0}#s1-chain-panel select{flex:1;padding:7px;border:1px solid rgba(90,64,42,.2);border-radius:7px;background:#fff}#s1-chain-panel button{border:0;border-radius:7px;padding:8px 11px;background:#2a2118;color:#fff;cursor:pointer;font-weight:600}#s1-chain-panel button[disabled]{opacity:.45;cursor:default}#s1-chain-panel .s1-secondary{background:#efe5d8;color:#4c3828}#s1-chain-panel .s1-status{margin-top:10px;padding:9px;border-radius:8px;background:#f4eee6;color:#5d4d3d;white-space:pre-wrap}#s1-chain-panel .s1-status.error{background:#fff0ee;color:#a33b2d}#s1-chain-panel .s1-nodes{display:grid;gap:5px;margin-top:10px}#s1-chain-panel .s1-node{display:flex;justify-content:space-between;gap:8px;padding:7px 8px;background:#faf5ef;border-radius:7px}#s1-chain-panel .s1-node small{color:#8b7764}',
      '@media (max-width:600px){#s1-chain-panel{left:10px;top:58px;width:calc(100vw - 20px);max-height:calc(100vh - 70px)}}'
    ].join('');
    document.head.appendChild(style);
  }

  function mount() {
    if (document.getElementById('s1-chain-panel')) return;
    var panel = document.createElement('section');
    panel.id = 's1-chain-panel';
    panel.setAttribute('aria-label', 'S1 原片到时间线');
    panel.hidden = true;
    panel.innerHTML = '<div class="s1-eyebrow">S1 CANVAS CHAIN</div><h2>原片到 Step02 时间线</h2><p>选择当前项目的视频素材，完成权利与媒体预检后创建三个可恢复节点。</p><div class="s1-assets" data-s1-assets><span>正在读取项目素材...</span></div><label class="s1-row"><input type="checkbox" data-s1-rights> 我确认拥有该原片的使用权</label><div class="s1-row"><span>媒体预检</span><select data-s1-preflight><option value="pending">未完成</option><option value="passed">已通过</option></select></div><div class="s1-row"><button type="button" data-s1-refresh class="s1-secondary">刷新素材</button><button type="button" data-s1-create disabled>创建 S1 节点链</button></div><div class="s1-status" data-s1-status>等待选择视频素材。</div><div class="s1-nodes" data-s1-nodes hidden></div>';
    document.body.appendChild(panel);
    installStyles();
    var assetsEl = panel.querySelector('[data-s1-assets]');
    var statusEl = panel.querySelector('[data-s1-status]');
    var nodesEl = panel.querySelector('[data-s1-nodes]');
    var createBtn = panel.querySelector('[data-s1-create]');
    var rightsEl = panel.querySelector('[data-s1-rights]');
    var preflightEl = panel.querySelector('[data-s1-preflight]');
    var revision = 0;
    var assets = [];

    function setStatus(message, error) { statusEl.textContent = message; statusEl.classList.toggle('error', Boolean(error)); }
    function selectedIds() { return Array.prototype.slice.call(panel.querySelectorAll('input[data-s1-asset]:checked')).map(function (input) { return input.value; }); }
    function syncButton() { createBtn.disabled = selectedIds().length === 0 || !rightsEl.checked || preflightEl.value !== 'passed'; }
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
        setStatus(doc.body.document && doc.body.document.nodes && doc.body.document.nodes.some(function (node) { return node.id === 's1-source-input'; }) ? 'S1 节点链已存在，可继续在画布中编辑。' : '等待选择视频素材。');
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
        nodesEl.hidden = false;
        nodesEl.innerHTML = nodes.filter(function (node) { return /^s1-/.test(node.id); }).map(function (node) { return '<div class="s1-node"><span>' + escapeHtml(node.data && node.data.title || node.id) + '</span><small>' + escapeHtml(node.status) + '</small></div>'; }).join('');
        setStatus('已创建 3 个节点和 2 条依赖边。Step01 当前保持真实阻塞，不会提交 Provider。');
      } catch (error) { setStatus((error.code ? error.code + ': ' : '') + (error.message || '创建失败'), true); syncButton(); }
    }
    panel.querySelector('[data-s1-refresh]').addEventListener('click', load);
    rightsEl.addEventListener('change', syncButton); preflightEl.addEventListener('change', syncButton); createBtn.addEventListener('click', create);
    load();
    window.addEventListener('hashchange', load);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true}); else mount();
}());
