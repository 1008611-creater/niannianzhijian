(function () {
  'use strict';

  const state = { route:null, evidence:null, ledger:null, snapshot:null, reviewEtag:null, reconcile:null, loading:false, error:null, confirming:false, reconciling:false };
  const root = () => document.getElementById('redrawStudioContent');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const currentRoute = () => {
    const match = location.hash.match(/^#redraw-source-truth\/([^/]+)$/i);
    return match ? { projectId:decodeURIComponent(match[1]) } : null;
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, {cache:'no-store', ...options});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || '暂时无法读取原片资料');
      error.code = payload.code;
      error.status = response.status;
      throw error;
    }
    return {payload, etag:response.headers.get('ETag')};
  };
  const evidenceShot = shotId => state.evidence?.timeline?.shots?.find(item => item.shotId === shotId) || null;
  const frame = (shotId, point) => evidenceShot(shotId)?.evidence?.keyframes?.find(item => item.point === point) || null;
  const facts = shot => [
    ['人物', (shot.characters || []).join('、')],
    ['服装', shot.wardrobe],
    ['动作', shot.action],
    ['画面事实', shot.source_visual_facts]
  ].filter(([, value]) => String(value || '').trim());
  const isSnapshotCurrent = () => {
    const snapshot = state.snapshot;
    const evidence = state.evidence;
    if (!snapshot || !evidence) return false;
    const revisionTime = (state.ledger?.revisions || []).reduce((latest, item) => Math.max(latest, Date.parse(item.created_at) || 0), 0);
    const confirmedAt = Date.parse(snapshot.confirmed_at) || 0;
    return snapshot.source_sha256 === evidence.package?.sourceSha256
      && Number(snapshot.counts?.shots) === Number(state.ledger?.counts?.shots)
      && Number(snapshot.counts?.frames) === Number(state.ledger?.counts?.frame_evidence)
      && Number(snapshot.counts?.dialogue) === Number(state.ledger?.counts?.dialogue_rows)
      && Number(snapshot.counts?.ocr) === Number(state.ledger?.counts?.ocr_rows)
      && (!state.reviewEtag || snapshot.shot_review_revision === state.reviewEtag)
      && confirmedAt >= revisionTime;
  };
  const factsComplete = () => (state.ledger?.shots || []).every(shot => String(shot.source_visual_facts || '').trim());
  const fullEvidenceReady = () => state.reconcile?.completed === true;
  function snapshotState() {
    if (!fullEvidenceReady()) return {label:state.reconcile?.status || '正在整理完整原片证据', detail:'原片全部证据整理完成后，才能确认时间轴。'};
    if (!factsComplete()) return {label:'原片事实待整理', detail:'先整理逐镜头画面事实，再进入地区选择。'};
    if (!state.snapshot) return {label:'尚未确认', detail:'核对完成后确认当前原片时间轴。'};
    if (!isSnapshotCurrent()) return {label:'需要重新确认', detail:'原片资料已有更新，请确认当前版本后再选择地区。'};
    return {label:'当前版本已确认', detail:'可以进入地区选择。'};
  }
  function isUsefulOcr(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text || /^\d{1,4}$/.test(text)) return false;
    const noise = /FaceTime|发送信息|共享联系人|添加到个人收藏|个人收藏|最近通话|通讯录|拨号键盘|语音信箱|滑动来接听|免提|静音|通话中|视频通话|^\d+[\s0-9*#]*$/i;
    return !noise.test(text);
  }
  function sourceItems(ids, all, empty, kind) {
    const entries = (ids || [])
      .map(id => (all || []).find(item => item.dialogue_id === id || item.ocr_id === id))
      .filter(Boolean)
      .filter(entry => kind !== 'ocr' || isUsefulOcr(entry.source_text));
    return entries.length
      ? '<ul>' + entries.map(entry => '<li>' + esc(entry.source_text || '') + '</li>').join('') + '</ul>'
      : '<span class="source-truth-empty-line">' + esc(empty) + '</span>';
  }
  function observationCell(shot) {
    const rows = facts(shot);
    return rows.length
      ? '<p class="source-truth-fact-copy">' + rows.map(([, value]) => esc(value)).join('<br>') + '</p>'
      : '<span class="source-truth-empty-line">等待修订补充</span>';
  }
  function continuityCell(shot) {
    const rows = [];
    if (shot.continuity_block_id) rows.push('与相邻镜头保持人物、服装和物件连续');
    if ((shot.props || []).length) rows.push('关键物件：' + shot.props.join('、'));
    if (/电话|手机|屏幕|文件|登记|多人/.test([shot.action, shot.source_visual_facts, ...(shot.props || [])].join(' '))) rows.push('重点核对画面信息');
    return rows.length ? '<ul>' + rows.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>' : '<span class="source-truth-empty-line">无特别连续性要求</span>';
  }
  function evidenceFrames(shot, index) {
    return ['start', 'mid', 'end'].map(point => {
      const item = frame(shot.shot_id, point);
      const label = {start:'起始',mid:'中间',end:'结束'}[point];
      const eager = index < 2;
      return '<figure>' + (item?.url ? '<img src="' + esc(item.url) + '" alt="' + esc(shot.shot_id + label + '帧原片证据') + '" loading="' + (eager ? 'eager' : 'lazy') + '" fetchpriority="' + (eager ? 'high' : 'auto') + '" decoding="async">' : '<span class="source-truth-frame-missing">证据帧不可读</span>') + '<figcaption>' + label + '</figcaption></figure>';
    }).join('');
  }
  function render() {
    const target = root();
    if (!target) return;
    if (state.loading) {
      target.innerHTML = '<section class="source-truth-stage"><div class="source-truth-empty"><strong>正在读取原片真相</strong><span>只读取已验证的原片证据。</span></div></section>';
      return;
    }
    if (state.error) {
      target.innerHTML = '<section class="source-truth-stage"><div class="source-truth-empty"><strong>原片资料暂不可用</strong><span>' + esc(state.error.message) + '</span><button type="button" data-source-truth-retry>重新读取</button><button type="button" data-source-truth-back>返回工作台</button></div></section>';
      return;
    }
    const shots = state.ledger?.shots || [];
    if (!shots.length) {
      target.innerHTML = '<section class="source-truth-stage"><div class="source-truth-empty"><strong>没有可核对的镜头</strong><span>当前项目还没有完整的原片证据。</span><button type="button" data-source-truth-retry>重新读取</button></div></section>';
      return;
    }
    const status = snapshotState();
    const rows = shots.map((shot, index) => '<article class="source-truth-shot" data-source-truth-row="' + esc(shot.shot_id) + '"><header><div><strong>' + esc(shot.shot_id) + '</strong><span>' + esc(shot.start_timecode) + ' 至 ' + esc(shot.end_timecode) + '</span></div><button type="button" data-source-truth-revise="' + esc(shot.shot_id) + '">修订</button></header><div class="source-truth-shot-content"><section class="source-truth-evidence"><h2>原片证据</h2><div>' + evidenceFrames(shot, index) + '</div></section><section class="source-truth-observations"><h2>画面事实</h2>' + observationCell(shot) + '</section><section class="source-truth-source-text"><h2>对白与文字</h2><div><h3>对白</h3>' + sourceItems(shot.dialogue_ids, state.ledger.dialogue_rows, '无对白', 'dialogue') + '</div><div><h3>画面文字</h3>' + sourceItems(shot.ocr_ids, state.ledger.ocr_rows, '无与剧情相关的可见文字', 'ocr') + '</div></section><section class="source-truth-continuity"><h2>连续性与道具</h2>' + continuityCell(shot) + '</section></div></article>').join('');
    const mainLabel = isSnapshotCurrent() ? '选择地区' : (state.confirming ? '正在确认…' : '确认原片时间轴并选择地区');
    const reconcileLabel = state.reconciling ? '正在整理完整原片证据…' : '重新整理完整原片证据';
    target.innerHTML = '<section class="source-truth-stage" data-source-truth-project="' + esc(state.route.projectId) + '"><header class="source-truth-header"><div><button type="button" data-source-truth-back>返回工作台</button><span>念念 AI</span><i>/</i><strong>原片事实账本</strong></div><div><span class="source-truth-snapshot ' + (isSnapshotCurrent() ? 'is-current' : '') + '">' + esc(status.label) + '</span>' + (!fullEvidenceReady() ? '<button type="button" data-source-truth-reconcile ' + (state.reconciling ? 'disabled' : '') + '>' + reconcileLabel + '</button>' : '') + '<button class="is-primary" type="button" data-source-truth-primary' + (state.confirming || !factsComplete() || !fullEvidenceReady() ? ' disabled' : '') + '>' + mainLabel + '</button></div></header><main class="source-truth-document"><header><div><h1>原片逐镜头事实表</h1><p>每个镜头用三张关键图快速核对；完整原片证据已用于后台事实整理。</p></div><strong>' + esc(String(shots.length)) + ' 个镜头</strong></header><div class="source-truth-shot-list">' + rows + '</div></main></section>';
  }
  async function load() {
    const route = currentRoute();
    if (!route) return;
    state.route = route;
    state.loading = true;
    state.error = null;
    render();
    try {
      const base = '/api/projects/' + encodeURIComponent(route.projectId);
      const evidence = await api(base + '/step01-evidence');
      state.evidence = evidence.payload.evidence;
      const ledger = await api(base + '/step01/shot-ledger');
      state.ledger = ledger.payload.ledger;
      const snapshot = await api(base + '/step01/snapshots/current').catch(error => error.code === 'STEP01_SNAPSHOT_REQUIRED' ? null : Promise.reject(error));
      state.snapshot = snapshot?.payload?.snapshot || null;
      const reconcile = await api(base + '/step01/visual-facts/reconcile').catch(() => null);
      state.reconcile = reconcile?.payload?.reconcile || null;
      state.reviewEtag = null;
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      render();
    }
  }
  async function continueToMarket() {
    state.confirming = true;
    render();
    try {
      const review = await api('/api/projects/' + encodeURIComponent(state.route.projectId) + '/shot-review?analysis_run_id=' + encodeURIComponent(state.evidence.package?.analysisRunId || state.evidence.package?.analysis_run_id || state.ledger?.analysis_run_id || ''));
      state.reviewEtag = String(review.etag || '').replace(/^W\//, '');
      if (isSnapshotCurrent()) {
        location.hash = 'redraw/' + encodeURIComponent(state.route.projectId) + '/stage/02';
        return;
      }
      const result = await api('/api/projects/' + encodeURIComponent(state.route.projectId) + '/step01/confirm', {
        method:'POST',
        headers:{'Content-Type':'application/json','If-Match':state.reviewEtag},
        body:JSON.stringify({analysis_run_id:state.evidence.package?.analysisRunId || state.evidence.package?.analysis_run_id || state.ledger?.analysis_run_id || ''})
      });
      state.snapshot = result.payload.snapshot;
      location.hash = 'redraw/' + encodeURIComponent(state.route.projectId) + '/stage/02';
    } catch (error) {
      state.error = error;
      state.confirming = false;
      render();
    }
  }
  async function reconcileVisualFacts() {
    state.reconciling = true;
    render();
    try {
      await api('/api/projects/' + encodeURIComponent(state.route.projectId) + '/step01/visual-facts/reconcile', {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'visual-facts-' + Date.now().toString(36)},body:'{}'});
      state.reconciling = false;
      await load();
    } catch (error) {
      state.reconciling = false;
      state.error = error;
      render();
    }
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-source-truth-retry]')) { void load(); return; }
    if (event.target.closest('[data-source-truth-reconcile]')) { void reconcileVisualFacts(); return; }
    if (event.target.closest('[data-source-truth-back]')) { location.hash = 'workbench'; return; }
    if (event.target.closest('[data-source-truth-revise]')) { location.hash = 'redraw-ledger/' + encodeURIComponent(state.route.projectId); return; }
    if (event.target.closest('[data-source-truth-primary]')) void continueToMarket();
  });
  function sync() {
    if (currentRoute()) {
      document.body.classList.add('is-production-studio');
      document.body.dataset.productionStudio = 'redraw';
      if (typeof setView === 'function') setView('redraw-source-truth/' + encodeURIComponent(currentRoute().projectId), {syncHash:false});
      void load();
    } else if (root()?.querySelector('.source-truth-stage')) root().innerHTML = '';
  }
  window.addEventListener('hashchange', sync);
  sync();
})();
