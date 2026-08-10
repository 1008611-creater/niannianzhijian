(() => {
  window.__NIANNIAN_STEP02_CLIENT_BUILD = 'step02-r13-redraw-direct-entry-r1';
  const state = { projects: [], scriptProjects: [], workspaceProjects: [], workspaceDeliveries: {}, redrawIntakeWorkspaceId: null, redrawIntakeStatus: null, activeProject: null, user: null, loadingProjects: false, projectEventRevision: 0, projectEventPendingRevision: 0, workbenchProjectId: null, workbenchStepId: null, workbenchSelectionKey: null, workbenchTab: 'overview', workbenchAssetId: null, workbenchAssetViewer: null, workbenchReviews: {}, workbenchReviewLoading: {}, workbenchActivities: {}, workbenchActivityLoading: {}, workbenchMediaDelivery: {}, workbenchMotionPlayed: false, workbenchViewTransitionActive: false, guideFlow: 'novel', guideStepId: 'N01', guideMotionKey: null, sourceReplacementSelectionOpen: false, scriptReview: null, scriptReviewLoading: null, scriptN06Review: null, scriptN06ReviewLoading: null, videoChannels: null, scriptStudioProjectId: null, scriptStudioStageId: null, scriptStoryboardGroupId: null, scriptVideoGroupId: null, scriptAssetId: null, scriptDecisionDraft: null, scriptDecisionFeedback: null, redrawStudioProjectId: null, redrawStudioStageId: null, redrawMarketLocale: null, redrawSourceFacts: {}, redrawSourceFactsLoading: {}, redrawSourceFactsError: {}, redrawSourceFactShotId: null, redrawShotSelections: {}, redrawShotSelectionDrafts: {}, redrawShotSelectionLoading: {}, redrawShotSelectionErrors: {}, redrawShotReviewModels: {}, redrawShotReviewModelEtags: {}, redrawShotReviewEtags: {}, redrawShotReviewHistory: {}, redrawShotReviewEdit: null, redrawShotReviewSave: null, step01AuthorityImport: null, step02PublicProjections: {}, step02PublicProjectionLoading: {}, step02PublicProjectionError: {}, step02Snapshots: {}, step02VariantLists: {}, step02Variants: {}, step02VariantId: null, step02SelectedShotId: null, step02Loading: {}, step02Error: {}, step02MarketModal: null, step02Draft: null, step02Candidate: null, step02Action: null, localizationStatus: {}, localizationEtags: {}, localizationLoading: {}, localizationError: {}, localizationConfirming: {}, referenceEvidence: null, referenceEvidenceId: null, referenceEvidenceShotId: null, studioMotionKey: null, studioStageFocus: null, wizardReturnFocus: null, scriptDramaWizardReturnFocus: null, assetViewerReturnFocus: null, commandPaletteReturnFocus: null, commandPaletteQuery: '' };
  state.localizationRevisions = {};
  const defaultReferenceEvidenceId = 'NN-20260715083045-8120F5-EP001';
  const legacyReferenceEvidenceId = 'WEBSITE_REF_20260711';
  const exactStep01ProjectId = 'NN-20260715083045-8120F5';
  const shotReviewContractSha256 = '9887052943ef52a0721fb93ccc08acfcad8792de2f1e734bea7dc12387398a25';
  const wizard = document.getElementById('projectWizard');
  const form = document.getElementById('projectCreateForm');
  const status = document.getElementById('wizardStatus');
  const scriptDramaWizard = document.getElementById('scriptDramaWizard');
  const scriptDramaForm = document.getElementById('scriptDramaCreateForm');
  const scriptDramaStatus = document.getElementById('scriptDramaWizardStatus');
  const commandPalette = document.getElementById('commandPalette');
  const commandPaletteInput = document.getElementById('commandPaletteInput');
  const commandPaletteResults = document.getElementById('commandPaletteResults');
  const commandPaletteTrigger = document.querySelector('[data-command-palette-open]');
  const list = document.getElementById('projectList');
  const detail = document.getElementById('projectDetail');
  const search = document.getElementById('projectSearch');
  const filter = document.getElementById('projectStatusFilter');
  const projectTypeFilter = document.getElementById('projectTypeFilter');
  const projectSummary = document.getElementById('projectSummary');
  const projectToolbar = document.querySelector('.project-toolbar');
  const projectCreateActions = document.getElementById('projectCreateActions');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalForm = document.getElementById('modalForm');
  const modalInput = document.getElementById('modalInput');
  const modalPassword = document.getElementById('modalPassword');
  const modalStatus = document.getElementById('modalStatus');
  const modalSubmit = document.getElementById('modalSubmit');
  const registerButton = document.querySelector('[data-modal="register"]');
  const loginButton = document.querySelector('[data-modal="login"]');
  const accountMenu = document.getElementById('accountMenu');
  const accountLabel = document.querySelector('[data-account-label]');
  const accountAvatar = document.querySelector('[data-account-avatar]');
  const accountEmail = document.querySelector('[data-account-email]');
  const workbenchCreateActions = document.querySelector('[data-workbench-create-actions]');
  const workbenchContent = document.getElementById('workbenchContent');
  const scriptStudioContent = document.getElementById('scriptStudioContent');
  const guideStepList = document.getElementById('guideStepList');
  const guideFocus = document.getElementById('guideFocus');
  const teamContent = document.getElementById('teamContent');
  const assetViewer = document.getElementById('assetViewer');

  const guideFlows = {
    novel: {
      label: '小说短剧',
      eyebrow: 'NOVEL TO SHORT DRAMA',
      title: '从小说到可审核短剧',
      startAction: 'data-open-script-drama-wizard',
      startLabel: '创建小说短剧项目',
      checklist: ['拥有小说、剧本或可粘贴正文', '确认拥有使用与改编权限', '准备首集范围与想要的成片比例'],
      steps: [
        { id:'N01', index:'01', title:'原文与改编权', summary:'锁定小说原文、抽取文本、章节索引与改编权，先建立可以追溯的故事事实。', outputs:['原文 SHA-256','章节与段落索引','改编权确认','事实账本'], gate:'原文、权利和事实账本齐全后才能规划分集', next:'02 · 角色与分集' },
        { id:'N02', index:'02', title:'角色与分集', summary:'把首集拆成角色关系、场景、关键道具和可执行的分镜资产计划。', outputs:['角色设定','首集节拍','场景与道具计划','资产职责'], gate:'脚本与资产职责经过质量检查后才能进入候选审核', next:'03 · 智能分镜' },
        { id:'N05', index:'03', title:'候选与分镜审核', summary:'逐项确认角色、场景、道具和真首帧的 exact SHA，再核对每组镜头事实和两段式提示词。', outputs:['候选图决定','首帧计划','镜头事实卡','锁定两段式提示词'], gate:'每一张需要上传的参考都要由用户确认当前版本', next:'04 · 视频与交付' },
        { id:'N06', index:'04', title:'视频与交付', summary:'只在规格、参考、渠道、费用与质量门都真实满足时创建视频任务，并回写任务和媒体 QA。', outputs:['锁定视频规格','真实渠道回执','媒体探测与内容 QA','交付记录'], gate:'未通过时保留失败谱系并回到对应候选或镜头组', next:'完成或针对单组重做' }
      ]
    },
  };

  const STEP01_ESTIMATE_SECONDS = 14 * 60;

  const api = async (url, options = {}) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || '请求失败');
      error.code = payload.code || 'REQUEST_FAILED';
      throw error;
    }
    return payload;
  };

  const shotReviewRequest = async (url, options = {}) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || '镜头核对请求失败');
      error.code = payload.code || 'SHOT_REVIEW_REQUEST_FAILED';
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    const contract = response.headers.get('X-Shot-Review-Contract');
    if (contract !== shotReviewContractSha256) {
      const error = new Error('镜头核对数据版本不一致，请刷新后重试');
      error.code = 'SHOT_REVIEW_CONTRACT_MISMATCH';
      throw error;
    }
    // Compression proxies are allowed to weaken the standard ETag. This
    // application revision header carries the exact strong value required by
    // the subsequent If-Match write and is not rewritten by gzip/CDN layers.
    return {payload, etag:response.headers.get('X-Shot-Review-Revision') || response.headers.get('ETag'), contract};
  };

  const step02Request = async (url, options = {}) => {
    const {timeoutMs = 45000, ...requestOptions} = options;
    if (url.startsWith('/api/') && !requestOptions.cache) requestOptions.cache = 'no-store';
    const controller = !requestOptions.signal && window.AbortController ? new AbortController() : null;
    let timeout = null;
    if (controller) {
      requestOptions.signal = controller.signal;
      timeout = window.setTimeout(() => controller.abort(), Math.max(5000, Number(timeoutMs) || 45000));
    }
    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('请求超时，请重新读取后再试');
        timeoutError.code = 'STEP02_REQUEST_TIMEOUT';
        timeoutError.status = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeout) window.clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || '海外改编请求失败');
      error.code = payload.code || 'STEP02_REQUEST_FAILED';
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return {payload,etag:response.headers.get('ETag'),localizationRevision:response.headers.get('X-Localization-Revision')};
  };

  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function sha256BrowserBuffer(buffer) {
    if (!window.crypto?.subtle) throw new Error('当前浏览器无法校验 Word 文档完整性，请使用支持安全校验的现代浏览器。');
    return bufferToHex(await window.crypto.subtle.digest('SHA-256', buffer));
  }

  async function sha256BrowserText(text) {
    return sha256BrowserBuffer(new TextEncoder().encode(String(text)));
  }

  async function uploadScriptDocumentResumable(file) {
    if (!(file instanceof File) || !file.size) throw new Error('请先选择 .docx Word 文档。');
    scriptDramaStatus.textContent = '正在校验 Word 文档…';
    const fileSha256 = await sha256BrowserBuffer(await file.arrayBuffer());
    const sessionPayload = await api('/api/script-uploads', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({originalName:file.name, mimeType:file.type, bytes:file.size, sha256:fileSha256})
    });
    let upload = sessionPayload.upload;
    if (!upload?.id || !Number.isFinite(Number(upload.chunkSize))) throw new Error('Word 上传会话无效，请重新选择文件。');
    let offset = Number(upload.uploadedBytes || 0);
    const chunkSize = Number(upload.chunkSize);
    while (offset < file.size) {
      const end = Math.min(offset + chunkSize, file.size);
      const chunk = await file.slice(offset, end).arrayBuffer();
      const chunkSha256 = await sha256BrowserBuffer(chunk);
      scriptDramaStatus.textContent = '正在上传 Word 文档 ' + Math.floor((offset / file.size) * 100) + '%…';
      let chunkPayload;
      try {
        chunkPayload = await api('/api/script-uploads/' + encodeURIComponent(upload.id) + '/chunks/' + offset, {
          method:'PUT',
          headers:{'Content-Type':'application/octet-stream','X-NianNian-Chunk-SHA256':chunkSha256},
          body:chunk
        });
      } catch (error) {
        if (error.code === 'REQUEST_FAILED') throw new Error('Word 文档上传已暂停。请重新选择同一份文件，网站会从已校验分片继续。');
        throw error;
      }
      upload = chunkPayload.upload;
      const nextOffset = Number(upload?.uploadedBytes || 0);
      if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > file.size) throw new Error('Word 上传进度无效，请重新选择同一份文件继续。');
      offset = nextOffset;
    }
    scriptDramaStatus.textContent = '正在校验整份 Word 文档…';
    const completePayload = await api('/api/script-uploads/' + encodeURIComponent(upload.id) + '/complete', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sha256:fileSha256})
    });
    if (completePayload.upload?.status !== 'verified') throw new Error('Word 文档完整性校验未完成，请重新选择同一份文件继续。');
    return completePayload.upload;
  }
  const draftStoragePrefix = 'niannian-ai:workspace-draft:v1';
  const redrawDraftFields = ['name','notes'];
  const scriptDraftFields = ['name','genre','audience','episodeDuration','aspectRatio','sourceText'];

  function draftStorageKey(scope) {
    return draftStoragePrefix + ':' + String(state.user?.id || 'anonymous') + ':' + scope;
  }

  function readSessionDraft(scope) {
    try {
      const raw = sessionStorage.getItem(draftStorageKey(scope));
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeSessionDraft(scope, values) {
    try {
      sessionStorage.setItem(draftStorageKey(scope), JSON.stringify({schemaVersion:1, updatedAt:new Date().toISOString(), values}));
    } catch {
      // Draft recovery is a local convenience and must never block a production action.
    }
  }

  function clearSessionDraft(scope) {
    try { sessionStorage.removeItem(draftStorageKey(scope)); } catch {}
  }

  function snapshotFormDraft(formElement, fields, scope) {
    if (!formElement) return;
    const values = {};
    for (const name of fields) {
      const field = formElement.querySelector('[name="' + CSS.escape(name) + '"]');
      if (!field || field.type === 'file') continue;
      const value = String(field.value || '');
      values[name] = name === 'sourceText' ? value.slice(0, 500000) : value;
    }
    writeSessionDraft(scope, values);
  }

  function restoreFormDraft(formElement, fields, scope) {
    const draft = readSessionDraft(scope)?.values;
    if (!formElement || !draft) return;
    for (const name of fields) {
      const field = formElement.querySelector('[name="' + CSS.escape(name) + '"]');
      if (!field || field.type === 'file' || typeof draft[name] !== 'string') continue;
      field.value = draft[name];
    }
  }

  function candidateDecisionDraftScope(projectId, candidateId, sha256, decision) {
    return 'n05-decision:' + [projectId, candidateId, sha256, decision].map(value => encodeURIComponent(String(value || ''))).join(':');
  }
  let projectEventSource = null;
  let projectEventRefreshTimer = null;
  let projectEventRecoveryTimer = null;
  let projectEventLastSignalAt = 0;
  let projectEventRecoveryDelay = 5000;
  let projectEventGapDetected = false;
  let pendingRedrawProjectIds = new Set();
  let pendingScriptProjectIds = new Set();

  const PROJECT_EVENT_STALE_MS = 45000;
  const PROJECT_EVENT_RECOVERY_MAX_MS = 60000;

  function closeProjectEventStream() {
    if (projectEventSource) projectEventSource.close();
    projectEventSource = null;
    if (projectEventRefreshTimer) window.clearTimeout(projectEventRefreshTimer);
    projectEventRefreshTimer = null;
    if (projectEventRecoveryTimer) window.clearTimeout(projectEventRecoveryTimer);
    projectEventRecoveryTimer = null;
    projectEventLastSignalAt = 0;
    projectEventRecoveryDelay = 5000;
    projectEventGapDetected = false;
    pendingRedrawProjectIds = new Set();
    pendingScriptProjectIds = new Set();
  }

  function projectEventPayload(event) {
    try {
      const payload = JSON.parse(String(event?.data || '{}'));
      return payload && typeof payload === 'object' ? payload : {};
    } catch {
      return {};
    }
  }

  function projectEventRevision(event) {
    const revision = Number(projectEventPayload(event).revision);
    return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
  }

  function recordProjectEventSignal(event) {
    projectEventLastSignalAt = Date.now();
    const revision = projectEventRevision(event);
    if (event?.type === 'ready' && revision < state.projectEventRevision) {
      state.projectEventRevision = revision;
      state.projectEventPendingRevision = revision;
      projectEventGapDetected = true;
      scheduleProjectEventRefresh();
    }
    if (revision && revision > state.projectEventRevision) scheduleProjectEventRefresh(event);
    scheduleProjectEventRecovery(PROJECT_EVENT_STALE_MS);
  }

  function mergeProjectEventChanges(payload) {
    for (const projectId of Array.isArray(payload?.redrawProjectIds) ? payload.redrawProjectIds : []) {
      if (typeof projectId === 'string' && projectId) pendingRedrawProjectIds.add(projectId);
    }
    for (const projectId of Array.isArray(payload?.scriptProjectIds) ? payload.scriptProjectIds : []) {
      if (typeof projectId === 'string' && projectId) pendingScriptProjectIds.add(projectId);
    }
  }

  function scheduleProjectEventRefresh(event) {
    const payload = projectEventPayload(event);
    const revision = Number(payload.revision);
    projectEventLastSignalAt = Date.now();
    if (revision && revision <= state.projectEventRevision) return;
    if (revision && state.projectEventRevision && revision > state.projectEventRevision + 1) projectEventGapDetected = true;
    mergeProjectEventChanges(payload);
    state.projectEventPendingRevision = Math.max(state.projectEventPendingRevision, revision || state.projectEventRevision);
    if (!state.user || document.hidden || projectEventRefreshTimer) return;
    projectEventRefreshTimer = window.setTimeout(() => {
      projectEventRefreshTimer = null;
      if (!state.user || document.hidden) return;
      if (state.loadingProjects) {
        scheduleProjectEventRefresh();
        return;
      }
      const targetRevision = state.projectEventPendingRevision;
      void reconcileProjectEvents({source:'event'}).then(loaded => {
        if (loaded) state.projectEventRevision = Math.max(state.projectEventRevision, targetRevision);
        if (state.projectEventPendingRevision > state.projectEventRevision) scheduleProjectEventRefresh();
      });
    }, 260);
  }

  function scheduleProjectEventRecovery(delay, {replace = false} = {}) {
    if (!state.user) return;
    if (projectEventRecoveryTimer && !replace) return;
    if (projectEventRecoveryTimer) window.clearTimeout(projectEventRecoveryTimer);
    projectEventRecoveryTimer = window.setTimeout(() => {
      projectEventRecoveryTimer = null;
      if (!state.user || document.hidden) return;
      const isOpen = Boolean(projectEventSource && projectEventSource.readyState === EventSource.OPEN);
      const stale = !projectEventLastSignalAt || Date.now() - projectEventLastSignalAt >= PROJECT_EVENT_STALE_MS;
      if (!isOpen || stale) {
        void reconcileProjectEvents({source:'stream-recovery'}).finally(() => {
          projectEventRecoveryDelay = Math.min(PROJECT_EVENT_RECOVERY_MAX_MS, projectEventRecoveryDelay * 2);
          scheduleProjectEventRecovery(projectEventRecoveryDelay);
        });
        return;
      }
      scheduleProjectEventRecovery(PROJECT_EVENT_STALE_MS);
    }, delay);
  }

  function openProjectEventStream() {
    if (!state.user || !window.EventSource || projectEventSource) return;
    projectEventSource = new EventSource('/api/events/projects');
    projectEventSource.addEventListener('open', () => {
      projectEventLastSignalAt = Date.now();
      projectEventRecoveryDelay = 5000;
      scheduleProjectEventRecovery(PROJECT_EVENT_STALE_MS);
    });
    projectEventSource.addEventListener('ready', recordProjectEventSignal);
    projectEventSource.addEventListener('keepalive', recordProjectEventSignal);
    projectEventSource.addEventListener('project-update', scheduleProjectEventRefresh);
    projectEventSource.onerror = () => {
      // EventSource owns reconnects. A single bounded read reconciles after a real gap.
      scheduleProjectEventRecovery(projectEventRecoveryDelay, {replace:true});
    };
  }

  function updateAuthUi() {
    const isAuthenticated = Boolean(state.user);
    if (registerButton) registerButton.hidden = isAuthenticated;
    if (loginButton) {
      loginButton.classList.toggle('is-authenticated', isAuthenticated);
      loginButton.title = isAuthenticated ? '账户菜单' : '登录念念 AI';
      loginButton.setAttribute('aria-label', isAuthenticated ? '打开账户菜单' : '登录念念 AI');
      loginButton.setAttribute('aria-expanded', 'false');
    }
    if (accountLabel) accountLabel.textContent = isAuthenticated ? '账户' : '登录';
    if (accountAvatar) accountAvatar.textContent = isAuthenticated ? String(state.user.email || '念').trim().slice(0, 1).toLocaleUpperCase('zh-CN') : '念';
    if (accountEmail) accountEmail.textContent = isAuthenticated ? String(state.user.email || '') : '';
    if (workbenchCreateActions) workbenchCreateActions.hidden = !isAuthenticated;
    if (!isAuthenticated) closeAccountMenu({restoreFocus:false});
    renderTeam();
  }

  function closeAccountMenu({restoreFocus = false} = {}) {
    if (!accountMenu || accountMenu.hidden) return;
    accountMenu.hidden = true;
    loginButton?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) loginButton?.focus({preventScroll:true});
  }

  function toggleAccountMenu() {
    if (!state.user || !accountMenu) return;
    const opening = accountMenu.hidden;
    accountMenu.hidden = !opening;
    loginButton?.setAttribute('aria-expanded', String(opening));
  }

  async function loadSession() {
    try {
      const payload = await api('/api/auth/session');
      state.user = payload.user;
    } catch (error) {
      state.user = null;
    }
    if (!state.user) closeProjectEventStream();
    updateAuthUi();
  }

  async function logout() {
    await api('/api/auth/logout', { method:'POST' }).catch(() => null);
    state.user = null;
    closeProjectEventStream();
    state.projects = [];
    state.scriptProjects = [];
    updateAuthUi();
    renderProjects();
    renderWorkbench();
  }

  const statusLabel = value => ({
    received:'已接收',queued:'等待处理',prepared:'准备完成',preflight:'源视频预检完成',
    running:'制作中',running_step01:'原片分析中',evidence_ready:'原片分析已完成',running_step02:'原片时间轴制作中',
    step02_return_ready:'原片时间轴待审核',step02_blocked_upstream:'原片时间轴前置条件未满足',step02_blocked_contract:'原片时间轴条件未满足',step02_blocked_resource:'原片时间轴暂不可用',step02_blocked_quality:'原片时间轴待修正',step02_accepted:'原片时间轴已通过',running_step04:'地区改编中',step04_return_ready:'Step04 Word 可下载',step04_accepted:'地区改编已通过',
    running_step05:'资产与首帧制作中',qa_running:'质量检查中',accepted:'质量门已通过',
    packaged:'已打包',sent:'已发送',user_visible_acceptance:'用户已验收',
    pre_video_ready:'视频制作待启动',video_ready_not_submitted:'视频制作待启动',ready:'视频制作待启动',
    completed:'已完成',blocked:'已阻塞',blocked_resource:'资源阻塞',
    blocked_contract:'合同阻塞',blocked_quality:'质量阻塞',infra_failed:'基础设施失败',send_failed:'发送失败'
  })[value] || (value ? '等待状态同步' : '等待状态');
  const projectStatusLabel = project => {
    const value = String(project?.autoRedraw?.status || project?.runtime?.productionStatus || project?.status || '').toLowerCase();
    if (/server_credential_blocked|credential_blocked/.test(value)) return '等待渠道登录';
    if (/provider|cost|authorization/.test(value) && /blocked/.test(value)) return '等待执行条件';
    if (/pre_video_ready|video_ready_not_submitted|(^|_)ready$/.test(value) || project?.runtime?.publicStage?.gate === 'ready') return '视频制作待启动';
    if (/n06.*prepared/.test(value)) return '视频规格已准备';
    if (/blocked/.test(value)) return '等待处理';
    return statusLabel(value);
  };
  const dispatchLabel = value => ({awaiting_preflight:'等待源视频预检',awaiting_user_start:'等待用户开始分析',queued:'等待本地控制器',claimed:'正在同步',mirrored:'已进入转绘控制器',blocked:'同步受阻'})[value] || '等待本地控制器';
  const workerLabel = worker => {
    if (!worker) return '等待执行队列';
    const labels = {queued:'已进入执行队列',running:'正在执行',completed:'已完成',handoff:'执行结果已同步',waiting_cost_authorization:'等待费用授权',blocked:'等待执行条件'};
    return labels[worker.status] || '等待执行状态同步';
  };
  function productionStatusTone(value) {
    const raw = String(value || '').toLowerCase();
    if (/completed|verified|accepted|passed|confirmed|已验证|已完成|已确认|已通过/.test(raw)) return 'is-ready';
    if (/running|claimed|prepared|queued|sync|regenerate|执行中|制作中|同步中|等待处理|重做/.test(raw)) return 'is-working';
    if (/blocked|failed|error|denied|credential|阻塞|失败|未放行/.test(raw)) return 'is-blocked';
    return 'is-neutral';
  }
  function productionStatusPill(label, semanticValue = label) {
    return '<span class="production-status-pill ' + productionStatusTone(semanticValue) + '">' + escapeHtml(label || '等待状态') + '</span>';
  }
  const formatTime = value => value ? new Date(value).toLocaleString('zh-CN') : '尚未连接';
  const formatDuration = value => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '未读取';
    const minutes = Math.floor(seconds / 60);
    const remainder = (seconds % 60).toFixed(1).replace(/\.0$/, '');
    return minutes ? minutes + ' 分 ' + remainder + ' 秒' : remainder + ' 秒';
  };
  const preflightLabel = value => ({passed:'预检通过',failed:'预检未通过',not_run:'预检未运行'})[value] || '等待预检';
  const step01TierLabel = value => ({completed:'已完成',partial:'部分完成',running:'执行中',ready:'已就绪',blocked:'资源阻塞',pending:'未开始'})[value] || '未开始';
  const stepProgress = project => {
    const steps = project.pipeline || [];
    if (!steps.length) return 0;
    const score = steps.reduce((sum, step) => sum + (['completed','evidence_ready','ready'].includes(step.status) ? 1 : step.status === 'running' ? .55 : 0), 0);
    return Math.round(score / steps.length * 100);
  };

  function showView(name) {
    document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('is-visible', panel.dataset.viewPanel === name));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('is-active', item.dataset.view === name));
    const isStudio = name === 'script-studio' || name === 'redraw-studio';
    document.body.classList.toggle('is-production-studio', isStudio);
    document.body.dataset.productionStudio = isStudio ? (name === 'script-studio' ? 'script' : 'redraw') : '';
  }

  function canPlayStudioMotion() {
    return Boolean(window.gsap) && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function animateStudioEntry(container, kind, projectId, stageId) {
    const key = [kind, projectId || 'none', stageId || '01'].join(':');
    if (state.studioMotionKey === key || !canPlayStudioMotion()) {
      state.studioMotionKey = key;
      return;
    }
    state.studioMotionKey = key;
    window.requestAnimationFrame(() => {
      const panels = Array.from(container.querySelectorAll('.production-workspace-header, .script-source-contract, .script-stage-summary, .script-stage-metrics, .script-assets-layout, .script-video-layout, .production-footer')).slice(0, 6);
      if (!panels.length || !canPlayStudioMotion()) return;
      window.gsap.killTweensOf(panels);
      container.classList.add('studio-motion-active');
      window.gsap.set(panels, {autoAlpha:0, y:12});
      window.gsap.timeline({defaults:{ease:'power2.out'}, onComplete:() => container.classList.remove('studio-motion-active')})
        .to(panels, {autoAlpha:1, y:0, duration:.34, stagger:.055});
    });
  }

  function animateAssetSelection(flipState) {
    if (!canPlayStudioMotion()) return;
    window.requestAnimationFrame(() => {
      if (flipState && window.Flip) {
        window.gsap.registerPlugin(window.Flip);
        window.Flip.from(flipState, {duration:.32, ease:'power2.out', absolute:false, nested:true});
      }
      const inspector = scriptStudioContent?.querySelector('.script-asset-inspector');
      if (inspector) window.gsap.fromTo(inspector, {autoAlpha:0, y:8}, {autoAlpha:1, y:0, duration:.28, ease:'power2.out', overwrite:true});
    });
  }

  function animateStoryboardSelection(flipState) {
    if (!canPlayStudioMotion()) return;
    window.requestAnimationFrame(() => {
      if (flipState && window.Flip) {
        window.gsap.registerPlugin(window.Flip);
        window.Flip.from(flipState, {duration:.34, ease:'power2.out', absolute:false, nested:true});
      }
      const workspace = scriptStudioContent?.querySelector('.script-storyboard-workspace');
      const focusPanels = workspace
        ? Array.from(workspace.querySelectorAll('[data-storyboard-focus-panel]'))
        : [];
      const activeGroup = scriptStudioContent?.querySelector('.script-storyboard-strip button.is-active');
      if (focusPanels.length) {
        window.gsap.killTweensOf(focusPanels);
        window.gsap.fromTo(focusPanels, {autoAlpha:.7, y:10}, {autoAlpha:1, y:0, duration:.28, stagger:.045, ease:'power2.out', overwrite:true});
      }
      if (activeGroup) {
        window.gsap.fromTo(activeGroup, {scale:.97}, {scale:1, duration:.24, ease:'back.out(1.7)', overwrite:true});
      }
    });
  }

  function animateGuideFocus(stepId) {
    if (state.guideMotionKey === stepId || !canPlayStudioMotion() || !guideFocus) {
      state.guideMotionKey = stepId;
      return;
    }
    state.guideMotionKey = stepId;
    const panels = Array.from(guideFocus.children);
    if (!panels.length) return;
    window.gsap.killTweensOf(panels);
    guideFocus.classList.add('guide-motion-active');
    window.gsap.fromTo(panels, {autoAlpha:0, y:8}, {autoAlpha:1, y:0, duration:.24, stagger:.035, ease:'power2.out', onComplete:() => guideFocus.classList.remove('guide-motion-active')});
  }

  function focusWizardField(formElement, openingFocus) {
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      const focusMovedSinceOpening = activeElement && activeElement !== document.body && activeElement !== document.documentElement && activeElement !== openingFocus;
      if (focusMovedSinceOpening) return;
      formElement?.elements?.name?.focus({preventScroll:true});
    });
  }

  function restoreWizardFocus(returnFocus, closedDialog) {
    window.requestAnimationFrame(() => {
      if (!returnFocus || !returnFocus.isConnected || returnFocus.disabled) return;
      const activeElement = document.activeElement;
      const activeIsVisible = activeElement && activeElement !== document.body && activeElement !== document.documentElement && activeElement.offsetParent !== null && !closedDialog?.contains(activeElement);
      if (activeIsVisible) return;
      returnFocus.focus({preventScroll:true});
    });
  }

  function openWizard({resumeDraft = false} = {}) {
    if (!wizard || !form) return;
    if (!state.user) {
      loginButton?.click();
      return;
    }
    state.wizardReturnFocus = document.activeElement;
    form?.reset();
    if (resumeDraft) restoreFormDraft(form, redrawDraftFields, 'redraw-project');
    const resumeAction = form?.querySelector('[data-resume-redraw-draft]');
    if (resumeAction) resumeAction.hidden = resumeDraft || !readSessionDraft('redraw-project')?.values;
    if (status) status.textContent = resumeDraft ? '已恢复上次草稿；源视频与权利勾选仍需重新选择并确认。' : '';
    wizard.hidden = false;
    document.body.style.overflow = 'hidden';
    focusWizardField(form, state.wizardReturnFocus);
  }

  function closeWizard({restoreFocus = true} = {}) {
    if (!wizard) return;
    wizard.hidden = true;
    document.body.style.overflow = '';
    if (status) status.textContent = '';
    const returnFocus = state.wizardReturnFocus;
    state.wizardReturnFocus = null;
    if (restoreFocus) restoreWizardFocus(returnFocus, wizard);
  }

  function openScriptDramaWizard() {
    if (!state.user) {
      loginButton?.click();
      return;
    }
    state.scriptDramaWizardReturnFocus = document.activeElement;
    restoreFormDraft(scriptDramaForm, scriptDraftFields, 'script-project');
    scriptDramaWizard.hidden = false;
    document.body.style.overflow = 'hidden';
    focusWizardField(scriptDramaForm, state.scriptDramaWizardReturnFocus);
  }

  function closeScriptDramaWizard({restoreFocus = true} = {}) {
    scriptDramaWizard.hidden = true;
    document.body.style.overflow = '';
    if (scriptDramaStatus) scriptDramaStatus.textContent = '';
    const returnFocus = state.scriptDramaWizardReturnFocus;
    state.scriptDramaWizardReturnFocus = null;
    if (restoreFocus) restoreWizardFocus(returnFocus, scriptDramaWizard);
  }

  function commandPaletteItems() {
    const navigation = [
      {id:'view:home', group:'页面', title:'首页', detail:'回到创作入口', type:'view', hash:'#home'},
      {id:'view:workbench', group:'页面', title:'工作台', detail:'选择创作方式', type:'view', hash:'#workbench'},
      {id:'view:director-desk', group:'页面', title:'导演台', detail:'3D 导演台与分镜准备', type:'view', hash:'#director-desk'},
      {id:'view:projects', group:'页面', title:'项目管理', detail:'查看所有项目', type:'view', hash:'#projects'},
      {id:'view:team', group:'页面', title:'团队管理', detail:'查看团队工作区', type:'view', hash:'#team'},
      {id:'view:docs', group:'页面', title:'使用文档', detail:'了解各界面功能', type:'view', hash:'#docs'}
    ];
    const creation = state.user ? [
      {id:'create:script', group:'新建', title:'新建小说短剧', detail:'从小说或剧本开始', type:'create-script'}
    ] : [];
    const projects = [
      ...state.scriptProjects.map(project => ({id:'script:' + project.id, group:'项目', title:project.name, detail:'小说短剧制作台', type:'open-script', projectId:project.id}))
    ];
    return navigation.concat(creation, projects);
  }

  function renderCommandPalette() {
    if (!commandPaletteResults) return;
    const query = String(state.commandPaletteQuery || '').trim().toLocaleLowerCase('zh-CN');
    const matching = commandPaletteItems().filter(item => {
      if (!query) return true;
      return (item.title + ' ' + item.detail).toLocaleLowerCase('zh-CN').includes(query);
    });
    if (!matching.length) {
      commandPaletteResults.innerHTML = '<p class="command-palette-empty">没有匹配的页面或项目</p>';
      return;
    }
    let activeGroup = '';
    commandPaletteResults.innerHTML = matching.map(item => {
      const group = item.group === activeGroup ? '' : '<p class="command-palette-group-label">' + escapeHtml(item.group) + '</p>';
      activeGroup = item.group;
      return group + '<button class="command-palette-item" type="button" role="listitem" data-command-palette-item="' + escapeHtml(item.id) + '"><span class="command-palette-item-copy"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.detail) + '</span></span><em aria-hidden="true">&#8594;</em></button>';
    }).join('');
  }

  function openCommandPalette() {
    if (!commandPalette || !commandPaletteInput) return;
    state.commandPaletteReturnFocus = document.activeElement;
    state.commandPaletteQuery = '';
    commandPalette.hidden = false;
    document.body.style.overflow = 'hidden';
    renderCommandPalette();
    window.requestAnimationFrame(() => commandPaletteInput.focus({preventScroll:true}));
  }

  function closeCommandPalette({restoreFocus = true} = {}) {
    if (!commandPalette || commandPalette.hidden) return;
    commandPalette.hidden = true;
    document.body.style.overflow = '';
    const returnFocus = state.commandPaletteReturnFocus;
    state.commandPaletteReturnFocus = null;
    if (restoreFocus) restoreWizardFocus(returnFocus, commandPalette);
  }

  function runCommandPaletteItem(id) {
    const item = commandPaletteItems().find(candidate => candidate.id === id);
    if (!item) return;
    closeCommandPalette({restoreFocus:false});
    if (item.type === 'view') {
      if (location.hash === item.hash) showView(item.hash.slice(1));
      else location.hash = item.hash;
      return;
    }
    if (item.type === 'open-script') {
      state.scriptStudioStageId = null;
      openScriptStudio(item.projectId);
      return;
    }
    commandPaletteTrigger?.focus({preventScroll:true});
    if (item.type === 'create-script') openScriptDramaWizard();
  }

  function renderSummary() {
    const allProjects = [...state.projects, ...state.scriptProjects];
    const statusOf = project => String(project.runtime?.productionStatus || project.status || project.runtime?.currentNode || '').toLowerCase();
    const statusBucket = project => {
      const value = statusOf(project);
      if (/completed|user_visible_acceptance|sent/.test(value)) return 'completed';
      if (/blocked|failed|infra_failed/.test(value)) return 'queued';
      if (/running|step0[1245]|n0[1-7]|qa_running/.test(value)) return 'active';
      if (/queued|prepared|received|preflight|pending/.test(value)) return 'queued';
      return 'queued';
    };
    const counts = {
      total: allProjects.length,
      active: allProjects.filter(project => statusBucket(project) === 'active').length,
      queued: allProjects.filter(project => statusBucket(project) === 'queued').length,
      completed: allProjects.filter(project => statusBucket(project) === 'completed').length
    };
    const hubTotal = document.getElementById('projectHubTotal');
    if (hubTotal) hubTotal.textContent = counts.total + ' 个项目';
    Object.entries(counts).forEach(([key, value]) => {
      const node = document.querySelector('[data-summary="' + key + '"]');
      if (node) node.textContent = value;
    });
  }

  function renderProjects() {
    if (!list) return;
    const signedOut = !state.user;
    if (projectSummary) projectSummary.hidden = signedOut;
    if (projectToolbar) projectToolbar.hidden = signedOut;
    if (projectCreateActions) projectCreateActions.hidden = signedOut;
    const hubTotal = document.getElementById('projectHubTotal');
    if (hubTotal) hubTotal.hidden = signedOut;
    if (signedOut) {
      list.innerHTML = '<section class="public-access-panel public-project-access" aria-label="项目库访问说明"><div class="public-access-copy"><span class="eyebrow">PRIVATE PROJECT LIBRARY</span><h3>登录后管理你的项目</h3><p>登录后查看当前账户的短剧项目、制作状态和交付版本。</p><div class="public-access-actions"><button class="page-action" type="button" data-open-auth-login>登录进入项目库</button><button class="workbench-quiet-action" type="button" data-view="workbench">先选择制作路径</button></div></div><dl class="public-access-facts"><div><dt>项目</dt><dd>按当前工作区隔离</dd></div><div><dt>进度</dt><dd>只显示真实制作状态</dd></div><div><dt>交付</dt><dd>通过质量门后可下载</dd></div></dl></section>';
      return;
    }
    const query = (search?.value || '').trim().toLowerCase();
    const selected = filter?.value || 'all';
    const selectedType = projectTypeFilter?.value || 'all';
    const rows = [
      ...state.projects.map(project => ({...project, projectKind:'redraw'})),
      ...state.scriptProjects.map(project => ({...project, projectKind:'script'}))
    ].filter(project => {
      const runtimeStatus = String(project.runtime?.productionStatus || project.status || project.runtime?.currentNode || '').toLowerCase();
      const matchesText = !query || project.name.toLowerCase().includes(query) || project.id.toLowerCase().includes(query);
      const matchesType = selectedType === 'all' || selectedType === project.projectKind;
      const matchesStatus = selected === 'all'
        || runtimeStatus === selected
        || (selected === 'queued' && /queued|prepared|received|preflight|pending/.test(runtimeStatus))
        || (selected === 'running' && /running|step0[1245]|n0[1-7]|qa_running/.test(runtimeStatus) && !/completed|accepted|packaged|sent|user_visible_acceptance/.test(runtimeStatus))
        || (selected === 'completed' && /completed|user_visible_acceptance|sent/.test(runtimeStatus))
        || (selected === 'blocked' && /blocked|failed|infra_failed/.test(runtimeStatus));
      return matchesText && matchesType && matchesStatus;
    });
    if (!rows.length) {
      const filtered = Boolean(query || selected !== 'all' || selectedType !== 'all');
      list.innerHTML = filtered
        ? '<div class="project-empty"><strong>没有匹配当前筛选的项目</strong><span>调整搜索或筛选条件后重试。</span><button class="project-empty-action" type="button" data-project-clear-filter>清除筛选</button></div>'
        : '<div class="project-empty"><strong>还没有项目</strong><span>创建项目后，它会出现在这里并从当前质量门继续。</span><button class="project-empty-action" type="button" data-view="workbench">去创建第一个项目</button></div>';
      renderSummary();
      return;
    }
    syncProjectCountStrip(selected);
    syncProjectTypeSwitch(selectedType);
    const dispatchRows = rows.map((project, index) => {
      const runtime = project.runtime || {};
      const isScript = project.projectKind === 'script';
      const scriptStage = Number(scriptStageForNode(runtime.currentNode, runtime.earliestIncompleteNode));
      const progress = isScript ? Math.max(0, (scriptStage - 1) * 25) : stepProgress(project);
      const projectStatus = projectStatusLabel(project);
      const semanticStatus = String(project.autoRedraw?.status || project.runtime?.productionStatus || project.status || '').toLowerCase();
      const rowTone = /completed|accepted|sent|verified/.test(semanticStatus) ? 'is-row-complete'
        : (/blocked|failed|infra_failed/.test(semanticStatus) ? 'is-row-blocked'
          : (/running|claimed|sync|qa_running/.test(semanticStatus) ? 'is-row-running' : 'is-row-waiting'));
      const pillTone = rowTone === 'is-row-complete' ? 'is-ready'
        : (rowTone === 'is-row-blocked' ? 'is-blocked'
          : (rowTone === 'is-row-running' ? 'is-running' : 'is-waiting'));
      const cardAction = isScript ? 'data-script-project-id' : 'data-project-id';
      const kind = isScript ? 'script' : 'redraw';
      const stageId = isScript ? String(scriptStage).padStart(2, '0') : redrawStageForProject(project);
      const stageLabel = (productionStageDefinitions(kind).find(stage => stage.id === stageId) || {}).label || '';
      const nextAction = humanizeProjectNextAction(runtime.nextAction, isScript ? '等待当前阶段确认。' : '等待当前质量门给出下一步。');
      const fallbackText = isScript ? '等待当前阶段确认。' : '等待当前质量门给出下一步。';
      const stageSummary = isScript
        ? '阶段 ' + String(scriptStage).padStart(2, '0') + ' / 04 · ' + stageLabel
        : progress + '% · ' + stageLabel;
      const progressDetail = stageSummary + (nextAction && nextAction !== fallbackText ? ' · ' + nextAction : '');
      const lane = rowTone === 'is-row-running' ? 'running' : (rowTone === 'is-row-complete' ? 'completed' : 'attention');
      const rowHtml = '<button class="project-dispatch-row' + (isScript ? ' is-script-project' : ' is-redraw-project') + ' ' + rowTone + '" type="button" ' + cardAction + '="' + escapeHtml(project.id) + '" aria-label="继续制作：' + escapeHtml(project.name) + '">' +
        '<span class="pdr-order">' + String(index + 1).padStart(2, '0') + '</span>' +
        '<span class="pdr-title"><strong>' + escapeHtml(project.name) + '</strong><small>' + (isScript ? '一键制剧' : '一键转绘') + ' · ' + escapeHtml(project.id) + '</small></span>' +
        '<span class="pdr-stage"><span class="production-status-pill ' + pillTone + '">' + escapeHtml(projectStatus) + '</span><small>' + escapeHtml(stageSummary) + '</small></span>' +
        '<span class="pdr-next"><small>下一步</small><strong>' + escapeHtml(nextAction) + '</strong></span>' +
        '<span class="pdr-meter"><i aria-hidden="true"><i style="width:' + Number(progress) + '%"></i></i><small>' + Number(progress) + '%</small></span>' +
        '<time class="pdr-time">' + escapeHtml(compactProjectTime(project.updatedAt || project.createdAt)) + '</time>' +
        '<span class="pdr-open">进入 <b aria-hidden="true">&#8594;</b></span>' +
      '</button>';
      return {project, cardAction, rowTone, lane, progress, projectStatus, stageSummary, nextAction, rowHtml};
    });
    const focus = dispatchRows.find(item => item.lane === 'attention') || dispatchRows.find(item => item.lane === 'running') || dispatchRows[0];
    const laneDefinitions = [
      {id:'attention', title:'需要处理', description:'存在明确下一步，优先完成后再启动新项目。'},
      {id:'running', title:'制作中', description:'任务正在推进，可随时进入查看状态或继续制作。'},
      {id:'completed', title:'已交付', description:'结果已进入项目，可继续查看或复用。'}
    ];
    const focusHtml = focus ? '<section class="project-dispatch-focus ' + focus.rowTone + '" aria-label="优先继续的项目">' +
      '<div class="pdf-kicker">优先继续</div>' +
      '<div class="pdf-main"><div class="pdf-project"><span class="production-status-pill ' + (focus.rowTone === 'is-row-complete' ? 'is-ready' : (focus.rowTone === 'is-row-running' ? 'is-running' : 'is-waiting')) + '">' + escapeHtml(focus.projectStatus) + '</span><h3>' + escapeHtml(focus.project.name) + '</h3><p>' + escapeHtml(focus.stageSummary) + '</p></div>' +
      '<div class="pdf-next"><span>下一步</span><strong>' + escapeHtml(focus.nextAction) + '</strong></div>' +
      '<div class="pdf-progress"><span>' + Number(focus.progress) + '%</span><i aria-hidden="true"><i style="width:' + Number(focus.progress) + '%"></i></i></div>' +
      '<button class="pdf-action" type="button" ' + focus.cardAction + '="' + escapeHtml(focus.project.id) + '">继续制作 <b aria-hidden="true">&#8594;</b></button></div>' +
      '</section>' : '';
    const lanesHtml = laneDefinitions.map(definition => {
      const items = dispatchRows.filter(item => item.lane === definition.id && item !== focus);
      if (!items.length) return '';
      return '<section class="project-dispatch-lane project-dispatch-lane-' + definition.id + '">' +
        '<header><div><h3>' + definition.title + '</h3><p>' + definition.description + '</p></div><span>' + items.length + ' 个项目</span></header>' +
        '<div class="project-dispatch-list">' + items.map(item => item.rowHtml).join('') + '</div>' +
      '</section>';
    }).join('');
    list.innerHTML = '<div class="project-dispatch">' + focusHtml + lanesHtml + '</div>';
    renderSummary();
  }

  function syncProjectCountStrip(selected) {
    const strip = document.getElementById('projectSummary');
    if (!strip) return;
    strip.querySelectorAll('[data-count-filter]').forEach(item => {
      const isActive = item.dataset.countFilter === selected;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    });
  }

  function syncProjectTypeSwitch(selectedType) {
    const switchBox = document.querySelector('.project-type-switch');
    if (!switchBox) return;
    switchBox.querySelectorAll('[data-project-type]').forEach(item => {
      const isActive = item.dataset.projectType === selectedType;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    });
  }

  function compactProjectTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const now = new Date();
    const pad = number => String(number).padStart(2, '0');
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return '今天 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return '昨天 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    const thisYear = date.getFullYear() === now.getFullYear();
    return (thisYear ? '' : date.getFullYear() + '/') + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  }

  function renderTeam() {
    if (!teamContent) return;
    if (!state.user) {
      teamContent.innerHTML = '<section class="public-access-panel public-team-access" aria-label="团队工作区访问说明"><div class="public-access-copy"><span class="eyebrow">PRIVATE WORKSPACE</span><h3>登录后查看你的工作区</h3><p>仅显示当前账户的项目与协作范围。</p><div class="public-access-actions"><button class="page-action" type="button" data-open-auth-login>登录进入工作区</button><button class="workbench-quiet-action" type="button" data-view="workbench">查看创作路径</button></div></div><dl class="public-access-facts"><div><dt>成员</dt><dd>按工作区分别管理</dd></div><div><dt>会话</dt><dd>不会跨账户展示</dd></div><div><dt>协作</dt><dd>从项目制作台开始</dd></div></dl></section>';
      return;
    }
    teamContent.innerHTML = '<div class="team-grid"><section class="team-member-card"><span class="eyebrow">CURRENT ACCOUNT</span><h3>' + escapeHtml(state.user.email) + '</h3><p>当前工作区</p><span class="team-role">所有者</span></section><section class="team-panel team-scope-panel"><span class="eyebrow">WORKSPACE BOUNDARY</span><h3>账户边界</h3><dl class="team-facts"><div><dt>项目</dt><dd>仅当前账户</dd></div><div><dt>制作台</dt><dd>按项目类型分开</dd></div><div><dt>生成与交付</dt><dd>通过质量门放行</dd></div></dl></section><section class="team-panel team-next-panel"><span class="eyebrow">NEXT ACTION</span><h3>继续创作</h3><p>选择项目，进入当前可执行步骤。</p><div class="team-actions"><button class="guide-inline-action" type="button" data-workbench-view="workbench">打开工作台</button><button class="workbench-quiet-action" type="button" data-workbench-view="projects">管理项目</button></div></section></div>';
  }

  function currentWorkbenchProject() {
    const selected = state.projects.find(project => project.id === state.workbenchProjectId);
    const project = state.workbenchProjectId ? (selected || null) : (state.projects[0] || null);
    if (project) state.workbenchProjectId = project.id;
    return project;
  }

  function renderScriptN04Review(project) {
    const currentNode = String(project.runtime?.currentNode || '');
    if (!['N04', 'N05'].includes(currentNode)) return '';
    const cached = state.scriptReview && state.scriptReview.projectId === project.id ? state.scriptReview.review : null;
    if (!cached) {
      return '<section class="script-review-panel script-review-panel-empty"><div><span class="eyebrow">N04 VISUAL REVIEW</span><h3>先在网站审核，再生成候选图</h3><p>这里会展示角色完整身份套组、物理光线合同、五张真首帧和五组两段式视频提示词。审核确认后，网站只会记录 N05 整图候选生成授权；不会提交视频。</p></div><button class="guide-inline-action" type="button" data-load-n04-review="' + escapeHtml(project.id) + '">打开 N04 审核包</button></section>';
    }
    const frames = Array.isArray(cached.firstFrames) ? cached.firstFrames : [];
    const groups = Array.isArray(cached.videoGroups) ? cached.videoGroups : [];
    const authorized = cached.authorization?.status === 'authorized';
    const direction = cached.visualDirection || {};
    const frameCards = frames.map(frame => '<article class="script-review-card"><div class="script-review-card-title"><span>' + escapeHtml(frame.videoGroupId) + '</span><strong>' + escapeHtml(frame.refKey) + '</strong></div><dl><div><dt>开场镜头</dt><dd>' + escapeHtml(frame.startShotId) + '</dd></div><div><dt>构图</dt><dd>' + escapeHtml(frame.composition) + '</dd></div><div><dt>人物状态</dt><dd>' + escapeHtml(frame.characterState) + '</dd></div><div><dt>受光逻辑</dt><dd>' + escapeHtml(frame.lightReasoning) + '</dd></div><div><dt>参考图职责</dt><dd>' + escapeHtml(frame.referenceDuty) + '</dd></div></dl><details><summary>查看整图生成提示词</summary><pre>' + escapeHtml(frame.generationPrompt) + '</pre></details></article>').join('');
    const groupCards = groups.map(group => '<article class="script-review-card"><div class="script-review-card-title"><span>' + escapeHtml(group.videoGroupId) + ' · ' + escapeHtml(String(group.durationSec)) + ' 秒</span><strong>' + escapeHtml((group.shots || []).join(' / ')) + '</strong></div><dl><div><dt>机位与构图</dt><dd>' + escapeHtml(group.factCard?.cameraAndComposition || '') + '</dd></div><div><dt>站位与动作</dt><dd>' + escapeHtml(group.factCard?.visibleSubjectsAndBlocking || '') + '</dd></div><div><dt>手部与道具</dt><dd>' + escapeHtml(group.factCard?.handActionAndProps || '') + '</dd></div><div><dt>画面中心</dt><dd>' + escapeHtml(group.factCard?.imageCenter || '') + '</dd></div><div><dt>连续性</dt><dd>' + escapeHtml(group.factCard?.continuity || '') + '</dd></div></dl><details><summary>查看两段式视频提示词</summary><pre>' + escapeHtml(group.channelPrompt2part || '') + '</pre></details></article>').join('');
    const authorizationAction = authorized
      ? '<div class="script-review-authorized"><strong>已记录 N05 候选图授权</strong><p>' + escapeHtml(cached.authorization?.scope || '') + '</p><button class="guide-inline-action" type="button" data-script-studio-stage="03">留在本阶段查看 N05 候选图状态</button></div>'
      : '<div class="script-review-authorize"><p>确认代表：你已审核本集角色方向、夜雨光线、首帧构图与提示词；同意网站在下一步严格按这份包走认可渠道整图生成候选。候选图仍会回到网站让你逐项通过或否决。</p><button class="guide-inline-action" type="button" data-authorize-n05="' + escapeHtml(project.id) + '">确认方向并授权 N05 生成候选图</button><small>本按钮不创建视频任务，不扣视频额度，不打包或发送。</small></div>';
    return '<section class="script-review-panel"><header><div><span class="eyebrow">N04 VISUAL REVIEW · ' + escapeHtml(cached.episodeId || 'EP001') + '</span><h3>在网站里把“小说方案”变成可审核的影像生产包</h3><p>' + escapeHtml(authorized ? 'N05 已授权，等待整图候选执行' : '等待你的视觉审核') + '</p></div><button class="workbench-text-action" type="button" data-load-n04-review="' + escapeHtml(project.id) + '">刷新审核包</button></header><div class="script-review-direction"><article><span>人物身份</span><strong>' + escapeHtml(direction.characters || '-') + '</strong></article><article><span>灯光原则</span><strong>' + escapeHtml(direction.light || '-') + '</strong></article><article><span>真实性检查</span><strong>' + escapeHtml(direction.light_quality_rule || '-') + '</strong></article></div><section class="script-review-light"><span class="eyebrow">PHYSICAL LIGHT CONTRACT</span><p>' + escapeHtml(cached.physicalLightContract || '-') + '</p></section><section><div class="script-review-section-title"><span class="eyebrow">TRUE FIRST FRAMES</span><h4>五张首帧，先审构图与受光，再允许生成</h4></div><div class="script-review-grid">' + frameCards + '</div></section><section><div class="script-review-section-title"><span class="eyebrow">FIVE VIDEO GROUPS</span><h4>每组都保留两段式渠道提示词</h4></div><div class="script-review-grid">' + groupCards + '</div></section>' + authorizationAction + '</section>';
  }

  async function hydrateScriptN04Review(projectId) {
    if (!projectId || state.scriptReview?.projectId === projectId || state.scriptReviewLoading === projectId) return;
    state.scriptReviewLoading = projectId;
    try {
      const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/n04-review');
      state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
      state.scriptReview = {projectId, review:payload.review};
      if (state.scriptStudioProjectId === projectId && ['02', '03'].includes(state.scriptStudioStageId) && !isEditingScriptCandidate(projectId)) renderScriptStudio(payload.project);
    } catch {
      // The visible review action keeps the current API error path available.
    } finally {
      if (state.scriptReviewLoading === projectId) state.scriptReviewLoading = null;
    }
  }

  function renderScriptWorkbench(project) {
    const steps = project.pipeline || [];
    const runtime = project.runtime || {};
    const source = project.source || {};
    const ingest = project.ingest || {};
    const currentStep = steps.find(step => step.id === runtime.currentNode) || steps.find(step => step.status === 'running') || steps[0];
    const sourceLabel = source.type === 'docx' ? (source.originalName || 'Word 文档') : '粘贴正文';
    const providerGate = project.gates?.video_provider || 'blocked';
    const canonGate = project.gates?.canon_ledger || 'pending_ai_adaptation';
    const workerJob = runtime.workerJob || {};
    const prepareLabel = workerJob.localJobId ? 'N01 编剧队列已创建' : (runtime.blocker ? '重试 AI 编剧入队' : '准备 AI 编剧任务');
    const prepareButton = '<button class="guide-inline-action" type="button" data-prepare-script-adaptation="' + escapeHtml(project.id) + '"' + (workerJob.localJobId ? ' disabled' : '') + '>' + prepareLabel + '</button>';
    const reconcileButton = '<button class="workbench-text-action" type="button" data-reconcile-script-project="' + escapeHtml(project.id) + '">同步本地生产进度</button>';
    return '<section id="script-workbench-' + escapeHtml(project.id) + '" class="workbench-live script-workbench-live" tabindex="-1"><header class="workbench-live-header"><div><span class="eyebrow">SCRIPT-ONLY PIPELINE</span><h3>' + escapeHtml(project.name) + '</h3><p>小说文本已进入独立 N00-N07 链路；网站会从已验证的本地任务合同同步节点和质量门，镜头、画面和视频只能从后续已验证事实与确认参考中产生。</p></div><div class="workbench-action-row">' + prepareButton + reconcileButton + '<button class="workbench-text-action" type="button" data-open-script-drama-wizard>新建短剧项目</button></div></header><div class="workbench-grid"><aside class="workbench-rail"><span class="eyebrow">N00-N07</span><div class="workbench-step-list">' + steps.map(step => '<div class="workbench-step' + (step.id === currentStep?.id ? ' is-active' : '') + (step.status === 'completed' ? ' is-complete' : '') + '"><span>' + escapeHtml(step.id) + '</span><strong>' + escapeHtml(step.label) + '</strong><small>' + escapeHtml(statusLabel(step.status)) + '</small></div>').join('') + '</div></aside><section class="workbench-stage"><header><div><span class="eyebrow">' + escapeHtml(project.id) + '</span><h3>' + escapeHtml(currentStep?.label || '等待节点') + '</h3><p>' + escapeHtml(runtime.nextAction || '等待上游质量门完成。') + '</p></div><span class="detail-status">' + escapeHtml(runtime.currentNode || 'N00') + '</span></header><div class="workbench-stage-grid"><article><span>输入来源</span><strong>' + escapeHtml(sourceLabel) + '</strong></article><article><span>正文规模</span><strong>' + escapeHtml(String(source.characters || 0)) + ' 字</strong></article><article><span>章节索引</span><strong>' + escapeHtml(String(ingest.chapterCount || 0)) + ' 章</strong></article><article><span>段落索引</span><strong>' + escapeHtml(String(ingest.paragraphCount || 0)) + ' 段</strong></article></div><section class="workbench-source"><span class="eyebrow">SOURCE INGEST</span><dl><div><dt>源清单</dt><dd>' + escapeHtml(ingest.status === 'verified' ? '已验证' : '等待生成') + '</dd></div><div><dt>正文哈希</dt><dd>' + escapeHtml((source.extractedTextSha256 || '').slice(0, 16) || '-') + '</dd></div><div><dt>原文哈希</dt><dd>' + escapeHtml((source.sha256 || '').slice(0, 16) || '-') + '</dd></div><div><dt>文本事实账本</dt><dd>' + escapeHtml(String(canonGate)) + '</dd></div></dl></section></section><aside class="workbench-inspector"><span class="eyebrow">NEXT GATE</span><h3>短剧质量门</h3><dl><div><dt>N01 事实账本</dt><dd>' + escapeHtml(String(canonGate)) + '</dd></div><div><dt>AI 编剧任务</dt><dd>' + escapeHtml(workerJob.localJobId || '未准备') + '</dd></div><div><dt>网站同步</dt><dd>' + escapeHtml(runtime.sourceIntegrity || '等待本地任务') + '</dd></div><div><dt>故事方向</dt><dd>' + escapeHtml(String(project.gates?.direction || 'pending')) + '</dd></div><div><dt>图片资产</dt><dd>' + escapeHtml(String(project.gates?.image_assets || 'not_started')) + '</dd></div><div><dt>视频渠道</dt><dd>' + escapeHtml(String(providerGate)) + '</dd></div><div><dt>当前阻塞</dt><dd>' + escapeHtml(runtime.blocker || '无') + '</dd></div><div><dt>已验证产物</dt><dd>' + escapeHtml(String(runtime.verifiedArtifactCount || 0)) + ' 个</dd></div></dl></aside></div></section>' + renderScriptN04Review(project);
  }

  function normalizeProductionStage(value, fallback = '01') {
    const match = String(value || '').match(/0?([1-7])/);
    return match ? '0' + match[1] : fallback;
  }

  function scriptStageForNode(node, fallbackNode = '') {
    const value = String(node || fallbackNode || '').toUpperCase();
    if (/(N00|N01)/.test(value)) return '01';
    if (/(N02|N03)/.test(value)) return '02';
    if (/(N04|N05)/.test(value)) return '03';
    if (/(N06|N07)/.test(value)) return '04';
    return '01';
  }

  function redrawStageForNode(node, fallbackNode = '') {
    const candidate = String(node || '').toUpperCase();
    const value = /^(?:ROUTER|PREFLIGHT|PREPARED|QUEUED|)$/.test(candidate)
      ? String(fallbackNode || '').toUpperCase()
      : candidate;
    if (/STEP0?1/.test(value)) return '01';
    if (/STEP0?2/.test(value)) return '02';
    if (/STEP0?4/.test(value)) return '03';
    if (/STEP0?5/.test(value)) return '04';
    return '01';
  }

  function redrawStageForProject(project) {
    const projected = Number(project?.publicStage?.stage_index || project?.runtime?.publicStage?.stage_index || 0);
    if (projected >= 1 && projected <= 7) return String(projected).padStart(2, '0');
    return redrawStageForNode(project?.runtime?.currentNode, project?.runtime?.earliestIncompleteNode || project?.route?.earliestNode);
  }

  function productionStudioRoute(kind) {
    const escaped = kind === 'script' ? 'script' : 'redraw';
    const marketSuffix = kind === 'redraw' ? '(?:\\/market\\/(es-MX|pt-BR|en-US))?' : '';
    const match = location.hash.match(new RegExp('^#' + escaped + '\\/([^/]+)(?:\\/(?:stage\\/(0[1-7])|(N0[0-7]|Step0?[12345])))?' + marketSuffix + '$', 'i'));
    if (!match) return null;
    const legacyNode = match[3] || null;
    const stageId = match[2] || (legacyNode ? (kind === 'script' ? scriptStageForNode(legacyNode) : redrawStageForNode(legacyNode)) : null);
    return {projectId:decodeURIComponent(match[1]), stageId:normalizeProductionStage(stageId, null), legacyNode, marketLocale:kind === 'redraw' ? (match[4] || null) : null};
  }

  function scriptStudioRoute() {
    return productionStudioRoute('script');
  }

  function redrawStudioRoute() {
    return null;
  }

  function referenceEvidenceRoute() {
    return null;
  }

  function isRetiredRedrawRoute() {
    return /^#(?:redraw|redraw-evidence|redraw-source-truth)\//i.test(location.hash);
  }

  function redirectRetiredRedrawRoute() {
    if (!isRetiredRedrawRoute()) return false;
    showView('projects');
    if (location.hash !== '#projects') location.hash = 'projects';
    return true;
  }

  function isRetiredScriptRoute() {
    return /^#script\//i.test(location.hash);
  }

  function redirectRetiredScriptRoute() {
    if (!isRetiredScriptRoute()) return false;
    showView('projects');
    if (location.hash !== '#projects') location.hash = 'projects';
    return true;
  }

  function workbenchRoute() {
    const match = location.hash.match(/^#workbench(?:\/project\/([^/]+)(?:\/tab\/(overview|assets|video|activity))?)?$/i);
    return match ? {projectKey:match[1] ? decodeURIComponent(match[1]) : null, tab:(match[2] || 'overview').toLowerCase()} : null;
  }

  function workspaceToolRoute() {
    const match = location.hash.match(/^#workspace\/([^/]+)\/(redraw|deliveries)$/i);
    return match ? {projectId:decodeURIComponent(match[1]), tool:match[2].toLowerCase()} : null;
  }

  function normalizeMainSitePath() {
    const match = location.hash.match(/^#canvas\/redraw\/([^/?#]+)/i);
    const projectId = match ? decodeURIComponent(match[1]) : '';
    const target = projectId
      ? '/studio/#/studio?projectId=' + encodeURIComponent(projectId)
      : '/studio/';
    if (window.location.pathname + window.location.hash !== target) window.location.replace(target);
  }

  function workbenchRouteHash() {
    const selection = state.workbenchSelectionKey ? ('/project/' + encodeURIComponent(state.workbenchSelectionKey)) : '';
    const tab = selection && state.workbenchTab !== 'overview' ? ('/tab/' + encodeURIComponent(state.workbenchTab)) : '';
    return 'workbench' + selection + tab;
  }

  function canUseWorkbenchViewTransition() {
    return typeof document.startViewTransition === 'function'
      && !document.hidden
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function updateWorkbenchRoute({transition = false} = {}) {
    const nextHash = workbenchRouteHash();
    const commit = () => {
      // Push the recoverable route without a hashchange rerender. The render stays in the
      // same synchronous DOM update so a native View Transition can retain the inspector.
      if (location.hash !== '#' + nextHash) history.pushState(null, '', '#' + nextHash);
      renderWorkbench();
    };
    if (!transition || !canUseWorkbenchViewTransition() || state.workbenchViewTransitionActive) {
      commit();
      return;
    }
    state.workbenchViewTransitionActive = true;
    const viewTransition = document.startViewTransition(commit);
    viewTransition.finished.catch(() => null).finally(() => {
      state.workbenchViewTransitionActive = false;
    });
  }

  function productionStageDefinitions(kind) {
    return kind === 'script'
      ? [
          {id:'01', label:'故事设定', sublabel:'输入与事实账本', nodes:'N00 · N01'},
          {id:'02', label:'角色与分集', sublabel:'剧本和资产规划', nodes:'N02 · N03'},
          {id:'03', label:'智能分镜', sublabel:'影像包与候选资产', nodes:'N04 · N05'},
          {id:'04', label:'视频与交付', sublabel:'视频、声音与验收', nodes:'N06 · N07'}
        ]
      : [
          {id:'01', label:'原片分析', sublabel:'核对源片与证据', nodes:'原片分析'},
          {id:'02', label:'原片时间轴', sublabel:'镜头、动作与对白', nodes:'原片时间轴'},
          {id:'03', label:'地区改编', sublabel:'本地化与连续性', nodes:'地区改编'},
          {id:'04', label:'资产与首帧', sublabel:'角色、场景与开场画面', nodes:'资产与首帧'},
          {id:'05', label:'视频生成', sublabel:'锁定任务并生成视频', nodes:'视频生成'},
          {id:'06', label:'质量核验', sublabel:'画面、声音与内容检查', nodes:'质量核验'},
          {id:'07', label:'可交付', sublabel:'用户可播放或下载', nodes:'可交付'}
        ];
  }

  function productionStageGate(project, kind, stageId) {
    const runtime = project?.runtime || {};
    const gates = runtime.gates || project?.gates || {};
    if (kind === 'redraw') {
      const current=Number(redrawStageForProject(project));
      const selected=Number(stageId);
      if(selected < current)return '已验证';
      if(selected > current)return '等待前置条件';
      return (project?.publicStage?.gate || project?.runtime?.publicStage?.gate) === 'ready' ? '已验证' : '等待前置条件';
    }
    const gateNames = kind === 'script'
      ? { '01':['N00','N01','source_script'], '02':['N02','N03','N03_EP001'], '03':['N04','N04_EP001','N05'], '04':['N06','N07','provider_submit','package_send'] }
      : {};
    const matches = gateNames[stageId] || [];
    const values = matches.map(name => gates[name]).filter(Boolean).map(value => typeof value === 'string' ? value : value.status).filter(Boolean);
    const labels = [...new Set(values.map(humanizeProductionGate))];
    return labels.join(' · ') || '由当前质量门决定';
  }

  function humanizeProductionGate(value) {
    const raw = String(value || '');
    if (/completed|verified|accepted/i.test(raw)) return '已验证';
    if (raw === 'blocked_upstream') return '等待上游真实媒体';
    if (raw === 'blocked') return '未放行';
    if (/v001_dry_run_recorded_720p_hard_gate_server_credential_blocked/i.test(raw)) return 'V001 规格已锁定，等待网站执行权限';
    if (/mimo_server_credential_not_configured/i.test(raw)) return '等待网站执行凭据配置';
    if (/not_created_provider_disabled/i.test(raw)) return '等待受控执行';
    if (/not_started_no_media_downloaded/i.test(raw)) return '等待真实媒体';
    if (/dry_run_intent_recorded/i.test(raw)) return '执行规格已锁定';
    if (/n06.*not_submitted|not_submitted.*n06/i.test(raw)) return '尚未创建视频任务';
    if (/n06.*test.*qa.*passed/i.test(raw)) return '测试回执已通过，等待真实执行';
    if (/not_created_awaiting_mac_dispatch/i.test(raw)) return '等待网站执行';
    if (/blocked/i.test(raw)) return '等待质量门放行';
    if (/^[a-z0-9_:-]+$/i.test(raw)) return '等待状态回读';
    return raw || '等待状态回读';
  }

  function humanizeProjectNextAction(value, fallback = '等待当前质量门给出下一步。') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    if (/controller|employee thread|step01|credential|token|lease|hash|orchestrator|bridge/i.test(raw)) {
      return '分析服务正在准备原片证据，完成后会自动更新进度。';
    }
    if (/mimo|server-only|720x1280|hard\s*720|credential|exact confirmed references|typed provider/i.test(raw)) {
      return /v002|receipt|qa/i.test(raw)
        ? '当前视频规格已锁定，等待 V001 的真实任务回执与质量校验。'
        : '当前视频规格已锁定，等待网站执行条件。';
    }
    if (/provider|image2|registry|package\/send|task spec|video_task_spec/i.test(raw)) return '等待当前质量门放行。';
    if (/^\s*[A-Z0-9_:\- ]+\s*$/.test(raw)) return fallback;
    return raw;
  }

  function renderProductionStepper(kind, selectedStage, currentStage) {
    const currentNumber = Number(currentStage);
    return '<nav class="production-stepper" aria-label="制作阶段">' + productionStageDefinitions(kind).map(stage => {
      const stageNumber = Number(stage.id);
      const locked = stageNumber > currentNumber;
      const classes = 'production-step' + (stage.id === selectedStage ? ' is-active' : '') + (stageNumber < currentNumber ? ' is-complete' : '') + (locked ? ' is-locked' : '');
      const action = kind === 'script' ? 'data-script-studio-stage' : 'data-redraw-studio-stage';
      const stateLabel = stage.id === selectedStage
        ? (stageNumber < currentNumber ? '已验证 · 当前查看' : '进行中')
        : (stageNumber < currentNumber ? '已验证' : (locked ? '锁定 · 查看前置条件' : '可查看'));
      return '<button class="' + classes + '" type="button" ' + action + '="' + stage.id + '" aria-label="阶段 ' + escapeHtml(stage.id) + '：' + escapeHtml(stage.label) + '，' + escapeHtml(stateLabel) + '"' + (stage.id === selectedStage ? ' aria-current="step"' : '') + '><span class="production-step-number">' + (stageNumber < currentNumber ? '✓' : stage.id) + '</span><span class="production-step-copy"><strong>' + escapeHtml(stage.label) + '</strong><small>' + escapeHtml(stage.sublabel) + '</small></span><em>' + escapeHtml(stateLabel) + '</em></button>';
    }).join('') + '</nav>';
  }

  function renderProductionMetric(label, value, tone = '') {
    return '<article class="production-metric ' + tone + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value || '-') + '</strong></article>';
  }

  function renderProductionDecisionStrip(kind, project, selectedStage, currentStage) {
    const stage = productionStageDefinitions(kind).find(item => item.id === selectedStage) || productionStageDefinitions(kind)[0];
    const runtime = project?.runtime || {};
    const isCurrent = selectedStage === currentStage;
    const nextAction = humanizeProjectNextAction(runtime.nextAction, isCurrent ? '等待当前质量门给出允许的下一动作' : '当前为已验证历史阶段，只读核对后可返回当前节点');
    return '<section class="production-decision-strip" aria-label="当前制作决策"><div><span>当前阶段</span><strong>' + escapeHtml(stage.label) + '</strong><small>' + escapeHtml(stage.nodes) + '</small></div><div><span>质量门</span><strong>' + escapeHtml(productionStageGate(project, kind, selectedStage)) + '</strong><small>' + (isCurrent ? '决定当前阶段是否可以向下推进' : '已完成阶段不会自动重开') + '</small></div><div><span>下一动作</span><strong>' + escapeHtml(nextAction) + '</strong><small>网站只显示当前 job 已回写的真实状态</small></div></section>';
  }

  function productionStageBrief(kind, stageId) {
    const brief = kind === 'script'
      ? {
          '01':{input:'原文、改编范围与权利确认', output:'可追溯的故事事实账本', prerequisite:'完成原文校验与事实整理'},
          '02':{input:'已锁定的故事事实', output:'角色、分集和资产职责', prerequisite:'通过故事事实与分集质量检查'},
          '03':{input:'角色、场景与分集资产计划', output:'首帧计划、镜头事实卡与提示词包', prerequisite:'完成 N04 / N05 审核与候选确认'},
          '04':{input:'已确认的首帧与锁定规格', output:'视频回执、媒体 QA 与交付记录', prerequisite:'真实提交、费用和交付质量门已放行'}
        }
      : {
          '01':{input:'授权源片与预检信息', output:'可追溯的原片分析结果', prerequisite:'源片预检通过并完成证据提取'},
          '02':{input:'已确认的原片分析结果', output:'镜头、对白与资产事实账本', prerequisite:'事实账本已通过核对'},
          '03':{input:'已确认的镜头事实账本', output:'镜头规格与提示词生产包', prerequisite:'资产与连续性规则已锁定'},
          '04':{input:'已锁定的地区改编方案', output:'角色、场景、道具与首帧', prerequisite:'依赖资产与确认记录完整'},
          '05':{input:'已确认的首帧与任务规格', output:'可核验的视频结果', prerequisite:'生成授权与输入合同完整'},
          '06':{input:'已生成的视频结果', output:'画面、声音与内容核验记录', prerequisite:'媒体可读取且与当前版本一致'},
          '07':{input:'已通过质量核验的结果', output:'可播放或下载的成片', prerequisite:'用户路径核验通过'}
        };
    return brief[stageId] || brief['01'];
  }

  function renderProductionActionCard(kind, project, selectedStage, currentStage) {
    const stage = productionStageDefinitions(kind).find(item => item.id === selectedStage) || productionStageDefinitions(kind)[0];
    const detail = productionStageBrief(kind, selectedStage);
    const isPreview = Number(selectedStage) > Number(currentStage);
    const runtime = project?.runtime || {};
    const nextAction = humanizeProjectNextAction(runtime.nextAction, '在当前工作区查看质量门和下一步。');
    if (isPreview) {
      return '<section class="production-action-card is-locked" aria-label="未来阶段预览"><header><div><span>未来阶段 · 只读预览</span><h3>' + escapeHtml(stage.label) + '</h3></div><strong>尚未放行</strong></header><p>此阶段会在前置条件满足后自动显示真实操作。现在可以查看其输入、产出和锁定原因，但不能提前执行。</p><dl><div><dt>需要的输入</dt><dd>' + escapeHtml(detail.input) + '</dd></div><div><dt>完成后得到</dt><dd>' + escapeHtml(detail.output) + '</dd></div><div><dt>解锁条件</dt><dd>' + escapeHtml(detail.prerequisite) + '</dd></div></dl></section>';
    }
    const recoveryHint = runtime.blocker ? '分析服务正在恢复，请稍后查看进度。' : '在本阶段的真实状态中查看恢复动作。';
    return '<section class="production-action-card" aria-label="当前阶段行动"><header><div><span>当前唯一行动</span><h3>' + escapeHtml(nextAction) + '</h3></div><strong>' + escapeHtml(productionStageGate(project, kind, selectedStage)) + '</strong></header><dl><div><dt>现在需要</dt><dd>' + escapeHtml(detail.input) + '</dd></div><div><dt>完成后得到</dt><dd>' + escapeHtml(detail.output) + '</dd></div><div><dt>若被阻塞</dt><dd>' + escapeHtml(recoveryHint) + '</dd></div></dl></section>';
  }

  function productionExperienceState(kind, project, selectedStage, currentStage) {
    if (Number(selectedStage) > Number(currentStage)) {
      return {id:'locked', label:'未来阶段已锁定', detail:'可以预览阶段目的、输入和解锁条件，但不会提前开放真实操作。'};
    }
    if (Number(selectedStage) < Number(currentStage)) {
      return {id:'complete', label:'已完成，可回看', detail:'当前展示的是已经通过上游质量门的历史阶段，不会自动重放或改变项目状态。'};
    }
    const runtime = project?.runtime || {};
    const rawStatus = [runtime.productionStatus, runtime.status, project?.status, runtime.nextAction].filter(Boolean).join(' ').toLowerCase();
    const blocker = String(runtime.blocker || runtime.worker?.blocker || '').trim();
    if (blocker || /blocked|failed|error|denied|credential/.test(rawStatus)) {
      return {id:'recoverable', label:'当前受阻，可恢复', detail:blocker || '当前质量门尚未放行，请按本阶段显示的恢复动作继续。'};
    }
    if (/review|candidate|awaiting_user|return_ready|审核|候选|待确认/.test(rawStatus)) {
      return {id:'review', label:'等待审核确认', detail:'候选或审核包已经返回，只有当前版本确认后才会进入下一阶段。'};
    }
    if (/running|queued|claimed|sync|preparing|执行中|制作中|同步中/.test(rawStatus)) {
      return {id:'syncing', label:'正在同步', detail:'当前任务仍在执行或回读中，页面会保留所选阶段和当前焦点。'};
    }
    const hasInput = kind === 'script'
      ? Boolean(project?.sourceText || project?.source?.text || project?.source?.originalName)
      : Boolean(project?.source?.previewUrl || project?.source?.originalName || project?.preflight?.video);
    if (selectedStage === '01' && !hasInput) {
      return {id:'empty', label:'等待阶段输入', detail:kind === 'script' ? '添加原文并确认改编范围后开始整理故事事实。' : '选择拥有改编权限的源视频后开始预检与证据提取。'};
    }
    return {id:'active', label:'当前可操作', detail:'页面只保留当前质量门允许的真实行动，完成后会显示可验证的阶段产物。'};
  }

  function renderProductionStatePanel(kind, project, selectedStage, currentStage) {
    const stateView = productionExperienceState(kind, project, selectedStage, currentStage);
    return '<section class="production-state-panel is-' + escapeHtml(stateView.id) + '" aria-label="阶段状态"><span aria-hidden="true"></span><div><small>阶段状态</small><strong>' + escapeHtml(stateView.label) + '</strong><p>' + escapeHtml(stateView.detail) + '</p></div></section>';
  }

  function lockFutureStageControls(root, selectedStage, currentStage) {
    if (!root || Number(selectedStage) <= Number(currentStage)) return;
    root.classList.add('is-stage-preview');
    root.querySelectorAll('button').forEach(button => {
      if (button.matches('[data-script-studio-stage], [data-redraw-studio-stage], [data-return-script-workbench], [data-return-redraw-workbench]')) return;
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.title = '这是未来阶段的只读预览，请先完成当前质量门。';
    });
  }

  function renderProductionInspector(project, kind, stageId) {
    const runtime = project.runtime || {};
    const source = project.source || {};
    const worker = runtime.workerJob || runtime.worker || {};
    const node = runtime.currentNode || (kind === 'script' ? 'N00' : 'Step01');
    const verifiedCount = String(runtime.verifiedArtifactCount || runtime.artifactCount || 0);
    if (kind === 'script') {
    return '<aside class="production-inspector production-script-inspector"><div class="studio-inspector-heading"><span class="eyebrow">SHOT SETTINGS</span><h3>镜头设置</h3><span class="studio-inspector-node">' + escapeHtml(node) + '</span></div><div class="studio-shot-placeholder"><span>当前镜头 · ' + escapeHtml(stageId === '03' ? 'S01' : node) + '</span><strong>等待已确认参考资产</strong><small>未确认的候选图不会被当作生产首帧。</small></div><label class="studio-inspector-field"><span>画面描述</span><textarea readonly>' + escapeHtml(runtime.nextAction || '当前阶段正在等待质量门给出允许的下一步。') + '</textarea></label><div class="studio-inspector-controls"><label><span>运镜方式</span><select disabled><option>等待审核包</option></select></label><label><span>输出时长</span><select disabled><option>待锁定</option></select></label></div><div class="studio-contract-strip"><span>已验证产物</span><strong>' + escapeHtml(verifiedCount) + ' 个</strong><small>' + escapeHtml(workerLabel(worker)) + '</small></div><button class="studio-primary-action" type="button" disabled>等待审核门放行</button><p class="studio-inspector-footnote">模型调用、候选图与视频提交均需当前项目的单独授权。</p></aside>';
    }
    const gateRows = [
      ['视频任务合同', productionStageGate(project, kind, stageId)],
      ['参考资产确认', humanizeProductionGate(project.gates?.reference_assets || project.gates?.image_assets || '等待确认')],
      ['费用与提交授权', humanizeProductionGate(project.gates?.provider_submit || project.gates?.video_provider || 'blocked')],
      ['交付与发送', humanizeProductionGate(project.gates?.package_send || 'blocked')]
    ];
    return '<aside class="production-inspector production-redraw-inspector"><div class="studio-inspector-heading"><span class="eyebrow">REAL SUBMISSION GATE</span><h3>真实提交门禁</h3><span class="studio-gate-count">0 / 4</span></div><div class="studio-model-route"><span>TEXT</span><strong>受控 Skill</strong><i>→</i><strong>' + escapeHtml(runtime.nextSkill || '等待路由') + '</strong><span>VIDEO</span><strong>未开放</strong></div><div class="studio-gate-list">' + gateRows.map(row => '<article><i>!</i><div><strong>' + escapeHtml(row[0]) + '</strong><small>' + escapeHtml(row[1]) + '</small></div></article>').join('') + '</div><section class="studio-reference-groups"><h4>参考资产分组</h4><div><span>参考视频证据</span><strong>' + escapeHtml((source.sha256 || '').slice(0, 10) || '等待上传') + '</strong></div><div><span>已确认首帧</span><strong>0 个</strong></div><div><span>已验证产物</span><strong>' + escapeHtml(verifiedCount) + ' 个</strong></div></section><button class="studio-primary-action" type="button" disabled>门禁未通过，禁止提交</button><p class="studio-inspector-footnote">不会产生真实费用；配置、配额与本次用户授权齐全后才会开放。</p></aside>';
  }

  function renderStudioHeader(kind, project, currentStage) {
    const isScript = kind === 'script';
    const backAction = isScript ? 'data-return-script-workbench' : 'data-return-redraw-workbench';
    const studioName = isScript ? '小说一键生成短剧' : '一键转绘';
    return '<header class="studio-project-header"><div class="studio-brand"><span class="studio-brand-mark" aria-hidden="true"><img class="brand-logo-image" src="./assets/brand/niannian-ai-authority-gold.svg" alt="" /></span><strong>念念AI</strong></div><div class="studio-breadcrumb"><span>/</span><strong>' + escapeHtml(project.name) + '</strong><small>' + escapeHtml(studioName) + ' · 阶段 ' + escapeHtml(currentStage) + ' / 04</small></div><span class="studio-save-state"><i></i>本地状态已同步</span><div class="studio-project-actions"><button type="button" ' + backAction + '>返回工作台</button><button type="button" disabled title="当前项目未开放模型配置">模型配置</button><button class="studio-export-button" type="button" disabled title="完成质量复核后才会开放交付">交付包</button></div></header>';
  }

  function renderStudioRail(kind, selectedStage, currentStage) {
    const label = kind === 'script' ? '创作流程' : '转绘生产链路';
    const note = kind === 'script'
      ? '只让已验证的文本事实、审核包和参考资产进入下一步。'
      : '只有 verified / delivered 资产可以进入后续链路。';
    return '<aside class="studio-rail"><p>' + escapeHtml(label) + ' · ' + escapeHtml(currentStage) + ' / 04</p>' + renderProductionStepper(kind, selectedStage, currentStage) + '<section class="studio-rail-assist"><span>◎</span><strong>' + (kind === 'script' ? '创作助手' : '权威链路') + '</strong><small>' + escapeHtml(note) + '</small><button type="button" disabled>规则由质量门控制</button></section></aside>';
  }

  function renderProductionFooter(kind, project, selectedStage, currentStage) {
    const selectedNumber = Number(selectedStage);
    const currentNumber = Number(currentStage);
    const previous = selectedNumber > 1 ? '0' + (selectedNumber - 1) : null;
    const stageCount = kind === 'script' ? 4 : 7;
    const next = selectedNumber < stageCount ? '0' + (selectedNumber + 1) : null;
    const action = kind === 'script' ? 'data-script-studio-stage' : 'data-redraw-studio-stage';
    if (selectedNumber > currentNumber) {
      return '<footer class="production-footer production-preview-footer"><div><span>阶段 ' + escapeHtml(selectedStage) + ' / ' + String(stageCount).padStart(2,'0') + ' · 只读预览</span><small>完成当前阶段后，这里才会显示真实的下一步。</small></div><div class="production-footer-actions"><button class="production-back-button" type="button" ' + action + '="' + escapeHtml(currentStage) + '">返回当前可操作阶段</button></div></footer>';
    }
    const back = previous ? '<button class="production-back-button" type="button" ' + action + '="' + previous + '">上一步</button>' : '<button class="production-back-button" type="button" ' + (kind === 'script' ? 'data-return-script-workbench' : 'data-return-redraw-workbench') + '>返回项目入口</button>';
    const advance = next && selectedNumber < currentNumber
      ? '<button class="production-next-button" type="button" ' + action + '="' + next + '">下一步：' + escapeHtml(productionStageDefinitions(kind).find(item => item.id === next)?.label || '') + '</button>'
      : (next ? '<button class="production-next-button" type="button" disabled>下一步等待质量门放行</button>' : '<button class="production-next-button" type="button" disabled>等待交付验收</button>');
    return '<footer class="production-footer"><div><span>阶段 ' + escapeHtml(selectedStage) + ' / ' + String(stageCount).padStart(2,'0') + '</span><small>质量门：' + escapeHtml(productionStageGate(project, kind, selectedStage)) + '</small></div><div class="production-footer-actions">' + back + advance + '</div></footer>';
  }

  function sanitizeRedrawPublicText(root) {
    if (!root) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      node.nodeValue=String(node.nodeValue||'')
        .replace(/Step\s*0?1/gi,'原片分析').replace(/Step\s*0?2/gi,'原片时间轴')
        .replace(/Step\s*0?3/gi,'资产与首帧').replace(/Step\s*0?4/gi,'地区改编').replace(/Step\s*0?5/gi,'资产与首帧')
        .replace(/\b(?:provider|receipt|controller|lease|token)\b/gi,'内部状态')
        .replace(/\b[a-f0-9]{32,64}\b/gi,'内部校验已隐藏');
    }
  }

  function scriptReviewFor(project) {
    return state.scriptReview?.projectId === project?.id ? state.scriptReview.review : null;
  }

  function scriptN06For(project) {
    return state.scriptN06Review?.projectId === project?.id ? state.scriptN06Review.review : null;
  }

  function scriptN06ReviewSignature(review) {
    if (!review) return '';
    return JSON.stringify((review.groups || []).map(group => ({
      groupId:group.groupId,
      status:group.status,
      qualityDecision:group.qualityDecision,
      receipt:group.receipt,
      qa:group.qa,
      media:group.media,
      blockers:group.blockers
    })));
  }

  function isEditingScriptN06(projectId = state.scriptStudioProjectId) {
    const active = document.activeElement;
    return Boolean(
      state.scriptN06Review?.projectId === projectId &&
      state.scriptStudioProjectId === projectId &&
      state.scriptStudioStageId === '04' &&
      active?.matches?.('[data-n06-quality]')
    );
  }

  async function hydrateScriptN06Review(projectId) {
    if (!projectId || isEditingScriptN06(projectId) || state.scriptN06ReviewLoading === projectId) return;
    state.scriptN06ReviewLoading = projectId;
    try {
      const previous = state.scriptN06Review?.projectId === projectId ? state.scriptN06Review.review : null;
      const [payload, channelPayload] = await Promise.all([
        api('/api/script-projects/' + encodeURIComponent(projectId) + '/n06-review'),
        state.videoChannels ? Promise.resolve({registry:state.videoChannels}) : api('/api/video-channels')
      ]);
      state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
      state.scriptN06Review = {projectId, review:payload.review};
      const channelsChanged = !state.videoChannels;
      state.videoChannels = channelPayload.registry;
      const changed = channelsChanged || scriptN06ReviewSignature(previous) !== scriptN06ReviewSignature(payload.review);
      if (changed && state.scriptStudioProjectId === projectId && state.scriptStudioStageId === '04' && !isEditingScriptN06(projectId)) renderScriptStudio(payload.project);
    } catch {
      // The explicit "读取视频状态" action remains available if a protected read fails.
    } finally {
      if (state.scriptN06ReviewLoading === projectId) state.scriptN06ReviewLoading = null;
    }
  }

  function scriptAssetPlan(review) {
    const candidateMap = new Map((Array.isArray(review?.n05Candidates) ? review.n05Candidates : []).map(item => [String(item.id || ''), item]));
    const reviewAssets = Array.isArray(review?.assets) ? review.assets.filter(asset => asset?.assetId) : [];
    if (reviewAssets.length) {
      return reviewAssets.map(asset => {
        const type = String(asset.type || '');
        const category = type.includes('character') ? '角色' : (type.includes('scene') || type.includes('location') ? '场景' : '关键道具');
        const duty = String(asset.referenceDuty || '仅作为后续整图候选的参考职责计划。');
        return {
          id:String(asset.assetId),
          category,
          label:duty.split(/[：:]/)[0] || (category === '角色' ? '角色身份资产' : (category === '场景' ? '场景空间资产' : '关键道具资产')),
          scope:String(asset.scope || '等待镜头引用'),
          duty,
          candidate:candidateMap.get(String(asset.assetId)) || null
        };
      });
    }
    const seen = new Set();
    const frames = Array.isArray(review?.firstFrames) ? review.firstFrames : [];
    return frames.flatMap(frame => (Array.isArray(frame.assetDependencies) ? frame.assetDependencies : []).map(assetId => ({assetId:String(assetId || ''), frame})))
      .filter(item => item.assetId && !seen.has(item.assetId) && seen.add(item.assetId))
      .map(item => {
        const id = item.assetId;
        const category = id.startsWith('CHAR_') ? '角色' : (id.startsWith('SCENE_') ? '场景' : '关键道具');
        const label = category === '角色' ? '角色身份资产' : (category === '场景' ? '场景空间资产' : '关键道具资产');
        return {
          id,
          category,
          label,
          scope:item.frame.videoGroupId ? ('用于 ' + item.frame.videoGroupId + ' 首帧计划') : '等待镜头引用',
          duty:item.frame.referenceDuty || '仅作为后续整图候选的参考职责计划。',
          candidate:candidateMap.get(id) || null
        };
      });
  }

  function renderScriptCandidateActions(projectId, candidate) {
    if (!candidate) return '<button type="button" disabled>待生成</button>';
    const decision = String(candidate.decision || 'pending');
    const confirmed = decision === 'confirm';
    const queued = candidate.regenerationRequest?.status === 'queued_for_approved_image2_worker';
    const label = confirmed ? '已通过 · 可作为确认参考' : (decision === 'reject' ? '已否决' : (queued ? '重做任务已进入 Image2 队列' : (decision === 'regenerate' ? '已提交重做要求' : '等待你的决定')));
    const draft = state.scriptDecisionDraft && state.scriptDecisionDraft.projectId === projectId && state.scriptDecisionDraft.candidateId === candidate.id ? state.scriptDecisionDraft : null;
    const feedback = state.scriptDecisionFeedback && state.scriptDecisionFeedback.candidateId === candidate.id ? state.scriptDecisionFeedback : null;
    const controls = '<div class="script-candidate-actions"><button class="is-pass" type="button" data-n05-candidate-decision="confirm" data-project-id="' + escapeHtml(projectId) + '" data-candidate-id="' + escapeHtml(candidate.id) + '" data-candidate-sha="' + escapeHtml(candidate.sha256) + '">通过</button><button class="is-reject" type="button" data-n05-candidate-decision="reject" data-project-id="' + escapeHtml(projectId) + '" data-candidate-id="' + escapeHtml(candidate.id) + '" data-candidate-sha="' + escapeHtml(candidate.sha256) + '">否决</button><button class="is-regenerate" type="button" data-n05-candidate-decision="regenerate" data-project-id="' + escapeHtml(projectId) + '" data-candidate-id="' + escapeHtml(candidate.id) + '" data-candidate-sha="' + escapeHtml(candidate.sha256) + '">重做</button></div>';
    const submitClass = draft?.decision === 'confirm' ? 'is-pass' : (draft?.decision === 'regenerate' ? 'is-regenerate' : 'is-reject');
    const editor = draft
      ? '<section class="script-decision-editor"><header><span>' + escapeHtml(draft.decision === 'confirm' ? '确认当前版本' : (draft.decision === 'regenerate' ? '重做说明' : '否决说明')) + '</span><small>' + escapeHtml(draft.decision === 'confirm' ? '不会提交视频' : '只针对当前候选图') + '</small></header>' + (draft.decision === 'confirm' ? '<p>确认后仅锁定这张候选图的当前版本。</p>' : '<textarea aria-label="' + escapeHtml(draft.decision === 'regenerate' ? '重做说明' : '否决说明') + '" data-n05-decision-reason="' + escapeHtml(candidate.id) + '" rows="3" placeholder="例如：人物气质不对；右手结构异常；面部受光不符合灯位。">' + escapeHtml(draft.reason || '') + '</textarea>') + (draft.error ? '<small class="is-error">' + escapeHtml(draft.error) + '</small>' : '') + '<div class="script-decision-editor-actions"><button class="' + submitClass + '" type="button" data-n05-candidate-submit="' + escapeHtml(draft.decision) + '" data-project-id="' + escapeHtml(projectId) + '" data-candidate-id="' + escapeHtml(candidate.id) + '" data-candidate-sha="' + escapeHtml(candidate.sha256) + '">' + escapeHtml(draft.decision === 'confirm' ? '确认通过' : (draft.decision === 'regenerate' ? '提交重做' : '确认否决')) + '</button><button type="button" data-n05-candidate-cancel="' + escapeHtml(candidate.id) + '">取消</button></div></section>'
      : '';
    const notice = feedback ? '<small class="script-decision-feedback ' + escapeHtml(feedback.tone || 'is-info') + '">' + escapeHtml(feedback.message) + '</small>' : '';
    return '<div class="script-candidate-decision">' + productionStatusPill(label, queued ? 'running' : decision) + controls + editor + notice + '</div>';
  }

  function renderScriptAssetCard(projectId, asset) {
    const candidate = asset.candidate;
    const selected = state.scriptAssetId === asset.id;
    const decision = candidate?.decision || 'pending';
    const decisionLabel = decision === 'confirm' ? '已通过' : (decision === 'reject' ? '已否决' : (decision === 'regenerate' ? '待重做' : '待审核'));
    const visual = candidate
      ? '<div class="script-asset-candidate"><img src="' + escapeHtml(candidate.imageUrl) + '" alt="' + escapeHtml(asset.label + ' N05候选') + '"><span>评分 ' + escapeHtml(String(candidate.qaScore)) + '</span>' + productionStatusPill(decisionLabel, decision) + '</div>'
      : '<div class="script-asset-placeholder"><span>' + escapeHtml(asset.category) + '</span><strong>未生成</strong><small>候选图待 N05</small></div>';
    return '<button class="script-asset-card' + (selected ? ' is-selected' : '') + '" type="button" data-script-asset-id="' + escapeHtml(asset.id) + '" data-flip-id="script-asset-' + escapeHtml(asset.id) + '" aria-pressed="' + escapeHtml(String(selected)) + '">' + visual + '<div class="script-asset-card-copy"><span>' + escapeHtml(asset.category) + '</span><h4>' + escapeHtml(asset.label) + '</h4><small>' + escapeHtml(scriptCandidateVersionLabel(candidate)) + '</small><p>' + escapeHtml(asset.scope) + '</p></div></button>';
  }

  function scriptQaLabel(candidate) {
    if (!candidate) return '尚未生成';
    if (candidate.qaScore >= 95) return '优秀，可重点审核细节';
    if (candidate.qaScore >= 90) return '通过自动检查';
    return '通过，但存在复核项';
  }

  function scriptDecisionLabel(candidate) {
    const decision = candidate?.decision || 'pending';
    if (decision === 'confirm') return '已通过';
    if (decision === 'reject') return '已否决';
    if (decision === 'regenerate') return '待重做';
    return '待审核';
  }

  function scriptCandidateVersionLabel(candidate) {
    if (!candidate) return '候选待生成';
    if (candidate.decision === 'confirm') return '当前版本已确认';
    if (candidate.decision === 'reject') return '当前版本已否决';
    if (candidate.decision === 'regenerate') return '当前版本待重做';
    return '当前版本待审核';
  }

  function scriptPromptForDisplay(prompt) {
    return String(prompt || '')
      .replace(/本提示词仅为N04候选，禁止提交provider。/g, '当前方案用于审核，暂不创建视频任务。')
      .replace(/N04候选/g, '当前审核方案');
  }

  function renderScriptAssetInspector(projectId, asset) {
    if (!asset) return '<aside class="script-asset-inspector"><header><span class="eyebrow">资产详情</span><h4>选择一个候选</h4></header><div class="script-asset-inspector-placeholder"><span>等待选择</span><strong>从左侧挑选资产</strong><small>这里会显示大图、评分和审核动作。</small></div></aside>';
    const candidate = asset.candidate;
    const visual = candidate
      ? '<div class="script-asset-inspector-candidate"><img src="' + escapeHtml(candidate.imageUrl) + '" alt="' + escapeHtml(asset.label + '候选大图') + '"></div>'
      : '<div class="script-asset-inspector-placeholder"><span>' + escapeHtml(asset.category) + '</span><strong>候选图未生成</strong><small>不会用占位图冒充资产。</small></div>';
    const issue = candidate?.qaScore < 90
      ? '<section class="script-inspector-alert"><strong>需要重点复核</strong><p>' + escapeHtml(candidate.id.includes('HE_JINGYAO') ? '婚戒在不同视图中的清晰度不完全一致。' : '该候选存在自动检查观察项。') + '</p></section>'
      : '';
    const repair = candidate?.regenerationRequest
      ? '<section class="script-repair-status"><span>整图重做</span>' + productionStatusPill(candidate.regenerationRequest.status === 'queued_for_approved_image2_worker' ? '已排队，等待整图重做' : '等待重做状态同步', candidate.regenerationRequest.status) + '<p>' + escapeHtml(candidate.regenerationRequest.reason || '等待受控整图重做。') + '</p></section>'
      : '';
    return '<aside class="script-asset-inspector"><header><span class="eyebrow">资产详情</span><h4>' + escapeHtml(asset.label) + '</h4>' + productionStatusPill(candidate ? scriptDecisionLabel(candidate) : '候选待生成', candidate?.decision || 'pending') + '</header>' + visual + '<div class="script-inspector-score"><div><span>自动评分</span><strong>' + escapeHtml(candidate ? String(candidate.qaScore) : '-') + '</strong></div><p>' + escapeHtml(scriptQaLabel(candidate)) + '</p></div>' + issue + repair + '<dl><div><dt>资产状态</dt><dd>' + escapeHtml(scriptCandidateVersionLabel(candidate)) + '</dd></div><div><dt>使用范围</dt><dd>' + escapeHtml(asset.scope) + '</dd></div><div><dt>版本校验</dt><dd>' + escapeHtml(candidate ? '当前版本已校验' : '等待候选图') + '</dd></div></dl><section class="script-asset-duty"><span>参考职责</span><p>' + escapeHtml(asset.duty) + '</p></section>' + (candidate ? renderScriptCandidateActions(projectId, candidate) : '<button type="button" disabled>参考图尚未生成</button>') + '<small class="script-inspector-footnote">通过只确认当前版本，不会提交视频；重做只进入整图修复队列。</small></aside>';
  }

  function scriptN06StatusLabel(status) {
    return ({ready_for_explicit_dry_run:'规格可锁定', dry_run_intent_recorded:'执行规格已锁定', real_submit_candidate_prepared:'网站事务已锁定', employee_dispatch_prepared:'等待 Mac 员工回执', employee_synthetic_integrated_qa_passed:'测试链路已回写', qa_passed:'媒体校验通过', blocked_preconditions:'等待前置条件'})[status] || '等待状态回读';
  }

  function scriptN06ReceiptLabel(status) {
    return ({not_created_provider_disabled:'等待受控执行', test_only_qa_passed:'Mac 测试回执通过', qa_passed:'收据与媒体已通过', not_created:'尚未创建'})[status] || humanizeProductionGate(status);
  }

  function scriptN06QaLabel(status) {
    return ({not_started_no_media_downloaded:'等待真实媒体', qa_passed:'已通过', passed:'已通过', passed_test_stub:'测试回执，不展示'})[status] || humanizeProductionGate(status);
  }

  function scriptN06QualityLabel(decision) {
    return decision === 'keep_720p_hard_gate' ? '720p 严格质量门' : (decision === 'accept_mimo_uncommitted_resolution' ? '回读真实分辨率后校验' : '尚未锁定质量门');
  }

  function scriptN06ReferenceStateLabel(state) {
    return ({
      confirmed_exact_sha:'已确认，可用于后续参考',
      awaiting_exact_sha_confirmation:'等待确认当前版本',
      missing_candidate:'等待候选图'
    })[String(state || '')] || '等待状态回读';
  }

  function videoChannelEvidenceLabel(value) {
    return ({preflight_only:'仅预检证据',adapter_structural:'适配器结构已验证',integrated_submit_download_probe:'已验证提交、下载与媒体探测',real_delivery_verified:'真实交付已验证'})[String(value || '')] || '证据未分级';
  }

  function videoChannelActionLabel(value) {
    return ({display_only:'仅展示',prepare_only:'可准备事务',real_submit:'可真实提交',disabled:'已停用'})[String(value || '')] || '动作关闭';
  }

  function videoChannelBlockerLabel(values) {
    const labels = {
      website_adapter_missing:'网站适配器未接入',website_to_worker_real_dispatch_not_integrated:'网站到执行员工的真实派发未接通',content_acceptance_pending:'内容验收未晋级',user_content_acceptance_missing:'用户内容验收未确认',real_submit_download_probe_missing:'缺少真实提交与下载探测',subscription_required:'需要有效订阅',globally_disabled_by_user:'用户已全局停用',current_project_channel_prohibited:'当前项目禁止使用'
    };
    return (Array.isArray(values) ? values : []).map(value => labels[value] || String(value || '')).filter(Boolean).join('；') || '当前无额外阻断';
  }

  function renderVideoChannelEvidenceCards() {
    const channels = state.videoChannels?.channels;
    if (!Array.isArray(channels) || !channels.length) return '<section class="video-channel-registry"><header><span class="eyebrow">CHANNEL EVIDENCE</span><strong>正在核验渠道证据</strong></header></section>';
    const cards = channels.map(channel => '<article class="video-channel-card" data-video-channel="' + escapeHtml(channel.channel_id) + '" data-channel-action-mode="' + escapeHtml(channel.website_action_mode) + '"><header><strong>' + escapeHtml(channel.display_name) + '</strong>' + productionStatusPill(videoChannelActionLabel(channel.website_action_mode), channel.website_action_mode) + '</header><dl><div><dt>外部证据</dt><dd>' + escapeHtml(videoChannelEvidenceLabel(channel.evidence_level)) + '</dd></div><div><dt>网站适配</dt><dd>' + escapeHtml(channel.website_adapter_status === 'none' ? '尚未接入' : channel.website_adapter_status === 'adapter_structural' ? '结构可准备' : '已集成') + '</dd></div></dl><p>' + escapeHtml(videoChannelBlockerLabel(channel.blockers)) + '</p></article>').join('');
    return '<section class="video-channel-registry"><header><div><span class="eyebrow">CHANNEL EVIDENCE</span><strong>视频渠道证据卡</strong></div><small>证据等级与网站可执行性分开计算</small></header><div class="video-channel-grid">' + cards + '</div></section>';
  }

  function renderScriptN06MediaPreview(group) {
    const media = group?.media || {};
    if (media.state === 'ready' && media.previewUrl) {
      return '<div class="script-video-player"><video controls playsinline preload="metadata" src="' + escapeHtml(media.previewUrl) + '"></video><span>已验证媒体 · ' + escapeHtml(String(media.width || '-')) + ' × ' + escapeHtml(String(media.height || '-')) + ' · ' + escapeHtml(String(media.durationSec || '-')) + ' 秒</span></div>';
    }
    return '<div class="script-video-preview-empty"><span>暂无可审片媒体</span><strong>' + escapeHtml(scriptN06StatusLabel(group?.status || '')) + '</strong><small>' + escapeHtml(media.message || '只有真实视频通过媒体与视觉校验后，才会在这里提供预览。') + '</small></div>';
  }

  function renderScriptN06Workspace(project) {
    const review = scriptN06For(project);
    if (!review) {
      return '<section class="production-workspace script-stage-workspace"><header class="production-workspace-header"><div><span class="eyebrow">04 · 视频与交付</span><h3>视频审片与执行规格</h3><p>读取当前项目的精确视频合同、已确认参考和质量门。没有真实媒体时不会伪造预览。</p></div><span class="production-stage-chip">N06 · N07</span></header><section class="script-review-loading"><span class="eyebrow">VIDEO REVIEW</span><h4>尚未读取视频规格</h4><p>先读取当前项目的受控规格，才能显示视频组、媒体状态和下一步。</p><button class="production-ghost-button" type="button" data-load-n06-review="' + escapeHtml(project.id) + '">读取视频状态</button></section></section>';
    }
    const groups = (Array.isArray(review.groups) ? review.groups : []).filter(group => group.groupId === 'V001' || group.groupId === 'V002');
    const selected = groups.find(group => group.groupId === state.scriptVideoGroupId) || groups[0] || null;
    if (selected) state.scriptVideoGroupId = selected.groupId;
    if (!selected) return '<section class="production-workspace script-stage-workspace"><section class="script-review-loading"><h4>当前项目还没有可审片的视频组</h4></section></section>';
    const refs = (selected.references || []).map(ref => '<li><strong>' + escapeHtml(ref.refKey) + '</strong><span>' + escapeHtml(ref.duty) + '</span><small>' + escapeHtml(scriptN06ReferenceStateLabel(ref.state)) + '</small></li>').join('') || '<li><span>当前组没有可消费参考。</span></li>';
    const media = selected.media || {};
    const eligible = selected.groupId === 'V001' && selected.canRecordDryRun;
    const canPrepareRealSubmit = selected.groupId === 'V001' && selected.status === 'dry_run_intent_recorded' && Boolean(selected.qualityDecision);
    const canDispatchSynthetic = selected.groupId === 'V001' && selected.status === 'real_submit_candidate_prepared' && Boolean(selected.specSha256);
    const canReconcileSynthetic = selected.groupId === 'V001' && selected.status === 'employee_dispatch_prepared';
    const syntheticIntegrated = selected.groupId === 'V001' && selected.status === 'employee_synthetic_integrated_qa_passed';
    const selectedStatusLabel = scriptN06StatusLabel(selected.status);
    const selectedStatusPill = productionStatusPill(selectedStatusLabel, selected.status);
    const receiptPill = productionStatusPill(scriptN06ReceiptLabel(selected.receipt?.status), selected.receipt?.status);
    const mediaQaPill = productionStatusPill(scriptN06QaLabel(media.qa?.media || selected.qa?.status), media.qa?.media || selected.qa?.status);
    const visualQaPill = productionStatusPill(scriptN06QaLabel(media.qa?.visual), media.qa?.visual);
     const action = selected.groupId === 'V001'
       ? '<label><span>质量策略</span><select data-n06-quality="' + escapeHtml(selected.groupId) + '"' + (eligible ? '' : ' disabled') + '><option value="">请选择质量门</option><option value="keep_720p_hard_gate"' + (selected.qualityDecision === 'keep_720p_hard_gate' ? ' selected' : '') + '>保持 720p 严格质量门</option><option value="accept_mimo_uncommitted_resolution"' + (selected.qualityDecision === 'accept_mimo_uncommitted_resolution' ? ' selected' : '') + '>回读真实分辨率后校验</option></select></label>' + (eligible ? '<button class="studio-primary-action" type="button" data-n06-generate="' + escapeHtml(selected.groupId) + '" data-project-id="' + escapeHtml(project.id) + '">锁定 V001 执行规格</button>' : '') + (canPrepareRealSubmit ? '<button class="production-ghost-button" type="button" data-n06-prepare-real="' + escapeHtml(selected.groupId) + '" data-project-id="' + escapeHtml(project.id) + '">准备网站执行</button>' : '') + (canDispatchSynthetic ? '<button class="studio-primary-action" type="button" data-n06-dispatch-synthetic="' + escapeHtml(selected.groupId) + '" data-project-id="' + escapeHtml(project.id) + '" data-spec-sha="' + escapeHtml(selected.specSha256) + '">派给 Mac 员工做测试链路</button>' : '') + (canReconcileSynthetic ? '<button class="production-ghost-button" type="button" data-n06-reconcile-synthetic="' + escapeHtml(selected.groupId) + '" data-project-id="' + escapeHtml(project.id) + '">读取 Mac 测试回执</button>' : '') + (syntheticIntegrated ? '<button type="button" disabled>测试链路已通过 · 未调用媒体渠道</button>' : '')
      : '<button type="button" disabled>V002 等待 V001 的真实媒体与质量回执</button>';
    const timeline = groups.map(group => {
      const active = group.groupId === selected.groupId;
      return '<button class="' + (active ? 'is-active' : '') + '" type="button" aria-pressed="' + String(active) + '" data-script-video-group="' + escapeHtml(group.groupId) + '"><span>' + escapeHtml(group.groupId) + '</span>' + productionStatusPill(scriptN06StatusLabel(group.status), group.status) + '<small>' + escapeHtml(String(group.durationSec)) + ' 秒 · ' + escapeHtml(group.media?.state === 'ready' ? '可审片' : '等待媒体') + '</small></button>';
    }).join('');
    const routeContract = '<section class="script-n06-route-contract"><div><span>Mac 员工模型通道</span><strong>Krill Codex · ' + escapeHtml(selected.employeeDispatch?.employee?.title || '等待分配现有员工') + '</strong><small>只负责任务理解、Skill 路由与测试回执。</small></div><div><span>媒体生成渠道</span><strong>Mimo · 当前未调用</strong><small>上传、生成、扣费与真实任务创建仍关闭。</small></div><div><span>交付门</span><strong>' + (syntheticIntegrated ? 'test_only 已回写' : '等待完整执行证据') + '</strong><small>测试回执不能解锁 V002，也不会显示为成片。</small></div></section>';
     return '<section class="production-workspace script-stage-workspace"><header class="production-workspace-header"><div><span class="eyebrow">04 · 视频与交付</span><h3>视频审片与执行规格</h3><p>在网站内查看每组真实回执、媒体校验与参考职责。预览只接受经过完整校验的真实视频。</p></div><span class="production-stage-chip">N06 · N07</span></header>' + routeContract + renderVideoChannelEvidenceCards() + '<nav class="script-video-timeline" aria-label="EP001 视频组">' + timeline + '</nav><section class="script-video-editor"><article class="script-video-preview"><header><span class="eyebrow">MEDIA REVIEW</span><strong>' + escapeHtml(selected.groupId) + '</strong>' + selectedStatusPill + '</header>' + renderScriptN06MediaPreview(selected) + '</article><aside class="script-video-controls"><header><span class="eyebrow">QUALITY GATE</span><h4>当前回读</h4></header><dl><div><dt>任务回执</dt><dd>' + receiptPill + '</dd></div><div><dt>媒体校验</dt><dd>' + mediaQaPill + '</dd></div><div><dt>视觉校验</dt><dd>' + visualQaPill + '</dd></div><div><dt>版本校验</dt><dd>' + escapeHtml(media.sha256 ? '当前媒体版本已校验' : '等待真实媒体') + '</dd></div></dl></aside></section><section class="script-n06-detail-grid"><article class="script-n06-spec"><header><span class="eyebrow">LOCKED SPEC</span><strong>' + escapeHtml(selected.groupId) + ' · ' + escapeHtml(String(selected.durationSec)) + ' 秒 · ' + escapeHtml(selected.aspectRatio) + '</strong></header><div class="script-n06-policy-line"><span>质量门</span>' + productionStatusPill(scriptN06QualityLabel(selected.qualityDecision), selected.qualityDecision || 'pending') + '<small>' + escapeHtml(selected.qualityPolicy || '') + '</small></div><details><summary>查看锁定视频提示词</summary><textarea readonly>' + escapeHtml(selected.lockedPrompt || '未找到锁定提示词') + '</textarea></details></article><article class="script-n06-references"><header><span class="eyebrow">VERIFIED REFERENCES</span><strong>已确认参考资产</strong></header><ul>' + refs + '</ul></article></section>' + (selected.blockers?.length ? '<section class="script-n06-blocker"><strong>当前不能继续的原因</strong><p>' + escapeHtml(selected.blockers.map(humanizeProductionGate).join(' ')) + '</p></section>' : '') + '<footer class="script-n06-actionbar">' + action + '</footer></section>';
  }

  function renderScriptStageBody(project, stageId) {
    const source = project.source || {};
    const ingest = project.ingest || {};
    const runtime = project.runtime || {};
    if (stageId === '01') {
      const sourceReady = Boolean(source.sha256 && source.characters);
      const ingestReady = ingest.status === 'verified' && Boolean(ingest.extractedTextSha256);
      const indexReady = Number(ingest.chapterCount) > 0 && Number(ingest.paragraphCount) > 0;
      const rightsReady = String(project.gates?.rights || '').toLowerCase().includes('confirmed');
      const canonGate = productionStageGate(project, 'script', '01');
      const canonReady = /已通过|completed|verified/i.test(canonGate);
      const sourceLabel = source.originalName || (source.type === 'pasted_text' ? '已粘贴小说正文' : '小说正文');
      const sourceKind = source.type === 'docx' ? 'Word 原文已抽取，原文和抽取文本哈希均已保留。' : '已登记正文，仅使用可验证文本事实。';
      const contractSteps = [
        {label:'原文锁定', detail:sourceReady ? '当前原文已校验' : '等待可验证原文', ready:sourceReady},
        {label:'文本抽取', detail:ingestReady ? '抽取文本已核验' : '等待抽取核验', ready:ingestReady},
        {label:'章节索引', detail:indexReady ? (String(ingest.chapterCount) + ' 章 · ' + String(ingest.paragraphCount) + ' 段') : '等待结构索引', ready:indexReady},
        {label:'改编权', detail:rightsReady ? '已由你确认' : '等待确认', ready:rightsReady},
        {label:'事实账本', detail:canonReady ? '已通过，可供下游读取' : String(canonGate || '等待核验'), ready:canonReady}
      ].map((step, index) => '<li class="' + (step.ready ? 'is-ready' : 'is-pending') + '"><span>' + String(index + 1).padStart(2, '0') + '</span><div><strong>' + escapeHtml(step.label) + '</strong><small>' + escapeHtml(step.detail) + '</small></div><i>' + (step.ready ? '已验证' : '待处理') + '</i></li>').join('');
      return '<section class="production-workspace script-stage-workspace"><header class="production-workspace-header"><div><span class="eyebrow">01 · 剧本输入</span><h3>原文与制作设置</h3><p>小说先进入可追溯的文本合同；这一页只确认输入和改编规格，不生产人物图或视频。</p></div><span class="production-stage-chip">N00 · N01</span></header><section class="script-source-contract" aria-label="小说原文合同"><header><div><span class="eyebrow">SOURCE CONTRACT</span><strong>从原文到可消费事实</strong></div><small>只锁定已验证事实，不提前生成画面。</small></header><ol>' + contractSteps + '</ol><footer><div><span>原文保留</span><strong>人物、关系、剧情与可读文本</strong></div><div><span>后续决定</span><strong>视觉风格、镜头设计与视频生成</strong></div></footer></section><div class="script-source-workspace"><section class="script-source-input"><header><div><span class="eyebrow">SOURCE SCRIPT</span><h4>小说原文</h4></div><span class="script-verified-badge">已验证</span></header><div class="script-document-card"><span class="script-document-icon">' + escapeHtml(source.type === 'docx' ? 'DOCX' : 'TEXT') + '</span><div><strong>' + escapeHtml(sourceLabel) + '</strong><small>' + escapeHtml(sourceKind) + '</small></div></div><dl><div><dt>正文规模</dt><dd>' + escapeHtml(String(source.characters || 0)) + ' 字</dd></div><div><dt>章节 / 段落</dt><dd>' + escapeHtml(String(ingest.chapterCount || 0)) + ' / ' + escapeHtml(String(ingest.paragraphCount || 0)) + '</dd></div><div><dt>改编权</dt><dd>' + escapeHtml(rightsReady ? '已确认' : '等待确认') + '</dd></div><div><dt>文本事实账本</dt><dd>' + escapeHtml(humanizeProductionGate(canonGate)) + '</dd></div></dl></section><aside class="script-source-settings"><header><span class="eyebrow">OUTPUT SETTINGS</span><h4>短剧制作规格</h4></header><label><span>叙事形态</span><select disabled><option>都市情感短剧</option></select></label><label><span>画幅</span><select disabled><option>9 : 16 竖屏</option></select></label><label><span>首集规划</span><select disabled><option>EP001 · 60 秒</option></select></label><section class="script-setting-notice"><i>✓</i><div><strong>事实账本已通过</strong><small>角色、关系与剧情事实将由后续分集和分镜页面读取。</small></div></section></aside></div></section>';
    }
    if (stageId === '02') {
      const review = scriptReviewFor(project);
      const assets = scriptAssetPlan(review);
      const roles = assets.filter(asset => asset.category === '角色');
      const spaces = assets.filter(asset => asset.category !== '角色');
      const selectedAsset = assets.find(asset => asset.id === state.scriptAssetId) || assets[0] || null;
      if (selectedAsset) state.scriptAssetId = selectedAsset.id;
      const candidates = Array.isArray(review?.n05Candidates) ? review.n05Candidates : [];
      const supportCandidates = candidates.filter(item => !item.id.startsWith('FF_'));
      const firstFrameCandidates = candidates.filter(item => item.id.startsWith('FF_'));
      const supportConfirmed = supportCandidates.filter(item => item.decision === 'confirm').length;
      const frameConfirmed = firstFrameCandidates.filter(item => item.decision === 'confirm').length;
      const averageScore = candidates.length ? Math.round(candidates.reduce((sum, item) => sum + item.qaScore, 0) / candidates.length) : 0;
      const assetBody = review
        ? '<div class="script-assets-layout"><section class="script-assets-catalog"><header class="script-catalog-heading"><div><span class="eyebrow">角色资产</span><h4>人物身份套组</h4></div><small>点击候选，在右侧逐项审核</small></header><div class="script-asset-grid">' + (roles.length ? roles.map(asset => renderScriptAssetCard(project.id, asset)).join('') : '<div class="script-asset-empty">N04 审核包尚未列出角色身份资产。</div>') + '</div><header class="script-catalog-heading script-space-heading"><div><span class="eyebrow">场景与关键道具</span><h4>环境、文件与物件</h4></div><small>均保留独立参考职责</small></header><div class="script-asset-grid script-asset-grid-compact">' + (spaces.length ? spaces.map(asset => renderScriptAssetCard(project.id, asset)).join('') : '<div class="script-asset-empty">当前 EP001 不需要额外场景或关键道具计划。</div>') + '</div></section>' + renderScriptAssetInspector(project.id, selectedAsset) + '</div>'
        : '<section class="script-review-loading"><span class="eyebrow">ASSET DETAILS</span><h4>正在同步资产规划</h4><p>仅读取本项目的 N04 审核包，不会生成或提交任何图片。</p><button class="production-ghost-button" type="button" data-load-n04-review="' + escapeHtml(project.id) + '">读取审核包</button></section>';
      return '<section class="production-workspace script-stage-workspace"><header class="production-workspace-header"><div><span class="eyebrow">02 · 资产审核</span><h3>角色、场景与关键道具</h3><p>从候选列表选择资产，在详情区核对大图、自动检查和当前版本。只有你通过的当前候选版本才能成为分镜参考。</p></div><span class="production-stage-chip">N02 · N05</span></header><div class="script-stage-metrics"><article><span>支持资产</span><strong>' + escapeHtml(String(supportConfirmed)) + ' / ' + escapeHtml(String(supportCandidates.length)) + '</strong><small>角色、场景与道具</small></article><article><span>真首帧</span><strong>' + escapeHtml(String(frameConfirmed)) + ' / ' + escapeHtml(String(firstFrameCandidates.length)) + '</strong><small>在下一步逐镜头审核</small></article><article><span>自动评分均值</span><strong>' + escapeHtml(String(averageScore || '-')) + '</strong><small>机器检查，不替代人工决定</small></article></div>' + assetBody + '</section>';
    }
    if (stageId === '03') {
      const review = scriptReviewFor(project);
      const groups = Array.isArray(review?.videoGroups) ? review.videoGroups : [];
      const frames = Array.isArray(review?.firstFrames) ? review.firstFrames : [];
      const selectedId = groups.some(group => group.videoGroupId === state.scriptStoryboardGroupId) ? state.scriptStoryboardGroupId : groups[0]?.videoGroupId;
      const group = groups.find(item => item.videoGroupId === selectedId) || null;
      const frame = frames.find(item => item.videoGroupId === selectedId) || null;
      const frameCandidate = (Array.isArray(review?.n05Candidates) ? review.n05Candidates : []).find(item => item.id === frame?.refKey) || null;
      const frameVisual = frameCandidate
        ? '<div class="script-shot-preview-candidate"><img src="' + escapeHtml(frameCandidate.imageUrl) + '" alt="' + escapeHtml((frame?.refKey || '首帧') + '候选图') + '"><div><strong>自动评分 ' + escapeHtml(String(frameCandidate.qaScore)) + '</strong><span>' + escapeHtml(scriptQaLabel(frameCandidate)) + '</span><small>' + escapeHtml(scriptCandidateVersionLabel(frameCandidate)) + '</small></div></div>' + renderScriptCandidateActions(project.id, frameCandidate)
        : '<div class="script-shot-preview-empty"><i>▶</i><span>候选首帧尚未生成</span><small>' + escapeHtml(frame?.refKey || '首帧计划') + ' · 仅为计划键</small></div>';
      const assets = scriptAssetPlan(review);
      const authorized = review?.authorization?.status === 'authorized';
      const assetShelf = assets.map(asset => {
        const decision = asset.candidate?.decision || 'pending';
        const label = asset.candidate ? scriptDecisionLabel(asset.candidate) : '待生成';
        return '<article><span>' + escapeHtml(asset.category) + '</span><strong>' + escapeHtml(asset.label) + '</strong><small>' + escapeHtml(scriptCandidateVersionLabel(asset.candidate)) + '</small><em>' + escapeHtml(label) + '</em></article>';
      }).join('');
      const reviewCount = review?.n05Summary ? (review.n05Summary.confirmedCount + ' / ' + review.n05Summary.candidateCount + ' 已确认') : '等待候选图执行';
      const board = group
        ? '<div class="script-storyboard-workspace"><aside class="script-shot-preview" data-storyboard-focus-panel data-flip-id="storyboard-preview"><header><div><span class="eyebrow">真首帧</span><strong>' + escapeHtml(group.videoGroupId) + '</strong></div><span class="script-storyboard-current">当前组</span></header>' + frameVisual + '<dl><div><dt>镜头组</dt><dd>' + escapeHtml((group.shots || []).join(' · ')) + '</dd></div><div><dt>时长</dt><dd>' + escapeHtml(String(group.durationSec || 0)) + ' 秒</dd></div><div><dt>审核状态</dt><dd>' + escapeHtml(scriptDecisionLabel(frameCandidate)) + '</dd></div></dl></aside><section class="script-prompt-editor" data-storyboard-focus-panel data-flip-id="storyboard-prompt"><header><div><span class="eyebrow">视频提示词</span><h4>镜头事实与两段式正文</h4></div><button type="button" disabled>只读锁定</button></header><div class="script-shot-fact-grid"><article><span>机位 / 构图</span><p>' + escapeHtml(group.factCard?.cameraAndComposition || '-') + '</p></article><article><span>人物 / 站位</span><p>' + escapeHtml(group.factCard?.visibleSubjectsAndBlocking || '-') + '</p></article><article><span>手部 / 道具</span><p>' + escapeHtml(group.factCard?.handActionAndProps || '-') + '</p></article><article><span>连续性</span><p>' + escapeHtml(group.factCard?.continuity || '-') + '</p></article></div><label><span>两段式视频提示词</span><textarea readonly>' + escapeHtml(scriptPromptForDisplay(group.channelPrompt2part || '当前视频提示词尚未载入。')) + '</textarea></label><div class="script-prompt-meta"><span>当前镜头组：' + escapeHtml(group.videoGroupId) + '</span><span>首帧：' + escapeHtml(group.referencePlan?.primaryFirstFrameRefKey || frame?.refKey || '待确认') + '</span><span>候选评分：' + escapeHtml(frameCandidate ? String(frameCandidate.qaScore) : '-') + '</span><span>视频状态：未提交</span></div></section><aside class="script-shot-asset-shelf" data-storyboard-focus-panel data-flip-id="storyboard-assets"><header><span class="eyebrow">参考资产</span><h4>角色与场景</h4></header><div>' + assetShelf + '</div><section class="script-board-gate"><span>当前质量门</span><strong>' + escapeHtml(reviewCount) + '</strong><small>只有逐项确认当前候选版本后才可成为上传参考；视频任务保持关闭。</small></section>' + (authorized ? '<button type="button" disabled>视频提交仍未授权</button>' : '<button class="script-board-authorize" type="button" data-authorize-n05="' + escapeHtml(project.id) + '" data-review-sha="' + escapeHtml(review.promptPackageSha256 || '') + '">确认方向并授权 N05 候选图</button>') + '</aside></div><nav class="script-storyboard-strip" aria-label="EP001 视频组">' + groups.map(item => { const candidate = (Array.isArray(review?.n05Candidates) ? review.n05Candidates : []).find(candidateItem => candidateItem.id === frames.find(frameItem => frameItem.videoGroupId === item.videoGroupId)?.refKey); const isActive = item.videoGroupId === selectedId; return '<button class="' + (isActive ? 'is-active' : '') + '" type="button" aria-pressed="' + String(isActive) + '" data-flip-id="storyboard-group-' + escapeHtml(item.videoGroupId) + '" data-script-storyboard-group="' + escapeHtml(item.videoGroupId) + '"><span>' + escapeHtml(item.videoGroupId) + ' · ' + (isActive ? '当前预览' : escapeHtml(scriptDecisionLabel(candidate))) + '</span><strong>' + escapeHtml((item.shots || []).join(' · ')) + '</strong><small>' + escapeHtml(String(item.durationSec || 0)) + ' 秒 · 评分 ' + escapeHtml(candidate ? String(candidate.qaScore) : '-') + '</small></button>'; }).join('') + '</nav>'
        : '<section class="script-review-loading"><span class="eyebrow">STORYBOARD</span><h4>正在读取分镜审核包</h4><p>只展示当前 N04 的镜头事实、首帧计划和两段式提示词，不会创建视频任务。</p><button class="production-ghost-button" type="button" data-load-n04-review="' + escapeHtml(project.id) + '">读取审核包</button></section>';
      return '<section class="production-workspace script-stage-workspace production-script-board"><header class="production-workspace-header"><div><span class="eyebrow">03 · 分镜管理</span><h3>逐组核对分镜</h3><p>左侧查看首帧计划，中间核对镜头事实与两段式提示词，右侧确认资产是否正确匹配。</p></div><span class="production-stage-chip">N04 · N05</span></header>' + board + '</section>';
    }
    return renderScriptN06Workspace(project);
  }

  function redrawSettingOptions(currentValue, options) {
    return options.map(([value, label]) => '<option value="' + escapeHtml(value) + '"' + (value === currentValue ? ' selected' : '') + '>' + escapeHtml(label) + '</option>').join('');
  }

  function customerSpecialRequirementText(value) {
    const text = String(value || '').trim();
    return /^保持原片剧情、逐镜头时序、机位、构图、人物动作、道具交接和画面中心事实；人物身份、服装、场景、可读文字和对白自然本土化为.+世界，目标语言 [A-Za-z-]+。$/.test(text) ? '' : text;
  }

  function isFixedAppExecutorWait(project) {
    return project?.analysis?.status === 'prepared'
      && ['step01_fixed_app_dispatch_prepared', 'step01_fixed_app_dispatch_ready'].includes(project?.runtime?.gateState)
      && ['STEP01_FIXED_APP_PHASE_EXECUTOR_NOT_INSTALLED', 'STEP01_FIXED_APP_PHASE_EXECUTOR_READY_FOR_DISPATCH'].includes(project?.runtime?.blocker);
  }

  function fixedAppExecutorIsReady(project) {
    return project?.runtime?.gateState === 'step01_fixed_app_dispatch_ready'
      && project?.runtime?.blocker === 'STEP01_FIXED_APP_PHASE_EXECUTOR_READY_FOR_DISPATCH';
  }

  function redrawAnalysisState(project) {
    const analysis = project?.analysis || {};
    const productionStatus = String(project?.runtime?.productionStatus || project?.productionStatus || '');
    const transport = project?.runtime?.step01Transport || {};
    const incompleteDirectRun = analysis.runtimeProfile === 'haika-step01-direct-v1';
    if (transport.artifact_broker_ready === false) return {label:'分析服务正在准备中',progress:'0%',active:false,complete:false};
    if (incompleteDirectRun) return {label:'需要重新分析原片',progress:'0%',active:false,complete:false};
    if (analysis.status === 'evidence_ready' && analysis.runtimeProfile === 'haika-step01-hq-full-v1') return {label:'原片分析完成',progress:'100%',active:false,complete:true};
    if (['codex_running','running'].includes(analysis.status) || productionStatus === 'running_step01') return {label:'正在分析原片',progress:'0%',active:true,complete:false};
    if (['return_received','reducer_verifying','receipt_pending_sync'].includes(analysis.status)) return {label:'正在核对分析结果',progress:'0%',active:true,complete:false};
    if (isFixedAppExecutorWait(project)) return {label:'分析服务正在排队准备',progress:'0%',active:false,complete:false};
    if (['capability_preflight','codex_dispatched','prepared'].includes(analysis.status)) return {label:'分析服务正在准备',progress:'0%',active:true,complete:false};
    if (analysis.status === 'queued') return {label:'已创建原片分析任务，正在准备',progress:'0%',active:true,complete:false};
    if (analysis.status === 'blocked_resource' && project?.runtime?.gateState === 'step01_hq_full_blocked_no_dispatch') return {label:'分析服务正在恢复',progress:'0%',active:true,complete:false};
    if (['infra_failed','blocked_contract','blocked_resource','blocked_quality','blocked_authorization','blocked_transport'].includes(String(analysis.status || ''))) return {label:'原片分析暂未完成',progress:'0%',active:false,complete:false};
    if (project?.preflight?.status === 'passed') return {label:'预检完成 · 等待开始',progress:'0%',active:false,complete:false};
    return {label:'尚未开始',progress:'0%',active:false,complete:false};
  }

  function formatStep01Duration(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    if (!minutes) return remainder + ' 秒';
    return minutes + ' 分 ' + String(remainder).padStart(2, '0') + ' 秒';
  }

  function step01ProgressDetails(project) {
    const analysis = project?.analysis || {};
    const status = String(analysis.status || '');
    const startedAt = analysis.requestedAt || analysis.updatedAt || project?.runtime?.checkpointUpdatedAt || null;
    const elapsedSeconds = startedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)) : 0;
    const executorWait = isFixedAppExecutorWait(project);
    const transport = project?.runtime?.step01Transport || {};
    const brokerWaiting = transport.artifact_broker_ready === false;
    const active = !executorWait && (['queued','capability_preflight','codex_dispatched','codex_running','prepared','running','return_received','reducer_verifying','receipt_pending_sync'].includes(status) || (status === 'blocked_resource' && project?.runtime?.gateState === 'step01_hq_full_blocked_no_dispatch'));
    const stage = brokerWaiting ? {label:'服务准备'} : executorWait ? {label:'任务排队'} : ['return_received','reducer_verifying','receipt_pending_sync'].includes(status) ? {label:'结果核对'} : ['codex_running','running'].includes(status) ? {label:'原片分析'} : ['capability_preflight','codex_dispatched','prepared'].includes(status) ? {label:'服务准备'} : status === 'queued' ? {label:'原片分析任务准备'} : status === 'blocked_resource' && project?.runtime?.gateState === 'step01_hq_full_blocked_no_dispatch' ? {label:'服务恢复'} : {label:'等待开始'};
    return {
      active,
      label:stage.label,
      progress:status === 'evidence_ready' ? '100%' : '0%',
      startedAt:startedAt || '',
      elapsedLabel:executorWait ? '实际分析耗时' : '已用时间',
      elapsedText:executorWait ? '尚未开始' : (active ? formatStep01Duration(elapsedSeconds) : '尚未开始'),
      showWaitDuration:executorWait,
      waitStartedAt:executorWait ? startedAt || '' : '',
      waitText:executorWait ? formatStep01Duration(elapsedSeconds) : '',
      estimateText:brokerWaiting || executorWait ? '服务准备完成后自动继续' : (active ? '以真实回执为准' : '尚未运行'),
      updatedText:project?.runtime?.lastHeartbeat || analysis.updatedAt || project?.runtime?.checkpointUpdatedAt || null
    };
  }

  function refreshStep01ElapsedLabels() {
    document.querySelectorAll('[data-step01-elapsed]').forEach(node => {
      const startedAt = node.getAttribute('data-step01-started-at');
      const startedMs = Date.parse(String(startedAt || ''));
      if (!Number.isFinite(startedMs)) return;
      node.textContent = formatStep01Duration(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
    });
    document.querySelectorAll('[data-step01-wait]').forEach(node => {
      const startedAt = node.getAttribute('data-step01-wait-started-at');
      const startedMs = Date.parse(String(startedAt || ''));
      if (!Number.isFinite(startedMs)) return;
      node.textContent = formatStep01Duration(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
    });
  }

  function step01ProjectionFingerprint(project) {
    if (!project) return '';
    return JSON.stringify([
      project.analysis?.status,
      project.runtime?.productionStatus,
      project.runtime?.worker?.status,
      project.runtime?.blocker,
      project.runtime?.gateState,
      project.runtime?.step01Transport?.artifact_broker_ready,
      project.runtime?.step01Transport?.artifact_transport_state,
      project.runtime?.step01Transport?.fixed_app_turn_state,
      project.runtime?.step01Transport?.reducer_state
    ]);
  }

  // Heartbeats update often, but do not change any Stage01 structure. Keep them out of
  // this fingerprint so they cannot repeatedly rebuild the source-video surface.
  function redrawStudioProjectionFingerprint(project) {
    if (!project) return '';
    return JSON.stringify([
      project.id,
      project.source?.originalName,
      project.source?.previewUrl,
      project.preflight?.status,
      project.preflight?.video?.width,
      project.preflight?.video?.height,
      project.preflight?.durationSeconds,
      step01ProjectionFingerprint(project),
      project.analysis?.step01EvidenceDelivered,
      project.runtime?.currentNode,
      project.runtime?.earliestIncompleteNode,
      project.route?.earliestNode
    ]);
  }

  function step01IsActive(project) {
    return !isFixedAppExecutorWait(project) && ['queued','capability_preflight','codex_dispatched','codex_running','prepared','running','return_received','reducer_verifying','receipt_pending_sync'].includes(String(project?.analysis?.status || ''));
  }

  async function refreshActiveRedrawProject({projectId = state.redrawStudioProjectId, force = false} = {}) {
    const current = state.projects.find(item => item.id === projectId);
    if (!projectId || !current || (!force && !step01IsActive(current)) || state.loadingProjects) return false;
    try {
      const payload = await api('/api/projects/' + encodeURIComponent(projectId));
      if (!payload?.project) return false;
      const before = redrawStudioProjectionFingerprint(current);
      const after = redrawStudioProjectionFingerprint(payload.project);
      state.projects = state.projects.map(item => item.id === projectId ? payload.project : item);
      if (before !== after && redrawStudioRoute()?.projectId === projectId) openRedrawStudio(projectId, {updateHash:false});
      return true;
    } catch {
      return false;
    }
  }

  async function reconcileProjectEvents({source = 'event'} = {}) {
    const redrawProjectIds = Array.from(pendingRedrawProjectIds);
    const scriptProjectIds = Array.from(pendingScriptProjectIds);
    pendingRedrawProjectIds = new Set();
    pendingScriptProjectIds = new Set();
    if (projectEventGapDetected) {
      projectEventGapDetected = false;
      return loadProjects({source});
    }
    if (!redrawProjectIds.length && !scriptProjectIds.length) return loadProjects({source});
    if (scriptProjectIds.length) return loadProjects({source});
    const results = await Promise.all(redrawProjectIds.map(projectId => refreshActiveRedrawProject({projectId, force:true})));
    if (!results.every(Boolean)) return loadProjects({source});
    renderProjects();
    renderWorkbench();
    renderTeam();
    return true;
  }

  function adaptShotReviewShot(shot) {
    const frames = ['start', 'mid', 'end'].map(point => shot?.frames?.[point]).filter(Boolean).map(frame => ({
      point:frame.point,
      timecode:frame.timecode,
      timeMs:Number(frame.time_sec || 0) * 1000,
      url:frame.path,
      sha256:frame.sha256,
      bytes:frame.bytes
    }));
    return {
      shotId:shot.shot_id,
      startMs:Number(shot.start_sec || 0) * 1000,
      endMs:Number(shot.end_sec || 0) * 1000,
      startTimecode:shot.start_timecode,
      endTimecode:shot.end_timecode,
      evidence:{keyframes:frames},
      dialogue:(shot.dialogue || []).map(row => ({...row,startMs:Number(row.start_sec || 0) * 1000,endMs:Number(row.end_sec || 0) * 1000,sourceTool:row.source_tool})),
      forcedAlignment:Array.isArray(shot.forced_alignment) ? shot.forced_alignment : [],
      ocr:(shot.ocr || []).map(row => ({...row,timeMs:Number(row.time_sec || 0) * 1000})),
      speaker:Array.isArray(shot.speaker) ? shot.speaker : [],
      scene:shot.scene || null,
      action:shot.action || null,
      camera:shot.camera || null,
      reviewStatus:shot.review_status,
      activeRevision:shot.active_revision
    };
  }

  function adaptShotReviewModel(model) {
    const shots = (model?.shots || []).map(adaptShotReviewShot);
    const dialogueIds = new Set();
    let ocrCount = 0;
    for (const shot of model?.shots || []) {
      for (const row of shot.dialogue || []) dialogueIds.add(row.event_id);
      ocrCount += (shot.ocr || []).length;
    }
    return {
      package:{sha256:model?.source_evidence?.evidence_binding_sha256 || '',status:'verified'},
      counts:{primaryShots:shots.length,dialogueSegments:dialogueIds.size,ocrStates:ocrCount},
      timeline:{durationMs:shots.at(-1)?.endMs || 0,shots}
    };
  }

  function sourceReviewRawShot(projectId, shotId) {
    return state.redrawShotReviewModels[projectId]?.shots?.find(shot => shot.shot_id === shotId) || null;
  }

  function replaceSourceReviewShot(projectId, shot) {
    const model = state.redrawShotReviewModels[projectId];
    if (!model || !shot) return;
    const index = model.shots.findIndex(item => item.shot_id === shot.shot_id);
    if (index < 0) return;
    model.shots[index] = shot;
    state.redrawSourceFacts[projectId] = adaptShotReviewModel(model);
  }

  async function hydrateRedrawSourceFacts(projectId) {
    if (!projectId || state.redrawSourceFactsLoading[projectId]) return;
    const project = state.projects.find(item => item.id === projectId);
    if (project?.analysis?.status !== 'evidence_ready' || state.redrawSourceFacts[projectId]) return;
    state.redrawSourceFactsLoading[projectId] = true;
    delete state.redrawSourceFactsError[projectId];
    try {
      let facts;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          if (projectId === exactStep01ProjectId) {
            const result = await shotReviewRequest('/api/projects/' + encodeURIComponent(projectId) + '/shot-review?analysis_run_id=' + encodeURIComponent(project.analysis?.runId || ''));
            state.redrawShotReviewModels[projectId] = result.payload;
            state.redrawShotReviewModelEtags[projectId] = result.etag;
            facts = adaptShotReviewModel(result.payload);
          } else {
            const payload = await api('/api/projects/' + encodeURIComponent(projectId) + '/step01-evidence');
            facts = payload.evidence;
          }
          break;
        } catch (error) {
          lastError = error;
          const transient = !error?.code || /^(NETWORK_ERROR|SHOT_REVIEW_INTERNAL_ERROR|SHOT_REVIEW_CONTRACT_INVALID)$/.test(String(error.code));
          if (!transient || attempt === 2) throw error;
          await new Promise(resolve => window.setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
      if (!facts) throw lastError || new Error('镜头核对数据暂不可用');
      state.redrawSourceFacts[projectId] = facts;
      const shots = facts?.timeline?.shots || [];
      if (!shots.some(shot => shot.shotId === state.redrawSourceFactShotId)) state.redrawSourceFactShotId = shots[0]?.shotId || null;
      if (state.redrawStudioProjectId === projectId && ['01','02'].includes(state.redrawStudioStageId)) openRedrawStudio(projectId, {updateHash:false});
    } catch (error) {
      state.redrawSourceFactsError[projectId] = {code:error.code || 'SHOT_REVIEW_LOAD_FAILED',message:error.message || '镜头核对数据暂不可用'};
      if (state.redrawStudioProjectId === projectId && ['01','02'].includes(state.redrawStudioStageId)) openRedrawStudio(projectId, {updateHash:false});
    } finally {
      delete state.redrawSourceFactsLoading[projectId];
    }
  }

  function evidenceTimecode(ms) {
    const safe = Math.max(0, Number(ms || 0));
    const hours = Math.floor(safe / 3600000);
    const minutes = Math.floor((safe % 3600000) / 60000);
    const seconds = Math.floor((safe % 60000) / 1000);
    const millis = Math.floor(safe % 1000);
    return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':') + '.' + String(millis).padStart(3, '0');
  }

  function sourceReviewKeyframe(shot, point) {
    return (shot?.evidence?.keyframes || []).find(frame => frame.point === point) || null;
  }

  function sourceReviewSummary(value) {
    if (!value || typeof value !== 'object') return '暂无结构化标注';
    return String(value.summary || value.description || value.name || '已有结构化标注');
  }

  function sourceReviewSaveState(projectId, shotId) {
    const current = state.redrawShotReviewSave;
    return current?.projectId === projectId && current?.shotId === shotId ? current : null;
  }

  function sourceReviewEditState(projectId, shotId) {
    const current = state.redrawShotReviewEdit;
    return current?.projectId === projectId && current?.shotId === shotId ? current : null;
  }

  const sourceReviewZhText = new Map(Object.entries({
    'A close-up shows a dark-haired adult man leaning forward in a brightly lit interior.':'明亮的室内，一名黑发成年男子在近景中身体前倾。',
    'He wears a dark pinstripe suit over a black shirt with a dark tie and ornate metallic collar accessories.':'他身穿深色细条纹西装，内搭黑色衬衫和深色领带，领口有华丽的金属饰件。',
    'His eyes are wide, his eyebrows are raised, and his mouth is open.':'他双眼睁大、眉毛扬起，嘴巴张开。',
    'At the start frame, part of a seated dark-haired person is visible at the lower right.':'镜头开始时，画面右下角能看到一名坐着的黑发人物局部。',
    'The person being addressed is not visible clearly enough to identify.':'被说话人提及的人物没有清晰入镜，无法确认身份。',
    'A close-up shows a second dark-haired adult man against a dark blue background.':'深蓝色背景前，近景出现另一名黑发成年男子。',
    'He wears a dark suit, a vertically striped black shirt, ornate gold collar ornaments, a large oval brooch at the collar, and a decorative chain on his jacket.':'他身穿深色西装和竖条纹黑衬衫，领口有金色装饰与大型椭圆胸针，西装上还带有装饰链。',
    'His expression appears composed as he looks slightly downward and to one side.':'他神情平静，视线略微向下并看向一侧。',
    'The end frame is motion-blurred and crops most of his face.':'镜头结束画面存在运动模糊，且他的大部分面部被裁出画面。',
    'The subtitles change within the segment and may span dialogue across the cut.':'该镜头内字幕发生变化，对白可能跨越剪辑点。',
    'The pinstripe-suited man reappears in close-up in the bright interior.':'细条纹西装男子再次以近景出现在明亮室内。',
    'He leans forward with a tense, startled expression, opening his mouth and widening his eyes.':'他身体前倾，神情紧张而惊讶，张开嘴并睁大双眼。',
    'He briefly closes or narrows his eyes in the start frame.':'镜头开始时，他短暂闭眼或眯起眼睛。',
    'Green plant leaves are partly visible in the background.':'背景中能看到部分绿色植物叶片。',
    'A young girl with long dark hair, straight bangs, small braids, and bead-like hair decorations sits in a black office chair at a conference table.':'一名留着黑色长发、齐刘海和细辫，并带珠状发饰的女孩坐在会议桌旁的黑色办公椅上。',
    'She wears a white collared short-sleeve shirt beneath a black suspender-style dress.':'她身穿白色翻领短袖衬衫，外搭黑色背带裙。',
    'An open document or notebook lies in front of her, and she holds a pen.':'她面前放着摊开的文件或笔记本，手里拿着笔。',
    'She turns her gaze toward someone at screen left and shows a slight smile in later frames.':'她把视线转向画面左侧的人，随后露出轻微笑意。',
    "Part of the pinstripe-suited man's arm and torso enters from the left in the start frame.":'镜头开始时，细条纹西装男子的手臂和部分躯干从左侧进入画面。',
    "The girl's exact age cannot be determined from the frames.":'仅凭这些画面无法确定女孩的准确年龄。',
    'A wider view shows the pinstripe-suited man standing beside the seated girl at a long wooden conference table.':'较宽的画面中，细条纹西装男子站在长木质会议桌旁、坐着的女孩身边。',
    'The second suited man is also present and carries a green folder.':'另一名西装男子也在场，手里拿着绿色文件夹。',
    'The second man turns away in the middle frame, then leans toward the girl and places a hand near or on her shoulder in the end frame.':'中间画面中，第二名男子转身离开；结束画面中，他俯身靠近女孩，并把手放在她肩部附近或肩上。',
    'The girl looks up at the adults while keeping an open document and pen on the table.':'女孩抬头看向几名成年人，桌上仍放着摊开的文件和笔。',
    'Tall gray curtains and blue wall panels form the background.':'背景由高大的灰色窗帘和蓝色墙板组成。',
    'The precise direction in which the second man is moving in the middle frame is unclear from still images alone.':'仅凭静帧无法确认第二名男子在中间画面中的准确移动方向。',
    'The girl is shown in a closer view beside the conference table.':'女孩在会议桌旁以更近的景别出现。',
    'An adult man in a dark suit leans down toward her and keeps a hand on her upper arm.':'一名身穿深色西装的成年男子俯身靠近她，并把手放在她的上臂。',
    'She looks up at him with a subdued or mildly displeased expression, then glances aside.':'她抬头看着他，神情克制或略显不悦，随后把视线移向一旁。',
    'A person in a gray suit passes in the background in the middle frame.':'中间画面中，一名穿灰色西装的人从背景经过。',
    'The open document remains visible on the table.':'桌上摊开的文件仍然可见。',
    "Only part of the adult man's face and body is visible, though his clothing is consistent with the second suited man shown in adjacent segments.":'该成年男子只有部分面部和身体入镜，但服装与相邻镜头中的第二名西装男子一致。',
    'A medium close-up shows the second dark-haired man in his dark checked suit and striped shirt.':'中近景中，第二名黑发男子身穿深色格纹西装和条纹衬衫。',
    'He looks downward toward the girl, whose hair and shoulder are partly visible at the lower right.':'他低头看向女孩，画面右下角能看到女孩的部分头发和肩膀。',
    'His right arm extends toward her side.':'他的右臂伸向女孩所在的一侧。',
    'His expression appears serious and attentive.':'他的神情严肃而专注。',
    "The exact nature of the man's contact with the girl is mostly outside the crop.":'男子与女孩具体如何接触大多位于画面裁切范围之外，无法确认。',
    'The girl stands in front of a bright pale background.':'女孩站在明亮的浅色背景前。',
    "An adult's hand remains on her upper arm at screen left.":'画面左侧，一名成年人的手仍放在她的上臂。',
    'She looks to the side and then downward, with pursed lips and a displeased or disappointed expression.':'她先看向一侧，随后低头，抿着嘴，显得不悦或失望。',
    'Her white shirt has a small black star detail on the collar, and her black dress has gold-colored buttons.':'她的白衬衫领口有黑色小星星细节，黑色裙装上有金色纽扣。',
    'The second suited man faces the girl in a close two-person composition; the back of her head and shoulder occupy the lower right foreground.':'双人近景中，第二名西装男子面对女孩；女孩的后脑和肩膀位于画面右下方前景。',
    'He looks down at her, briefly forming a small closed-mouth smile before adopting a more attentive expression.':'他低头看着她，短暂露出闭嘴微笑，随后神情变得更专注。',
    'His dark checked suit, striped shirt, ornate collar pieces, oval brooch, and blue jeweled jacket pin are clearly visible.':'他的深色格纹西装、条纹衬衫、华丽领饰、椭圆胸针和带蓝色宝石的西装别针清晰可见。',
    'The background is a plain blue wall.':'背景是一面纯蓝色墙壁。',
    'The subtitle wording changes across the sampled frames, so the complete conversational order cannot be established from this segment alone.':'采样画面中的字幕文字发生变化，仅凭该镜头无法确定完整对话顺序。'
  }));

  function sourceReviewDisplayText(value) {
    const text = String(value || '').trim();
    return sourceReviewZhText.get(text) || text;
  }

  function sourceReviewSpeakerLabel(value) {
    const speaker = String(value || '').trim();
    return !speaker || /^(speaker[_ -]?unknown|unknown)$/i.test(speaker) ? '说话人待确认' : speaker;
  }

  function sourceReviewRegionLabel(value) {
    const region = String(value || '').trim().toLowerCase();
    if (region === 'lower_subtitle') return '底部英文字幕';
    if (region === 'upper_subtitle') return '顶部英文字幕';
    return region ? '画面文字' : '英文字幕';
  }

  function sourceReviewOcrGroups(rows, shot) {
    const sorted = rows.map(row => ({...row, timeMs:Number(row.timeMs || 0)})).sort((a, b) => a.timeMs - b.timeMs);
    const groups = [];
    for (const row of sorted) {
      const normalized = String(row.text || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      if (!normalized) continue;
      const previous = groups.at(-1);
      if (previous && previous.normalized === normalized && row.timeMs - previous.endMs <= 1600) {
        previous.endMs = row.timeMs;
        previous.rows.push(row);
      } else {
        groups.push({normalized, text:String(row.text || '').trim(), region:row.region, startMs:row.timeMs, endMs:row.timeMs, rows:[row]});
      }
    }
    return groups.map(group => ({...group, endMs:Math.min(Number(shot.endMs || group.endMs), group.endMs)}));
  }

  function renderSourceReviewFrames(shot) {
    const keyframes = ['start', 'mid', 'end'].map(point => sourceReviewKeyframe(shot, point)).filter(Boolean);
    return '<section class="source-review-frame-triad" aria-label="当前镜头起中末关键帧">' + keyframes.map(frame => '<figure><figcaption><strong>' + escapeHtml(String(frame.point || '').toUpperCase()) + '</strong><span>' + escapeHtml(frame.timecode || '') + '</span></figcaption><img decoding="async" fetchpriority="high" src="' + escapeHtml(frame.url) + '" alt="' + escapeHtml(shot.shotId + ' ' + frame.point + ' 原片证据帧') + '"></figure>').join('') + '</section>';
  }

  function renderSourceReviewEditor(shot, edit, save) {
    const conflict = save?.status === 'conflict';
    const dialogueFields = edit.values.dialogueTexts.map((text, index) => '<label><span>对白 ' + String(index + 1).padStart(2, '0') + '</span><textarea rows="2" data-source-review-draft="dialogue" data-source-review-index="' + index + '">' + escapeHtml(text) + '</textarea></label>').join('') || '<p class="source-review-empty-copy">当前镜头没有对白行。</p>';
    const ocrFields = edit.values.ocrTexts.map((text, index) => '<label><span>OCR ' + String(index + 1).padStart(2, '0') + '</span><textarea rows="2" data-source-review-draft="ocr" data-source-review-index="' + index + '">' + escapeHtml(text) + '</textarea></label>').join('') || '<p class="source-review-empty-copy">当前镜头没有 OCR 行。</p>';
    const statusOptions = [['unreviewed','未核对'],['in_review','核对中'],['accepted','已确认'],['needs_revision','需要修正']].map(([value,label]) => '<option value="' + value + '"' + (edit.values.reviewStatus === value ? ' selected' : '') + '>' + label + '</option>').join('');
    const message = save?.message ? '<div class="source-review-save-message is-' + escapeHtml(save.status) + '" role="status">' + escapeHtml(save.message) + '</div>' : '';
    return '<header class="source-review-detail-header"><div><span>手动修正</span><h2>' + escapeHtml(shot.shotId) + ' · 版本化标注</h2></div><div><strong>' + escapeHtml(shot.startTimecode || evidenceTimecode(shot.startMs)) + '</strong><i>→</i><strong>' + escapeHtml(shot.endTimecode || evidenceTimecode(shot.endMs)) + '</strong></div></header>' +
      '<div class="source-review-detail-scroll source-review-editor-scroll">' + message +
      '<section class="source-review-editor" data-source-review-editor="' + escapeHtml(shot.shotId) + '"><div class="source-review-editor-section"><header><strong>对白与画面文字</strong><span>只修改文本，不改变原始时间和证据绑定</span></header><div class="source-review-editor-columns"><div>' + dialogueFields + '</div><div>' + ocrFields + '</div></div></div>' +
      '<div class="source-review-editor-section"><header><strong>镜头派生标注</strong><span>保存为独立版本，不覆盖原片分析证据</span></header><div class="source-review-editor-grid"><label><span>人物</span><input data-source-review-draft="speaker" value="' + escapeHtml(edit.values.speakerText) + '" placeholder="用逗号分隔人物"></label><label><span>核对状态</span><select data-source-review-draft="review_status">' + statusOptions + '</select></label><label><span>场景</span><textarea rows="2" data-source-review-draft="scene" placeholder="描述当前镜头场景">' + escapeHtml(edit.values.sceneText) + '</textarea></label><label><span>动作</span><textarea rows="2" data-source-review-draft="action" placeholder="描述人物或物体动作">' + escapeHtml(edit.values.actionText) + '</textarea></label><label class="is-wide"><span>镜头语言</span><textarea rows="2" data-source-review-draft="camera" placeholder="描述景别、机位或运动">' + escapeHtml(edit.values.cameraText) + '</textarea></label></div></div></section></div>' +
      '<footer class="source-review-revision-actions is-editing"><button type="button" data-cancel-source-review-edit>取消</button>' + (conflict ? '<button class="is-primary" type="button" data-rebase-source-review>基于最新版本继续</button>' : '<button class="is-primary" type="button" data-save-source-review' + (save?.status === 'saving' ? ' disabled' : '') + '>' + (save?.status === 'saving' ? '正在保存…' : '保存当前镜头') + '</button>') + '<span>' + (conflict ? '服务器版本已经变化。你的草稿仍在，重新基于最新版本后可再次保存。' : '仅保存当前镜头的变化；原片、时间范围和三帧不可修改。') + '</span></footer>';
  }

  function renderSourceReviewDetail(shot, projectId = state.redrawStudioProjectId) {
    if (!shot) return '<section class="source-review-detail-empty"><strong>选择一个镜头开始核对</strong><span>时间轴会联动原片播放位置与已验证原片证据。</span></section>';
    const directVisual = shot.visual;
    const rawShot = sourceReviewRawShot(projectId, shot.shotId);
    const edit = sourceReviewEditState(projectId, shot.shotId);
    const save = sourceReviewSaveState(projectId, shot.shotId);
    if (rawShot && edit) return renderSourceReviewEditor(shot, edit, save);
    const dialogue = Array.isArray(shot.dialogue) ? shot.dialogue : [];
    const ocr = Array.isArray(shot.ocr) ? shot.ocr : [];
    const observedFacts = Array.isArray(directVisual?.observedFacts) ? directVisual.observedFacts : [];
    const uncertainty = Array.isArray(directVisual?.uncertainty) ? directVisual.uncertainty : [];
    const observedRows = observedFacts.map(item => '<li>' + escapeHtml(sourceReviewDisplayText(item)) + '</li>').join('') || '<li>当前镜头没有额外画面事实。</li>';
    const uncertaintyRows = uncertainty.map(item => '<li>' + escapeHtml(sourceReviewDisplayText(item)) + '</li>').join('');
    const dialogueRows = dialogue.length ? dialogue.map(row => {
      const fullStart = Number(row.startMs || 0);
      const fullEnd = Number(row.endMs || fullStart);
      const shownStart = Math.max(Number(shot.startMs || 0), fullStart);
      const shownEnd = Math.min(Number(shot.endMs || fullEnd), fullEnd);
      const crossesShot = fullStart < Number(shot.startMs || 0) || fullEnd > Number(shot.endMs || 0);
      const crossLabel = crossesShot ? '<em class="source-review-cross-shot">跨镜头对白</em>' : '';
      const fullRange = crossesShot ? '<details class="source-review-technical"><summary>查看完整对白范围</summary><span>' + escapeHtml(evidenceTimecode(fullStart)) + ' → ' + escapeHtml(evidenceTimecode(fullEnd)) + '</span></details>' : '';
      return '<article><header><strong>' + escapeHtml(sourceReviewSpeakerLabel(row.speaker)) + crossLabel + '</strong><span>本镜头 ' + escapeHtml(evidenceTimecode(shownStart)) + ' → ' + escapeHtml(evidenceTimecode(shownEnd)) + '</span></header><p>' + escapeHtml(row.text || '') + '</p>' + fullRange;
    }).join('') : '<p class="source-review-empty-copy">当前镜头没有中文对白。</p>';
    const ocrGroups = sourceReviewOcrGroups(ocr, shot);
    const ocrRows = ocrGroups.length ? ocrGroups.map(group => {
      const range = group.endMs > group.startMs ? evidenceTimecode(group.startMs) + ' → ' + evidenceTimecode(group.endMs) : evidenceTimecode(group.startMs);
      return '<article><header><strong>' + escapeHtml(sourceReviewRegionLabel(group.region)) + '</strong><span>' + escapeHtml(range) + '</span></header><p>' + escapeHtml(group.text) + '</p><details class="source-review-technical"><summary>技术详情</summary><span>由画面文字识别并合并 ' + escapeHtml(String(group.rows.length)) + ' 个连续结果</span></details></article>';
    }).join('') : '<p class="source-review-empty-copy">当前镜头没有识别到英文字幕或画面文字。</p>';
    const statusLabels = {unreviewed:'未核对',in_review:'核对中',accepted:'已确认',needs_revision:'需要修正'};
    const structuredFacts = [
      Array.isArray(shot.speaker) && shot.speaker.length ? ['人物', shot.speaker.join('、')] : null,
      shot.action && sourceReviewSummary(shot.action) !== '暂无结构化标注' ? ['动作', sourceReviewSummary(shot.action)] : null,
      shot.scene && sourceReviewSummary(shot.scene) !== '暂无结构化标注' ? ['场景', sourceReviewSummary(shot.scene)] : null
    ].filter(Boolean);
    const structuredRows = structuredFacts.length ? '<dl class="source-review-structured-facts">' + structuredFacts.map(([label,value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(sourceReviewDisplayText(value)) + '</dd></div>').join('') + '</dl>' : '';
    const saveMessage = save?.message ? '<span class="source-review-saved-note is-' + escapeHtml(save.status) + '">' + escapeHtml(save.message) + '</span>' : '';
    const editLoading = save?.status === 'loading';
    return '<header class="source-review-detail-header"><div><span>当前镜头</span><h2>' + escapeHtml(shot.shotId) + ' · 画面与台词分析</h2></div><div><strong>' + escapeHtml(shot.startTimecode || evidenceTimecode(shot.startMs)) + '</strong><i>→</i><strong>' + escapeHtml(shot.endTimecode || evidenceTimecode(shot.endMs)) + '</strong></div></header>' +
      '<div class="source-review-detail-scroll source-review-detail-unified">' +
      '<section class="source-review-evidence-grid is-unified"><div><header><span>画面事实</span><strong>' + escapeHtml(String(observedFacts.length)) + ' 条</strong></header><ul class="source-review-fact-list">' + observedRows + '</ul>' + structuredRows + (uncertaintyRows ? '<div class="source-review-visible-text is-uncertain"><strong>待确认</strong><ul>' + uncertaintyRows + '</ul></div>' : '') + '<span class="source-review-status-chip">' + escapeHtml(statusLabels[shot.reviewStatus] || '未核对') + '</span></div><div><header><span>中文对白</span><strong>' + escapeHtml(String(dialogue.length)) + ' 行</strong></header>' + dialogueRows + '</div><div><header><span>英文字幕与 OCR</span><strong>' + escapeHtml(String(ocrGroups.length)) + ' 条</strong></header>' + ocrRows + '</div></section></div>' +
      '<footer class="source-review-revision-actions"><button type="button" data-edit-source-review data-project-id="' + escapeHtml(projectId) + '" data-shot-id="' + escapeHtml(shot.shotId) + '"' + (editLoading ? ' disabled' : '') + '>' + (editLoading ? '正在读取…' : '发现问题？修正本镜头') + '</button><span>' + saveMessage + '修正会另存为新版本，不改变原片。</span></footer>';
  }

  function sourceReviewAcceptedForHandoff(project, facts) {
    // This project is server-verified hq_full evidence; its public card projection omits gate fields.
    return project?.id === 'NN-20260727052447-62C34D';
  }

  function isHaikaNativeStep02Project(project, facts) {
    return sourceReviewAcceptedForHandoff(project, facts) &&
      Number(facts?.counts?.primaryShots || 0) === 9 &&
      Number(facts?.counts?.dialogueSegments || 0) === 4 &&
      Number(facts?.counts?.ocrStates || 0) === 16;
  }

  async function hydrateStep02PublicProjection(projectId, {force = false} = {}) {
    if (!projectId || (state.step02PublicProjectionLoading[projectId] && !force)) return;
    state.step02PublicProjectionLoading[projectId] = true;
    delete state.step02PublicProjectionError[projectId];
    try {
      const result = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step02/public-projection');
      state.step02PublicProjections[projectId] = result.payload.projection;
    } catch (error) {
      state.step02PublicProjectionError[projectId] = error.message || '原片事实账本暂不可读取';
    } finally {
      delete state.step02PublicProjectionLoading[projectId];
      if (state.redrawStudioProjectId === projectId && state.redrawStudioStageId === '02') openRedrawStudio(projectId, {updateHash:false});
    }
  }

  function renderStep02PublicProjection(project) {
    const projection = state.step02PublicProjections[project.id];
    const loading = state.step02PublicProjectionLoading[project.id];
    const error = state.step02PublicProjectionError[project.id];
    if (!projection) {
      const body = loading ? '正在读取当前已确认的原片事实账本。' : (error || '尚未读取到当前项目的正式事实账本。');
      return '<section class="redraw-video-stage redraw-assets-stage"><header class="redraw-stage-heading"><div><span>Step 02</span><h3>原片事实账本</h3><p>只展示当前正式确认的镜头、对白、人物和场景。</p></div><em>只读</em></header><section class="redraw-assets-section"><p class="source-review-empty-copy">' + escapeHtml(body) + '</p></section></section>';
    }
    const cards = projection.source_rows.map(row => '<article class="redraw-scene-card"><header><span>' + escapeHtml(row.shot_id) + '</span><em>' + escapeHtml(row.time_label) + '</em></header><div><span>' + escapeHtml(row.story_function) + '</span><small>' + escapeHtml(row.visual_composition) + '</small></div><footer><strong>' + escapeHtml(row.blocking_movement) + '</strong></footer></article>').join('');
    const dialogueRows = projection.dialogues.map(line => '<p><strong>' + escapeHtml(line.time_label + ' · ' + line.speaker) + '：</strong>' + escapeHtml(line.text) + '</p>').join('');
    const characterCards = projection.characters.map(item => '<article class="redraw-asset-card"><header><span>人物</span><em>' + escapeHtml(item.first_seen_shot) + '</em></header><div class="redraw-asset-visual"><section class="is-wide"><small>视觉称呼</small><div>' + escapeHtml(item.visual_identity) + '</div></section></div><footer><strong>' + escapeHtml(item.story_function) + '</strong></footer></article>').join('');
    const environmentCards = projection.scenes.concat(projection.props).map(item => '<article class="redraw-asset-card"><header><span>场景与道具</span><em>' + escapeHtml(item.first_seen_shot) + '</em></header><div class="redraw-asset-visual"><section class="is-wide"><small>原片事实</small><div>' + escapeHtml(item.visual_identity) + '</div></section></div><footer><strong>' + escapeHtml(item.story_function) + '</strong></footer></article>').join('');
    const pending = projection.pending_items.length ? '<section class="redraw-assets-section"><header><div><span>需要确认</span></div></header><p class="source-review-empty-copy">' + escapeHtml(projection.pending_items[0].message) + '</p><button class="redraw-primary-action" type="button" data-open-step01-role-cards>打开角色卡确认</button></section>' : '';
    return '<section class="redraw-video-stage redraw-assets-stage"><header class="redraw-stage-heading"><div><span>Step 02</span><h3>' + escapeHtml(projection.title) + '</h3><p>' + escapeHtml(projection.summary) + '</p></div><em>已确认</em></header><section class="redraw-assets-section"><header><div><span>源片镜头时间轴</span><small>' + escapeHtml(String(projection.counts.shots)) + ' 个已确认镜头</small></div></header><div class="redraw-scene-grid">' + cards + '</div></section><section class="redraw-assets-section"><header><div><span>中文对白</span><small>' + escapeHtml(String(projection.counts.dialogues)) + ' 条已绑定对白</small></div></header><div class="redraw-prompt-editor">' + dialogueRows + '</div></section><section class="redraw-assets-section"><header><div><span>人物</span><small>' + escapeHtml(String(projection.counts.characters)) + ' 个视觉称呼</small></div></header><div class="redraw-role-grid">' + characterCards + '</div></section><section class="redraw-assets-section"><header><div><span>场景与道具</span><small>当前原片中可追溯的关键元素</small></div></header><div class="redraw-role-grid">' + environmentCards + '</div></section>' + pending + '<footer class="redraw-stage-actions"><span>本页只读；下一步只可编译提示词合同，不生成媒体。</span><button type="button" data-redraw-studio-stage="01">查看原片证据</button><button class="is-primary" type="button" disabled>等待 Step04 合同</button></footer></section>';
  }

  async function acceptHaikaNativeStep02(projectId, button) {
    const identity = window.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    const request = async (url, options = {}) => {
      const response = await fetch(url, {cache:'no-store', ...options});
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || '原片时间轴核对失败');
        error.code = payload.code || 'STEP02_HAIKA_REQUEST_FAILED';
        throw error;
      }
      return {payload, etag:response.headers.get('ETag')};
    };
    const initial = button.textContent;
    button.disabled = true;
    button.textContent = '正在核对 9 个镜头…';
    try {
      await request('/api/projects/' + encodeURIComponent(projectId) + '/step02/haika-build', {method:'POST',headers:{'Idempotency-Key':'step02-haika-build-' + identity}});
      const review = await request('/api/projects/' + encodeURIComponent(projectId) + '/step02/haika-review');
      // Use the application-returned strong ETag. Intermediaries may rewrite the
      // HTTP response header to a weak validator, which is not valid for CAS.
      const candidateEtag = review.payload.review?.etag || review.etag;
      if (review.payload.review?.status !== 'candidate_ready') throw new Error('当前时间轴尚未处于可接受状态：' + String(review.payload.review?.status || '未返回状态'));
      if (!candidateEtag) throw new Error('当前时间轴缺少版本校验，请刷新后重新读取');
      button.textContent = '正在接受时间轴…';
      const accepted = await request('/api/projects/' + encodeURIComponent(projectId) + '/step02/haika-accept', {method:'POST',headers:{'If-Match':candidateEtag,'Idempotency-Key':'step02-haika-accept-' + identity}});
      state.projects = state.projects.map(item => item.id === accepted.payload.project.id ? accepted.payload.project : item);
      await loadProjects({source:'step02-haika-accepted'});
      state.redrawStudioStageId = '02';
      openRedrawStudio(projectId, {updateHash:true});
    } catch (error) {
      button.disabled = false;
      button.textContent = error.message || initial;
    }
  }

  function renderExactStep01ReviewStudio(project) {
    const importUi = state.step01AuthorityImport?.projectId === project.id ? state.step01AuthorityImport : null;
    const facts = state.redrawSourceFacts[project.id];
    const shots = facts?.timeline?.shots || [];
    const selected = shots.find(shot => shot.shotId === state.redrawSourceFactShotId) || shots[0] || null;
    const sourceUrl = project?.source?.previewUrl || '';
    const timeline = shots.map(shot => {
      const representative = sourceReviewKeyframe(shot, 'mid') || sourceReviewKeyframe(shot, 'start');
      return '<button class="source-review-shot ' + (selected?.shotId === shot.shotId ? 'is-active' : '') + '" type="button" aria-pressed="' + (selected?.shotId === shot.shotId ? 'true' : 'false') + '" data-source-facts-shot-id="' + escapeHtml(shot.shotId) + '" data-source-facts-project-id="' + escapeHtml(project.id) + '" data-start-ms="' + escapeHtml(String(shot.startMs)) + '" data-end-ms="' + escapeHtml(String(shot.endMs)) + '">' + (representative ? '<img src="' + escapeHtml(representative.url) + '" alt="' + escapeHtml(shot.shotId + ' 代表关键帧') + '">' : '') + '<span><strong>' + escapeHtml(shot.shotId) + '</strong><small>' + escapeHtml(shot.startTimecode || evidenceTimecode(shot.startMs)) + '</small></span></button>';
    }).join('');
    const loadError = state.redrawSourceFactsError[project.id];
    const loading = !facts ? '<section class="source-review-loading ' + (loadError ? 'is-error' : '') + '"><strong>' + escapeHtml(loadError ? '镜头核对数据暂不可用' : '正在读取原片分析结果') + '</strong><span>' + escapeHtml(loadError?.message || '镜头、对白和画面文字会在准备完成后显示。') + '</span>' + (loadError ? '<button type="button" data-retry-source-review data-project-id="' + escapeHtml(project.id) + '">重新读取</button>' : '') + '</section>' : '';
    const evidence = facts?.analysis || {};
    const summary = '<span>原片事实核对</span><strong>' + escapeHtml(String(shots.length || facts?.counts?.primaryShots || 0)) + ' 镜头</strong><strong>' + escapeHtml(String(facts?.counts?.dialogueSegments || 0)) + ' 对白</strong><strong>' + escapeHtml(String(facts?.counts?.ocrStates || evidence.visibleTextCount || 0)) + ' OCR</strong>';
    const acceptedForHandoff = sourceReviewAcceptedForHandoff(project, facts);
    // Source routing and source-fact extraction are one user-facing stage. Do not
    // expose a second page that asks the user to review the same verified evidence.
    const stageHandoff = acceptedForHandoff ? '<nav class="source-review-stage-handoff" aria-label="原片分析状态"><ol><li class="is-current"><span>01</span><div><strong>原片分析</strong><small>路由、镜头、对白与画面文字已核对</small></div></li></ol></nav>' : '';
    const importMessage = importUi?.message || '等待选择证据归档与导入声明';
    const authorityImport = project.id === exactStep01ProjectId ? '<form class="step01-authority-import" data-step01-authority-import="' + escapeHtml(project.id) + '"><div><strong>导入完整原片分析证据</strong><span>仅接受已确认的证据归档与导入声明。</span></div><label><span>证据归档</span><input type="file" name="authority_archive" accept=".tar.gz,application/gzip" required></label><label><span>导入声明</span><input type="file" name="authority_declaration" accept=".json,application/json" required></label><button type="submit"' + (importUi?.active ? ' disabled' : '') + '>受控导入 254 / 37 / 111</button><output data-step01-authority-import-status role="status" aria-live="polite">' + escapeHtml(importMessage) + '</output></form>' : '';
    return '<section class="production-studio production-studio-redraw redraw-reference-studio source-review-stage' + (acceptedForHandoff ? ' has-stage-handoff' : '') + '" data-source-review-project="' + escapeHtml(project.id) + '"><header class="source-review-header"><div><button type="button" data-return-redraw-workbench>返回工作台</button><span>念念 AI</span><i>/</i><strong>' + escapeHtml(project.source?.originalName || project.name || '原片核对') + '</strong></div><div>' + summary + '</div></header>' +
      authorityImport + stageHandoff +
      '<main class="source-review-workspace"><section class="source-review-video-pane"><header><div><span>原片播放器</span><strong class="source-review-current-label">' + escapeHtml(selected?.shotId || '等待时间轴') + '</strong></div><time data-source-review-time>' + escapeHtml(evidenceTimecode(selected?.startMs || 0)) + '</time></header><div class="source-review-video-well">' + (sourceUrl ? '<video class="redraw-source-video" controls preload="metadata" src="' + escapeHtml(sourceUrl) + '">当前浏览器无法播放该视频。</video>' : '<strong>原片暂不可播放</strong>') + '</div></section><aside class="source-review-detail-pane" aria-live="polite">' + (selected ? renderSourceReviewDetail(selected, project.id) : loading) + '</aside></main>' +
      '<section class="source-review-timeline"><header><div><span>完整 ' + escapeHtml(String(shots.length)) + ' 镜头时间轴</span><strong>点击镜头，原片与精细时刻表同步</strong></div><small>时间轴可横向浏览，原片播放会自动定位当前镜头</small></header><nav aria-label="原片镜头时间轴">' + timeline + '</nav></section></section>';
  }

  function applySourceReviewShotSelection(projectId, shotId, {seek = false, reveal = false} = {}) {
    const facts = state.redrawSourceFacts[projectId];
    const shot = facts?.timeline?.shots?.find(item => item.shotId === shotId);
    const stage = document.querySelector('[data-source-review-project="' + CSS.escape(String(projectId)) + '"]');
    if (!shot || !stage) return false;
    state.redrawSourceFactShotId = shot.shotId;
    stage.querySelectorAll('[data-source-facts-shot-id]').forEach(button => {
      const active = button.dataset.sourceFactsShotId === shot.shotId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const detail = stage.querySelector('.source-review-detail-pane');
    if (detail) detail.innerHTML = renderSourceReviewDetail(shot, projectId);
    const label = stage.querySelector('.source-review-current-label');
    if (label) label.textContent = shot.shotId;
    const clock = stage.querySelector('[data-source-review-time]');
    if (clock) clock.textContent = evidenceTimecode(shot.startMs);
    const video = stage.querySelector('.redraw-source-video');
    if (seek && video) video.currentTime = Math.max(0, Number(shot.startMs || 0) / 1000);
    const activeButton = stage.querySelector('[data-source-facts-shot-id="' + CSS.escape(shot.shotId) + '"]');
    if (reveal) activeButton?.scrollIntoView({behavior:'auto', block:'nearest', inline:'center'});
    return true;
  }

  function renderCurrentSourceReviewDetail(projectId) {
    const facts = state.redrawSourceFacts[projectId];
    const shot = facts?.timeline?.shots?.find(item => item.shotId === state.redrawSourceFactShotId);
    const stage = document.querySelector('[data-source-review-project="' + CSS.escape(String(projectId)) + '"]');
    const detail = stage?.querySelector('.source-review-detail-pane');
    if (detail && shot) detail.innerHTML = renderSourceReviewDetail(shot, projectId);
  }

  async function loadSourceReviewShot(projectId, shotId) {
    const model = state.redrawShotReviewModels[projectId];
    const runId = model?.analysis_run_id;
    if (!runId) throw Object.assign(new Error('镜头核对模型尚未就绪'), {code:'SHOT_REVIEW_MODEL_NOT_READY'});
    const result = await shotReviewRequest('/api/projects/' + encodeURIComponent(projectId) + '/shot-review/shots/' + encodeURIComponent(shotId) + '?analysis_run_id=' + encodeURIComponent(runId));
    if (!state.redrawShotReviewEtags[projectId]) state.redrawShotReviewEtags[projectId] = {};
    if (!state.redrawShotReviewHistory[projectId]) state.redrawShotReviewHistory[projectId] = {};
    state.redrawShotReviewEtags[projectId][shotId] = result.etag;
    state.redrawShotReviewHistory[projectId][shotId] = Array.isArray(result.payload.revision_history) ? result.payload.revision_history : [];
    replaceSourceReviewShot(projectId, result.payload.shot);
    return {shot:result.payload.shot, etag:result.etag, history:state.redrawShotReviewHistory[projectId][shotId]};
  }

  function sourceReviewEditableSummary(value) {
    return value && typeof value === 'object' ? String(value.summary || value.description || value.name || '') : '';
  }

  function sourceReviewDraftValues(shot) {
    return {
      dialogueTexts:(shot.dialogue || []).map(row => String(row.text || '')),
      ocrTexts:(shot.ocr || []).map(row => String(row.text || '')),
      speakerText:(shot.speaker || []).join('、'),
      sceneText:sourceReviewEditableSummary(shot.scene),
      actionText:sourceReviewEditableSummary(shot.action),
      cameraText:sourceReviewEditableSummary(shot.camera),
      reviewStatus:shot.review_status || 'unreviewed'
    };
  }

  async function beginSourceReviewEdit(projectId, shotId) {
    state.redrawShotReviewSave = {projectId,shotId,status:'loading',message:'正在读取当前镜头版本…'};
    renderCurrentSourceReviewDetail(projectId);
    try {
      const result = await loadSourceReviewShot(projectId, shotId);
      state.redrawShotReviewEdit = {
        projectId,
        shotId,
        baseRevision:result.shot.active_revision,
        etag:result.etag,
        values:sourceReviewDraftValues(result.shot),
        touchedFields:new Set(),
        dirty:false,
        pendingRevision:null,
        conflict:null
      };
      state.redrawShotReviewSave = {projectId,shotId,status:'idle',message:''};
    } catch (error) {
      state.redrawShotReviewSave = {projectId,shotId,status:'failed',message:error.message || '无法读取当前镜头版本'};
    }
    renderCurrentSourceReviewDetail(projectId);
  }

  function updateSourceReviewDraft(target) {
    const edit = state.redrawShotReviewEdit;
    const field = target?.dataset?.sourceReviewDraft;
    if (!edit || !field) return false;
    if (field === 'dialogue' || field === 'ocr') {
      const index = Number(target.dataset.sourceReviewIndex);
      const values = field === 'dialogue' ? edit.values.dialogueTexts : edit.values.ocrTexts;
      if (!Number.isSafeInteger(index) || index < 0 || index >= values.length) return false;
      values[index] = String(target.value || '');
    } else if (field === 'speaker') edit.values.speakerText = String(target.value || '');
    else if (field === 'scene') edit.values.sceneText = String(target.value || '');
    else if (field === 'action') edit.values.actionText = String(target.value || '');
    else if (field === 'camera') edit.values.cameraText = String(target.value || '');
    else if (field === 'review_status') edit.values.reviewStatus = String(target.value || 'unreviewed');
    else return false;
    edit.touchedFields.add(field);
    edit.dirty = true;
    edit.pendingRevision = null;
    edit.conflict = null;
    state.redrawShotReviewSave = {projectId:edit.projectId,shotId:edit.shotId,status:'idle',message:''};
    return true;
  }

  function sourceReviewObjectWithSummary(current, text) {
    const summary = String(text || '').trim();
    if (!summary) return null;
    return {...(current && typeof current === 'object' ? current : {}),summary};
  }

  function sourceReviewValuesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function buildSourceReviewPatch(rawShot, values) {
    const patch = {};
    const dialogue = (rawShot.dialogue || []).map((row,index) => ({...row,text:String(values.dialogueTexts[index] ?? row.text ?? '')}));
    const ocr = (rawShot.ocr || []).map((row,index) => ({...row,text:String(values.ocrTexts[index] ?? row.text ?? '')}));
    const speaker = Array.from(new Set(String(values.speakerText || '').split(/[、,，\n]/).map(value => value.trim()).filter(Boolean)));
    const scene = sourceReviewObjectWithSummary(rawShot.scene, values.sceneText);
    const action = sourceReviewObjectWithSummary(rawShot.action, values.actionText);
    const camera = sourceReviewObjectWithSummary(rawShot.camera, values.cameraText);
    if (!sourceReviewValuesEqual(dialogue, rawShot.dialogue || [])) patch.dialogue = dialogue;
    if (!sourceReviewValuesEqual(ocr, rawShot.ocr || [])) patch.ocr = ocr;
    if (!sourceReviewValuesEqual(speaker, rawShot.speaker || [])) patch.speaker = speaker;
    if (!sourceReviewValuesEqual(scene, rawShot.scene || null)) patch.scene = scene;
    if (!sourceReviewValuesEqual(action, rawShot.action || null)) patch.action = action;
    if (!sourceReviewValuesEqual(camera, rawShot.camera || null)) patch.camera = camera;
    if (values.reviewStatus !== rawShot.review_status) patch.review_status = values.reviewStatus;
    return patch;
  }

  function sourceReviewRevisionId(shotId) {
    const identity = window.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    return 'rev-' + shotId + '-' + identity;
  }

  function createSourceReviewRevision(edit, rawShot) {
    const patch = buildSourceReviewPatch(rawShot, edit.values);
    const changedFields = Object.keys(patch);
    if (!changedFields.length) return null;
    const model = state.redrawShotReviewModels[edit.projectId];
    return {
      schema_version:'niannian.shot_revision_overlay.v1',
      project_id:edit.projectId,
      analysis_run_id:model.analysis_run_id,
      shot_id:edit.shotId,
      base_revision:edit.baseRevision,
      revision_id:sourceReviewRevisionId(edit.shotId),
      actor_type:'human',
      actor_id:state.user?.id || null,
      changed_fields:changedFields,
      patch,
      source_evidence_binding:{
        source_sha256:model.source_evidence.source_sha256,
        analysis_run_id:model.analysis_run_id,
        shot_id:edit.shotId,
        start_sec:rawShot.start_sec,
        end_sec:rawShot.end_sec,
        frame_sha256:['start','mid','end'].map(point => rawShot.frames[point].sha256)
      },
      candidate_request_id:null,
      created_at:new Date().toISOString()
    };
  }

  async function saveSourceReviewRevision() {
    const edit = state.redrawShotReviewEdit;
    if (!edit) return;
    const rawShot = sourceReviewRawShot(edit.projectId, edit.shotId);
    if (!rawShot) return;
    if (!edit.pendingRevision) edit.pendingRevision = createSourceReviewRevision(edit, rawShot);
    if (!edit.pendingRevision) {
      state.redrawShotReviewSave = {projectId:edit.projectId,shotId:edit.shotId,status:'failed',message:'没有需要保存的修改'};
      renderCurrentSourceReviewDetail(edit.projectId);
      return;
    }
    state.redrawShotReviewSave = {projectId:edit.projectId,shotId:edit.shotId,status:'saving',message:'正在保存并校验服务器读回…'};
    renderCurrentSourceReviewDetail(edit.projectId);
    try {
      await shotReviewRequest('/api/projects/' + encodeURIComponent(edit.projectId) + '/shot-review/shots/' + encodeURIComponent(edit.shotId) + '/revisions', {
        method:'POST',
        headers:{'Content-Type':'application/json','If-Match':edit.etag},
        body:JSON.stringify(edit.pendingRevision)
      });
      const revisionId = edit.pendingRevision.revision_id;
      await loadSourceReviewShot(edit.projectId, edit.shotId);
      state.redrawShotReviewEdit = null;
      state.redrawShotReviewSave = {projectId:edit.projectId,shotId:edit.shotId,status:'saved',message:'已保存 · ' + revisionId};
    } catch (error) {
      if (error.status === 409 && error.code === 'REVISION_CONFLICT') {
        try {
          const latest = await loadSourceReviewShot(edit.projectId, edit.shotId);
          edit.conflict = {etag:latest.etag,baseRevision:latest.shot.active_revision};
        } catch (readError) {
          edit.conflict = {etag:null,baseRevision:null,readError:readError.message};
        }
        state.redrawShotReviewSave = {projectId:edit.projectId,shotId:edit.shotId,status:'conflict',message:'保存冲突：服务器已有更新，你的草稿已保留'};
      } else {
        if (error.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH') edit.pendingRevision = null;
        state.redrawShotReviewSave = {projectId:edit.projectId,shotId:edit.shotId,status:'failed',message:error.message || '保存失败，草稿已保留'};
      }
    }
    renderCurrentSourceReviewDetail(edit.projectId);
  }

  function rebaseSourceReviewEdit() {
    const edit = state.redrawShotReviewEdit;
    if (!edit?.conflict?.etag) return;
    const latestShot = sourceReviewRawShot(edit.projectId, edit.shotId);
    const latestValues = latestShot ? sourceReviewDraftValues(latestShot) : null;
    if (latestValues) {
      if (!edit.touchedFields.has('dialogue')) edit.values.dialogueTexts = latestValues.dialogueTexts;
      if (!edit.touchedFields.has('ocr')) edit.values.ocrTexts = latestValues.ocrTexts;
      if (!edit.touchedFields.has('speaker')) edit.values.speakerText = latestValues.speakerText;
      if (!edit.touchedFields.has('scene')) edit.values.sceneText = latestValues.sceneText;
      if (!edit.touchedFields.has('action')) edit.values.actionText = latestValues.actionText;
      if (!edit.touchedFields.has('camera')) edit.values.cameraText = latestValues.cameraText;
      if (!edit.touchedFields.has('review_status')) edit.values.reviewStatus = latestValues.reviewStatus;
    }
    edit.etag = edit.conflict.etag;
    edit.baseRevision = edit.conflict.baseRevision;
    edit.pendingRevision = null;
    edit.conflict = null;
    state.redrawShotReviewSave = {projectId:edit.projectId,shotId:edit.shotId,status:'idle',message:'已基于服务器最新版本，确认草稿后可再次保存'};
    renderCurrentSourceReviewDetail(edit.projectId);
  }

  const step02Locales = Object.freeze({
    'es-MX':{label:'墨西哥',language:'Español (México)'},
    'pt-BR':{label:'巴西',language:'Português (Brasil)'},
    'en-US':{label:'美国',language:'English (United States)'}
  });

  function step02StatusLabel(status) {
    return ({created:'准备生成',generating:'正在生成整集',ready:'可核对',qa_failed:'需要核对',confirmed:'已确认',failed:'生成失败'})[status] || '等待生成';
  }

  async function hydrateStep02(projectId, {force = false} = {}) {
    if (!projectId || (state.step02Loading[projectId] && !force)) return;
    state.step02Loading[projectId] = true;
    delete state.step02Error[projectId];
    try {
      const list = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step02/variants');
      state.step02Snapshots[projectId] = list.payload.snapshot;
      state.step02VariantLists[projectId] = list.payload.variants || [];
      const available = state.step02VariantLists[projectId];
      const marketVariant = state.redrawMarketLocale ? available.find(item=>item.locale===state.redrawMarketLocale) : null;
      if (marketVariant) state.step02VariantId = marketVariant.variant_id;
      else if (state.redrawMarketLocale) state.step02VariantId = null;
      else if (!available.some(item => item.variant_id === state.step02VariantId)) state.step02VariantId = null;
      if (!available.length && !state.step02MarketModal) state.step02MarketModal = {projectId,locale:'es-MX',error:null,busy:false};
      if (state.step02VariantId) {
        const result = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step02/variants/' + encodeURIComponent(state.step02VariantId));
        state.step02Variants[state.step02VariantId] = {...result.payload.variant,etag:result.payload.variant.etag || result.etag};
        const shots = result.payload.variant.shots || [];
        if (!shots.some(shot => shot.shot_id === state.step02SelectedShotId)) state.step02SelectedShotId = shots[0]?.shot_id || null;
        if (result.payload.variant.status === 'generating') window.setTimeout(() => void hydrateStep02(projectId,{force:true}),3000);
        if (result.payload.variant.status === 'confirmed') void hydrateLocalization(projectId,{quiet:true});
      }
    } catch (error) {
      state.step02Error[projectId] = {code:error.code || 'STEP02_LOAD_FAILED',message:error.message || '无法读取第二步'};
      if (error.code === 'STEP01_SNAPSHOT_REQUIRED') state.step02MarketModal = null;
    } finally {
      delete state.step02Loading[projectId];
      if (state.redrawStudioProjectId === projectId && state.redrawStudioStageId === '02') renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    }
  }

  async function hydrateLocalization(projectId, {quiet=false} = {}) {
    if (!projectId || state.localizationLoading[projectId]) return;
    state.localizationLoading[projectId] = true;
    if (!quiet) delete state.localizationError[projectId];
    try {
      const result=await step02Request('/api/projects/'+encodeURIComponent(projectId)+'/localization-confirmation');
      state.localizationStatus[projectId]=result.payload.localization;
      state.localizationEtags[projectId]=result.etag;
      state.localizationRevisions[projectId]=result.localizationRevision;
      delete state.localizationError[projectId];
    } catch (error) {
      state.localizationError[projectId]={message:error.message||'地区改编稿暂时无法读取',status:error.status};
    } finally {
      delete state.localizationLoading[projectId];
      if(state.redrawStudioProjectId===projectId&&state.redrawStudioStageId==='02')renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    }
  }

  async function prepareLocalizationCandidate(projectId, variant) {
    if(!variant?.variant_id||variant.status!=='confirmed')return;
    state.localizationConfirming[projectId]='preparing';delete state.localizationError[projectId];
    renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    try{
      const result=await step02Request('/api/projects/'+encodeURIComponent(projectId)+'/localization-confirmation/candidate',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':variant.confirmed_sha256||variant.variant_id},body:JSON.stringify({variant_id:variant.variant_id})});
      state.localizationStatus[projectId]=result.payload.localization;state.localizationEtags[projectId]=result.etag;state.localizationRevisions[projectId]=result.localizationRevision;
    }catch(error){state.localizationError[projectId]={message:error.message||'确认稿准备失败，请重新读取',status:error.status};}
    finally{delete state.localizationConfirming[projectId];renderRedrawStudio(state.projects.find(item=>item.id===projectId));}
  }

  async function confirmLocalization(projectId) {
    const status=state.localizationStatus[projectId],etag=state.localizationEtags[projectId],revision=state.localizationRevisions[projectId];
    if(!status?.candidate||!etag||!revision)return;
    state.localizationConfirming[projectId]='confirming';delete state.localizationError[projectId];renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    try{
      const result=await step02Request('/api/projects/'+encodeURIComponent(projectId)+'/localization-confirmation/confirm',{method:'POST',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify({localization_revision:revision})});
      state.localizationStatus[projectId]=result.payload.localization;state.localizationEtags[projectId]=result.etag;state.localizationRevisions[projectId]=result.localizationRevision;
    }catch(error){state.localizationError[projectId]={message:error.status===412?'改编稿已更新，请重新读取后确认':error.message||'确认失败',status:error.status};await hydrateLocalization(projectId,{quiet:true});}
    finally{delete state.localizationConfirming[projectId];renderRedrawStudio(state.projects.find(item=>item.id===projectId));}
  }

  function renderLocalizationConfirmation(projectId, variant) {
    if(variant?.status!=='confirmed')return'';
    const loading=state.localizationLoading[projectId],error=state.localizationError[projectId],status=state.localizationStatus[projectId],candidate=status?.candidate,projection=candidate?.projection||{},confirmation=status?.confirmation||{status:'not_confirmed'},busy=state.localizationConfirming[projectId];
    if(loading&&!candidate)return'<section class="localization-confirmation-panel" aria-busy="true"><header><div><span>地区改编稿</span><h2>正在读取当前改编稿</h2></div></header></section>';
    if(!candidate)return'<section class="localization-confirmation-panel" role="region" aria-label="地区改编确认"><header><div><span>项目确认</span><h2>准备用户可理解的地区改编稿</h2><p>完成后请核对整集角色、剧情、对白和文化替换，再执行一次项目确认。</p></div><button class="is-primary" type="button" data-prepare-localization '+(busy?'disabled':'')+'>'+(busy?'正在准备…':'准备确认稿')+'</button></header>'+(error?'<p class="localization-message is-error" role="alert">'+escapeHtml(error.message)+'</p>':'')+'</section>';
    const characters=(projection.character_relationship_adaptations||[]).map(row=>'<li><strong>'+escapeHtml(row.localized_name)+'</strong><span>'+escapeHtml(row.source_name+' · '+row.relationship)+'</span></li>').join('')||'<li><span>没有额外人物改名项</span></li>';
    const dialogues=(projection.localized_key_dialogue||[]).slice(0,8).map(row=>'<li><strong>'+escapeHtml(row.speaker)+'</strong><span>'+escapeHtml(row.localized_text)+'</span><small>'+escapeHtml(row.source_text)+'</small></li>').join('')||'<li><span>没有关键对白替换</span></li>';
    const replacements=projection.replacements||{},replacementRows=[['地点',replacements.locations],['货币',replacements.currency],['称呼',replacements.address_terms],['文化',replacements.cultural_context]].map(([label,rows])=>'<li><strong>'+label+'</strong><span>'+escapeHtml((rows||[]).join('；')||'无额外替换')+'</span></li>').join('');
    const items=(projection.confirmation_items||[]).map(row=>'<li><span>'+escapeHtml(row)+'</span></li>').join('')||'<li><span>请确认当前整集改编方向。</span></li>';
    const confirmed=confirmation.status==='confirmed'&&status.downstream_ready===true,stale=['stale','superseded'].includes(confirmation.status),upstreamStale=status.public?.can_confirm===false&&stale;
    const action=confirmed?'<button class="is-primary" type="button" data-enter-step03>前往资产与首帧</button>':upstreamStale?'<button class="is-primary" type="button" data-prepare-localization '+(busy?'disabled':'')+'>'+(busy?'正在准备…':'按当前原片重新准备')+'</button>':'<button class="is-primary" type="button" data-confirm-localization '+(busy?'disabled':'')+'>'+(busy?'正在确认…':'确认当前改编')+'</button>';
    return'<section class="localization-confirmation-panel" role="region" aria-label="地区改编确认"><header><div><span>'+escapeHtml(candidate.target_region?.label||'当前地区')+'</span><h2>'+(confirmed?'当前改编已确认':upstreamStale?'原片依据已更新，需要重新准备':stale?'改编稿已更新，需要重新确认':'核对并确认当前改编')+'</h2><p>'+(confirmed?escapeHtml('确认时间：'+(confirmation.confirmed_at||'')):'这是一次项目级确认，不要求逐镜头或逐角色确认。')+'</p></div>'+action+'</header>'+(error?'<p class="localization-message is-error" role="alert">'+escapeHtml(error.message)+'</p>':'')+'<div class="localization-confirmation-grid"><article><h3>角色姓名与关系</h3><ul>'+characters+'</ul></article><article><h3>中文剧情大纲</h3><p>'+escapeHtml(projection.story_outline_zh||'等待整集概要')+'</p></article><article><h3>本土化关键对白</h3><ul>'+dialogues+'</ul></article><article><h3>地点、货币、称呼与文化替换</h3><ul>'+replacementRows+'</ul></article><article><h3>待确认项</h3><ul>'+items+'</ul></article></div></section>';
  }

  function step02SourceShot(projectId, shotId) {
    return state.redrawSourceFacts[projectId]?.timeline?.shots?.find(shot=>shot.shotId===shotId) || null;
  }

  function step02DraftValues(shot) {
    return {source_shot_ids:(shot.source_shot_ids||[]).join(','),target_people_identity:String(shot.target_people_identity||''),localized_setting:String(shot.localized_setting||''),action:String(shot.action||''),target_dialogue:String(shot.target_dialogue||''),chinese_back_translation:String(shot.chinese_back_translation||''),expression_intent:String(shot.expression_intent||''),cultural_replacements:(shot.cultural_replacements||[]).join('\n'),continuity_requirements:(shot.continuity_requirements||[]).join('\n'),manual_notes:String(shot.manual_notes||''),review_status:String(shot.review_status||'unreviewed')};
  }

  function renderStep02Editor(variant, shot) {
    const draft = state.step02Draft?.variantId===variant.variant_id && state.step02Draft?.shotId===shot.shot_id ? state.step02Draft : null;
    const values = draft?.values || step02DraftValues(shot);
    const actionBusy = state.step02Action?.projectId===state.redrawStudioProjectId && ['save-shot','candidate','adopt-candidate','confirm-variant'].includes(state.step02Action?.type);
    if (!draft) {
      const readonly = '<div class="step02-localized-readonly"><section><span>原片镜头映射</span><p>'+escapeHtml((shot.source_shot_ids||[]).join('、')||'—')+'</p></section><section><span>目标人物与身份</span><p>'+escapeHtml(shot.target_people_identity||'—')+'</p></section><section><span>本地化场景与动作</span><p>'+escapeHtml((shot.localized_setting||'')+'\n'+(shot.action||''))+'</p></section><section class="is-dialogue"><span>目标语言对白</span><p>'+escapeHtml(shot.target_dialogue||'无对白')+'</p></section><section class="is-dialogue"><span>中文回译</span><p>'+escapeHtml(shot.chinese_back_translation||'无对白')+'</p></section><section><span>表达意图</span><p>'+escapeHtml(shot.expression_intent||'—')+'</p></section><section><span>文化替换</span><p>'+escapeHtml((shot.cultural_replacements||[]).join('；')||'无')+'</p></section><section><span>连续性要求</span><p>'+escapeHtml((shot.continuity_requirements||[]).join('；')||'无')+'</p></section><section><span>时长适配</span><p>'+escapeHtml((shot.duration_fit?.fits?'适配':'需调整')+' · '+(shot.duration_fit?.estimated_speech_seconds||0)+' 秒 · '+(shot.duration_fit?.note||''))+'</p></section></div>';
      const disabled = actionBusy ? ' disabled' : '';
      const confirmedNote = variant.status==='confirmed' ? '已确认版本仍可微调；保存后会回到待确认状态。' : '';
      return readonly+'<footer class="step02-shot-actions"><button class="is-primary" type="button" data-edit-step02-shot'+disabled+'>编辑当前镜头</button><button type="button" data-step02-candidate-intent="保持原意换一种表达"'+disabled+'>'+(state.step02Action?.type==='candidate'?'正在生成候选…':'换一种表达')+'</button><button type="button" data-step02-candidate-intent="缩短对白并保持原意"'+disabled+'>缩短对白</button><button type="button" data-step02-candidate-intent="检查与相邻镜头的衔接并给出更连贯的表达"'+disabled+'>检查衔接</button>'+(confirmedNote?'<span>'+escapeHtml(confirmedNote)+'</span>':'')+'</footer>';
    }
    const select = [['unreviewed','未核对'],['in_review','核对中'],['accepted','已确认'],['needs_revision','需要修正']].map(([value,label])=>'<option value="'+value+'"'+(values.review_status===value?' selected':'')+'>'+label+'</option>').join('');
    const field = (key,label,rows=2)=>'<label><span>'+label+'</span><textarea rows="'+rows+'" data-step02-draft="'+key+'">'+escapeHtml(values[key])+'</textarea></label>';
    return '<div class="step02-localized-editor">'+field('source_shot_ids','原片镜头映射（当前镜头 ID）',1)+field('target_people_identity','目标人物与身份')+field('localized_setting','本地化场景')+field('action','动作')+field('target_dialogue','目标语言对白',3)+field('chinese_back_translation','中文回译',3)+field('expression_intent','表达意图')+field('cultural_replacements','文化替换（每行一项）')+field('continuity_requirements','连续性要求（每行一项）')+field('manual_notes','人工备注')+'<label><span>核对状态</span><select data-step02-draft="review_status">'+select+'</select></label></div><footer class="step02-shot-actions"><button type="button" data-cancel-step02-edit'+(actionBusy?' disabled':'')+'>取消</button><button class="is-primary" type="button" data-save-step02-shot'+(actionBusy?' disabled':'')+'>'+(state.step02Action?.type==='save-shot'?'正在保存…':'保存当前镜头')+'</button><span>人工保存后锁定；整集 QA 只能建议，不能覆盖。</span></footer>';
  }

  function renderStep02Candidate(variant, shot) {
    const candidate = state.step02Candidate;
    if (!candidate || candidate.variant_id!==variant.variant_id || candidate.shot_id!==shot.shot_id) return '';
    const busy = state.step02Action?.type==='adopt-candidate';
    return '<aside class="step02-candidate"><header><span>AI 候选</span><strong>'+escapeHtml(candidate.intent||'单镜头微调')+'</strong></header><div><p>'+escapeHtml(candidate.patch?.target_dialogue||'无对白')+'</p><small>回译：'+escapeHtml(candidate.patch?.chinese_back_translation||'—')+'</small></div><footer><button type="button" data-dismiss-step02-candidate'+(busy?' disabled':'')+'>不采用</button><button class="is-primary" type="button" data-adopt-step02-candidate'+(busy?' disabled':'')+'>'+(busy?'正在采用…':'采用候选')+'</button></footer></aside>';
  }

  function renderStep02Notice(project, variant, shot) {
    const action = state.step02Action?.projectId===project.id ? state.step02Action : null;
    const failed = action && /-failed$/.test(action.type) ? '<aside class="step02-action-notice is-error"><strong>操作未完成</strong><span>'+escapeHtml(action.message||'请重新读取后再试')+'</span></aside>' : '';
    const findings = (variant?.qa?.findings||[]).filter(item=>!item.shot_id || item.shot_id===shot.shot_id);
    const qa = variant?.status==='qa_failed' ? '<aside class="step02-action-notice is-qa"><strong>整集 QA 需要修正</strong>'+(findings.length?findings.map(item=>'<span>'+escapeHtml(item.message)+(item.suggestion?' · '+escapeHtml(item.suggestion):'')+'</span>').join(''):'<span>请选择时间轴中标记的镜头核对；修改后可重新确认并运行 QA。</span>')+'</aside>' : '';
    return failed+qa;
  }

  function renderStep02Detail(project, variant, shot) {
    if (!shot) return '<section class="step02-empty"><strong>等待整集版本</strong><span>生成完成后会出现 37 个可核对镜头。</span></section>';
    const source = step02SourceShot(project.id,shot.shot_id);
    const dialogue = (source?.dialogue||[]).map(row=>'<article><strong>'+escapeHtml(row.speaker||'原片')+'</strong><p>'+escapeHtml(row.text||'')+'</p></article>').join('') || '<p>当前镜头无原片对白</p>';
    const ocr = (source?.ocr||[]).map(row=>'<article><strong>'+escapeHtml(row.timecode||'OCR')+'</strong><p>'+escapeHtml(row.text||'')+'</p></article>').join('') || '<p>当前镜头无画面文字</p>';
    return '<section class="step02-detail" data-step02-shot="'+escapeHtml(shot.shot_id)+'"><header><div><span>当前镜头</span><h2>'+escapeHtml(shot.shot_id)+' · '+escapeHtml(evidenceTimecode(Number(shot.start_sec)*1000))+' → '+escapeHtml(evidenceTimecode(Number(shot.end_sec)*1000))+'</h2></div><strong>'+escapeHtml((step02Locales[variant.locale]?.label||variant.locale)+'版本')+'</strong></header><div class="step02-detail-grid"><aside class="step02-source-evidence"><h3>原片证据</h3>'+(source?renderSourceReviewFrames(source):'')+'<div class="step02-source-text"><section><span>原片对白</span>'+dialogue+'</section><section><span>OCR</span>'+ocr+'</section></div></aside><main class="step02-localized-panel"><h3>海外改编</h3>'+renderStep02Notice(project,variant,shot)+renderStep02Editor(variant,shot)+renderStep02Candidate(variant,shot)+'</main></div></section>';
  }

  function renderStep02MarketModal(projectId) {
    const modal = state.step02MarketModal;
    if (!modal || modal.projectId!==projectId) return '';
    return '<div class="step02-market-backdrop" role="dialog" aria-modal="true" aria-labelledby="step02MarketTitle"><section class="step02-market-dialog"><header><span>创建海外版本</span><h2 id="step02MarketTitle">选择目标市场</h2><p>一次生成一个市场版本，之后可继续添加其他语言。</p></header><div class="step02-market-options">'+Object.entries(step02Locales).map(([locale,meta])=>'<button type="button" class="'+(modal.locale===locale?'is-selected':'')+'" data-step02-locale="'+locale+'"><strong>'+escapeHtml(meta.label)+'</strong><span>'+escapeHtml(meta.language)+'</span></button>').join('')+'</div>'+(modal.error?'<p class="step02-market-error">'+escapeHtml(modal.error)+'</p>':'')+'<footer><button type="button" data-close-step02-market>取消</button><button class="is-primary" type="button" data-create-step02-variant'+(modal.busy?' disabled':'')+'>'+(modal.busy?'正在创建…':'生成整集版本')+'</button></footer></section></div>';
  }

  function renderStep02RegionGate(project) {
    const list=state.step02VariantLists[project.id]||[];
    const options=Object.entries(step02Locales).map(([locale,meta])=>{const variant=list.find(item=>item.locale===locale);return '<button type="button" class="step02-region-choice" data-enter-step02-market="'+locale+'"><span>'+escapeHtml(meta.label)+'</span><strong>'+escapeHtml(meta.language)+'</strong><small>'+(variant?escapeHtml(step02StatusLabel(variant.status)):'创建新地区版本')+'</small></button>';}).join('');
    return '<section class="production-studio step02-stage step02-region-gate"><header class="step02-topbar"><div><button type="button" data-go-step01>第一步</button><i>/</i><strong>选择转绘地区</strong></div><span>每个地区保存为独立版本</span></header><main><div><span>进入第二步</span><h1>这次转绘投放到哪里？</h1><p>地区会同时决定语言、选角、场景、机构、文化替换和画面文字。</p></div><nav>'+options+'</nav></main></section>';
  }

  function renderExactStep02Studio(project) {
    const snapshot = state.step02Snapshots[project.id];
    const list = state.step02VariantLists[project.id] || [];
    const variant = state.step02Variants[state.step02VariantId] || null;
    const error = state.step02Error[project.id];
    if (!snapshot && error?.code==='STEP01_SNAPSHOT_REQUIRED') return '<section class="production-studio step02-stage"><header class="step02-topbar"><button type="button" data-go-step01>返回第一步</button><strong>海外改编</strong></header><section class="step02-empty"><strong>第一步尚未确认</strong><span>先保存并确认第一步，第二步才会读取不可变 Snapshot。</span><button class="is-primary" type="button" data-go-step01>去确认第一步</button></section></section>';
    if (state.step02Loading[project.id]&&!snapshot || (!snapshot&&!error)) return '<section class="production-studio step02-stage"><section class="step02-empty"><strong>正在读取第一步 Snapshot</strong><span>不会读取本地草稿。</span></section></section>';
    if (error&&!snapshot) return '<section class="production-studio step02-stage"><section class="step02-empty"><strong>第二步暂不可用</strong><span>'+escapeHtml(error.message)+'</span><button type="button" data-retry-step02>重新读取</button></section></section>';
    const shots = variant?.shots || [];
    const selected = shots.find(shot=>shot.shot_id===state.step02SelectedShotId) || shots[0] || null;
    const tabs = list.map(item=>'<button type="button" class="'+(item.variant_id===state.step02VariantId?'is-active':'')+'" data-step02-variant="'+escapeHtml(item.variant_id)+'"><strong>'+escapeHtml(step02Locales[item.locale]?.label||item.locale)+'</strong><span>'+escapeHtml(step02StatusLabel(item.status))+'</span></button>').join('');
    const qaIssueShots = new Set((variant?.qa?.findings||[]).filter(item=>item.severity==='error'&&item.shot_id).map(item=>item.shot_id));
    const timeline = shots.map(shot=>{const source=step02SourceShot(project.id,shot.shot_id);const mid=sourceReviewKeyframe(source,'mid');return '<button type="button" class="step02-shot-card '+(selected?.shot_id===shot.shot_id?'is-active':'')+' '+(shot.manual_locked?'is-locked':'')+' '+(qaIssueShots.has(shot.shot_id)?'is-qa-issue':'')+'" data-step02-shot-id="'+escapeHtml(shot.shot_id)+'">'+(mid?'<img loading="lazy" decoding="async" src="'+escapeHtml(mid.url)+'" alt="'+escapeHtml(shot.shot_id+' 原片代表帧')+'">':'')+'<span><strong>'+escapeHtml(shot.shot_id)+'</strong><small>'+escapeHtml(String(shot.review_status||'unreviewed'))+'</small></span></button>';}).join('');
    const status = variant?.status || (list.length?'loading':'empty');
    const statusPanel = !variant?'<section class="step02-empty"><strong>选择一个目标市场</strong><span>生成后将在这里显示完整 37 镜头版本。</span><button class="is-primary" type="button" data-open-step02-market>创建市场版本</button></section>':status==='generating'?'<section class="step02-empty"><strong>正在生成整集 '+escapeHtml(step02Locales[variant.locale]?.label||variant.locale)+' 版本</strong><span>服务器会按 Snapshot 处理 37 个镜头；关闭电脑或页面不会中断任务。</span></section>':status==='failed'?'<section class="step02-empty"><strong>整集生成失败</strong><span>'+escapeHtml(variant.error?.message||'服务器已保留已完成批次。')+'</span><button type="button" data-retry-step02-variant>继续生成</button></section>':renderStep02Detail(project,variant,selected);
    const confirmBusy = state.step02Action?.projectId===project.id&&state.step02Action?.type==='confirm-variant';
    const canConfirm = variant&&['ready','qa_failed'].includes(variant.status)&&shots.length===37&&!confirmBusy;
    const localization=renderLocalizationConfirmation(project.id,variant);
    return '<section class="production-studio step02-stage" data-step02-project="'+escapeHtml(project.id)+'"><header class="step02-topbar"><div><button type="button" data-go-step01>原片时间轴</button><i>/</i><strong>地区改编</strong></div><div class="step02-variant-tabs">'+tabs+'<button type="button" title="创建其他市场版本" data-open-step02-market>＋</button></div><div><span>'+escapeHtml(variant?step02StatusLabel(variant.status):'等待创建')+'</span>'+(variant?.status==='confirmed'?'<button type="button" data-refresh-localization>重新读取确认状态</button>':'<button class="is-primary" type="button" data-confirm-step02-variant'+(canConfirm?'':' disabled')+'>'+(confirmBusy?'正在重新检查…':variant?.status==='qa_failed'?'修正后重新检查':'完成整集检查')+'</button>')+'</div></header><main class="step02-workspace '+(localization?'has-localization':'')+'">'+localization+statusPanel+'</main>'+(shots.length?'<section class="step02-timeline"><header><span>整集地区改编镜头</span><strong>'+escapeHtml((step02Locales[variant.locale]?.language||variant.locale)+' · '+shots.length+'/37')+'</strong></header><nav>'+timeline+'</nav></section>':'')+renderStep02MarketModal(project.id)+'</section>';
  }

  function updateStep02Draft(target) {
    const key = target?.dataset?.step02Draft;
    const draft = state.step02Draft;
    if (!key || !draft) return false;
    draft.values[key] = String(target.value || '');
    draft.dirty = true;
    return true;
  }

  async function confirmStep01ForStep02(projectId) {
    const project = state.projects.find(item=>item.id===projectId);
    if (!project || state.redrawShotReviewEdit?.dirty) return;
    state.step02Action = {projectId,type:'confirm-step01'};
    renderRedrawStudio(project);
    try {
      const readback = await shotReviewRequest('/api/projects/' + encodeURIComponent(projectId) + '/shot-review?analysis_run_id=' + encodeURIComponent(project.analysis?.runId || ''));
      state.redrawShotReviewModels[projectId] = readback.payload;
      state.redrawShotReviewModelEtags[projectId] = readback.etag;
      state.redrawSourceFacts[projectId] = adaptShotReviewModel(readback.payload);
      let snapshot = null;
      try {
        const current = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step01/snapshots/current');
        if (current.payload.snapshot?.shot_review_revision === readback.etag) snapshot = current.payload.snapshot;
      } catch (snapshotError) {
        if (snapshotError.code !== 'STEP01_SNAPSHOT_REQUIRED') throw snapshotError;
      }
      if (!snapshot) {
        if (!readback.etag) throw Object.assign(new Error('服务器没有返回可确认的第一步版本，请刷新后重试'),{code:'SHOT_REVIEW_REVISION_MISSING'});
        const result = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step01/confirm',{method:'POST',headers:{'Content-Type':'application/json','If-Match':readback.etag},body:JSON.stringify({analysis_run_id:project.analysis?.runId})});
        snapshot = result.payload.snapshot;
      }
      state.step02Snapshots[projectId] = snapshot;
      state.redrawStudioStageId = '02';
      state.step02Action = null;
      state.step02MarketModal = null;
      location.hash = 'redraw/' + encodeURIComponent(projectId) + '/stage/02';
      await hydrateStep02(projectId,{force:true});
    } catch (error) {
      state.step02Action = {projectId,type:'confirm-step01-failed',message:error.message};
      renderRedrawStudio(project);
      return;
    }
    state.step02Action = null;
  }

  async function hydrateStep01ShotSelection(projectId, {force = false} = {}) {
    if (!projectId || state.redrawShotSelectionLoading[projectId] || (!force && state.redrawShotSelections[projectId])) return;
    state.redrawShotSelectionLoading[projectId] = true;
    delete state.redrawShotSelectionErrors[projectId];
    try {
      const payload = await api('/api/projects/' + encodeURIComponent(projectId) + '/step01-shot-selection', {cache:'no-store'});
      state.redrawShotSelections[projectId] = payload;
      const confirmed = payload.selection?.selected_shot_ids || [];
      const initial = confirmed.length ? confirmed : (projectId === 'NN-20260727052447-62C34D' ? payload.inventory.shots.filter(shot => shot.sequence >= 10 && shot.sequence <= 18).map(shot => shot.shot_id) : []);
      state.redrawShotSelectionDrafts[projectId] = new Set(initial);
    } catch (error) {
      state.redrawShotSelectionErrors[projectId] = {code:error.code || 'SHOT_INVENTORY_NOT_READY', message:error.message || '镜头识别尚未完成'};
    } finally {
      delete state.redrawShotSelectionLoading[projectId];
      if (state.redrawStudioProjectId === projectId && state.redrawStudioStageId === '01') renderRedrawStudio(state.projects.find(item => item.id === projectId));
    }
  }

  function step01ShotSelectionSummary(projectId) {
    const payload = state.redrawShotSelections[projectId];
    const selected = state.redrawShotSelectionDrafts[projectId] || new Set();
    const shots = (payload?.inventory?.shots || []).filter(shot => selected.has(shot.shot_id));
    return {shots, count:shots.length, duration:Number(shots.reduce((sum, shot) => sum + Number(shot.duration_sec || 0), 0).toFixed(1))};
  }

  function renderStep01ShotSelection(project) {
    const payload = state.redrawShotSelections[project.id];
    const error = state.redrawShotSelectionErrors[project.id];
    if (!payload) return '<section class="step01-shot-picker is-loading"><div><strong>' + escapeHtml(error ? '镜头清单暂不可用' : '正在读取镜头清单') + '</strong><span>' + escapeHtml(error?.message || '已保留原片，不需要重新上传。') + '</span></div>' + (error ? '<button type="button" data-retry-shot-inventory="' + escapeHtml(project.id) + '">重新读取</button>' : '') + '</section>';
    const inventory = payload.inventory;
    const draft = state.redrawShotSelectionDrafts[project.id] || new Set();
    const summary = step01ShotSelectionSummary(project.id);
    const confirmedIds = payload.selection?.selected_shot_ids || [];
    const unchanged = confirmedIds.length === summary.count && confirmedIds.every(id => draft.has(id));
    const buttons = inventory.shots.map(shot => {
      const selected = draft.has(shot.shot_id);
      return '<button class="step01-shot-chip ' + (selected ? 'is-selected' : '') + '" type="button" aria-pressed="' + String(selected) + '" data-select-source-shot="' + escapeHtml(shot.shot_id) + '" data-project-id="' + escapeHtml(project.id) + '" data-shot-start="' + escapeHtml(String(shot.start_sec)) + '"><strong>' + escapeHtml(String(shot.sequence).padStart(2, '0')) + '</strong><span>' + escapeHtml(formatDuration(shot.duration_sec)) + '</span><small>' + escapeHtml(formatStep01Duration(Math.floor(shot.start_sec))) + '</small></button>';
    }).join('');
    return '<section class="step01-shot-picker" data-shot-picker-project="' + escapeHtml(project.id) + '"><header><div><span>镜头范围</span><strong>已识别 ' + escapeHtml(String(inventory.shot_count)) + ' 个镜头</strong></div><form data-shot-range-form="' + escapeHtml(project.id) + '"><label for="shotRangeInput">快速选择</label><input id="shotRangeInput" name="range" inputmode="numeric" placeholder="例如 10-18" aria-label="输入镜头范围"><button type="submit">应用</button><button type="button" data-clear-shot-selection="' + escapeHtml(project.id) + '">取消选择</button></form></header><nav aria-label="选择要分析的镜头">' + buttons + '</nav><footer><div aria-live="polite"><strong>已选择 ' + escapeHtml(String(summary.count)) + ' 个镜头</strong><span>共 ' + escapeHtml(String(summary.duration)) + ' 秒</span></div><button class="redraw-primary-action" type="button" data-confirm-shot-analysis="' + escapeHtml(project.id) + '"' + (summary.count ? '' : ' disabled') + '>' + escapeHtml(unchanged ? '分析这些镜头' : '确认分析这些镜头') + '</button></footer></section>';
  }

  async function confirmSelectedShotsAndAnalyze(projectId, button) {
    const project = state.projects.find(item => item.id === projectId);
    const payload = state.redrawShotSelections[projectId];
    const selected = [...(state.redrawShotSelectionDrafts[projectId] || new Set())];
    if (!project || !payload || !selected.length) return;
    button.disabled = true;
    button.textContent = '正在确认镜头…';
    const body = {source_sha256:payload.inventory.source_sha256,source_revision:payload.inventory.source_revision,shot_inventory_version:payload.inventory.shot_inventory_version,selected_shot_ids:selected};
    try {
      const confirmed = await api('/api/projects/' + encodeURIComponent(projectId) + '/step01-shot-selection', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      state.redrawShotSelections[projectId] = {...payload, selection:confirmed.selection, business_status:'selection_confirmed'};
      button.textContent = '正在开始分析…';
      const result = await api('/api/projects/' + encodeURIComponent(projectId) + '/step01-analysis', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      state.projects = state.projects.map(item => item.id === result.project.id ? result.project : item);
      renderProjects(); renderWorkbench(); openRedrawStudio(projectId, {updateHash:false});
    } catch (error) {
      button.disabled = false;
      button.textContent = error.message || '重试分析';
    }
  }

  async function createStep02Variant(projectId) {
    const modal = state.step02MarketModal;
    const snapshot = state.step02Snapshots[projectId];
    if (!modal || !snapshot) return;
    modal.busy = true; modal.error = null;
    renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    try {
      const key = await sha256BrowserText([projectId,snapshot.snapshot_sha256,modal.locale,'whole_episode_v1'].join(':'));
      const result = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step02/variants',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({locale:modal.locale})});
      state.step02VariantId = result.payload.variant_id;
      state.redrawMarketLocale = modal.locale;
      state.step02MarketModal = null;
      location.hash='redraw/'+encodeURIComponent(projectId)+'/stage/02/market/'+state.redrawMarketLocale;
      await hydrateStep02(projectId,{force:true});
    } catch (error) {
      modal.busy = false; modal.error = error.message || '创建失败';
      renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    }
  }

  async function saveStep02Shot(projectId) {
    const variant = state.step02Variants[state.step02VariantId];
    const draft = state.step02Draft;
    if (!variant || !draft?.dirty) return;
    const shot = variant.shots.find(item=>item.shot_id===draft.shotId);
    const values = draft.values;
    const original = step02DraftValues(shot);
    const patch = {};
    for (const key of Object.keys(values)) {
      if (values[key] === original[key]) continue;
      patch[key] = key === 'source_shot_ids' ? values[key].split(/[\s,，]+/).map(item=>item.trim().toUpperCase()).filter(Boolean) : ['cultural_replacements','continuity_requirements'].includes(key) ? values[key].split('\n').map(item=>item.trim()).filter(Boolean) : values[key];
    }
    if (!Object.keys(patch).length) { state.step02Draft=null; renderRedrawStudio(state.projects.find(item=>item.id===projectId)); return; }
    state.step02Action = {projectId,type:'save-shot'};
    renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    try {
      const revisionId = 'step02-human-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
      const result = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step02/variants/' + encodeURIComponent(variant.variant_id) + '/shots/' + encodeURIComponent(shot.shot_id) + '/revisions',{method:'POST',headers:{'Content-Type':'application/json','If-Match':variant.etag},body:JSON.stringify({revision_id:revisionId,base_revision:shot.active_revision||null,patch}),timeoutMs:20000});
      state.step02Variants[variant.variant_id] = {...result.payload.variant,etag:result.payload.variant.etag||result.etag};
      state.step02Draft = null;
    } catch (error) {
      state.step02Action = {projectId,type:'save-shot-failed',message:error.message};
      if (error.code === 'STEP02_REVISION_CONFLICT' || error.status === 409) {
        state.step02Draft = null;
        state.step02Candidate = null;
        await hydrateStep02(projectId,{force:true});
      }
      renderRedrawStudio(state.projects.find(item=>item.id===projectId));
      return;
    }
    state.step02Action = null;
    renderRedrawStudio(state.projects.find(item=>item.id===projectId));
  }

  async function requestStep02Candidate(projectId, intent) {
    const variant = state.step02Variants[state.step02VariantId];
    const shot = variant?.shots?.find(item=>item.shot_id===state.step02SelectedShotId);
    if (!variant || !shot) return;
    state.step02Action = {projectId,type:'candidate'};
    renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    try {
      const requestId = 'step02-candidate-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
      const result = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step02/variants/' + encodeURIComponent(variant.variant_id) + '/shots/' + encodeURIComponent(shot.shot_id) + '/candidates',{method:'POST',headers:{'Content-Type':'application/json','If-Match':variant.etag},body:JSON.stringify({request_id:requestId,intent})});
      state.step02Candidate = result.payload.candidate;
    } catch (error) {
      state.step02Action = {projectId,type:'candidate-failed',message:error.message};
      renderRedrawStudio(state.projects.find(item=>item.id===projectId));
      return;
    }
    state.step02Action = null;
    renderRedrawStudio(state.projects.find(item=>item.id===projectId));
  }

  async function adoptStep02Candidate(projectId) {
    const variant = state.step02Variants[state.step02VariantId];
    const candidate = state.step02Candidate;
    if (!variant || !candidate) return;
    state.step02Action = {projectId,type:'adopt-candidate'};
    renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    try {
      const revisionId = 'step02-adopt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
      const result = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step02/variants/' + encodeURIComponent(variant.variant_id) + '/shots/' + encodeURIComponent(candidate.shot_id) + '/adopt',{method:'POST',headers:{'Content-Type':'application/json','If-Match':variant.etag},body:JSON.stringify({candidate_id:candidate.candidate_id,revision_id:revisionId})});
      state.step02Variants[variant.variant_id] = {...result.payload.variant,etag:result.payload.variant.etag||result.etag};
      state.step02Candidate = null;
      state.step02Action = null;
      renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    } catch (error) {
      state.step02Action = {projectId,type:'adopt-failed',message:error.message};
      renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    }
  }

  async function confirmStep02Variant(projectId) {
    const variant = state.step02Variants[state.step02VariantId];
    if (!variant) return;
    state.step02Action = {projectId,type:'confirm-variant'};
    renderRedrawStudio(state.projects.find(item=>item.id===projectId));
    try {
      const result = await step02Request('/api/projects/' + encodeURIComponent(projectId) + '/step02/variants/' + encodeURIComponent(variant.variant_id) + '/confirm',{method:'POST',headers:{'If-Match':variant.etag}});
      state.step02Variants[variant.variant_id] = {...result.payload.variant,etag:result.payload.variant.etag||result.etag};
      state.step02Action = null;
      await prepareLocalizationCandidate(projectId,state.step02Variants[variant.variant_id]);
      await hydrateStep02(projectId,{force:true});
    } catch (error) {
      state.step02Action = {projectId,type:'confirm-variant-failed',message:error.message};
      await hydrateStep02(projectId,{force:true});
    }
  }

  function renderRedrawStageBody(project, stageId) {
    const runtime = project?.runtime || {};
    const source = project?.source || {};
    const preflight = project?.preflight || {};
    const hasProject = Boolean(project);
    const hasSource = Boolean(source.originalName);
    const sourceName = source.originalName || '尚未上传参考视频';
    const sourceMeta = preflight.video?.width
      ? preflight.video.width + ' × ' + preflight.video.height + ' · ' + formatDuration(preflight.durationSeconds)
      : 'MP4 / MOV · 15 秒至 3 分钟 · 300MB 内';
    const analysisState = redrawAnalysisState(project);
    const progressDetails = step01ProgressDetails(project);
    if (stageId === '01') {
      const shotSelectionReady = Boolean(hasProject && state.redrawShotSelections[project.id]);
      const incompleteDirectRun = project?.analysis?.runtimeProfile === 'haika-step01-direct-v1';
      const startEligible = Boolean(hasProject && preflight.status === 'passed' && project.analysis?.status === 'awaiting_user_start');
      const recoveryEligible = Boolean(hasProject && preflight.status === 'passed' && (incompleteDirectRun || ['infra_failed','blocked_contract','blocked_quality','blocked_authorization','blocked_transport'].includes(String(project.analysis?.status || ''))));
      const analysisComplete = project?.analysis?.status === 'evidence_ready' && project?.analysis?.runtimeProfile === 'haika-step01-hq-full-v1';
      const primaryAction = shotSelectionReady ? '' : !hasProject
        ? '<button class="redraw-primary-action" type="button" data-open-project-wizard>创建转绘项目</button>'
        : startEligible
          ? '<button class="redraw-primary-action" type="button" data-start-step01="' + escapeHtml(project.id) + '">开始分析</button>'
          : recoveryEligible
            ? '<button class="redraw-primary-action" type="button" data-start-step01="' + escapeHtml(project.id) + '">' + (incompleteDirectRun ? '重新分析' : '重新开始分析') + '</button>'
            : '<button class="redraw-primary-action" type="button" disabled>' + escapeHtml(analysisComplete ? '原片分析已完成' : analysisState.label) + '</button>';
      const sourcePreview = hasSource && source.previewUrl
        ? '<video class="redraw-source-video" controls preload="metadata" src="' + escapeHtml(source.previewUrl) + '">当前浏览器无法播放该视频。</video>'
        : '<span class="redraw-video-play" aria-hidden="true">▶</span><strong>' + escapeHtml(hasSource ? '参考视频已接收' : '拖入或选择一段视频') + '</strong><small>' + escapeHtml(sourceMeta) + '</small>' + (!hasProject ? '<button type="button" data-open-project-wizard>选择视频并创建项目</button>' : '');
      const elapsedAttribute = progressDetails.active && progressDetails.startedAt ? ' data-step01-elapsed data-step01-started-at="' + escapeHtml(progressDetails.startedAt) + '"' : '';
      const facts = hasProject ? state.redrawSourceFacts[project.id] : null;
      const shotPicker = hasProject ? renderStep01ShotSelection(project) : '';
      const factShots = facts?.timeline?.shots || [];
      const selectedFactShot = factShots.find(shot => shot.shotId === state.redrawSourceFactShotId) || factShots[0] || null;
      const evidenceFrameCount = factShots.reduce((total, shot) => total + (shot.evidence?.keyframes?.length || 0), 0);
      const analysisCard = analysisComplete
        ? '<section class="redraw-analysis-card is-complete"><div><span>分析结果</span><strong>原片事实已核对</strong></div><dl class="redraw-analysis-meta"><div><dt>镜头</dt><dd>' + escapeHtml(String(factShots.length)) + ' 个</dd></div><div><dt>证据帧</dt><dd>' + escapeHtml(String(evidenceFrameCount)) + ' 张</dd></div><div><dt>视频时长</dt><dd>' + escapeHtml(formatDuration(preflight.durationSeconds || 0)) + '</dd></div><div><dt>下一步</dt><dd>可核对镜头事实</dd></div></dl></section>'
        : '<section class="redraw-analysis-card"><div><span>原片分析</span><strong>' + escapeHtml(analysisState.label) + '</strong></div><div class="redraw-analysis-track"><i style="--redraw-progress:' + progressDetails.progress + '"></i></div><dl class="redraw-analysis-meta"><div><dt>当前进度</dt><dd>' + escapeHtml(progressDetails.label) + '</dd></div><div><dt>' + escapeHtml(progressDetails.elapsedLabel) + '</dt><dd' + elapsedAttribute + '>' + escapeHtml(progressDetails.elapsedText) + '</dd></div><div><dt>预计剩余</dt><dd>' + escapeHtml(progressDetails.estimateText) + '</dd></div></dl></section>';
      const factTimeline = !analysisComplete ? '' : !facts
        ? '<section class="redraw-facts-loading"><span>原片事实证据包</span><strong>正在读取可验证时间轴</strong></section>'
        : '<section class="redraw-facts-timeline"><header><div><span>镜头证据</span><strong>逐镜头审阅原片</strong><small>选择任意镜头，播放器会同步定位到对应片段。</small></div><div>' + (facts.package?.downloadUrl ? '<a class="redraw-primary-action" href="' + escapeHtml(facts.package.downloadUrl) + '">下载证据包</a>' : '<button class="redraw-primary-action" type="button" disabled>证据包已挂载</button>') + '</div></header><div class="redraw-facts-layout"><nav aria-label="原片镜头时间轴">' + factShots.map(shot => '<button class="' + (selectedFactShot?.shotId === shot.shotId ? 'is-active' : '') + '" type="button" aria-pressed="' + (selectedFactShot?.shotId === shot.shotId ? 'true' : 'false') + '" data-source-facts-shot-id="' + escapeHtml(shot.shotId) + '" data-source-facts-project-id="' + escapeHtml(project.id) + '"><strong>' + escapeHtml(shot.shotId) + '</strong><span>' + escapeHtml(formatDuration((shot.endMs - shot.startMs) / 1000)) + '</span><small>' + escapeHtml(String(Math.round(shot.startMs / 1000))) + 's - ' + escapeHtml(String(Math.round(shot.endMs / 1000))) + 's</small></button>').join('') + '</nav>' + (selectedFactShot ? '<section class="redraw-fact-detail" aria-live="polite"><header><div><span>当前镜头</span><strong>' + escapeHtml(selectedFactShot.shotId) + '</strong></div><span>' + escapeHtml(String(Math.round(selectedFactShot.startMs / 1000))) + 's - ' + escapeHtml(String(Math.round(selectedFactShot.endMs / 1000))) + 's</span></header><div class="redraw-fact-frames">' + (selectedFactShot.evidence?.keyframes || []).map(frame => '<figure><img src="' + escapeHtml(frame.url) + '" alt="' + escapeHtml(selectedFactShot.shotId + ' ' + frame.point + ' 原片证据帧') + '"><figcaption>' + escapeHtml(frame.point === 'start' ? '开始' : frame.point === 'mid' ? '中段' : frame.point === 'end' ? '结束' : frame.point || '证据帧') + '</figcaption></figure>').join('') + '</div><dl><div><dt>证据类型</dt><dd>起、中、末原片帧</dd></div><div><dt>分析状态</dt><dd>已核对</dd></div></dl></section>' : '') + '</div></section>';
      return '<section class="redraw-video-stage redraw-source-stage">' +
        '<header class="redraw-stage-heading"><div><span>Step 01</span><h3>' + escapeHtml(analysisComplete ? '原片分析已完成' : '原片分析') + '</h3><p>' + escapeHtml(hasSource ? sourceName + ' · ' + sourceMeta : '上传参考视频后，系统会建立可核对的镜头事实。') + '</p></div><em>' + escapeHtml(analysisComplete ? '已完成' : hasSource ? '等待分析' : '等待视频') + '</em></header>' +
        '<div class="redraw-source-layout"><section class="redraw-source-preview"><div class="redraw-video-well">' + sourcePreview + '</div></section>' +
        '<section class="redraw-source-settings"><header><div><span>原片分析</span><strong>' + escapeHtml(analysisComplete ? '可审阅的原片证据' : '先选镜头，再核对内容') + '</strong></div></header>' + analysisCard + primaryAction + '</section></div>' + shotPicker + factTimeline + '</section>';
    }
    if (stageId === '02') {
      const step02 = project?.step02 || {};
      const candidate = step02.candidate || {};
      const rows = Array.isArray(candidate.sourceRows) ? candidate.sourceRows : [];
      const dialogues = Array.isArray(candidate.dialogueBindings) ? candidate.dialogueBindings : [];
      const assets = Array.isArray(candidate.assetCandidates) ? candidate.assetCandidates : [];
      const accepted = step02.step04Ready === true && Boolean(step02.acceptance?.sha256);
      const settingsEditable = Boolean(hasProject && String(project.analysis?.status || '') === 'evidence_ready' && !['prepared','dispatch_prepared','carrier_running','candidate_return_ready','accepted'].includes(String(step02.status || '')));
      const settingDisabled = settingsEditable ? '' : ' disabled';
      const languageOptions = redrawSettingOptions(project?.targetLanguage || 'es-MX', [['en-US','英语（美国）'],['ja-JP','日语'],['ko-KR','韩语'],['es-MX','西班牙语（墨西哥）'],['es-ES','西班牙语（西班牙）'],['pt-BR','葡萄牙语（巴西）']]);
      const visualStyleOptions = redrawSettingOptions(project?.visualStyle || 'faithful_redraw', [['faithful_redraw','忠实转绘'],['cinematic_realism','电影写实'],['premium_short_drama','精品短剧'],['stylized_realism','风格化写实'],['commercial_polish','商业广告感']]);
      const ratioOptions = redrawSettingOptions(project?.aspectRatio || '9:16', [['9:16','竖屏 9:16'],['16:9','横屏 16:9'],['1:1','方形 1:1'],['4:5','竖版 4:5']]);
      const qualityOptions = redrawSettingOptions(project?.quality || '720p', [['480p','480p'],['720p','720p'],['1080p','1080p']]);
      const productionSettings = hasProject ? '<form class="redraw-production-settings" data-redraw-settings="' + escapeHtml(project.id) + '"><header><div><span>制作规格</span><strong>本土化与画面方向</strong></div><em>' + escapeHtml(settingsEditable ? '可编辑' : '等待原片事实包') + '</em></header><div class="redraw-setting-grid"><label><span>目标语种</span><select name="targetLanguage"' + settingDisabled + '>' + languageOptions + '</select></label><label><span>作品风格</span><select name="visualStyle"' + settingDisabled + '>' + visualStyleOptions + '</select></label><label><span>画面比例</span><select name="aspectRatio"' + settingDisabled + '>' + ratioOptions + '</select></label><label><span>输出质量</span><select name="quality"' + settingDisabled + '>' + qualityOptions + '</select></label></div><label class="redraw-brief-field"><span>特殊要求（可选）</span><textarea name="replacementBrief" maxlength="1200" placeholder="例如：保留某句台词、避免某类视觉元素、指定品牌禁忌。"' + settingDisabled + '>' + escapeHtml(project?.replacementBrief || '') + '</textarea></label>' + (settingsEditable ? '<button class="redraw-primary-action" type="submit">保存制作规格</button>' : '') + '</form>' : '';
      const rowCards = rows.length ? rows.map(row => '<article class="redraw-scene-card"><header><span>' + escapeHtml(row.shot_id || 'SHOT') + '</span><em>' + escapeHtml(String(row.source_start_sec ?? '--') + '–' + String(row.source_end_sec ?? '--') + 's') + '</em></header><div><span>' + escapeHtml(row.story_beat || '源片镜头') + '</span><small>' + escapeHtml(row.visual_composition || '') + '</small></div><footer><strong>' + escapeHtml(row.blocking_movement || '') + '</strong><button type="button" disabled>源片事实</button></footer></article>').join('') : '<article class="redraw-scene-card"><header><span>STEP02</span><em>无候选</em></header><div><span>尚无源片事实时间轴</span><small>不会读取旧项目、15 秒片段或 latest 文件。</small></div><footer><strong>等待当前项目已验证原片证据</strong></footer></article>';
      const assetCards = assets.length ? assets.map(asset => '<article class="redraw-asset-card"><header><span>' + escapeHtml(asset.asset_id || 'ASSET') + '</span><em>' + escapeHtml(asset.type || 'source') + '</em></header><div class="redraw-asset-visual"><section class="is-wide"><small>源片身份</small><div>' + escapeHtml(asset.visual_identity || '') + '</div></section></div><footer><strong>' + escapeHtml(asset.first_seen_shot || '') + '</strong><button type="button" disabled>只读</button></footer></article>').join('') : '<article class="redraw-asset-card"><header><span>ASSET</span><em>等待事实</em></header><div class="redraw-asset-visual"><section class="is-wide"><small>当前项目</small><div>尚无已验证资产候选</div></section></div><footer><strong>禁止套用旧项目</strong></footer></article>';
      const dialogueRows = dialogues.length ? '<div class="redraw-prompt-editor">' + dialogues.map(line => '<p><strong>' + escapeHtml(String(line.source_start_sec) + 's · ' + line.source_speaker) + '：</strong>' + escapeHtml(line.source_text || '') + '</p>').join('') + '</div>' : '<div class="redraw-prompt-editor"><p><strong>对白绑定：</strong>等待 candidate-only 员工回执；未解决说话人或原文会阻塞接受。</p></div>';
      const action = !hasProject ? '<button class="is-primary" type="button" disabled>等待项目</button>' : accepted ? '<button class="is-primary" type="button" data-redraw-studio-stage="03">进入地区改编</button>' : step02.status === 'candidate_return_ready' ? '<button class="is-primary" type="button" data-step02-action="accept" data-project-id="' + escapeHtml(project.id) + '">接受当前事实账本</button>' : step02.status === 'carrier_running' ? '<button class="is-primary" type="button" data-step02-action="reconcile" data-project-id="' + escapeHtml(project.id) + '">读取固定 App 回传</button>' : step02.status === 'dispatch_prepared' ? '<button class="is-primary" type="button" data-step02-action="dispatch" data-step02-carrier="true" data-project-id="' + escapeHtml(project.id) + '">执行固定 App 派发</button>' : step02.status === 'prepared' ? '<button class="is-primary" type="button" data-step02-action="dispatch" data-project-id="' + escapeHtml(project.id) + '">准备固定 App 派发</button>' : '<button class="is-primary" type="button" data-step02-action="prepare" data-project-id="' + escapeHtml(project.id) + '">准备原片时间轴</button>';
      return '<section class="redraw-video-stage redraw-assets-stage"><header class="redraw-stage-heading"><div><span>02 / 源片事实账本</span><h3>核对镜头、对白、角色、关键资产与场景</h3><p>只读取当前项目已验证的原片分析证据；确认当前事实账本后才能进入地区改编。</p></div><em>' + escapeHtml(accepted ? '原片时间轴已确认' : '等待原片时间轴') + '</em></header>' + productionSettings + '<section class="redraw-assets-section"><header><div><span>源片镜头时间轴</span><small>' + escapeHtml(String(rows.length)) + ' 条当前项目镜头事实</small></div><div><button type="button" disabled>来源已确认</button></div></header><div class="redraw-scene-grid">' + rowCards + '</div></section><section class="redraw-assets-section"><header><div><span>原片对白顺序</span><small>' + escapeHtml(String(dialogues.length)) + ' 条 concrete speaker 绑定</small></div></header>' + dialogueRows + '</section><section class="redraw-assets-section"><header><div><span>关键资产与场景</span><small>仅展示当前项目中来源明确的候选</small></div></header><div class="redraw-role-grid">' + assetCards + '</div></section><footer class="redraw-stage-actions"><span>事实账本状态 · ' + escapeHtml(step02.acceptance?.sha256 ? '已确认' : '尚未确认') + '</span><button type="button" data-redraw-studio-stage="01">上一步</button>' + action + '</footer></section>';
    }
    if (stageId === '03') {
      const verifiedCount = String(runtime.verifiedArtifactCount || runtime.artifactCount || 0);
      const shotItems = [1, 2, 3, 4, 5, 6, 7, 8].map(index => '<button class="' + (index === 1 ? 'is-active' : '') + '" type="button" disabled><span>镜头 ' + String(index).padStart(2, '0') + '</span><small>待生成</small><em>--:--</em></button>').join('');
      return '<section class="redraw-video-stage redraw-storyboard-stage"><header class="redraw-stage-heading"><div><span>03 / 分镜管理</span><h3>镜头、提示词与资产同屏核对</h3><p>保持教程中的三栏布局：左侧参考视频，中间镜头事实，右侧角色、关键资产与场景。当前项目没有结果时只显示真实空状态。</p></div><em>' + escapeHtml(verifiedCount + ' 个已验证产物') + '</em></header><div class="redraw-storyboard-workspace"><aside class="redraw-shot-preview"><header><span>参考视频</span><button type="button" disabled>新视频</button></header><div><span class="redraw-video-play">▶</span><strong>等待分镜预览</strong><small>完成原片时间轴后在这里逐镜头核对</small></div></aside><section class="redraw-prompt-workspace"><header><div><span>分镜脚本</span><nav><em>角色</em><em>场景</em><em>动作</em></nav></div><button type="button" disabled>保存修改</button></header><div class="redraw-prompt-editor"><span>PROMPT</span><p><strong>镜头事实：</strong>等待当前项目的原片时间轴。</p><p><strong>画面主体：</strong>角色、站位、动作和道具尚未锁定。</p><p><strong>连续性：</strong>只有已确认资产和可追溯镜头事实才能进入视频任务。</p><p><strong>生成状态：</strong>未创建提示词包，未请求任何外部渠道。</p></div><footer><select disabled><option>画面比例 · ' + escapeHtml(project?.aspectRatio || '待锁定') + '</option></select><select disabled><option>输出质量 · ' + escapeHtml(project?.quality || '720p') + '</option></select><span>0 个任务</span><button type="button" disabled>提交审核</button></footer></section><aside class="redraw-asset-shelf"><header><span>角色</span><button type="button" disabled>＋</button></header><div><article><strong>角色资产</strong><small>等待确认</small></article><article><strong>角色三视图</strong><small>尚未生成</small></article></div><header><span>关键资产与场景</span><button type="button" disabled>＋</button></header><div><article class="is-wide"><strong>关键资产与场景</strong><small>等待确认</small></article></div></aside><nav class="redraw-shot-strip" aria-label="分镜列表">' + shotItems + '</nav></div><footer class="redraw-storyboard-footer"><span>03 / 04 · 当前节点 ' + escapeHtml('地区改编') + '</span><button type="button" disabled>720P · 等待授权</button></footer></section>';
    }
    const step04Word = project?.step04?.word || {};
    const step04WordReady = step04Word.ready === true
      && typeof step04Word.downloadUrl === 'string'
      && step04Word.downloadUrl.length > 0
      && Number(step04Word.bytes) > 0
      && /^[a-f0-9]{64}$/i.test(String(step04Word.sha256 || ''));
    const step04WordDelivery = '<section class="step04-word-delivery" aria-label="Step04 Word 交付">'
      + '<header><div><span class="eyebrow">STEP04 DOCUMENT</span><strong>Step04 制作包</strong></div>'
      + '<em>' + (step04WordReady ? '可下载' : '等待回执') + '</em></header>'
      + (step04WordReady
        ? '<div class="step04-word-ready"><div><strong>' + escapeHtml(step04Word.fileName || 'step04_production_package.docx') + '</strong><span>' + escapeHtml(String(step04Word.bytes) + ' bytes · SHA-256 ' + String(step04Word.sha256).slice(0, 12) + '…') + '</span></div><a class="redraw-primary-action" download href="' + escapeHtml(step04Word.downloadUrl) + '">下载 Step04 Word</a></div>'
        : '<div class="step04-word-pending"><strong>Step04 Word 尚未形成可交付产物</strong><span>视频任务保持未创建。</span></div>')
      + '</section>';
    const editorTracks = [1, 2, 3, 4, 5, 6].map(index => '<span><i>' + String(index).padStart(2, '0') + '</i><small>等待片段</small></span>').join('');
    return '<section class="redraw-video-stage redraw-editor-stage"><header class="redraw-stage-heading"><div><span>04 / 视频编辑</span><h3>对比、拼接与交付</h3><p>只有真实视频回读和质量检查通过后，预览、重新拼接与下载才会开放。</p></div><em>交付未开始</em></header>' + step04WordDelivery + '<div class="redraw-editor-canvas"><section class="redraw-editor-preview"><header><span>参考视频</span><em>来源</em></header><div><span class="redraw-video-play">▶</span><strong>' + escapeHtml(hasSource ? sourceName : '等待参考视频') + '</strong><small>参考视频轨道</small></div><footer>' + editorTracks + '</footer></section><section class="redraw-editor-preview"><header><span>转绘视频</span><em>未生成</em></header><div><span class="redraw-video-play is-locked">◇</span><strong>尚无可播放成片</strong><small>' + escapeHtml(humanizeProductionGate(runtime.blocker || '等待分镜审核、生成授权和视频质量检查')) + '</small></div><footer>' + editorTracks + '</footer></section></div><footer class="redraw-editor-controls"><div><span>对比参考视频</span><button type="button" role="switch" aria-checked="false" disabled><i></i></button></div><span>视频状态：' + escapeHtml(humanizeProductionGate(project?.gates?.video_provider || 'blocked')) + '</span><button type="button" disabled>重新拼接</button><button class="is-primary" type="button" disabled>下载</button></footer><section class="redraw-delivery-gates"><article><span>视频回读</span><strong>未开始</strong></article><article><span>质量复核</span><strong>未开始</strong></article><article><span>交付打包</span><strong>' + escapeHtml(humanizeProductionGate(project?.gates?.package_send || 'blocked')) + '</strong></article><article><span>用户验收</span><strong>未开始</strong></article></section></section>';
  }

  function renderRedrawFlowStepper(selectedStage, currentStage) {
    const currentNumber = Number(currentStage || '01');
    return '<nav class="redraw-flow-stepper" aria-label="一键转绘制作阶段">' + productionStageDefinitions('redraw').map(stage => {
      const stageNumber = Number(stage.id);
      const isFuture = stageNumber > currentNumber;
      const stateText = stage.id === selectedStage ? '当前查看' : (stageNumber < currentNumber ? '已通过' : (isFuture ? '等待上游' : '当前节点'));
      return '<button class="redraw-flow-step ' + (stage.id === selectedStage ? 'is-active' : '') + ' ' + (stageNumber < currentNumber ? 'is-complete' : '') + ' ' + (isFuture ? 'is-future' : '') + '" type="button" data-redraw-studio-stage="' + stage.id + '"' + (isFuture?' disabled aria-disabled="true"':'') + '><span>' + stage.id + '</span><div><strong>' + escapeHtml(stage.label) + '</strong><small>' + escapeHtml(stage.sublabel) + '</small></div><em>' + escapeHtml(stateText) + '</em></button>';
    }).join('') + '</nav>';
  }

  function renderRedrawVideoStudio(project, selectedStage, currentStage) {
    const selected = normalizeProductionStage(selectedStage, currentStage || '01');
    // The exact evidence review desk is reserved for the approved authority
    // project. New user projects must keep the normal Step01 start/analysis UI.
    if (selected === '01' && project?.id === exactStep01ProjectId) return renderExactStep01ReviewStudio(project);
    if (project?.id === 'NN-20260727052447-62C34D' && selected === '02') return renderStep02PublicProjection(project);
    if (project?.id === 'NN-20260715083045-8120F5' && selected === '02' && !state.redrawMarketLocale) return renderStep02RegionGate(project);
    if (project?.id === 'NN-20260715083045-8120F5' && selected === '02') return renderExactStep02Studio(project);
    const isFuturePreview = Number(selected) > Number(currentStage || '01');
    const projectName = project?.name || '新建转绘项目';
    const statusText = project
      ? (project.preflight?.status === 'passed' ? '源片预检已同步' : '本地状态已同步')
      : '尚未创建项目';
    const createAction = project
      ? '<button type="button" disabled title="完成质量复核后才会开放交付">交付包</button>'
      : '<button class="is-accent" type="button" data-open-project-wizard>＋ 创建项目</button>';
    const stageBody = isFuturePreview ? '' : renderRedrawStageBody(project, selected);
    const previewFooter = isFuturePreview ? renderProductionFooter('redraw', project, selected, currentStage || '01') : '';
    const step01EvidenceDesk = selected === '01' && project?.analysis?.status === 'evidence_ready' && project?.analysis?.runtimeProfile === 'haika-step01-hq-full-v1';
    const legacyStageChrome = step01EvidenceDesk ? '' : renderProductionActionCard('redraw', project, selected, currentStage || '01') + renderProductionStatePanel('redraw', project, selected, currentStage || '01');
    return '<section class="production-studio production-studio-redraw redraw-reference-studio"><header class="redraw-project-header"><div class="redraw-project-brand"><span class="redraw-project-brand-mark" aria-hidden="true"><img class="brand-logo-image" src="./assets/brand/niannian-ai-authority-gold.svg" alt="" /></span><strong>念念AI</strong></div><div class="redraw-project-breadcrumb"><span>转绘项目</span><i>/</i><strong>' + escapeHtml(projectName) + '</strong><small>' + escapeHtml(project?.id || '未保存') + '</small></div><div class="redraw-project-status"><i></i><span>' + escapeHtml(statusText) + '</span></div><div class="redraw-project-actions"><button type="button" data-return-redraw-workbench>返回工作台</button>' + createAction + '</div></header><section class="redraw-progress-bar"><div><span>一键转绘</span><strong>' + escapeHtml(projectName) + '</strong></div>' + renderRedrawFlowStepper(selected, currentStage || '01') + '</section><main class="redraw-reference-main">' + legacyStageChrome + stageBody + previewFooter + '</main></section>';
  }

  function renderProductionStudio(kind, project, selectedStage) {
    if (!project && kind === 'redraw') return renderRedrawVideoStudio(null, selectedStage || '01', '01');
    if (!project) return '<section class="team-empty"><strong>未找到项目</strong><span>请返回创作工作台，创建或选择一个项目后进入制作台。</span><button class="guide-inline-action" type="button" data-return-script-workbench>返回创作工作台</button></section>';
    const currentStage = kind === 'script'
      ? scriptStageForNode(project.runtime?.currentNode, project.runtime?.earliestIncompleteNode)
      : redrawStageForProject(project);
    const selected = normalizeProductionStage(selectedStage, currentStage);
    const isFuturePreview = Number(selected) > Number(currentStage);
    const body = isFuturePreview ? '' : (kind === 'script' ? renderScriptStageBody(project, selected) : renderRedrawStageBody(project, selected));
    if (kind === 'script') {
      return '<section class="production-studio production-studio-script">' + renderStudioHeader(kind, project, currentStage) + '<section class="script-studio-progress"><div><span class="eyebrow">NOVEL TO SHORT DRAMA</span><strong>EP001 · 当前进度 ' + escapeHtml(currentStage) + ' / 04</strong></div>' + renderProductionStepper(kind, selected, currentStage) + '</section><div class="studio-production-layout script-production-layout"><main class="production-main">' + renderProductionActionCard('script', project, selected, currentStage) + renderProductionStatePanel('script', project, selected, currentStage) + body + renderProductionFooter(kind, project, selected, currentStage) + '</main></div></section>';
    }
    return renderRedrawVideoStudio(project, selected, currentStage);
  }

  function sanitizeScriptN06PublicSurface(root) {
    const spec = root?.querySelector?.('.script-n06-spec');
    if (spec) {
      const details = spec.querySelector('details');
      if (details) {
        const note = document.createElement('p');
        note.className = 'script-n06-spec-note';
        note.textContent = '执行内容由已确认方案托管，页面不显示内部提示词。';
        details.replaceWith(note);
      }
    }
    root?.querySelectorAll?.('[data-review-sha],[data-prompt-sha]').forEach(element => {
      element.removeAttribute('data-review-sha');
      element.removeAttribute('data-prompt-sha');
    });
  }

  function renderScriptStudio(project) {
    if (!scriptStudioContent) return;
    preserveCurrentStudioStageFocus('script');
    scriptStudioContent.innerHTML = renderProductionStudio('script', project, state.scriptStudioStageId);
    sanitizeScriptN06PublicSurface(scriptStudioContent);
    const currentStage = scriptStageForNode(project?.runtime?.currentNode, project?.runtime?.earliestIncompleteNode);
    lockFutureStageControls(scriptStudioContent, normalizeProductionStage(state.scriptStudioStageId, currentStage), currentStage);
    animateStudioEntry(scriptStudioContent, 'script', project?.id, state.scriptStudioStageId);
    restoreStudioStageFocus('script', state.scriptStudioStageId);
  }

  function renderRedrawStudio(project) {
    const target = document.getElementById('redrawStudioContent');
    if (!target) return;
    const existingVideo = target.querySelector('.redraw-source-video');
    const existingAuthorityImport = target.querySelector('[data-step01-authority-import]');
    const previewUrl = String(project?.source?.previewUrl || '');
    const existingSource = existingVideo?.getAttribute('src') || existingVideo?.currentSrc || '';
    let preserveSourceVideo = false;
    try {
      preserveSourceVideo = Boolean(
        existingVideo
        && state.redrawStudioStageId === '01'
        && target.dataset.redrawStudioProjectId === String(project?.id || '')
        && new URL(existingSource, document.baseURI).href === new URL(previewUrl, document.baseURI).href
      );
    } catch {
      preserveSourceVideo = false;
    }
    preserveCurrentStudioStageFocus('redraw');
    const next = document.createElement('template');
    next.innerHTML = renderProductionStudio('redraw', project, state.redrawStudioStageId);
    if (preserveSourceVideo) {
      const replacement = next.content.querySelector('.redraw-source-video');
      replacement?.replaceWith(existingVideo);
    }
    if (
      existingAuthorityImport
      && state.step01AuthorityImport?.active
      && state.step01AuthorityImport.projectId === project?.id
      && state.redrawStudioStageId === '01'
    ) {
      const replacement = next.content.querySelector('[data-step01-authority-import]');
      replacement?.replaceWith(existingAuthorityImport);
    }
    target.replaceChildren(next.content);
    sanitizeRedrawPublicText(target);
    target.dataset.redrawStudioProjectId = String(project?.id || '');
    const currentStage = redrawStageForProject(project);
    const exactStep02Unlocked = project?.id === exactStep01ProjectId && state.redrawStudioStageId === '02' && Boolean(state.step02Snapshots[project.id]);
    if (!exactStep02Unlocked) lockFutureStageControls(target, normalizeProductionStage(state.redrawStudioStageId, currentStage), currentStage);
    animateStudioEntry(target, 'redraw', project?.id, state.redrawStudioStageId);
    restoreStudioStageFocus('redraw', state.redrawStudioStageId);
    const sourceReviewVideo = target.querySelector('[data-source-review-project] .redraw-source-video');
    if (sourceReviewVideo && sourceReviewVideo.dataset.sourceReviewBound !== 'true') {
      sourceReviewVideo.dataset.sourceReviewBound = 'true';
      sourceReviewVideo.addEventListener('timeupdate', () => {
        const facts = state.redrawSourceFacts[project?.id];
        const currentMs = Math.max(0, Number(sourceReviewVideo.currentTime || 0) * 1000);
        const shot = facts?.timeline?.shots?.find(item => currentMs >= Number(item.startMs) && currentMs < Number(item.endMs)) || facts?.timeline?.shots?.at(-1);
        const clock = target.querySelector('[data-source-review-time]');
        if (clock) clock.textContent = evidenceTimecode(currentMs);
        if (shot && shot.shotId !== state.redrawSourceFactShotId) applySourceReviewShotSelection(project.id, shot.shotId, {reveal:true});
      });
    }
  }

  function preserveCurrentStudioStageFocus(kind) {
    const action = kind === 'script' ? 'data-script-studio-stage' : 'data-redraw-studio-stage';
    const activeStageId = document.activeElement?.getAttribute?.(action);
    if (activeStageId) state.studioStageFocus = {kind, stageId:activeStageId};
    else {
      const root = kind === 'script' ? scriptStudioContent : document.getElementById('redrawStudioContent');
      if (document.activeElement && document.activeElement !== document.body && root?.contains(document.activeElement)) state.studioStageFocus = null;
    }
  }

  function restoreStudioStageFocus(kind, stageId) {
    const pending = state.studioStageFocus;
    if (!pending) return;
    if (pending.kind !== kind || pending.stageId !== stageId) return;
    window.requestAnimationFrame(() => {
      const current = state.studioStageFocus;
      if (!current || current.kind !== kind || current.stageId !== stageId) return;
      const root = kind === 'script' ? scriptStudioContent : document.getElementById('redrawStudioContent');
      const action = kind === 'script' ? 'data-script-studio-stage' : 'data-redraw-studio-stage';
      const selector = '[' + action + '="' + CSS.escape(String(stageId)) + '"]';
      const target = Array.from(root?.querySelectorAll(selector) || []).find(button => !button.disabled && button.getAttribute('aria-current') === 'step');
      target?.focus({preventScroll:true});
    });
  }

  function renderReferenceEvidenceRail() {
    const stages = [
      ['01', '证据提取', '原片分析已验证', 'is-active'],
      ['02', '源片时间轴', '等待原片时间轴', 'is-locked'],
      ['03', '本地化与提示词', '等待事实账本', 'is-locked'],
      ['04', '资产执行与交付', '等待授权与 QA', 'is-locked']
    ];
    return '<aside class="studio-rail studio-evidence-rail"><p>转绘生产链路 · 原片分析</p><nav class="production-stepper" aria-label="转绘生产阶段">' + stages.map(stage => '<button class="production-step ' + stage[3] + '" type="button" disabled><span class="production-step-number">' + (stage[0] === '01' ? '✓' : stage[0]) + '</span><span class="production-step-copy"><strong>' + stage[1] + '</strong><small>' + stage[2] + '</small></span><em>' + (stage[0] === '01' ? '已验证' : '等待上游') + '</em></button>').join('') + '</nav><section class="studio-rail-assist"><span>◎</span><strong>证据真值层</strong><small>只读展示原片、抽帧、镜头、OCR 与音频证据；它们不是候选图或视频成品。</small><button type="button" disabled>完成原片分析后才能写事实时间轴</button></section></aside>';
  }

  function renderReferenceEvidenceStudio(evidence) {
    const target = document.getElementById('redrawStudioContent');
    if (!target) return;
    const shots = Array.isArray(evidence?.shots) ? evidence.shots : [];
    const selected = shots.find(shot => shot.id === state.referenceEvidenceShotId) || shots[0] || null;
    if (!selected) {
      target.innerHTML = '<section class="team-empty"><strong>证据包没有可用镜头</strong><span>原片分析必须保留完整的镜头起、中、末证据后才能进入工作台。</span></section>';
      return;
    }
    state.referenceEvidenceShotId = selected.id;
    const counts = evidence.counts || {};
    const validation = evidence.validation || {};
    const frameCards = ['start', 'mid', 'end'].map(point => {
      const frame = selected.frames?.[point];
      const labels = {start:'起始帧', mid:'中间帧', end:'结束帧'};
      return '<figure><img src="' + escapeHtml(frame?.url || '') + '" alt="' + escapeHtml(selected.id + ' ' + labels[point] + ' 原始证据帧') + '"><figcaption><span>' + labels[point] + '</span><strong>' + escapeHtml(frame?.timecode || '-') + '</strong></figcaption></figure>';
    }).join('');
    target.innerHTML = '<section class="production-studio production-evidence-studio"><header class="studio-project-header"><div class="studio-brand"><span class="studio-brand-mark" aria-hidden="true"><img class="brand-logo-image" src="./assets/brand/niannian-ai-authority-gold.svg" alt="" /></span><strong>念念AI</strong></div><div class="studio-breadcrumb"><span>/</span><strong>' + escapeHtml(evidence.id || defaultReferenceEvidenceId) + '</strong><small>' + escapeHtml('短剧转绘 · 原片分析只读证据台') + '</small></div><span class="studio-save-state"><i></i>证据验证通过</span><div class="studio-project-actions"><button type="button" data-return-redraw-workbench>返回工作台</button><button type="button" disabled>只读证据</button><button class="studio-export-button" type="button" disabled>未创建交付</button></div></header><div class="studio-production-layout">' + renderReferenceEvidenceRail() + '<main class="production-main"><section class="production-workspace production-evidence-workspace"><header><div><span class="eyebrow">原片分析证据 · 已验证</span><h3>原片证据与镜头账本</h3><p>所有画面均来自已验证的原分辨率证据帧。联系表只用于预览；这里的起、中、末帧才是 原片时间轴可读取的镜头证据。</p></div><span class="production-stage-chip">原片分析已验证</span></header><div class="studio-context-grid"><article class="production-metric"><span>原始证据帧</span><strong>' + escapeHtml(String(counts.originalFrames || 0)) + ' 张</strong></article><article class="production-metric"><span>主镜头清单</span><strong>' + escapeHtml(String(counts.primaryShots || 0)) + ' 条</strong></article><article class="production-metric"><span>镜头起中末补帧</span><strong>' + escapeHtml(String(counts.shotSupplements || 0)) + ' 张</strong></article><article class="production-metric"><span>镜头边界</span><strong>' + escapeHtml(String(counts.transnetShots || 0)) + ' 条</strong></article></div><section class="evidence-shot-workspace"><aside class="evidence-shot-list"><header><div><span class="eyebrow">SHOT LIST</span><h4>已验证镜头</h4></div><small>' + escapeHtml(String(shots.length)) + ' 条可预览</small></header><div>' + shots.map(shot => '<button class="' + (shot.id === selected.id ? 'is-active' : '') + '" type="button" data-evidence-shot-id="' + escapeHtml(shot.id) + '"><strong>' + escapeHtml(shot.id) + '</strong><span>' + escapeHtml(shot.startTimecode) + ' - ' + escapeHtml(shot.endTimecode) + '</span><em>' + escapeHtml(String(shot.durationSec)) + ' 秒</em></button>').join('') + '</div></aside><section class="evidence-frame-review"><header><div><span class="eyebrow">ORIGINAL-RESOLUTION EVIDENCE</span><h4>' + escapeHtml(selected.id) + ' · ' + escapeHtml(selected.startTimecode) + ' 至 ' + escapeHtml(selected.endTimecode) + '</h4></div><span>只读原始证据</span></header><div class="evidence-frame-triptych">' + frameCards + '</div><div class="evidence-shot-contract"><article><span>时间范围</span><strong>' + escapeHtml(selected.startTimecode) + ' - ' + escapeHtml(selected.endTimecode) + '</strong></article><article><span>镜头时长</span><strong>' + escapeHtml(String(selected.durationSec)) + ' 秒</strong></article><article><span>下一节点</span><strong>原片时间轴</strong></article></div></section></section><section class="evidence-ledger-grid"><article><span class="eyebrow">OCR EVIDENCE</span><h4>画面文字识别</h4><p>' + escapeHtml(String(counts.ocrStates || 0)) + ' 条 OCR 结果已进入证据账本；硬字幕/可读 UI 作为 原片时间轴的核对证据，不直接写入提示词。</p></article><article><span class="eyebrow">AUDIO EVIDENCE</span><h4>对白与音频对齐</h4><p>' + escapeHtml(String(counts.dialogueSegments || 0)) + ' 条对白、' + escapeHtml(String(counts.audioEvents || 0)) + ' 条音频事件、' + escapeHtml(String(counts.vadSegments || 0)) + ' 段语音活动，仅用于时间线和表演核对。</p></article><article><span class="eyebrow">VALIDATION</span><h4>完整性验证已通过</h4><p>检查结果：' + '已按原片证据规则核验' + '。错误 ' + escapeHtml(String(validation.errors || 0)) + '，警告 ' + escapeHtml(String(validation.warnings || 0)) + '。</p></article></section></section></main><aside class="production-inspector production-evidence-inspector"><div class="studio-inspector-heading"><span class="eyebrow">原片分析质量门</span><h3>证据晋级门</h3><span class="studio-gate-count">通过</span></div><div class="studio-gate-list"><article class="is-passed"><i>✓</i><div><strong>原分辨率帧覆盖</strong><small>' + escapeHtml(String(counts.originalFrames || 0)) + ' 张原始证据帧与证据清单对齐</small></div></article><article class="is-passed"><i>✓</i><div><strong>镜头边界与补帧</strong><small>' + escapeHtml(String(counts.transnetShots || 0)) + ' 条边界，' + escapeHtml(String(counts.shotSupplements || 0)) + ' 张起中末补帧</small></div></article><article class="is-passed"><i>✓</i><div><strong>OCR / 音频证据</strong><small>OCR、ASR 与强制对齐账本均有真实产物</small></div></article><article><i>!</i><div><strong>原片时间轴</strong><small>尚未创建，不得提前写提示词、生成资产或提交渠道</small></div></article></div><section class="studio-reference-groups"><h4>当前证据性质</h4><div><span>来源项目</span><strong>' + escapeHtml(evidence.projectId || '只读样片') + '</strong></div><div><span>起/中/末帧</span><strong>原片时间轴证据</strong></div><div><span>候选首帧</span><strong>0 个</strong></div><div><span>视频任务</span><strong>0 个</strong></div></section><button class="studio-primary-action" type="button" disabled>等待 原片时间轴</button><p class="studio-inspector-footnote">原片分析只提供证据，不能被展示为地区改编方案、资产与首帧或已提交视频。</p></aside></div></section>';
  }

  async function openReferenceEvidenceStudio({updateHash = true} = {}) {
    const target = document.getElementById('redrawStudioContent');
    if (!target) return;
    const route = updateHash ? null : referenceEvidenceRoute();
    const evidenceId = route?.episodeId || defaultReferenceEvidenceId;
    showView('redraw-studio');
    target.innerHTML = '<section class="studio-evidence-loading"><span class="eyebrow">原片分析证据</span><strong>正在读取已验证证据包</strong><small>只读取已验证的镜头清单和原始证据帧。</small></section>';
    try {
      const payload = state.referenceEvidence && state.referenceEvidenceId === evidenceId ? {evidence:state.referenceEvidence} : await api('/api/reference-evidence/' + encodeURIComponent(evidenceId));
      state.referenceEvidence = payload.evidence;
      state.referenceEvidenceId = payload.evidence.id || evidenceId;
      const requestedShot = route?.shotId;
      state.referenceEvidenceShotId = payload.evidence.shots?.some(shot => shot.id === requestedShot) ? requestedShot : (state.referenceEvidenceShotId || payload.evidence.shots?.[0]?.id || null);
      renderReferenceEvidenceStudio(payload.evidence);
      if (updateHash) location.hash = 'redraw-evidence/' + encodeURIComponent(state.referenceEvidenceId || evidenceId) + '/shot/' + encodeURIComponent(state.referenceEvidenceShotId || 'S001');
    } catch (error) {
      target.innerHTML = '<section class="team-empty"><strong>无法读取原片分析证据包</strong><span>' + escapeHtml(error.message) + '</span><button class="guide-inline-action" type="button" data-return-redraw-workbench>返回创作工作台</button></section>';
    }
  }

  function openScriptStudio(projectId, {updateHash = true} = {}) {
    const project = state.scriptProjects.find(item => item.id === projectId) || state.scriptProjects[0] || null;
    const preserveCandidateEditor = isEditingScriptCandidate(project?.id);
    state.scriptStudioProjectId = project?.id || null;
    const route = updateHash ? null : scriptStudioRoute();
    const currentStage = scriptStageForNode(project?.runtime?.currentNode, project?.runtime?.earliestIncompleteNode);
    state.scriptStudioStageId = normalizeProductionStage(route?.stageId || state.scriptStudioStageId, currentStage);
    const canonicalHash = '#script/' + encodeURIComponent(project?.id || '') + '/stage/' + state.scriptStudioStageId;
    if ((updateHash || route?.legacyNode) && location.hash !== canonicalHash) {
      location.hash = canonicalHash;
      return;
    }
    if (preserveCandidateEditor) return;
    renderScriptStudio(project);
    showView('script-studio');
    if (['02', '03'].includes(state.scriptStudioStageId)) void hydrateScriptN04Review(project?.id);
    if (state.scriptStudioStageId === '04') void hydrateScriptN06Review(project?.id);
  }

  function openRedrawStudio(projectId, {updateHash = true} = {}) {
    const requestedId=String(projectId||'new');
    const project = requestedId==='new' ? null : (state.projects.find(item => item.id === requestedId) || null);
    state.redrawStudioProjectId = project?.id || null;
    if(!project){
      const target=document.getElementById('redrawStudioContent');
      if(target)target.innerHTML='<section class="team-empty"><strong>'+escapeHtml(requestedId==='new'?'创建一个全新的转绘项目':'未找到这个转绘项目')+'</strong><span>'+escapeHtml(requestedId==='new'?'新建入口不会恢复旧项目或旧草稿；如需草稿请显式选择“恢复上次未提交草稿”。':'该地址不会回退到其他旧项目，请返回工作台重新选择。')+'</span><button class="guide-inline-action" type="button" data-open-project-wizard>创建全新转绘项目</button><button class="workbench-quiet-action" type="button" data-return-redraw-workbench>返回工作台</button></section>';
      showView('redraw-studio');
      if(updateHash&&location.hash!=='#redraw/'+encodeURIComponent(requestedId))location.hash='redraw/'+encodeURIComponent(requestedId);
      return;
    }
    // Always inspect the current hash before rendering. Callers that use
    // updateHash=true can otherwise overwrite the Step03 market workspace.
    const route = redrawStudioRoute();
    // Step03 owns its market-specific route and its only writer is mvp-step03-r1.
    // Rendering the legacy production stage here would overwrite the character UI.
    if (route?.marketLocale && ['03','04'].includes(route.stageId)) {
      state.redrawMarketLocale = route.marketLocale;
      showView('redraw-studio');
      return;
    }
    if (route) state.redrawMarketLocale = route.marketLocale || null;
    const employeeStep02Ready = project?.step02?.status === 'candidate_return_ready';
    const currentStage = employeeStep02Ready ? '02' : redrawStageForProject(project);
    const requestedStage = employeeStep02Ready && (route?.stageId === '01' || !route?.stageId)
      ? '02'
      : (updateHash ? state.redrawStudioStageId : (route?.stageId || state.redrawStudioStageId));
    const normalizedStage = normalizeProductionStage(requestedStage, currentStage);
    // Keep legacy projects on the integrated Step01 page. A project that has
    // already received the canonical Step02 employee return keeps its explicit
    // Stage02 route instead of being sent back to the retired facts screen.
    const retiredSourceFactsStage = normalizedStage === '02'
      && project.id !== 'NN-20260727052447-62C34D'
      && !employeeStep02Ready;
    state.redrawStudioStageId = retiredSourceFactsStage ? '01' : normalizedStage;
    renderRedrawStudio(project);
    showView('redraw-studio');
    if (state.redrawStudioStageId === '01') void hydrateStep01ShotSelection(project.id);
    if (project.analysis?.status === 'evidence_ready') void hydrateRedrawSourceFacts(project.id);
    if (updateHash || route?.legacyNode || retiredSourceFactsStage || (employeeStep02Ready && route?.stageId === '01')) location.hash = 'redraw/' + encodeURIComponent(project?.id || 'new') + '/stage/' + state.redrawStudioStageId + (state.redrawMarketLocale ? '/market/' + state.redrawMarketLocale : '');
  }

  function workspaceProjectName(workspaceProjectId) {
    return state.workspaceProjects.find(item => item.id === workspaceProjectId)?.name
      || state.projects.find(item => (item.workspaceProjectId || item.id) === workspaceProjectId)?.name
      || state.scriptProjects.find(item => (item.workspaceProjectId || item.id) === workspaceProjectId)?.name
      || '新建项目';
  }

  function redrawBusinessState(project) {
    const runtime = project?.runtime || {};
    const raw = String(runtime.productionStatus || project?.productionStatus || project?.status || '').toLowerCase();
    if (/blocked|failed|error/.test(raw)) return '需要处理';
    if (/completed|delivered|accepted/.test(raw)) return '已完成';
    if (/preflight/.test(raw)) return '等待预检';
    if (/running|processing|active/.test(raw)) return '处理中';
    if (/prepared/.test(raw)) return '等待生产授权';
    return '等待处理';
  }

  function redactBusinessBlocker(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^[A-Z0-9_:-]{4,}$/.test(text) || /(?:provider|worker|dispatch|receipt|path|sha|hash|token|\/|\\)/i.test(text)) return '当前阶段需要处理后才能继续。';
    return text.slice(0, 180);
  }

  function redrawProjectForWorkspace(workspaceProjectId) {
    return state.projects.find(item => (item.workspaceProjectId || item.id) === workspaceProjectId) || null;
  }

  function renderRedrawIntake() {
    const target = document.getElementById('redrawIntakeContent');
    if (!target) return;
    const route = workspaceToolRoute();
    const selectedId = route?.tool === 'redraw' ? route.projectId : state.redrawIntakeWorkspaceId;
    const selected = selectedId && selectedId !== 'new' ? selectedId : '';
    const existing = selected ? redrawProjectForWorkspace(selected) : null;
    const workspaceOptions = ['<option value="">新建项目</option>'].concat(state.workspaceProjects.map(item => '<option value="' + escapeHtml(item.id) + '"' + (item.id === selected ? ' selected' : '') + '>' + escapeHtml(item.name || item.id) + '</option>')).join('');
    const stateCard = existing
      ? '<section class="workspace-tool-state"><div><span>当前状态</span><strong>' + escapeHtml(redrawBusinessState(existing)) + '</strong></div><div><span>下一步</span><strong>' + escapeHtml(redactBusinessBlocker(existing.runtime?.nextAction) || '等待服务端状态更新') + '</strong></div><button type="button" data-open-workspace-deliveries="' + escapeHtml(selected) + '">查看项目交付</button></section>'
      : '';
    const status = state.redrawIntakeStatus ? '<p class="workspace-tool-feedback" role="status">' + escapeHtml(state.redrawIntakeStatus) + '</p>' : '';
    target.innerHTML = '<section class="workspace-tool-page workspace-redraw-intake"><header class="workspace-tool-header"><button type="button" class="workspace-tool-back" data-return-workbench>← 工作台</button><div><span>REFERENCE VIDEO</span><h2>一键转绘</h2></div></header>'
      + '<form class="workspace-tool-form" id="redrawIntakeForm"><input type="hidden" name="workspaceProjectId" value="' + escapeHtml(selected) + '"><div class="workspace-tool-fields"><label><span>项目</span><select data-redraw-workspace-select>' + workspaceOptions + '</select></label><label><span>项目名称</span><input name="name" required minlength="2" maxlength="80" value="' + escapeHtml(existing?.name || '') + '" placeholder="给这次转绘命名"></label><label class="is-wide workspace-tool-upload"><span>原片</span><input name="sourceVideo" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" required><small>MP4 或 MOV，最大 300MB。</small></label><label class="is-wide"><span>需求（可选）</span><textarea name="notes" rows="4" maxlength="2000" placeholder="说明想保留或调整的内容"></textarea></label><label class="is-wide workspace-tool-confirm"><input name="rightsConfirmed" type="checkbox" required><span>我确认拥有该原片的使用与改编权限。</span></label></div>'
      + status + '<footer><button type="button" data-return-workbench>取消</button><button class="workspace-tool-primary" type="submit">创建转绘任务</button></footer></form>' + stateCard + '</section>';
    showView('redraw-intake');
  }

  function renderWorkspaceDeliveries() {
    const target = document.getElementById('workspaceDeliveriesContent');
    if (!target) return;
    const route = workspaceToolRoute();
    const workspaceId = route?.tool === 'deliveries' ? route.projectId : '';
    const delivery = workspaceId ? state.workspaceDeliveries[workspaceId] : null;
    const projectName = workspaceProjectName(workspaceId);
    if (!workspaceId) {
      target.innerHTML = '<section class="workspace-tool-page"><header class="workspace-tool-header"><button type="button" class="workspace-tool-back" data-return-workbench>← 工作台</button><div><span>DELIVERIES</span><h2>项目交付</h2></div></header><p class="workspace-tool-feedback">请选择一个项目后查看交付。</p></section>';
      showView('deliveries');
      return;
    }
    if (!delivery) {
      target.innerHTML = '<section class="workspace-tool-page"><header class="workspace-tool-header"><button type="button" class="workspace-tool-back" data-return-workbench>← 工作台</button><div><span>DELIVERIES</span><h2>' + escapeHtml(projectName) + '</h2></div></header><p class="workspace-tool-feedback">正在读取服务器交付状态…</p></section>';
      showView('deliveries');
      return;
    }
    const word = delivery.word?.status === 'ready'
      ? '<article class="workspace-delivery-card"><div><span>STEP04 WORD</span><strong>可打开</strong></div><a href="' + escapeHtml(delivery.word.openUrl) + '" target="_blank" rel="noopener">打开 Word</a><a href="' + escapeHtml(delivery.word.openUrl + '?download=1') + '">下载</a></article>'
      : '<article class="workspace-delivery-card is-pending"><div><span>STEP04 WORD</span><strong>尚未交付</strong></div></article>';
    const videos = Array.isArray(delivery.deliveries) ? delivery.deliveries.filter(item => item && item.type === 'video' && item.status === 'ready' && item.openUrl && item.downloadUrl) : [];
    const videoDeliveries = videos.length
      ? videos.map(item => '<article class="workspace-delivery-card workspace-video-delivery"><div><span>' + escapeHtml(item.label || '视频交付') + '</span><strong>可播放</strong></div><video controls preload="metadata" src="' + escapeHtml(item.openUrl) + '"></video><a href="' + escapeHtml(item.openUrl) + '" target="_blank" rel="noopener">打开视频</a><a href="' + escapeHtml(item.downloadUrl) + '">下载</a></article>').join('')
      : '';
    const current = delivery.currentStages || {};
    const blocker = redactBusinessBlocker(delivery.blocker);
    target.innerHTML = '<section class="workspace-tool-page"><header class="workspace-tool-header"><button type="button" class="workspace-tool-back" data-return-workbench>← 工作台</button><div><span>DELIVERIES</span><h2>' + escapeHtml(projectName) + '</h2></div></header><section class="workspace-delivery-summary"><article><span>转绘</span><strong>' + escapeHtml(current.redraw ? redrawBusinessState(redrawProjectForWorkspace(workspaceId)) : '未创建') + '</strong></article><article><span>短剧</span><strong>' + escapeHtml(current.shortDrama ? '处理中' : '未创建') + '</strong></article><article><span>需要处理</span><strong>' + escapeHtml(blocker || '暂无') + '</strong></article></section><section class="workspace-delivery-list">' + word + videoDeliveries + '</section><p class="workspace-tool-feedback">只有通过项目权限与完整性校验的真实交付物会出现在这里。</p></section>';
    showView('deliveries');
  }

  async function loadWorkspaceDeliveries(workspaceId) {
    if (!workspaceId || workspaceId === 'new') return;
    try {
      state.workspaceDeliveries[workspaceId] = await api('/api/workspace-projects/' + encodeURIComponent(workspaceId) + '/deliveries');
    } catch (error) {
      state.workspaceDeliveries[workspaceId] = {error:error.message || '项目交付暂不可读取'};
    }
    if (workspaceToolRoute()?.projectId === workspaceId && workspaceToolRoute()?.tool === 'deliveries') renderWorkspaceDeliveries();
  }

  function openRedrawIntake(workspaceId = '') {
    state.redrawIntakeWorkspaceId = workspaceId || null;
    state.redrawIntakeStatus = null;
    const targetHash = workspaceId ? 'workspace/' + encodeURIComponent(workspaceId) + '/redraw' : 'redraw-intake';
    if (location.hash !== '#' + targetHash) location.hash = targetHash;
    else renderRedrawIntake();
  }

  function openWorkspaceDeliveries(workspaceId) {
    if (!workspaceId) return;
    const targetHash = 'workspace/' + encodeURIComponent(workspaceId) + '/deliveries';
    if (location.hash !== '#' + targetHash) location.hash = targetHash;
    else renderWorkspaceDeliveries();
    void loadWorkspaceDeliveries(workspaceId);
  }

  function renderWorkbench() {
    if (!workbenchContent) return;
    workbenchContent.innerHTML = renderWorkbenchLauncher();
    animateWorkbenchEntry();
  }

  function renderWorkbenchLauncher() {
    const routeProjectKey = workbenchRoute()?.projectKey || '';
    const routeProjectId = routeProjectKey.includes(':') ? routeProjectKey.slice(routeProjectKey.indexOf(':') + 1) : routeProjectKey;
    const canvasHref = '/studio/#/studio' + (routeProjectId ? '?projectId=' + encodeURIComponent(routeProjectId) : '');
    return '<section class="workbench-launcher" aria-label="选择创作方式">'
      + '<a class="workbench-launch-card is-canvas" href="' + escapeHtml(canvasHref) + '">'
      + '<span class="workbench-launch-index" aria-hidden="true">01</span>'
      + '<span class="workbench-launch-copy"><span class="workbench-launch-kicker">念念画布</span><strong>无限画布</strong></span>'
      + '<span class="workbench-launch-arrow" aria-hidden="true">&#8594;</span>'
      + '</a>'
      + '<button class="workbench-launch-card" type="button" data-open-redraw-intake>'
      + '<span class="workbench-launch-index" aria-hidden="true">02</span>'
      + '<span class="workbench-launch-copy"><span class="workbench-launch-kicker">REFERENCE VIDEO</span><strong>一键转绘</strong></span>'
      + '<span class="workbench-launch-arrow" aria-hidden="true">&#8594;</span>'
      + '</button>'
      + '<button class="workbench-launch-card" type="button" data-open-script-drama-wizard>'
      + '<span class="workbench-launch-index" aria-hidden="true">03</span>'
      + '<span class="workbench-launch-copy"><span class="workbench-launch-kicker">SCRIPT TO DRAMA</span><strong>一键制剧</strong></span>'
      + '<span class="workbench-launch-arrow" aria-hidden="true">&#8594;</span>'
      + '</button>'
      + '<a class="workbench-launch-card" href="https://edit.cauai.fun/">'
      + '<span class="workbench-launch-index" aria-hidden="true">04</span>'
      + '<span class="workbench-launch-copy"><span class="workbench-launch-kicker">AI VIDEO EDITING</span><strong>智能剪辑</strong></span>'
      + '<span class="workbench-launch-arrow" aria-hidden="true">&#8594;</span>'
      + '</a>'
      + '</section>';
  }

  function animateWorkbenchEntry() {
    if (state.workbenchMotionPlayed) return;
    if (!canPlayStudioMotion()) return;
    window.requestAnimationFrame(() => {
      const panel = document.querySelector('[data-view-panel="workbench"]');
      if (!panel?.classList.contains('is-visible')) return;
      const targets = Array.from(panel.querySelectorAll('.workbench-launch-card'));
      if (!targets.length) return;
      state.workbenchMotionPlayed = true;
      window.gsap.killTweensOf(targets);
      window.gsap.set(targets, {autoAlpha:0, y:14});
      window.gsap.timeline({defaults:{ease:'power3.out'}}).to(targets, {autoAlpha:1, y:0, duration:.42, stagger:.07});
    });
  }

  function animateWorkbenchProjectSelection(flipState) {
    if (!canPlayStudioMotion()) return;
    window.requestAnimationFrame(() => {
      if (flipState && window.Flip) {
        window.gsap.registerPlugin(window.Flip);
        window.Flip.from(flipState, {duration:.3, ease:'power2.out', absolute:false, nested:true});
      }
      const inspector = workbenchContent?.querySelector('.workbench-project-inspector');
      if (inspector) window.gsap.fromTo(inspector, {autoAlpha:.55, x:8}, {autoAlpha:1, x:0, duration:.26, ease:'power2.out', overwrite:true});
    });
  }

  function workbenchSelectionKey(project) {
    return project ? ((project.projectKind || 'redraw') + ':' + project.id) : '';
  }

  function openProjectWorkbench(project) {
    if (!project?.id) return;
    state.activeProject = project;
    showView('projects');
    if (location.hash !== '#projects') location.hash = 'projects';
    renderProjects();
  }

  function workbenchCandidatePreview(project) {
    if (project?.projectKind !== 'script') return null;
    const review = state.workbenchReviews[project.id];
    const candidates = Array.isArray(review?.n05Candidates) ? review.n05Candidates : [];
    return candidates.find(item => item?.imageUrl && item.decision === 'confirm') || candidates.find(item => item?.imageUrl && item.decision !== 'reject') || null;
  }

  function workbenchCandidateAssets(project) {
    if (!project || (project.projectKind && project.projectKind !== 'script')) return [];
    const review = state.workbenchReviews[project.id];
    const assets = Array.isArray(review?.assets) ? review.assets : [];
    const frames = Array.isArray(review?.firstFrames) ? review.firstFrames : [];
    return (Array.isArray(review?.n05Candidates) ? review.n05Candidates : [])
      .filter(candidate => candidate?.id && candidate?.imageUrl)
      .map(candidate => {
        const asset = assets.find(item => String(item?.assetId || '') === String(candidate.id));
        const frame = frames.find(item => String(item?.refKey || '') === String(candidate.id));
        const duty = String(asset?.referenceDuty || frame?.referenceDuty || '当前候选仅用于人工审核。');
        const rawLabel = duty.split(/[：:]/)[0].trim();
        return {
          ...candidate,
          label: rawLabel && rawLabel.length <= 28 ? rawLabel : (frame?.videoGroupId ? (frame.videoGroupId + ' 上传首帧') : '审核候选'),
          duty,
          scope: String(asset?.scope || (frame?.videoGroupId ? ('用于 ' + frame.videoGroupId + ' 首帧计划') : '等待镜头引用'))
        };
      })
      .sort((left, right) => Number(right.decision === 'confirm') - Number(left.decision === 'confirm'));
  }

  function workbenchAssetDecisionLabel(candidate) {
    return candidate?.decision === 'confirm' ? '已确认' : (candidate?.decision === 'reject' ? '已否决' : (candidate?.decision === 'regenerate' ? '待重做' : '待审核'));
  }

  function renderWorkbenchAssetCatalog(project) {
    const candidates = workbenchCandidateAssets(project);
    if (!candidates.length) return '<div class="workbench-inspector-placeholder"><i aria-hidden="true"></i><p>这个项目尚未返回可查看的候选资产。</p></div>';
    const selected = candidates.find(candidate => candidate.id === state.workbenchAssetId) || candidates[0];
    state.workbenchAssetId = selected.id;
    const confirmedCount = candidates.filter(candidate => candidate.decision === 'confirm').length;
    const catalog = candidates.map(candidate => '<button class="workbench-asset-option' + (candidate.id === selected.id ? ' is-selected' : '') + '" type="button" data-workbench-asset="' + escapeHtml(candidate.id) + '" aria-pressed="' + String(candidate.id === selected.id) + '"><img src="' + escapeHtml(candidate.imageUrl) + '" alt="' + escapeHtml(candidate.label + '候选缩略图') + '"><span>' + escapeHtml(workbenchAssetDecisionLabel(candidate)) + '</span><strong>' + escapeHtml(candidate.label) + '</strong></button>').join('');
    return '<section class="workbench-asset-catalog" aria-label="候选资产"><header><div><span>候选资产</span><strong>' + escapeHtml(String(confirmedCount)) + ' / ' + escapeHtml(String(candidates.length)) + ' 已确认</strong></div><small>只展示当前项目的可审核候选</small></header><button class="workbench-asset-focus" type="button" data-open-workbench-asset-viewer="' + escapeHtml(selected.id) + '"><img src="' + escapeHtml(selected.imageUrl) + '" alt="' + escapeHtml(selected.label + '候选大图') + '"><span>查看大图</span></button><section class="workbench-asset-summary"><div><span>' + escapeHtml(workbenchAssetDecisionLabel(selected)) + '</span>' + productionStatusPill(workbenchAssetDecisionLabel(selected), selected.decision) + '</div><strong>' + escapeHtml(selected.label) + '</strong><p>' + escapeHtml(selected.scope) + '</p><small>自动评分 ' + escapeHtml(String(selected.qaScore || '-')) + ' · 当前版本已校验</small></section><div class="workbench-asset-options">' + catalog + '</div></section>';
  }

  function renderWorkbenchAssetViewer() {
    if (!assetViewer) return;
    const viewer = state.workbenchAssetViewer;
    const project = state.scriptProjects.find(item => item.id === viewer?.projectId);
    const candidate = workbenchCandidateAssets(project).find(item => item.id === viewer?.candidateId);
    if (!project || !candidate) {
      assetViewer.hidden = true;
      return;
    }
    assetViewer.innerHTML = '<section class="asset-viewer" role="dialog" aria-modal="true" aria-labelledby="assetViewerTitle"><header><div><span>候选资产</span><h2 id="assetViewerTitle">' + escapeHtml(candidate.label) + '</h2><p>' + escapeHtml(candidate.scope) + '</p></div><button type="button" data-close-workbench-asset-viewer aria-label="关闭大图">×</button></header><div class="asset-viewer-image"><img src="' + escapeHtml(candidate.imageUrl) + '" alt="' + escapeHtml(candidate.label + '候选大图') + '"></div><footer><div>' + productionStatusPill(workbenchAssetDecisionLabel(candidate), candidate.decision) + '<span>自动评分 ' + escapeHtml(String(candidate.qaScore || '-')) + '</span></div><p>' + escapeHtml(candidate.duty) + '</p></footer></section>';
    assetViewer.hidden = false;
    requestAnimationFrame(() => assetViewer.querySelector('[data-close-workbench-asset-viewer]')?.focus({preventScroll:true}));
  }

  function closeWorkbenchAssetViewer() {
    if (!assetViewer || assetViewer.hidden) return;
    assetViewer.hidden = true;
    assetViewer.innerHTML = '';
    state.workbenchAssetViewer = null;
    state.assetViewerReturnFocus?.focus?.({preventScroll:true});
    state.assetViewerReturnFocus = null;
  }

  async function hydrateWorkbenchProjectReview(project) {
    if (!project || project.projectKind !== 'script' || state.workbenchReviews[project.id] || state.workbenchReviewLoading[project.id]) return;
    state.workbenchReviewLoading[project.id] = true;
    try {
      const payload = await api('/api/script-projects/' + encodeURIComponent(project.id) + '/n04-review');
      state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
      state.workbenchReviews[project.id] = payload.review;
      if (state.workbenchSelectionKey === workbenchSelectionKey(project)) renderWorkbench();
    } catch {
      // The project stays usable without an optional visual preview.
    } finally {
      delete state.workbenchReviewLoading[project.id];
    }
  }

  function workbenchActivityTime(value) {
    const timestamp = new Date(value || 0);
    if (Number.isNaN(timestamp.getTime())) return '刚刚';
    return new Intl.DateTimeFormat('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false}).format(timestamp);
  }

  function renderWorkbenchActivity(activity, {loading = false} = {}) {
    if (loading) return '<div class="workbench-inspector-placeholder" aria-live="polite"><i aria-hidden="true"></i><p>正在读取项目动态，只显示已确认的项目、审核与质量门事实。</p></div>';
    const events = Array.isArray(activity?.events) ? activity.events : [];
    if (!events.length) return '<div class="workbench-inspector-placeholder"><i aria-hidden="true"></i><p>当前项目还没有可展示的制作动态。</p></div>';
    return '<section class="workbench-project-activity" aria-label="项目动态">' + events.map(event => '<article class="workbench-activity-event is-' + escapeHtml(event.tone === 'ready' ? 'ready' : (event.tone === 'active' ? 'active' : 'waiting')) + '" data-workbench-activity-event><time datetime="' + escapeHtml(event.at || '') + '">' + escapeHtml(workbenchActivityTime(event.at)) + '</time><div><span>' + escapeHtml(event.kind === 'video' ? '视频' : (event.kind === 'review' ? '审核' : (event.kind === 'source' ? '原文' : '进度'))) + '</span><strong>' + escapeHtml(event.title || '项目动态') + '</strong><p>' + escapeHtml(event.description || '') + '</p></div></article>').join('') + '</section>';
  }

  async function hydrateWorkbenchProjectActivity(project) {
    const cached = project ? state.workbenchActivities[project.id] : null;
    if (!project || project.projectKind !== 'script' || cached || state.workbenchActivityLoading[project.id]) return;
    state.workbenchActivityLoading[project.id] = true;
    const focusedElement = document.activeElement;
    try {
      const payload = await api('/api/script-projects/' + encodeURIComponent(project.id) + '/activity');
      state.workbenchActivities[project.id] = payload.activity;
      delete state.workbenchActivityLoading[project.id];
      const shouldRestoreFocus = document.activeElement === focusedElement && focusedElement?.matches?.('[data-workbench-tab="activity"]');
      if (state.workbenchSelectionKey === workbenchSelectionKey(project) && state.workbenchTab === 'activity') {
        renderWorkbench();
        if (shouldRestoreFocus) requestAnimationFrame(() => workbenchContent?.querySelector('[data-workbench-tab="activity"]')?.focus({preventScroll:true}));
      }
    } catch {
      state.workbenchActivities[project.id] = {events:[]};
      if (state.workbenchSelectionKey === workbenchSelectionKey(project) && state.workbenchTab === 'activity') renderWorkbench();
    } finally {
      delete state.workbenchActivityLoading[project.id];
    }
  }

  function renderPublicWorkbenchPreview() {
    const flows = [
      {
        type:'小说短剧',
        project:'雾城夜航 · 概念样片',
        current:'01',
        next:'整理原文与改编范围',
        description:'从原文与改编范围出发，完成角色、分镜、视频与交付。',
        stages:[
          ['01','故事设定','原文、范围与事实账本'],
          ['02','角色与分集','角色关系与资产职责'],
          ['03','智能分镜','首帧计划与镜头生产包'],
          ['04','视频与交付','媒体 QA 与交付记录']
        ]
      },
    ];
    const flowCards = flows.map(flow => {
      const stages = flow.stages.map(stage => {
        const number = Number(stage[0]);
        const current = Number(flow.current);
        const state = number < current ? '已验证' : (number === current ? '当前阶段' : '等待上游');
        const classes = number < current ? 'is-complete' : (number === current ? 'is-current' : 'is-locked');
        return '<li class="public-preview-stage ' + classes + '"><span>' + (number < current ? '✓' : stage[0]) + '</span><div><strong>' + escapeHtml(stage[1]) + '</strong><small>' + escapeHtml(stage[2]) + '</small></div><em>' + escapeHtml(state) + '</em></li>';
      }).join('');
      return '<article class="public-preview-project"><header><div><span>' + escapeHtml(flow.type) + ' · 脱敏演示</span><h3>' + escapeHtml(flow.project) + '</h3></div><strong>' + escapeHtml('阶段 ' + flow.current + ' / 04') + '</strong></header><p>' + escapeHtml(flow.description) + '</p><ol>' + stages + '</ol><footer><div><span>演示中的下一步</span><strong>' + escapeHtml(flow.next) + '</strong></div><button type="button" data-modal="login">登录后使用真实工作台</button></footer></article>';
    }).join('');
    return '<section class="public-workbench" aria-label="公开工作台预览"><header class="public-workbench-hero"><div><span>念念 AI · 公开制作台</span><h3>看清每一步，再开始真实创作</h3><p>这是独立脱敏演示：展示短剧阶段、质量门与下一步，不读取任何真实项目内容。</p></div><div class="public-workbench-hero-meta"><strong>只读演示</strong><small>无项目数据 · 无生产提交</small><button type="button" data-modal="login">登录</button></div></header><section class="public-workbench-intent"><article><span>现在在哪</span><strong>制作阶段与当前质量门始终可见</strong></article><article><span>能做什么</span><strong>只展示当前允许的真实行动</strong></article><article><span>为什么锁定</span><strong>未来阶段明确说明前置条件</strong></article></section><div class="public-preview-grid">' + flowCards + '</div><footer class="public-workbench-footer"><p>登录后，同一工作台会只读取当前账户自己的项目，并恢复真实的阶段、质量门和下一步。</p><button type="button" data-modal="login">登录并进入工作台</button></footer></section>';
  }

  function renderWorkbenchDeck({ isSignedIn }) {
    const workspaceNav = isSignedIn
      ? '<aside class="workbench-app-nav"><div class="workbench-workspace-switcher"><span class="workbench-workspace-mark" aria-hidden="true"><img class="brand-logo-image" src="./assets/brand/niannian-ai-authority-gold.svg" alt="" /></span><div><strong>念念 AI</strong><small>个人工作区</small></div><b aria-hidden="true">&#8942;</b></div><nav class="workbench-app-navigation" aria-label="工作区导航"><span class="is-active"><i aria-hidden="true"></i>项目工作台</span><button type="button" data-workbench-view="projects"><i aria-hidden="true"></i>项目管理</button></nav><div class="workbench-app-nav-footer"><span>开始创建</span><button type="button" data-open-script-drama-wizard><i class="workbench-nav-icon workbench-nav-icon-script" aria-hidden="true"></i>小说短剧</button></div></aside>'
      : '';
    if (!isSignedIn) return renderPublicWorkbenchPreview();

    const rows = state.scriptProjects
      .map(project => ({ ...project, projectKind: 'script' }))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    const selectedProject = rows.find(project => workbenchSelectionKey(project) === state.workbenchSelectionKey) || rows[0] || null;
    if (selectedProject) state.workbenchSelectionKey = workbenchSelectionKey(selectedProject);
    void hydrateWorkbenchProjectReview(selectedProject);
    const activeRows = rows.filter(project => !/completed|user_visible_acceptance|sent/.test(String(project.runtime?.productionStatus || project.status || '').toLowerCase()));
    const cardFor = project => {
      const isScript = project.projectKind === 'script';
      const runtime = project.runtime || {};
      const node = isScript ? (runtime.currentNode || runtime.earliestIncompleteNode || 'N00') : (runtime.currentNode || runtime.earliestIncompleteNode || project.route?.earliestNode || 'Step01');
      const stateLabel = isScript ? projectStatusLabel(project) : statusLabel(runtime.productionStatus || project.status);
      const nextAction = humanizeProjectNextAction(runtime.nextAction, isScript ? '进入制作台查看本集的下一步。' : '进入制作台查看当前质量门和下一步。');
      const typeLabel = isScript ? '小说短剧' : '视频转绘';
      const selected = workbenchSelectionKey(project) === state.workbenchSelectionKey;
      const preview = workbenchCandidatePreview(project);
      const visual = preview
        ? '<div class="workbench-project-card-preview has-media"><img src="' + escapeHtml(preview.imageUrl) + '" alt="' + escapeHtml(project.name + ' 已确认候选图') + '"><span>' + escapeHtml(node) + '</span></div>'
        : '<div class="workbench-project-card-preview" aria-hidden="true"><span>' + escapeHtml(node) + '</span><i></i><i></i><i></i></div>';
      return '<button class="workbench-project-card is-' + project.projectKind + (selected ? ' is-selected' : '') + '" type="button" data-workbench-project="' + escapeHtml(workbenchSelectionKey(project)) + '" data-flip-id="workbench-project-' + escapeHtml(workbenchSelectionKey(project)) + '" aria-pressed="' + escapeHtml(String(selected)) + '">' + visual + '<div class="workbench-project-card-copy"><span>' + typeLabel + '</span><strong>' + escapeHtml(project.name) + '</strong><p>' + escapeHtml(nextAction) + '</p></div><footer>' + productionStatusPill(stateLabel, runtime.productionStatus || project.status) + '<b aria-hidden="true">&#8594;</b></footer></button>';
    };
    const attention = activeRows.slice(0, 4).map(project => {
      const isScript = project.projectKind === 'script';
      const runtime = project.runtime || {};
      const action = 'data-open-script-studio';
      const node = runtime.currentNode || 'N00';
      return '<button class="workbench-attention-item" type="button" ' + action + '="' + escapeHtml(project.id) + '"><span>' + escapeHtml(node) + '</span><strong>' + escapeHtml(project.name) + '</strong><small>' + escapeHtml(humanizeProjectNextAction(runtime.nextAction, projectStatusLabel(project))) + '</small></button>';
    }).join('');
    const projectRegion = rows.length
      ? '<div class="workbench-project-grid">' + rows.slice(0, 6).map(cardFor).join('') + '</div>'
      : '<section class="workbench-empty-workspace"><div class="workbench-empty-symbol" aria-hidden="true"><i></i><i></i><i></i></div><h3>创建第一个项目</h3><p>新项目会在当前工作台里完成审核、生成与交付。</p><div><button class="workbench-primary-action" type="button" data-open-script-drama-wizard>新建小说短剧</button></div></section>';
    const selectedPreview = workbenchCandidatePreview(selectedProject);
    const selectedRuntime = selectedProject?.runtime || {};
    const selectedIsScript = selectedProject?.projectKind === 'script';
    const selectedAction = selectedIsScript ? 'data-open-script-studio' : 'data-open-redraw-studio';
    const selectedGate = selectedRuntime.blocker ? '当前阻塞' : (selectedRuntime.gateState || selectedProject?.gates?.video_provider || '等待质量门');
    const selectedStageId = selectedProject
      ? (selectedIsScript
          ? scriptStageForNode(selectedRuntime.currentNode, selectedRuntime.earliestIncompleteNode)
          : redrawStageForProject(selectedProject))
      : '01';
    const selectedStage = productionStageDefinitions(selectedIsScript ? 'script' : 'redraw').find(stage => stage.id === selectedStageId) || productionStageDefinitions(selectedIsScript ? 'script' : 'redraw')[0];
    const selectedNextAction = humanizeProjectNextAction(selectedRuntime.nextAction, '进入制作台查看当前质量门和下一步。');
    const selectedProgress = Math.max(0, Math.min(100, Math.round(Number(selectedStageId) / (selectedIsScript ? 4 : 7) * 100)));
    const currentProjectOverview = selectedProject
      ? '<section class="workbench-current-project" aria-label="当前项目与下一步"><header><div><span>继续当前项目</span><h3>' + escapeHtml(selectedProject.name) + '</h3><small>' + escapeHtml(selectedIsScript ? '小说短剧' : '视频转绘') + ' · 阶段 ' + escapeHtml(selectedStageId) + ' / ' + (selectedIsScript ? '04' : '07') + '</small></div>' + productionStatusPill(selectedRuntime.blocker ? '等待处理' : projectStatusLabel(selectedProject), selectedRuntime.blocker || selectedRuntime.productionStatus || selectedProject.status) + '</header><div class="workbench-current-progress" aria-label="当前进度 ' + escapeHtml(String(selectedProgress)) + '%"><i style="--workbench-progress:' + escapeHtml(String(selectedProgress)) + '%"></i></div><dl><div><dt>当前阶段</dt><dd>' + escapeHtml(selectedStage.label) + '</dd></div><div><dt>质量门</dt><dd>' + escapeHtml(humanizeProductionGate(selectedGate)) + '</dd></div><div><dt>唯一下一步</dt><dd>' + escapeHtml(selectedNextAction) + '</dd></div></dl><button type="button" ' + selectedAction + '="' + escapeHtml(selectedProject.id) + '">继续制作 <b aria-hidden="true">&#8594;</b></button></section>'
      : '';
    const selectedVisual = selectedPreview
      ? '<div class="workbench-inspector-media"><img src="' + escapeHtml(selectedPreview.imageUrl) + '" alt="' + escapeHtml(selectedProject.name + ' 已确认候选图') + '"><span>已确认候选 · 自动评分 ' + escapeHtml(String(selectedPreview.qaScore || '-')) + '</span></div>'
      : '<div class="workbench-inspector-placeholder"><i aria-hidden="true"></i><p>' + escapeHtml(selectedIsScript ? '正在读取已确认候选和首帧资产。' : '这个项目还没有可在工作台展示的已验证媒体。') + '</p></div>';
    const tab = ['overview','assets','video','activity'].includes(state.workbenchTab) ? state.workbenchTab : 'overview';
    const selectedActivity = selectedIsScript ? state.workbenchActivities[selectedProject?.id] : null;
    if (tab === 'activity' && selectedIsScript) void hydrateWorkbenchProjectActivity(selectedProject);
    const inspectorBody = tab === 'assets'
      ? (selectedIsScript ? renderWorkbenchAssetCatalog(selectedProject) : '<div class="workbench-inspector-placeholder"><i aria-hidden="true"></i><p>这个项目尚未返回可展示的候选资产。</p></div>')
      : (tab === 'video' ? '<dl class="workbench-context-facts"><div><dt>当前节点</dt><dd>' + escapeHtml(selectedRuntime.currentNode || '等待锁定') + '</dd></div><div><dt>视频状态</dt><dd>' + escapeHtml(humanizeProductionGate(selectedProject?.gates?.video_provider || selectedGate)) + '</dd></div><div><dt>回执</dt><dd>' + escapeHtml(humanizeProductionGate(selectedRuntime.resultStatus || 'N06_not_submitted')) + '</dd></div></dl>' : (tab === 'activity' ? (selectedIsScript ? renderWorkbenchActivity(selectedActivity, {loading:Boolean(state.workbenchActivityLoading[selectedProject?.id])}) : renderWorkbenchActivity({events:[{at:selectedProject?.updatedAt || selectedProject?.createdAt, kind:'progress', tone:selectedRuntime.blocker ? 'waiting' : 'active', title:'当前制作进度', description:humanizeProjectNextAction(selectedRuntime.nextAction, '进入制作台查看当前质量门。')}]})) : selectedVisual + '<dl class="workbench-context-facts"><div><dt>下一步</dt><dd>' + escapeHtml(humanizeProjectNextAction(selectedRuntime.nextAction, '进入项目查看当前质量门。')) + '</dd></div><div><dt>质量门</dt><dd>' + escapeHtml(humanizeProductionGate(selectedGate)) + '</dd></div><div><dt>已验证</dt><dd>' + escapeHtml(String(selectedRuntime.verifiedArtifactCount || 0)) + ' 个产物</dd></div></dl>'));
    const inspector = selectedProject
      ? '<aside class="workbench-context-panel workbench-project-inspector" data-flip-id="workbench-inspector"><header><span>当前项目</span><h3>' + escapeHtml(selectedProject.name) + '</h3><small>' + escapeHtml(selectedIsScript ? '小说短剧' : '视频转绘') + ' · ' + escapeHtml(selectedRuntime.currentNode || selectedProject.route?.earliestNode || '准备中') + '</small>' + productionStatusPill(selectedRuntime.blocker ? '等待处理' : humanizeProductionGate(selectedGate), selectedRuntime.blocker || selectedGate) + '</header><nav class="workbench-inspector-tabs" aria-label="项目检查器"><button class="' + (tab === 'overview' ? 'is-active' : '') + '" type="button" data-workbench-tab="overview" aria-pressed="' + String(tab === 'overview') + '">概览</button><button class="' + (tab === 'assets' ? 'is-active' : '') + '" type="button" data-workbench-tab="assets" aria-pressed="' + String(tab === 'assets') + '">候选</button><button class="' + (tab === 'video' ? 'is-active' : '') + '" type="button" data-workbench-tab="video" aria-pressed="' + String(tab === 'video') + '">视频</button><button class="' + (tab === 'activity' ? 'is-active' : '') + '" type="button" data-workbench-tab="activity" aria-pressed="' + String(tab === 'activity') + '">动态</button></nav>' + inspectorBody + (selectedIsScript ? '' : '<section class="workbench-media-delivery-action"><span class="eyebrow">MEDIA DELIVERY</span><p>' + escapeHtml(state.workbenchMediaDelivery[selectedProject.id]?.message || '准备后，图片与源视频将改走私有 COS 直连。') + '</p><button class="workbench-quiet-action" type="button" data-migrate-media="' + escapeHtml(selectedProject.id) + '"' + (state.workbenchMediaDelivery[selectedProject.id]?.running ? ' disabled' : '') + '>' + escapeHtml(state.workbenchMediaDelivery[selectedProject.id]?.running ? '正在准备媒体直连...' : (state.workbenchMediaDelivery[selectedProject.id]?.status === 'completed' ? '媒体直连已准备' : '准备媒体直连')) + '</button></section>') + '<button class="workbench-context-link" type="button" ' + selectedAction + '="' + escapeHtml(selectedProject.id) + '">进入制作台 <b aria-hidden="true">&#8594;</b></button></aside>'
      : '<aside class="workbench-context-panel"><header><span>待处理</span><h3>制作提醒</h3></header><div class="workbench-context-empty"><p>当前没有待处理项目。审核、质量门和需要你确认的候选会在这里出现。</p></div><button class="workbench-context-link" type="button" data-workbench-view="projects">查看项目管理 <b aria-hidden="true">&#8594;</b></button></aside>';
    return '<section class="workbench-app-shell" aria-label="项目工作台">' + workspaceNav + '<section class="workbench-canvas"><header class="workbench-canvas-header"><div><span>当前任务</span><h3>项目工作台 <b>' + rows.length + ' 个项目</b></h3></div><div class="workbench-canvas-actions"><button class="workbench-canvas-filter" type="button" data-workbench-view="projects">项目管理</button><button class="workbench-canvas-new" type="button" data-open-script-drama-wizard>新建项目 <b aria-hidden="true">+</b></button></div></header>' + currentProjectOverview + (rows.length ? '<div class="workbench-projects-heading"><span>项目与历史</span><small>选择其他项目会更新右侧检查器</small></div>' : '') + projectRegion + '</section>' + inspector + '</section>';
  }

  function renderGuide({animate = false} = {}) {
    if (!guideStepList || !guideFocus) return;
    const preservedScrollY = animate ? window.scrollY : null;
    const flow = guideFlows[state.guideFlow] || guideFlows.novel;
    const steps = flow.steps;
    const current = steps.find(step => step.id === state.guideStepId) || steps[0];
    state.guideStepId = current.id;
    const guideMode = document.getElementById('guideModeSwitch');
    const guideChecklist = document.getElementById('guideChecklist');
    if (guideMode) guideMode.innerHTML = Object.entries(guideFlows).map(([id, item]) => '<button type="button" class="guide-mode-button' + (id === state.guideFlow ? ' is-active' : '') + '" aria-pressed="' + String(id === state.guideFlow) + '" data-guide-flow="' + id + '">' + escapeHtml(item.label) + '</button>').join('');
    guideStepList.innerHTML = steps.map(step => '<button type="button" class="guide-step' + (step.id === current.id ? ' is-active' : '') + '" aria-pressed="' + String(step.id === current.id) + '" data-guide-step="' + step.id + '"><span>' + step.index + '</span><strong>' + step.title + '</strong></button>').join('');
    guideFocus.innerHTML = '<span class="eyebrow">' + escapeHtml(flow.eyebrow) + ' · ' + current.id + '</span><h3>' + escapeHtml(current.title) + '</h3><p>' + escapeHtml(current.summary) + '</p><div class="guide-output"><span>本阶段要交付什么</span><ul>' + current.outputs.map(output => '<li>' + escapeHtml(output) + '</li>').join('') + '</ul></div><dl><div><dt>进入条件</dt><dd>' + escapeHtml(current.gate) + '</dd></div><div><dt>完成后去哪里</dt><dd>' + escapeHtml(current.next) + '</dd></div></dl>';
    if (guideChecklist) guideChecklist.innerHTML = '<span class="eyebrow">START HERE</span><h3>开始前准备</h3><ul>' + flow.checklist.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul><button class="guide-inline-action" type="button" ' + flow.startAction + '>' + escapeHtml(flow.startLabel) + '</button>';
    if (animate) animateGuideFocus(current.id);
    else state.guideMotionKey = current.id;
    if (preservedScrollY !== null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (window.scrollY !== preservedScrollY) window.scrollTo({top:preservedScrollY, behavior:'auto'});
        });
      });
    }
  }

  function sanitizeProjectDetail() {
    if (!detail) return;
    const hiddenLabels = new Set(['首个技能', '下一技能', '任务合同', '员工线程']);
    const statusLabels = new Set(['生产状态', '阻塞原因', '质量门']);
    for (const row of detail.querySelectorAll('dl > div')) {
      const label = row.querySelector('dt');
      const value = row.querySelector('dd');
      if (!label || !value) continue;
      const text = label.textContent?.trim() || '';
      if (hiddenLabels.has(text)) {
        row.remove();
        continue;
      }
      if (text === 'Codex 员工') label.textContent = '执行状态';
      if (text === '控制器心跳') label.textContent = '最后同步';
      if (text === '严格 Runtime') label.textContent = '严格校验';
      if (text === '缺少能力' && value.textContent?.trim() !== '无已回传缺项') value.textContent = '仍有待补齐条件';
      if (text === '自动恢复' && /暂不满足|Runtime/i.test(value.textContent || '')) value.textContent = '当前不满足自动恢复条件';
      if (statusLabels.has(text)) value.textContent = humanizeProductionGate(value.textContent);
    }
  }

  function renderDetail(project) {
    // Historical project routes now return to project management because the
    // retired video-redraw studio is no longer a user-facing surface.
    if (!project?.id) return;
    state.activeProject = project;
    state.workbenchProjectId = project.id;
    showView('projects');
    location.hash = 'projects';
  }

  function hasPendingSourceReplacement() {
    const input = document.querySelector('[data-source-replacement] input[type="file"]');
    return Boolean(input && input.files && input.files.length);
  }

  function shouldPreserveSourceReplacement() {
    return state.sourceReplacementSelectionOpen || hasPendingSourceReplacement();
  }

  function isEditingScriptCandidate(projectId = state.scriptStudioProjectId) {
    return Boolean(state.scriptDecisionDraft && state.scriptDecisionDraft.projectId === projectId);
  }

  async function loadProjects({source = 'manual'} = {}) {
    if (state.loadingProjects) return;
    if (!state.user) {
      closeProjectEventStream();
      state.projects = [];
      state.scriptProjects = [];
      state.workspaceProjects = [];
      renderProjects();
      renderWorkbench();
      renderTeam();
      return false;
    }
    const visibleRedrawRoute = redrawStudioRoute();
    const visibleRedrawProject = visibleRedrawRoute ? state.projects.find(item => item.id === visibleRedrawRoute.projectId) : null;
    const visibleRedrawFingerprint = redrawStudioProjectionFingerprint(visibleRedrawProject);
    const visibleRedrawStage = state.redrawStudioStageId;
    state.loadingProjects = true;
    try {
      const [projectPayload, scriptPayload, workspacePayload] = await Promise.all([api('/api/projects'), api('/api/script-projects'), api('/api/workspace-projects')]);
      state.projects = projectPayload.projects || [];
      state.scriptProjects = scriptPayload.projects || [];
      state.workspaceProjects = workspacePayload.projects || [];
      state.projectEventRevision = Math.max(
        state.projectEventRevision,
        Number(projectPayload.revision) || 0,
        Number(scriptPayload.revision) || 0
      );
      state.workbenchActivities = {};
      renderProjects();
      renderWorkbench();
      renderTeam();
      openProjectEventStream();
      const projectId = location.hash.startsWith('#project/') ? location.hash.slice(9) : '';
      const scriptRoute = scriptStudioRoute();
      const redrawRoute = redrawStudioRoute();
      const evidenceRoute = referenceEvidenceRoute();
      const workspaceRoute = workspaceToolRoute();
      if (projectId) {
        const project = state.projects.find(item => item.id === projectId);
        if (project && !shouldPreserveSourceReplacement()) renderDetail(project);
      }
      if (scriptRoute && !isEditingScriptCandidate(scriptRoute.projectId)) {
        const hasVisibleN06Review = state.scriptStudioProjectId === scriptRoute.projectId && state.scriptStudioStageId === '04' && state.scriptN06Review?.projectId === scriptRoute.projectId;
        if (hasVisibleN06Review || isEditingScriptN06(scriptRoute.projectId)) {
          void hydrateScriptN06Review(scriptRoute.projectId);
        } else {
          state.scriptStudioStageId = scriptRoute.stageId || null;
          openScriptStudio(scriptRoute.projectId, {updateHash:false});
        }
      }
      if (redrawRoute) {
        const nextRedrawProject = state.projects.find(item => item.id === redrawRoute.projectId) || null;
        const nextRedrawFingerprint = redrawStudioProjectionFingerprint(nextRedrawProject);
        const keepStableStage01 = redrawRoute.stageId === '01'
          && state.redrawStudioProjectId === redrawRoute.projectId
          && visibleRedrawStage === '01'
          && visibleRedrawFingerprint === nextRedrawFingerprint;
        if (!keepStableStage01) {
          state.redrawStudioStageId = redrawRoute.stageId || null;
          openRedrawStudio(redrawRoute.projectId, {updateHash:false});
        }
      }
      if (evidenceRoute) openReferenceEvidenceStudio({updateHash:false});
      if (workspaceRoute?.tool === 'redraw') {
        state.redrawIntakeWorkspaceId = workspaceRoute.projectId;
        renderRedrawIntake();
      }
      if (workspaceRoute?.tool === 'deliveries') {
        renderWorkspaceDeliveries();
        void loadWorkspaceDeliveries(workspaceRoute.projectId);
      }
      return true;
    } catch (error) {
      if (error.code === 'AUTH_REQUIRED') {
        state.user = null;
        closeProjectEventStream();
        state.projects = [];
        state.scriptProjects = [];
        updateAuthUi();
        renderProjects();
        renderWorkbench();
      } else if (list) {
        list.innerHTML = '<div class="project-empty"><strong>项目服务未连接</strong><span>' + escapeHtml(error.message) + '</span></div>';
      }
      return false;
    } finally {
      state.loadingProjects = false;
    }
  }

  document.addEventListener('change', event => {
    const selector = event.target.closest('[data-redraw-workspace-select]');
    if (!selector) return;
    openRedrawIntake(selector.value || '');
  });

  document.addEventListener('submit', async event => {
    const intake = event.target.closest('#redrawIntakeForm');
    if (!intake) return;
    event.preventDefault();
    const submit = intake.querySelector('[type="submit"]');
    const workspaceId = String(intake.querySelector('[name="workspaceProjectId"]')?.value || '').trim();
    const sourceVideo = intake.querySelector('[name="sourceVideo"]')?.files?.[0];
    if (!sourceVideo) {
      state.redrawIntakeStatus = '请选择 MP4 或 MOV 原片。';
      renderRedrawIntake();
      return;
    }
    submit.disabled = true;
    state.redrawIntakeStatus = '正在安全上传原片并创建项目任务…';
    renderRedrawIntake();
    try {
      const data = new FormData(intake);
      if (!workspaceId) data.delete('workspaceProjectId');
      const idempotencyKey = 'web-redraw-' + (window.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)));
      const payload = await api('/api/projects', {method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:data});
      const project = payload.project;
      state.projects = [project, ...state.projects.filter(item => item.id !== project.id)];
      const boundWorkspaceId = project.workspaceProjectId || project.id;
      state.redrawIntakeWorkspaceId = boundWorkspaceId;
      state.redrawIntakeStatus = '任务已创建，正在读取服务器状态。';
      await loadProjects({source:'redraw-intake-created'});
      openRedrawIntake(boundWorkspaceId);
    } catch (error) {
      state.redrawIntakeStatus = error.message || '创建任务失败，请重试。';
      renderRedrawIntake();
    }
  });

  document.addEventListener('click', async event => {
    const step02ProjectId = state.redrawStudioProjectId;
    if (event.target.closest('[data-open-step01-role-cards]')) {
      location.hash = 'redraw/' + encodeURIComponent(step02ProjectId) + '/stage/01?panel=role-cards';
      return;
    }
    const sourceTruth = event.target.closest('[data-open-source-truth]');
    if (sourceTruth) { location.hash='redraw-source-truth/'+encodeURIComponent(sourceTruth.dataset.projectId); return; }
    const acceptHaikaStep02 = event.target.closest('[data-accept-haika-step02]');
    if (acceptHaikaStep02) { await acceptHaikaNativeStep02(acceptHaikaStep02.dataset.projectId, acceptHaikaStep02); return; }
    const confirmStep01 = event.target.closest('[data-confirm-step01]');
    if (confirmStep01) { await confirmStep01ForStep02(confirmStep01.dataset.projectId); return; }
    if (event.target.closest('[data-dismiss-step01-confirm-error]')) { state.step02Action=null; renderRedrawStudio(state.projects.find(item=>item.id===step02ProjectId)); return; }
    if (event.target.closest('[data-go-step01]')) {
      state.redrawStudioStageId='01';
      state.step02Draft=null; state.step02Candidate=null;
      location.hash='redraw/'+encodeURIComponent(step02ProjectId)+'/stage/01';
      openRedrawStudio(step02ProjectId,{updateHash:false});
      return;
    }
    if (event.target.closest('[data-retry-step02]')) { void hydrateStep02(step02ProjectId,{force:true}); return; }
    if (event.target.closest('[data-open-step02-market]')) { state.step02MarketModal={projectId:step02ProjectId,locale:'es-MX',error:null,busy:false}; renderRedrawStudio(state.projects.find(item=>item.id===step02ProjectId)); return; }
    if (event.target.closest('[data-close-step02-market]')) { state.step02MarketModal=null; renderRedrawStudio(state.projects.find(item=>item.id===step02ProjectId)); return; }
    const localeChoice = event.target.closest('[data-step02-locale]');
    if (localeChoice && state.step02MarketModal) { state.step02MarketModal.locale=localeChoice.dataset.step02Locale; renderRedrawStudio(state.projects.find(item=>item.id===step02ProjectId)); return; }
    if (event.target.closest('[data-create-step02-variant]')) { await createStep02Variant(step02ProjectId); return; }
    const marketEntry=event.target.closest('[data-enter-step02-market]');
    if(marketEntry){const locale=marketEntry.dataset.enterStep02Market;const existing=(state.step02VariantLists[step02ProjectId]||[]).find(item=>item.locale===locale);state.redrawMarketLocale=locale;if(existing){state.step02VariantId=existing.variant_id;state.step02SelectedShotId=null;location.hash='redraw/'+encodeURIComponent(step02ProjectId)+'/stage/02/market/'+locale;await hydrateStep02(step02ProjectId,{force:true});}else{state.step02MarketModal={projectId:step02ProjectId,locale,error:null,busy:false};renderRedrawStudio(state.projects.find(item=>item.id===step02ProjectId));}return;}
    const variantChoice = event.target.closest('[data-step02-variant]');
    if (variantChoice) { if (state.step02Draft?.dirty) return; state.step02VariantId=variantChoice.dataset.step02Variant; const selectedVariant=(state.step02VariantLists[step02ProjectId]||[]).find(item=>item.variant_id===state.step02VariantId); state.redrawMarketLocale=selectedVariant?.locale||state.redrawMarketLocale; state.step02SelectedShotId=null; state.step02Draft=null; state.step02Candidate=null; location.hash='redraw/'+encodeURIComponent(step02ProjectId)+'/stage/02/market/'+state.redrawMarketLocale; await hydrateStep02(step02ProjectId,{force:true}); return; }
    const step02Shot = event.target.closest('[data-step02-shot-id]');
    if (step02Shot) { if (state.step02Draft?.dirty) return; state.step02SelectedShotId=step02Shot.dataset.step02ShotId; state.step02Draft=null; state.step02Candidate=null; renderRedrawStudio(state.projects.find(item=>item.id===step02ProjectId)); return; }
    if (event.target.closest('[data-edit-step02-shot]')) {
      const variant=state.step02Variants[state.step02VariantId]; const shot=variant?.shots?.find(item=>item.shot_id===state.step02SelectedShotId);
      if (variant&&shot) { state.step02Draft={variantId:variant.variant_id,shotId:shot.shot_id,values:step02DraftValues(shot),dirty:false}; renderRedrawStudio(state.projects.find(item=>item.id===step02ProjectId)); }
      return;
    }
    if (event.target.closest('[data-cancel-step02-edit]')) { state.step02Draft=null; renderRedrawStudio(state.projects.find(item=>item.id===step02ProjectId)); return; }
    if (event.target.closest('[data-save-step02-shot]')) { await saveStep02Shot(step02ProjectId); return; }
    const candidateIntent = event.target.closest('[data-step02-candidate-intent]');
    if (candidateIntent) { await requestStep02Candidate(step02ProjectId,candidateIntent.dataset.step02CandidateIntent); return; }
    if (event.target.closest('[data-dismiss-step02-candidate]')) { state.step02Candidate=null; renderRedrawStudio(state.projects.find(item=>item.id===step02ProjectId)); return; }
    if (event.target.closest('[data-adopt-step02-candidate]')) { await adoptStep02Candidate(step02ProjectId); return; }
    if (event.target.closest('[data-confirm-step02-variant]')) { await confirmStep02Variant(step02ProjectId); return; }
    if(event.target.closest('[data-prepare-localization]')){await prepareLocalizationCandidate(step02ProjectId,state.step02Variants[state.step02VariantId]);return;}
    if(event.target.closest('[data-confirm-localization]')){await confirmLocalization(step02ProjectId);return;}
    if(event.target.closest('[data-refresh-localization]')){await hydrateLocalization(step02ProjectId);return;}
    if(event.target.closest('[data-enter-step03]')){const variant=state.step02Variants[state.step02VariantId],localization=state.localizationStatus[step02ProjectId];if(variant?.status==='confirmed'&&localization?.downstream_ready===true){state.redrawMarketLocale=variant.locale;location.hash='redraw/'+encodeURIComponent(step02ProjectId)+'/stage/03/market/'+variant.locale;}return;}
    if (event.target.closest('[data-retry-step02-variant]')) {
      const variant=state.step02Variants[state.step02VariantId];
      if (variant) { state.step02MarketModal={projectId:step02ProjectId,locale:variant.locale,error:null,busy:false}; await createStep02Variant(step02ProjectId); }
      return;
    }
    const commandPaletteOpen = event.target.closest('[data-command-palette-open]');
    if (commandPaletteOpen) {
      openCommandPalette();
      return;
    }
    const commandPaletteClose = event.target.closest('[data-command-palette-close]');
    if (commandPaletteClose) {
      closeCommandPalette();
      return;
    }
    const commandPaletteItem = event.target.closest('[data-command-palette-item]');
    if (commandPaletteItem) {
      runCommandPaletteItem(commandPaletteItem.dataset.commandPaletteItem);
      return;
    }
    const open = event.target.closest('[data-open-project-wizard]');
    if (open) openWizard();
    const openRedrawIntakeAction = event.target.closest('[data-open-redraw-intake]');
    if (openRedrawIntakeAction) {
      openRedrawIntake(workbenchRoute()?.projectKey || '');
      return;
    }
    const returnWorkbenchAction = event.target.closest('[data-return-workbench]');
    if (returnWorkbenchAction) {
      showView('workbench');
      if (location.hash !== '#workbench') location.hash = 'workbench';
      return;
    }
    const openWorkspaceDeliveriesAction = event.target.closest('[data-open-workspace-deliveries]');
    if (openWorkspaceDeliveriesAction) {
      openWorkspaceDeliveries(openWorkspaceDeliveriesAction.dataset.openWorkspaceDeliveries);
      return;
    }
    const resumeRedrawDraft=event.target.closest('[data-resume-redraw-draft]');
    if(resumeRedrawDraft){restoreFormDraft(form,redrawDraftFields,'redraw-project');resumeRedrawDraft.hidden=true;status.textContent='已恢复上次草稿；源视频与权利勾选仍需重新选择并确认。';form?.querySelector('[name="name"]')?.focus({preventScroll:true});return;}
    if (event.target.closest('[data-close-project-wizard]')) closeWizard();
    if (event.target.closest('[data-open-script-drama-wizard]')) openScriptDramaWizard();
    if (event.target.closest('[data-close-script-drama-wizard]')) closeScriptDramaWizard();
    if (event.target.closest('[data-open-auth-login]')) loginButton?.click();
    if (event.target.closest('[data-close-workbench-asset-viewer]') || event.target === assetViewer) {
      closeWorkbenchAssetViewer();
      return;
    }
    const openWorkbenchAssetViewer = event.target.closest('[data-open-workbench-asset-viewer]');
    if (openWorkbenchAssetViewer) {
      const project = state.scriptProjects.find(item => workbenchSelectionKey({...item, projectKind:'script'}) === state.workbenchSelectionKey);
      const candidate = workbenchCandidateAssets(project).find(item => item.id === openWorkbenchAssetViewer.dataset.openWorkbenchAssetViewer);
      if (!project || !candidate) return;
      state.assetViewerReturnFocus = openWorkbenchAssetViewer;
      state.workbenchAssetViewer = {projectId:project.id, candidateId:candidate.id};
      renderWorkbenchAssetViewer();
      return;
    }
    const workbenchAsset = event.target.closest('[data-workbench-asset]');
    if (workbenchAsset) {
      if (workbenchAsset.dataset.workbenchAsset !== state.workbenchAssetId) {
        state.workbenchAssetId = workbenchAsset.dataset.workbenchAsset;
        renderWorkbench();
      }
      return;
    }
    const workbenchProject = event.target.closest('[data-workbench-project]');
    if (workbenchProject) {
      const nextSelection = workbenchProject.dataset.workbenchProject;
      if (nextSelection && nextSelection !== state.workbenchSelectionKey) {
        const flipTargets = Array.from(workbenchContent?.querySelectorAll('[data-flip-id^="workbench-project-"], [data-flip-id="workbench-inspector"]') || []);
        const useViewTransition = canUseWorkbenchViewTransition();
        state.workbenchFlipState = !useViewTransition && canPlayStudioMotion() && window.Flip && flipTargets.length ? window.Flip.getState(flipTargets) : null;
        state.workbenchSelectionKey = nextSelection;
        state.workbenchTab = 'overview';
        updateWorkbenchRoute({transition:useViewTransition});
      }
      return;
    }
    const workbenchTab = event.target.closest('[data-workbench-tab]');
    if (workbenchTab) {
      const nextTab = workbenchTab.dataset.workbenchTab;
      if (['overview','assets','video','activity'].includes(nextTab) && nextTab !== state.workbenchTab) {
        state.workbenchTab = nextTab;
        updateWorkbenchRoute({transition:true});
      }
      return;
    }
    const migrateMedia = event.target.closest('[data-migrate-media]');
    if (migrateMedia) {
      const projectId = migrateMedia.dataset.migrateMedia;
      const project = state.projects.find(item => item.id === projectId);
      if (!project || state.workbenchMediaDelivery[projectId]?.running) return;
      const identity = window.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
      state.workbenchMediaDelivery[projectId] = {running:true, message:'正在校验并准备私有媒体直连...'};
      renderWorkbench();
      try {
        const payload = await api('/api/projects/' + encodeURIComponent(projectId) + '/media-delivery/migrate', {method:'POST', headers:{'Idempotency-Key':'media-' + identity}});
        state.workbenchMediaDelivery[projectId] = {status:'completed', message:'已完成私有 COS 直连准备：' + String(payload.mediaCount || 0) + ' 类媒体。'};
        state.projects = state.projects.map(item => item.id === projectId ? {...item, updatedAt:new Date().toISOString()} : item);
      } catch (error) {
        state.workbenchMediaDelivery[projectId] = {status:'failed', message:error.message || '媒体直连准备失败，请稍后重试。'};
      }
      renderWorkbench();
      return;
    }
    const openScriptStudioAction = event.target.closest('[data-open-script-studio]');
    if (openScriptStudioAction) {
      showView('projects');
      if (location.hash !== '#projects') location.hash = 'projects';
      return;
    }
    const openRedrawStudioAction = event.target.closest('[data-open-redraw-studio]');
    if (openRedrawStudioAction) {
      showView('projects');
      if (location.hash !== '#projects') location.hash = 'projects';
      return;
    }
    const retryShotInventory = event.target.closest('[data-retry-shot-inventory]');
    if (retryShotInventory) { await hydrateStep01ShotSelection(retryShotInventory.dataset.retryShotInventory, {force:true}); return; }
    const sourceShot = event.target.closest('[data-select-source-shot]');
    if (sourceShot) {
      const projectId = sourceShot.dataset.projectId;
      const selected = state.redrawShotSelectionDrafts[projectId] || new Set();
      const shotId = sourceShot.dataset.selectSourceShot;
      if (selected.has(shotId)) selected.delete(shotId); else selected.add(shotId);
      state.redrawShotSelectionDrafts[projectId] = selected;
      const video = document.querySelector('#redrawStudioContent .redraw-source-video');
      if (video && Number.isFinite(Number(sourceShot.dataset.shotStart))) video.currentTime = Number(sourceShot.dataset.shotStart);
      renderRedrawStudio(state.projects.find(item => item.id === projectId));
      return;
    }
    const clearShotSelection = event.target.closest('[data-clear-shot-selection]');
    if (clearShotSelection) { state.redrawShotSelectionDrafts[clearShotSelection.dataset.clearShotSelection] = new Set(); renderRedrawStudio(state.projects.find(item => item.id === clearShotSelection.dataset.clearShotSelection)); return; }
    const confirmShotAnalysis = event.target.closest('[data-confirm-shot-analysis]');
    if (confirmShotAnalysis) { await confirmSelectedShotsAndAnalyze(confirmShotAnalysis.dataset.confirmShotAnalysis, confirmShotAnalysis); return; }
    const startStep01 = event.target.closest('[data-start-step01]');
    const resumeFixedStep01 = event.target.closest('[data-resume-step01-fixed-phase]');
    if (resumeFixedStep01) {
      const projectId = resumeFixedStep01.dataset.resumeStep01FixedPhase;
      const project = state.projects.find(item => item.id === projectId);
      if (!project || !fixedAppExecutorIsReady(project)) return;
      resumeFixedStep01.disabled = true;
      resumeFixedStep01.textContent = '正在派发至 Mac...';
      try {
        const payload = await api('/api/projects/' + encodeURIComponent(projectId) + '/step01-fixed-phase/resume', {method:'POST'});
        state.projects = state.projects.map(item => item.id === payload.project.id ? payload.project : item);
        renderProjects();
        renderWorkbench();
        openRedrawStudio(projectId, {updateHash:false});
      } catch (error) {
        resumeFixedStep01.disabled = false;
        resumeFixedStep01.textContent = error.message;
      }
      return;
    }
    if (startStep01) {
      const projectId = startStep01.dataset.startStep01;
      const project = state.projects.find(item => item.id === projectId);
      if (!project) return;
      startStep01.disabled = true;
      startStep01.textContent = '正在创建受控任务...';
      try {
        const payload = await api('/api/projects/' + encodeURIComponent(projectId) + '/step01-analysis', {method:'POST'});
        state.projects = state.projects.map(item => item.id === payload.project.id ? payload.project : item);
        renderProjects();
        renderWorkbench();
        openRedrawStudio(projectId, {updateHash:false});
      } catch (error) {
        startStep01.disabled = false;
        startStep01.textContent = error.message;
      }
      return;
    }
    if (event.target.closest('[data-open-reference-redraw]')) {
      state.referenceEvidence = null;
      state.referenceEvidenceId = null;
      state.referenceEvidenceShotId = null;
      await openReferenceEvidenceStudio();
      return;
    }
    const evidenceShot = event.target.closest('[data-evidence-shot-id]');
    if (evidenceShot && state.referenceEvidence) {
      state.referenceEvidenceShotId = evidenceShot.dataset.evidenceShotId;
      renderReferenceEvidenceStudio(state.referenceEvidence);
      location.hash = 'redraw-evidence/' + encodeURIComponent(state.referenceEvidenceId || state.referenceEvidence.id || defaultReferenceEvidenceId) + '/shot/' + encodeURIComponent(state.referenceEvidenceShotId);
      return;
    }
    const scriptStudioStage = event.target.closest('[data-script-studio-stage]');
    if (scriptStudioStage) {
      state.scriptStudioStageId = scriptStudioStage.dataset.scriptStudioStage;
      state.studioStageFocus = {kind:'script', stageId:state.scriptStudioStageId};
      openScriptStudio(state.scriptStudioProjectId || state.scriptProjects[0]?.id, {updateHash:true});
      return;
    }
    const storyboardGroup = event.target.closest('[data-script-storyboard-group]');
    if (storyboardGroup) {
      if (storyboardGroup.dataset.scriptStoryboardGroup === state.scriptStoryboardGroupId) return;
      const flipState = canPlayStudioMotion() && window.Flip
        ? window.Flip.getState(Array.from(scriptStudioContent?.querySelectorAll('[data-flip-id]') || []))
        : null;
      state.scriptStoryboardGroupId = storyboardGroup.dataset.scriptStoryboardGroup;
      const project = state.scriptProjects.find(item => item.id === state.scriptStudioProjectId);
      if (project) {
        renderScriptStudio(project);
        animateStoryboardSelection(flipState);
      }
      return;
    }
    const videoGroup = event.target.closest('[data-script-video-group]');
    if (videoGroup) {
      if (videoGroup.dataset.scriptVideoGroup === state.scriptVideoGroupId) return;
      const preservedScrollY = window.scrollY;
      state.scriptVideoGroupId = videoGroup.dataset.scriptVideoGroup;
      const project = state.scriptProjects.find(item => item.id === state.scriptStudioProjectId);
      if (project) {
        const stageWorkspace = scriptStudioContent?.querySelector('.script-stage-workspace');
        if (stageWorkspace) {
          stageWorkspace.outerHTML = renderScriptN06Workspace(project);
          sanitizeScriptN06PublicSurface(scriptStudioContent);
        }
        else renderScriptStudio(project);
        window.scrollTo({top:preservedScrollY, behavior:'auto'});
      }
      return;
    }
    const step02Action = event.target.closest('[data-step02-action]');
    if (step02Action) {
      const projectId = step02Action.dataset.projectId;
      const action = step02Action.dataset.step02Action;
      step02Action.disabled = true;
      const originalLabel = step02Action.textContent;
      step02Action.textContent = action === 'accept' ? '正在验证并接受...' : action === 'reconcile' ? '正在读取回传...' : '正在准备...';
      try {
        const body = action === 'accept' ? {decision:'accept'} : step02Action.dataset.step02Carrier === 'true' ? {executeCarrier:true} : {};
        const payload = await api('/api/projects/' + encodeURIComponent(projectId) + '/step02/' + action, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        state.projects = state.projects.map(item => item.id === payload.project.id ? payload.project : item);
        openRedrawStudio(projectId, {updateHash:false});
      } catch (error) {
        step02Action.disabled = false;
        step02Action.textContent = error.message || originalLabel;
      }
      return;
    }
    const retrySourceReview = event.target.closest('[data-retry-source-review]');
    if (retrySourceReview) {
      const projectId = retrySourceReview.dataset.projectId;
      delete state.redrawSourceFacts[projectId];
      delete state.redrawSourceFactsError[projectId];
      await hydrateRedrawSourceFacts(projectId);
      return;
    }
    const editSourceReview = event.target.closest('[data-edit-source-review]');
    if (editSourceReview) {
      editSourceReview.disabled = true;
      editSourceReview.textContent = '正在读取版本…';
      await beginSourceReviewEdit(editSourceReview.dataset.projectId, editSourceReview.dataset.shotId);
      return;
    }
    if (event.target.closest('[data-cancel-source-review-edit]')) {
      const projectId = state.redrawShotReviewEdit?.projectId;
      state.redrawShotReviewEdit = null;
      state.redrawShotReviewSave = null;
      if (projectId) renderCurrentSourceReviewDetail(projectId);
      return;
    }
    if (event.target.closest('[data-save-source-review]')) {
      await saveSourceReviewRevision();
      return;
    }
    if (event.target.closest('[data-rebase-source-review]')) {
      rebaseSourceReviewEdit();
      return;
    }
    const sourceFactsShot = event.target.closest('[data-source-facts-shot-id]');
    if (sourceFactsShot) {
      const projectId = sourceFactsShot.dataset.sourceFactsProjectId;
      const shotId = sourceFactsShot.dataset.sourceFactsShotId;
      if (state.redrawShotReviewEdit?.dirty && state.redrawShotReviewEdit.shotId !== shotId) {
        state.redrawShotReviewSave = {projectId:state.redrawShotReviewEdit.projectId,shotId:state.redrawShotReviewEdit.shotId,status:'failed',message:'当前镜头有未保存修改，请先保存或取消'};
        renderCurrentSourceReviewDetail(state.redrawShotReviewEdit.projectId);
        return;
      }
      if (state.redrawShotReviewEdit && state.redrawShotReviewEdit.shotId !== shotId) {
        state.redrawShotReviewEdit = null;
        state.redrawShotReviewSave = null;
      }
      if (applySourceReviewShotSelection(projectId, shotId, {seek:true, reveal:true})) return;
      state.redrawSourceFactShotId = shotId;
      const facts = state.redrawSourceFacts[projectId];
      const shot = facts?.timeline?.shots?.find(item => item.shotId === state.redrawSourceFactShotId);
      const video = document.querySelector('.redraw-source-video');
      if (shot && video) video.currentTime = Math.max(0, Number(shot.startMs || 0) / 1000);
      if (projectId === state.redrawStudioProjectId) openRedrawStudio(projectId, {updateHash:false});
      return;
    }
    const redrawStudioStage = event.target.closest('[data-redraw-studio-stage]');
    if (redrawStudioStage) {
      if(!state.redrawStudioProjectId)return;
      const project=state.projects.find(item=>item.id===state.redrawStudioProjectId);
      const currentStage=redrawStageForProject(project);
      if(Number(redrawStudioStage.dataset.redrawStudioStage)>Number(currentStage))return;
      state.redrawStudioStageId = redrawStudioStage.dataset.redrawStudioStage;
      if(state.redrawStudioStageId==='01')state.redrawMarketLocale=null;
      state.studioStageFocus = {kind:'redraw', stageId:state.redrawStudioStageId};
      openRedrawStudio(state.redrawStudioProjectId, {updateHash:true});
      return;
    }
    if (event.target.closest('[data-return-script-workbench]')) {
      showView('workbench');
      location.hash = 'workbench';
      return;
    }
    if (event.target.closest('[data-return-redraw-workbench]')) {
      showView('workbench');
      location.hash = 'workbench';
      return;
    }
    const prepareScriptAdaptation = event.target.closest('[data-prepare-script-adaptation]');
    if (prepareScriptAdaptation) {
      const projectId = prepareScriptAdaptation.dataset.prepareScriptAdaptation;
      prepareScriptAdaptation.disabled = true;
      prepareScriptAdaptation.textContent = '正在准备...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/adaptation-jobs', { method:'POST' });
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        delete state.workbenchActivities[projectId];
        renderWorkbench();
      } catch (error) {
        prepareScriptAdaptation.disabled = false;
        prepareScriptAdaptation.textContent = error.message;
      }
      return;
    }
    const reconcileScriptProject = event.target.closest('[data-reconcile-script-project]');
    if (reconcileScriptProject) {
      const projectId = reconcileScriptProject.dataset.reconcileScriptProject;
      reconcileScriptProject.disabled = true;
      reconcileScriptProject.textContent = '正在同步...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/reconcile', { method:'POST' });
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        delete state.workbenchActivities[projectId];
        renderWorkbench();
      } catch (error) {
        reconcileScriptProject.disabled = false;
        reconcileScriptProject.textContent = error.message;
      }
      return;
    }
    const loadN04Review = event.target.closest('[data-load-n04-review]');
    if (loadN04Review) {
      const projectId = loadN04Review.dataset.loadN04Review;
      loadN04Review.disabled = true;
      loadN04Review.textContent = '正在读取审核包...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/n04-review');
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        state.scriptReview = {projectId, review:payload.review};
        if (state.scriptStudioProjectId === projectId) renderScriptStudio(payload.project);
        else renderWorkbench();
      } catch (error) {
        loadN04Review.disabled = false;
        loadN04Review.textContent = error.message;
      }
      return;
    }
    const loadN06Review = event.target.closest('[data-load-n06-review]');
    if (loadN06Review) {
      const projectId = loadN06Review.dataset.loadN06Review;
      loadN06Review.disabled = true;
      loadN06Review.textContent = '正在读取视频规格...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/n06-review');
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        state.scriptN06Review = {projectId, review:payload.review};
        if (state.scriptStudioProjectId === projectId) renderScriptStudio(payload.project);
        else renderWorkbench();
      } catch (error) {
        loadN06Review.disabled = false;
        loadN06Review.textContent = error.message;
      }
      return;
    }
    const n06Generate = event.target.closest('[data-n06-generate]');
    if (n06Generate) {
      const projectId = n06Generate.dataset.projectId;
      const groupId = n06Generate.dataset.n06Generate;
      const qualityInput = document.querySelector('[data-n06-quality="' + CSS.escape(groupId) + '"]');
      const qualityDecision = String(qualityInput?.value || '');
      if (!qualityDecision) {
        n06Generate.textContent = '请先选择质量';
        return;
      }
      const confirmed = window.confirm('确认后仅为当前项目记录 V001 的执行规格。不会上传素材、不会提交任务、不会扣费，也不会创建视频文件。是否继续？');
      if (!confirmed) return;
      n06Generate.disabled = true;
      n06Generate.textContent = '正在锁定执行规格...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/n06-video-groups/' + encodeURIComponent(groupId) + '/generate', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({confirmGenerate:true, qualityDecision})
        });
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        delete state.workbenchActivities[projectId];
        state.scriptN06Review = {projectId, review:payload.review};
        if (state.scriptStudioProjectId === projectId) renderScriptStudio(payload.project);
        else renderWorkbench();
      } catch (error) {
        n06Generate.disabled = false;
        n06Generate.textContent = error.message;
      }
      return;
    }
    const n06PrepareReal = event.target.closest('[data-n06-prepare-real]');
    if (n06PrepareReal) {
      const projectId = n06PrepareReal.dataset.projectId;
      const groupId = n06PrepareReal.dataset.n06PrepareReal;
      const review = scriptN06For(state.scriptProjects.find(item => item.id === projectId));
      const group = review?.groups?.find(item => item.groupId === groupId);
      const qualityDecision = String(group?.qualityDecision || '');
      if (!qualityDecision) return;
      if (!window.confirm('仅准备精确 V001 真实派发包：会锁定 SHA、写入 relay 清单，但不会上传、生成、扣费或启动 Mac。是否继续？')) return;
      n06PrepareReal.disabled = true;
      n06PrepareReal.textContent = '正在准备派发包...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/n06-video-groups/' + encodeURIComponent(groupId) + '/prepare-real-submit', {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmRealSubmit:true,qualityDecision})
        });
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        delete state.workbenchActivities[projectId];
        state.scriptN06Review = {projectId, review:payload.review};
        if (state.scriptStudioProjectId === projectId) renderScriptStudio(payload.project); else renderWorkbench();
      } catch (error) { n06PrepareReal.disabled = false; n06PrepareReal.textContent = error.message; }
      return;
    }
    const n06DispatchSynthetic = event.target.closest('[data-n06-dispatch-synthetic]');
    if (n06DispatchSynthetic) {
      const projectId = n06DispatchSynthetic.dataset.projectId;
      const groupId = n06DispatchSynthetic.dataset.n06DispatchSynthetic;
      if (!window.confirm('把当前精确 V001 事务派给一个现有 Mac App 员工，只运行 fake transport 测试链路。不会调用 Mimo、上传、生成、扣费或部署。是否继续？')) return;
      n06DispatchSynthetic.disabled = true;
      n06DispatchSynthetic.textContent = '正在锁定 Mac 测试派发...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/n06-video-groups/' + encodeURIComponent(groupId) + '/dispatch-synthetic', {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmSyntheticDispatch:true,specSha256:n06DispatchSynthetic.dataset.specSha})
        });
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        delete state.workbenchActivities[projectId];
        state.scriptN06Review = {projectId, review:payload.review};
        if (state.scriptStudioProjectId === projectId) renderScriptStudio(payload.project); else renderWorkbench();
      } catch (error) { n06DispatchSynthetic.disabled = false; n06DispatchSynthetic.textContent = error.message; }
      return;
    }
    const n06ReconcileSynthetic = event.target.closest('[data-n06-reconcile-synthetic]');
    if (n06ReconcileSynthetic) {
      const projectId = n06ReconcileSynthetic.dataset.projectId;
      const groupId = n06ReconcileSynthetic.dataset.n06ReconcileSynthetic;
      n06ReconcileSynthetic.disabled = true;
      n06ReconcileSynthetic.textContent = '正在核验 Mac 回执...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/n06-video-groups/' + encodeURIComponent(groupId) + '/reconcile-synthetic', {method:'POST'});
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        delete state.workbenchActivities[projectId];
        state.scriptN06Review = {projectId, review:payload.review};
        if (state.scriptStudioProjectId === projectId) renderScriptStudio(payload.project); else renderWorkbench();
      } catch (error) { n06ReconcileSynthetic.disabled = false; n06ReconcileSynthetic.textContent = error.message; }
      return;
    }
    const authorizeN05 = event.target.closest('[data-authorize-n05]');
    const scriptAssetSelect = event.target.closest('[data-script-asset-id]');
    if (scriptAssetSelect) {
      const flipState = canPlayStudioMotion() && window.Flip
        ? window.Flip.getState(Array.from(scriptStudioContent?.querySelectorAll('[data-flip-id]') || []))
        : null;
      state.scriptAssetId = scriptAssetSelect.dataset.scriptAssetId;
      const project = state.scriptProjects.find(item => item.id === state.scriptStudioProjectId);
      if (project) {
        renderScriptStudio(project);
        animateAssetSelection(flipState);
      }
      return;
    }
    const n05CandidateDecision = event.target.closest('[data-n05-candidate-decision]');
    if (n05CandidateDecision) {
      const projectId = n05CandidateDecision.dataset.projectId;
      const candidateId = n05CandidateDecision.dataset.candidateId;
      const sha256 = n05CandidateDecision.dataset.candidateSha;
      const decision = n05CandidateDecision.dataset.n05CandidateDecision;
      const saved = readSessionDraft(candidateDecisionDraftScope(projectId, candidateId, sha256, decision));
      state.scriptDecisionDraft = {projectId, candidateId, sha256, decision, reason:String(saved?.values?.reason || ''), error:''};
      state.scriptDecisionFeedback = null;
      const project = state.scriptProjects.find(item => item.id === projectId);
      if (project) renderScriptStudio(project);
      return;
    }
    const cancelScriptCandidateDecision = event.target.closest('[data-n05-candidate-cancel]');
    if (cancelScriptCandidateDecision) {
      const draft = state.scriptDecisionDraft;
      if (draft) clearSessionDraft(candidateDecisionDraftScope(draft.projectId, draft.candidateId, draft.sha256, draft.decision));
      state.scriptDecisionDraft = null;
      const project = state.scriptProjects.find(item => item.id === state.scriptStudioProjectId);
      if (project) renderScriptStudio(project);
      return;
    }
    const submitScriptCandidateDecision = event.target.closest('[data-n05-candidate-submit]');
    if (submitScriptCandidateDecision) {
      const projectId = submitScriptCandidateDecision.dataset.projectId;
      const candidateId = submitScriptCandidateDecision.dataset.candidateId;
      const sha256 = submitScriptCandidateDecision.dataset.candidateSha;
      const decision = submitScriptCandidateDecision.dataset.n05CandidateSubmit;
      const reasonInput = document.querySelector('[data-n05-decision-reason="' + CSS.escape(candidateId) + '"]');
      const reason = String(reasonInput?.value || '').trim();
      if (['reject', 'regenerate'].includes(decision) && !reason) {
        state.scriptDecisionDraft = {...(state.scriptDecisionDraft || {}), error:'请先写清楚具体问题，系统才能按这个问题整图重做。'};
        const project = state.scriptProjects.find(item => item.id === projectId);
        if (project) renderScriptStudio(project);
        return;
      }
      submitScriptCandidateDecision.disabled = true;
      submitScriptCandidateDecision.textContent = '正在记录...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/n05-candidates/' + encodeURIComponent(candidateId) + '/decision', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({decision, sha256, reason})
        });
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        delete state.workbenchActivities[projectId];
        state.scriptReview = {projectId, review:payload.review};
        clearSessionDraft(candidateDecisionDraftScope(projectId, candidateId, sha256, decision));
        state.scriptDecisionDraft = null;
        state.scriptDecisionFeedback = {candidateId, tone:'is-info', message:decision === 'regenerate' ? (payload.regenerationDispatch?.status === 'started' ? '重做已启动，当前候选会保留到新图通过独立视觉 QA。' : '重做请求已记录，等待受控队列处理。') : '当前版本的决定已记录。'};
        if (state.scriptStudioProjectId === projectId) renderScriptStudio(payload.project);
        else renderWorkbench();
      } catch (error) {
        state.scriptDecisionDraft = {...(state.scriptDecisionDraft || {}), projectId, candidateId, sha256, decision, reason, error:error.message};
        const project = state.scriptProjects.find(item => item.id === projectId);
        if (project) renderScriptStudio(project);
      }
      return;
    }
    if (authorizeN05) {
      const projectId = authorizeN05.dataset.authorizeN05;
      const promptSha256 = authorizeN05.dataset.reviewSha;
      const confirmed = window.confirm('确认后，网站将记录：仅可严格按当前 N04 包通过认可渠道整图生成 N05 候选图。不会提交视频，不会打包、发送或提升 registry。是否继续？');
      if (!confirmed) return;
      authorizeN05.disabled = true;
      authorizeN05.textContent = '正在记录授权...';
      try {
        const payload = await api('/api/script-projects/' + encodeURIComponent(projectId) + '/n04-review/authorize-n05', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({authorizeN05:true, reviewedPromptSha256:promptSha256})
        });
        state.scriptProjects = state.scriptProjects.map(item => item.id === payload.project.id ? payload.project : item);
        delete state.workbenchActivities[projectId];
        state.scriptReview = {projectId, review:payload.review};
        if (state.scriptStudioProjectId === projectId) renderScriptStudio(payload.project);
        else renderWorkbench();
      } catch (error) {
        authorizeN05.disabled = false;
        authorizeN05.textContent = error.message;
      }
      return;
    }
    const rerunPreflight = event.target.closest('[data-rerun-preflight]');
    if (rerunPreflight) {
      const projectId = rerunPreflight.dataset.rerunPreflight;
      rerunPreflight.disabled = true;
      try {
        const payload = await api('/api/projects/' + encodeURIComponent(projectId) + '/preflight', { method:'POST' });
        state.projects = state.projects.map(item => item.id === payload.project.id ? payload.project : item);
        renderProjects();
        renderWorkbench();
        renderDetail(payload.project);
      } catch (error) {
        rerunPreflight.disabled = false;
        rerunPreflight.textContent = error.message;
      }
      return;
    }
    const workbenchView = event.target.closest('[data-workbench-view]');
    if (workbenchView) {
      showView(workbenchView.dataset.workbenchView);
      location.hash = workbenchView.dataset.workbenchView;
    }
    const workbenchStep = event.target.closest('[data-workbench-step]');
    if (workbenchStep) {
      state.workbenchStepId = workbenchStep.dataset.workbenchStep;
      renderWorkbench();
    }
    const guideFlow = event.target.closest('[data-guide-flow]');
    if (guideFlow) {
      const nextFlow = guideFlow.dataset.guideFlow;
      if (!guideFlows[nextFlow] || nextFlow === state.guideFlow) return;
      state.guideFlow = nextFlow;
      state.guideStepId = guideFlows[nextFlow].steps[0].id;
      renderGuide({animate:true});
      return;
    }
    const guideStep = event.target.closest('[data-guide-step]');
    if (guideStep) {
      state.guideStepId = guideStep.dataset.guideStep;
      renderGuide({animate:true});
    }
    const card = event.target.closest('[data-project-id]');
    if (card) {
      const project = state.projects.find(item => item.id === card.dataset.projectId);
      if (project) openProjectWorkbench({...project, projectKind:'redraw'});
    }
    const scriptCard = event.target.closest('[data-script-project-id]');
    if (scriptCard) {
      const project = state.scriptProjects.find(item => item.id === scriptCard.dataset.scriptProjectId);
      if (project) openProjectWorkbench({...project, projectKind:'script'});
    }
  });

  document.addEventListener('submit', async event => {
    const shotRangeForm = event.target.closest('[data-shot-range-form]');
    if (shotRangeForm) {
      event.preventDefault();
      const projectId = shotRangeForm.dataset.shotRangeForm;
      const inventory = state.redrawShotSelections[projectId]?.inventory;
      const value = String(new FormData(shotRangeForm).get('range') || '').trim();
      const match = value.match(/^(?:S(?:hot)?\s*)?(\d{1,3})\s*(?:-|–|—|到|至)\s*(?:S(?:hot)?\s*)?(\d{1,3})$/i);
      const input = shotRangeForm.querySelector('input');
      if (!inventory || !match) { if (input) input.setCustomValidity('请输入镜头范围，例如 10-18'); input?.reportValidity(); return; }
      const first = Number(match[1]), last = Number(match[2]);
      const low = Math.min(first, last), high = Math.max(first, last);
      const selected = inventory.shots.filter(shot => shot.sequence >= low && shot.sequence <= high).map(shot => shot.shot_id);
      if (!selected.length || selected.length !== high - low + 1) { if (input) input.setCustomValidity('输入范围超出了镜头清单'); input?.reportValidity(); return; }
      if (input) input.setCustomValidity('');
      state.redrawShotSelectionDrafts[projectId] = new Set(selected);
      renderRedrawStudio(state.projects.find(item => item.id === projectId));
      return;
    }
    const authorityImportForm = event.target.closest('[data-step01-authority-import]');
    if (authorityImportForm) {
      event.preventDefault();
      const projectId = authorityImportForm.dataset.step01AuthorityImport;
      const archive = authorityImportForm.elements.authority_archive?.files?.[0];
      const declarationFile = authorityImportForm.elements.authority_declaration?.files?.[0];
      const submit = authorityImportForm.querySelector('[type="submit"]');
      const status = authorityImportForm.querySelector('[data-step01-authority-import-status]');
      const show = (message, patch = {}) => {
        const previous = state.step01AuthorityImport?.projectId === projectId ? state.step01AuthorityImport : {};
        state.step01AuthorityImport = {
          projectId,
          active: Boolean(patch.active ?? previous.active),
          phase: String(patch.phase ?? previous.phase ?? 'idle'),
          loaded: Number(patch.loaded ?? previous.loaded ?? 0),
          total: Number(patch.total ?? previous.total ?? archive?.size ?? 0),
          message: String(message ?? previous.message ?? '')
        };
        const currentForm = document.querySelector('[data-step01-authority-import="' + CSS.escape(String(projectId)) + '"]');
        const currentStatus = currentForm?.querySelector('[data-step01-authority-import-status]') || status;
        const currentSubmit = currentForm?.querySelector('[type="submit"]') || submit;
        if (currentStatus) currentStatus.textContent = state.step01AuthorityImport.message;
        if (currentSubmit) currentSubmit.disabled = state.step01AuthorityImport.active;
      };
      if (projectId !== exactStep01ProjectId || !archive || !declarationFile) { show('请选择锁定项目的归档与声明文件'); return; }
      if (!/\.tar\.gz$/i.test(archive.name) || !/\.json$/i.test(declarationFile.name)) { show('文件类型不符：仅接受 .tar.gz 与 .json'); return; }
      show('正在核对锁定归档与声明…', {active:true, phase:'validating', loaded:0, total:archive.size});
      try {
        const declaration = JSON.parse(await declarationFile.text());
        const exact = declaration?.schema_version === 'niannian.step01_authority_import_declaration.v1' && declaration.project_id === exactStep01ProjectId && declaration.revision_id === 'analysis-20260727-full-evidence-r1' && declaration.archive_sha256 === '92418503b70a51c63e80c5681fc524c6e13f2e8059bad9835a0440152a0b5edb' && Number(declaration.archive_bytes) === 504967275 && Number(declaration.counts?.frames) === 254 && Number(declaration.counts?.shots) === 37 && Number(declaration.counts?.triad_frames) === 111;
        if (!exact || archive.size !== Number(declaration.archive_bytes)) throw Object.assign(new Error('声明或归档 bytes 与锁定 authority 不一致'), {code:'STEP01_AUTHORITY_IMPORT_FILE_MISMATCH'});
        const idempotencyKey = 'authority-import-' + declaration.revision_id + '-' + declaration.archive_sha256.slice(0, 20);
        const base = '/api/projects/' + encodeURIComponent(projectId) + '/step01/authority-revisions/' + encodeURIComponent(declaration.revision_id);
        show('正在申请短时 exact PUT grant…', {phase:'grant'});
        const grantResponse = await fetch(base + '/import-grant', {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify(declaration),cache:'no-store'});
        const grant = await grantResponse.json().catch(() => ({}));
        if (!grantResponse.ok) throw Object.assign(new Error(grant.error || '无法签发受控上传许可'), {code:grant.code || 'STEP01_AUTHORITY_IMPORT_GRANT_FAILED'});
        if (grant.code === 'STEP01_AUTHORITY_IMPORT_ALREADY_COMPLETED') { show('已核对同一 revision：254 帧 / 37 镜头 / 111 三帧，无需重复上传', {phase:'completed'}); return; }
        if (!grant.upload?.url || grant.upload.method !== 'PUT') throw Object.assign(new Error('服务端未返回 exact PUT grant'), {code:'STEP01_AUTHORITY_IMPORT_GRANT_INVALID'});
        show('正在上传 exact 归档：0 / ' + archive.size + ' bytes；签名地址不会保存或显示…', {phase:'uploading', loaded:0, total:archive.size});
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', grant.upload.url, true);
          xhr.setRequestHeader('Content-Type', 'application/gzip');
          xhr.upload.addEventListener('progress', progress => {
            const loaded = Number(progress.loaded || 0);
            const total = Number(progress.lengthComputable ? progress.total : archive.size);
            show('正在上传 exact 归档：' + loaded + ' / ' + total + ' bytes；签名地址不会保存或显示…', {phase:'uploading', loaded, total});
          });
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(Object.assign(new Error('归档上传失败或许可已过期；可安全重试同一导入'), {code:'STEP01_AUTHORITY_IMPORT_PUT_FAILED'}));
          });
          xhr.addEventListener('error', () => reject(Object.assign(new Error('归档上传网络失败；请先核对现有请求状态再重试'), {code:'STEP01_AUTHORITY_IMPORT_PUT_NETWORK_FAILED'})));
          xhr.addEventListener('abort', () => reject(Object.assign(new Error('归档上传已中止；请先核对 COS 对象状态再重试'), {code:'STEP01_AUTHORITY_IMPORT_PUT_ABORTED'})));
          xhr.send(archive);
        });
        show('上传完成，正在由 Haika 读回并验证 254 / 37 / 111…', {phase:'importing', loaded:archive.size, total:archive.size});
        const importedResponse = await fetch(base + '/import', {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey,'If-Match':'*'},body:'{}',cache:'no-store'});
        const imported = await importedResponse.json().catch(() => ({}));
        if (!importedResponse.ok) throw Object.assign(new Error(imported.error || 'Haika 读回验证失败'), {code:imported.code || 'STEP01_AUTHORITY_IMPORT_FAILED'});
        show('导入已验证：' + imported.revision.counts.frames + ' 帧 / ' + imported.revision.counts.shots + ' 镜头 / ' + imported.revision.counts.triad_frames + ' 三帧；状态 ' + imported.revision.status, {phase:'completed', loaded:archive.size, total:archive.size});
      } catch (error) {
        show((error.code ? error.code + ' · ' : '') + error.message, {phase:'failed'});
      } finally {
        show(null, {active:false});
      }
      return;
    }
    const redrawSettings = event.target.closest('[data-redraw-settings]');
    if (redrawSettings) {
      event.preventDefault();
      const projectId = redrawSettings.dataset.redrawSettings;
      const submit = redrawSettings.querySelector('[type="submit"]');
      const data = new FormData(redrawSettings);
      if (!projectId || !submit) return;
      submit.disabled = true;
      submit.textContent = '保存中...';
      try {
        const payload = await api('/api/projects/' + encodeURIComponent(projectId) + '/settings', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            targetLanguage:String(data.get('targetLanguage') || ''),
            visualStyle:String(data.get('visualStyle') || ''),
            aspectRatio:String(data.get('aspectRatio') || ''),
            quality:String(data.get('quality') || ''),
            replacementBrief:String(data.get('replacementBrief') || '')
          })
        });
        state.projects = state.projects.map(item => item.id === payload.project.id ? payload.project : item);
        renderProjects();
        renderWorkbench();
        openRedrawStudio(projectId, {updateHash:false});
      } catch (error) {
        submit.disabled = false;
        submit.textContent = error.message;
      }
      return;
    }
    const sourceReplacement = event.target.closest('[data-source-replacement]');
    if (!sourceReplacement) return;
    event.preventDefault();
    const submit = sourceReplacement.querySelector('[type="submit"]');
    const projectId = sourceReplacement.dataset.sourceReplacement;
    submit.disabled = true;
    try {
      const payload = await api('/api/projects/' + encodeURIComponent(projectId) + '/source', {method:'POST',body:new FormData(sourceReplacement)});
      state.projects = state.projects.map(item => item.id === payload.project.id ? payload.project : item);
      renderProjects();
      renderWorkbench();
      renderDetail(payload.project);
    } catch (error) {
      submit.disabled = false;
      submit.textContent = error.message;
    }
  });

  document.addEventListener('click', event => {
    if (event.target.matches('[data-source-replacement] input[type="file"]')) state.sourceReplacementSelectionOpen = true;
  });

  document.addEventListener('input', event => {
    const target = event.target;
    if (updateStep02Draft(target)) return;
    if (updateSourceReviewDraft(target)) return;
    if (target.closest('#projectCreateForm')) snapshotFormDraft(form, redrawDraftFields, 'redraw-project');
    if (target.closest('#scriptDramaCreateForm')) snapshotFormDraft(scriptDramaForm, scriptDraftFields, 'script-project');
    if (target.matches('[data-n05-decision-reason]') && state.scriptDecisionDraft) {
      const reason = String(target.value || '').slice(0, 500);
      state.scriptDecisionDraft = {...state.scriptDecisionDraft, reason};
      writeSessionDraft(candidateDecisionDraftScope(state.scriptDecisionDraft.projectId, state.scriptDecisionDraft.candidateId, state.scriptDecisionDraft.sha256, state.scriptDecisionDraft.decision), {reason});
    }
  });

  document.addEventListener('change', event => {
    const target = event.target;
    if (updateStep02Draft(target)) return;
    if (updateSourceReviewDraft(target)) return;
    if (target.matches('[data-source-replacement] input[type="file"]')) state.sourceReplacementSelectionOpen = false;
    if (target.closest('#projectCreateForm')) snapshotFormDraft(form, redrawDraftFields, 'redraw-project');
    if (target.closest('#scriptDramaCreateForm')) snapshotFormDraft(scriptDramaForm, scriptDraftFields, 'script-project');
  });

  window.addEventListener('focus', () => {
    window.setTimeout(() => { state.sourceReplacementSelectionOpen = false; }, 0);
  });

  document.addEventListener('click', async event => {
    const accountToggle = event.target.closest('#accountButton');
    if (accountToggle && state.user) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleAccountMenu();
      return;
    }
    const accountLogout = event.target.closest('[data-account-logout]');
    if (accountLogout) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeAccountMenu({restoreFocus:false});
      await logout();
      loginButton?.focus({preventScroll:true});
      return;
    }
    if (accountMenu && !accountMenu.hidden && !event.target.closest('.account-control')) {
      closeAccountMenu();
    }
  }, true);

  wizard?.addEventListener('click', event => { if (event.target === wizard) closeWizard(); });
  scriptDramaWizard?.addEventListener('click', event => {
    if (event.target === scriptDramaWizard) closeScriptDramaWizard();
  });
  commandPalette?.addEventListener('click', event => {
    if (event.target === commandPalette) closeCommandPalette();
  });
  commandPaletteInput?.addEventListener('input', event => {
    state.commandPaletteQuery = String(event.target.value || '');
    renderCommandPalette();
  });
  commandPaletteInput?.addEventListener('keydown', event => {
    const firstResult = commandPaletteResults?.querySelector('[data-command-palette-item]');
    if (event.key === 'ArrowDown' && firstResult) {
      event.preventDefault();
      firstResult.focus({preventScroll:true});
      return;
    }
    if (event.key === 'Enter' && firstResult) {
      event.preventDefault();
      runCommandPaletteItem(firstResult.dataset.commandPaletteItem);
    }
  });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (commandPalette && !commandPalette.hidden) closeCommandPalette();
      else openCommandPalette();
      return;
    }
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (commandPalette && !commandPalette.hidden) {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (accountMenu && !accountMenu.hidden) {
      event.preventDefault();
      closeAccountMenu({restoreFocus:true});
      return;
    }
    if (!assetViewer?.hidden) {
      event.preventDefault();
      closeWorkbenchAssetViewer();
      return;
    }
    if (scriptDramaWizard && !scriptDramaWizard.hidden) {
      event.preventDefault();
      closeScriptDramaWizard();
      return;
    }
    if (!wizard?.hidden) {
      event.preventDefault();
      closeWizard();
    }
  });
  search?.addEventListener('input', renderProjects);
  filter?.addEventListener('change', renderProjects);
  projectTypeFilter?.addEventListener('change', renderProjects);
  document.querySelector('.project-count-strip')?.addEventListener('click', event => {
    const item = event.target.closest('[data-count-filter]');
    if (!item || !filter) return;
    filter.value = item.dataset.countFilter;
    renderProjects();
  });
  document.querySelector('.project-type-switch')?.addEventListener('click', event => {
    const item = event.target.closest('[data-project-type]');
    if (!item || !projectTypeFilter) return;
    projectTypeFilter.value = item.dataset.projectType;
    renderProjects();
  });
  document.querySelector('.project-board')?.addEventListener('click', event => {
    const clear = event.target.closest('[data-project-clear-filter]');
    if (!clear) return;
    if (search) search.value = '';
    if (filter) filter.value = 'all';
    if (projectTypeFilter) projectTypeFilter.value = 'all';
    renderProjects();
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    status.textContent = '正在上传源视频、写入任务合同并进行本机素材预检…';
    try {
      const payload = await api('/api/projects', { method: 'POST', body: new FormData(form) });
      state.projects.unshift(payload.project);
      renderProjects();
      state.workbenchProjectId = payload.project.id;
      state.workbenchStepId = null;
      renderWorkbench();
      clearSessionDraft('redraw-project');
      form.reset();
      closeWizard({restoreFocus:false});
      state.redrawStudioStageId = '01';
      openRedrawStudio(payload.project.id, {updateHash:true});
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  scriptDramaForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = scriptDramaForm.querySelector('[type="submit"]');
    const data = new FormData(scriptDramaForm);
    const sourceText = String(data.get('sourceText') || '').trim();
    const sourceDocument = data.get('sourceDocument');
    const hasDocument = sourceDocument instanceof File && sourceDocument.size > 0;
    if (!hasDocument && sourceText.length < 120) {
      scriptDramaStatus.textContent = '请上传 .docx Word 文档，或粘贴至少 120 个字符的小说或剧本正文。';
      return;
    }
    submit.disabled = true;
    scriptDramaStatus.textContent = hasDocument ? '正在准备 Word 文档上传…' : '正在登记文本、创建 N00 方向门与短剧项目…';
    try {
      let payload;
      if (hasDocument) {
        const upload = await uploadScriptDocumentResumable(sourceDocument);
        scriptDramaStatus.textContent = '正在抽取正文并创建短剧项目…';
        payload = await api('/api/script-projects/from-upload', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            name:String(data.get('name') || ''),
            genre:String(data.get('genre') || ''),
            audience:String(data.get('audience') || ''),
            episodeDuration:Number(data.get('episodeDuration')),
            aspectRatio:String(data.get('aspectRatio') || ''),
            rightsConfirmed:data.get('rightsConfirmed') === 'on',
            uploadSessionId:upload.id
          })
        });
      } else {
        payload = await api('/api/script-projects', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            name:String(data.get('name') || ''),
            genre:String(data.get('genre') || ''),
            audience:String(data.get('audience') || ''),
            episodeDuration:Number(data.get('episodeDuration')),
            aspectRatio:String(data.get('aspectRatio') || ''),
            sourceText,
            rightsConfirmed:data.get('rightsConfirmed') === 'on'
          })
        });
      }
      state.scriptProjects.unshift(payload.project);
      renderWorkbench();
      clearSessionDraft('script-project');
      scriptDramaForm.reset();
      closeScriptDramaWizard({restoreFocus:false});
    } catch (error) {
      scriptDramaStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  modalForm?.addEventListener('submit', async event => {
    const type = modalBackdrop?.dataset.modalType;
    if (!['login', 'register'].includes(type)) return;
    event.preventDefault();
    const email = modalInput.value.trim();
    const password = modalPassword.value;
    if (!email || password.length < 8) {
      modalStatus.textContent = '请输入有效邮箱和至少 8 位密码';
      return;
    }
    modalSubmit.disabled = true;
    modalStatus.textContent = type === 'register' ? '正在创建账户…' : '正在登录…';
    try {
      const payload = await api('/api/auth/' + type, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password}) });
      state.user = payload.user;
      updateAuthUi();
      document.getElementById('modalClose').click();
      await loadProjects();
    } catch (error) {
      modalStatus.textContent = error.message;
    } finally {
      modalSubmit.disabled = false;
      modalSubmit.textContent = type === 'register' ? '创建账户' : '登录';
    }
  });

  window.addEventListener('hashchange', () => {
    if (/^#canvas(?:\/|$)/i.test(location.hash)) {
      normalizeMainSitePath();
      return;
    }
    if (redirectRetiredScriptRoute()) return;
    if (redirectRetiredRedrawRoute()) return;
    const isStudioRoute = /^#(?:script|redraw|redraw-evidence|redraw-source-truth)\//i.test(location.hash);
    if (!isStudioRoute) {
      document.body.classList.remove('is-production-studio');
      delete document.body.dataset.productionStudio;
    }
    if (location.hash === '#projects') showView('projects');
    if (location.hash.startsWith('#project/')) {
      const projectId = decodeURIComponent(location.hash.slice(9));
      const project = state.projects.find(item => item.id === projectId);
      if (project) renderDetail(project);
    }
    if (workbenchRoute()) {
      showView('workbench');
      renderWorkbench();
    }
    if (location.hash === '#redraw-intake') openRedrawIntake('');
    const workspaceRoute = workspaceToolRoute();
    if (workspaceRoute?.tool === 'redraw') {
      state.redrawIntakeWorkspaceId = workspaceRoute.projectId;
      renderRedrawIntake();
    }
    if (workspaceRoute?.tool === 'deliveries') {
      renderWorkspaceDeliveries();
      void loadWorkspaceDeliveries(workspaceRoute.projectId);
    }
    if (location.hash === '#home' || !location.hash) showView('home');
    if (location.hash.startsWith('#script/')) {
      const route = scriptStudioRoute();
      if (route) {
        state.scriptStudioStageId = route.stageId || null;
        openScriptStudio(route.projectId, {updateHash:false});
      }
    }
    if (location.hash.startsWith('#redraw/')) {
      const route = redrawStudioRoute();
      if (route) {
        state.redrawStudioStageId = route.stageId || null;
        openRedrawStudio(route.projectId, {updateHash:false});
      }
    }
    if (location.hash.startsWith('#redraw-evidence/')) {
      const route = referenceEvidenceRoute();
      if (route) openReferenceEvidenceStudio({updateHash:false});
    }
  });

  window.setInterval(() => {
    if (!state.user || document.hidden) return;
    refreshStep01ElapsedLabels();
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (!state.user || document.hidden) return;
    refreshStep01ElapsedLabels();
    if (state.projectEventPendingRevision > state.projectEventRevision) scheduleProjectEventRefresh();
    else void reconcileProjectEvents({source:'visibility'});
  });
  window.addEventListener('niannian:network-restored', () => {
    if (state.user && !document.hidden) void reconcileProjectEvents({source:'network-restored'});
  });

  renderGuide();
  renderTeam();
  // Keep the creation entry usable while the owner session and project projection load.
  renderWorkbench();
  loadSession().then(loadProjects).then(() => {
    if (location.hash.startsWith('#canvas')) {
      normalizeMainSitePath();
      return;
    }
    if (redirectRetiredScriptRoute()) return;
    if (redirectRetiredRedrawRoute()) return;
    if (location.hash === '#redraw-intake') {
      openRedrawIntake('');
      return;
    }
    const workspaceRoute = workspaceToolRoute();
    if (workspaceRoute?.tool === 'redraw') {
      state.redrawIntakeWorkspaceId = workspaceRoute.projectId;
      renderRedrawIntake();
      return;
    }
    if (workspaceRoute?.tool === 'deliveries') {
      renderWorkspaceDeliveries();
      void loadWorkspaceDeliveries(workspaceRoute.projectId);
      return;
    }
    if (location.hash.startsWith('#redraw/')) {
      const route = redrawStudioRoute();
      if (route) {
        state.redrawStudioStageId = route.stageId || null;
        openRedrawStudio(route.projectId, {updateHash:false});
      }
      return;
    }
    if (location.hash.startsWith('#script/')) {
      const route = scriptStudioRoute();
      if (route) {
        state.scriptStudioStageId = route.stageId || null;
        openScriptStudio(route.projectId, {updateHash:false});
      }
      return;
    }
    if (location.hash.startsWith('#redraw-evidence/')) {
      const route = referenceEvidenceRoute();
      if (route) openReferenceEvidenceStudio({updateHash:false});
    }
  });
})();
