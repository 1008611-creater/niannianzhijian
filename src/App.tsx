import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { theme } from './theme';
import { Dashboard } from './components/Dashboard';
import { QuickHome, type QuickRecipeInput } from './components/QuickHome';
import {
  listProjects, loadProject, createProject, renameProject, duplicateProject,
  randomProjectName, docFromTimeline, hasProjectHistory, type ProjectMeta,
} from './persist/projectStore';
import type { ProjectDoc, TimelineState } from './editor/types';
import { buildProjectExport, importProjectPackage } from './persist/projectTransfer';
import { purgeProjectCascade } from './persist/mediaCleanup';
import { applyLiveCaps, applyLiveKeyStatus, applyLiveModels } from './agent/capabilities';
import { fetchCodexModels, fetchCodexStatus } from './agent/codex/client';
import { applyAgentModelStatus, applyCodexAgentStatus } from './agent/model-selection';
import { useT } from './i18n/locale';

import Editor from './Editor';

// A brand-new project starts empty; the first-run "Sample Project" gets the seed clips.
const emptyState = (): TimelineState => ({
  fps: 30,
  width: 1920,
  height: 1080,
  items: [],
  selectedId: null,
  trackOrder: ['track_v1'],
  tracks: { track_v1: { kind: 'video' } },
});
const emptyDoc = (): ProjectDoc => docFromTimeline(emptyState());
const seedDoc = async (): Promise<ProjectDoc> => docFromTimeline((await import('./editor/initial')).INITIAL);

type Route = { name: 'dashboard' } | { name: 'editor'; id: string } | { name: 'quick' };
function parseHash(): Route {
  if (window.location.hash === '#/quick') return { name: 'quick' };
  const m = window.location.hash.match(/^#\/editor\/(.+)$/);
  return m ? { name: 'editor', id: m[1] } : { name: 'dashboard' };
}
const go = (hash: string) => { window.location.hash = hash; };

interface LiveAgentStatus {
  readonly caps?: Record<string, boolean>;
  readonly keys?: Record<string, { readonly configured: boolean }>;
  readonly models?: Record<string, string>;
}

async function syncAgentBackends(isActive: () => boolean): Promise<void> {
  const [keyResult, codexResult] = await Promise.allSettled([
    fetch('/api/keys').then(async (response): Promise<LiveAgentStatus> => {
      if (!response.ok) throw new Error('Agent key status is unavailable.');
      return response.json() as Promise<LiveAgentStatus>;
    }),
    fetchCodexStatus(),
  ]);
  if (!isActive()) return;
  let savedCodexModel: string | undefined;
  let savedCodexReasoningEffort: string | undefined;
  if (keyResult.status === 'fulfilled') {
    const { caps, keys, models } = keyResult.value;
    if (caps) applyLiveCaps(caps);
    if (keys) applyLiveKeyStatus(keys);
    if (models) {
      applyLiveModels(models);
      applyAgentModelStatus(keys ?? {}, models);
      savedCodexModel = models.CODEX_MODEL;
      savedCodexReasoningEffort = models.CODEX_REASONING_EFFORT;
    }
  }
  if (codexResult.status === 'fulfilled') {
    const modelResult = codexResult.value.account?.type === 'chatgpt'
      ? await fetchCodexModels().catch(() => null)
      : null;
    if (!isActive()) return;
    applyCodexAgentStatus(
      codexResult.value,
      savedCodexModel,
      savedCodexReasoningEffort,
      modelResult && !modelResult.error ? modelResult.models : [],
    );
  }
}

function Splash({ text }: { text: string }) {
  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: theme.bg, color: theme.textDim, fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
      {text}
    </div>
  );
}

const PROJECT_LIST_TIMEOUT_MS = 8_000;

function withProjectListTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('project list timed out')), PROJECT_LIST_TIMEOUT_MS);
    operation.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function StartupFailure({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: theme.bg, color: theme.text, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'grid', gap: 12, maxWidth: 420, textAlign: 'center' }}>
        <strong>{t('工程列表暂时无法加载')}</strong>
        <span style={{ color: theme.textDim, fontSize: 13 }}>{t('你的本地工程没有被删除，请重新加载后重试。')}</span>
        <button type="button" onClick={onRetry}>{t('重新加载')}</button>
      </div>
    </div>
  );
}

interface EditorLoadBoundaryProps {
  children: ReactNode;
  onHome: () => void;
  errorLabel: string;
  retryLabel: string;
  homeLabel: string;
}

interface EditorLoadBoundaryState {
  error: Error | null;
}

class EditorLoadBoundary extends Component<EditorLoadBoundaryProps, EditorLoadBoundaryState> {
  state: EditorLoadBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): EditorLoadBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Editor failed to load', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: theme.bg, color: theme.text, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'grid', gap: 12, maxWidth: 420, textAlign: 'center' }}>
          <strong>{this.props.errorLabel}</strong>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button type="button" onClick={() => window.location.reload()}>{this.props.retryLabel}</button>
            <button type="button" onClick={this.props.onHome}>{this.props.homeLabel}</button>
          </div>
        </div>
      </div>
    );
  }
}

// Load one project's timeline, then mount the editor for it.
function EditorLoader({ meta, onHome, onRename, recipe, onRecipeConsumed }: { meta: ProjectMeta; onHome: () => void; onRename: (name: string) => void; recipe?: QuickRecipeInput; onRecipeConsumed?: () => void }) {
  const t = useT();
  const [initial, setInitial] = useState<ProjectDoc | null>(null);
  useEffect(() => {
    let alive = true;
    loadProject(meta.id).then((d) => { if (alive) setInitial(d ?? emptyDoc()); });
    return () => { alive = false; };
  }, [meta.id]);
  if (!initial) return <Splash text={t('加载工程…')} />;
  return (
    <EditorLoadBoundary
      onHome={onHome}
      errorLabel={t('编辑器加载失败，请刷新后重试')}
      retryLabel={t('刷新重试')}
      homeLabel={t('返回工程列表')}
    >
      <Editor initial={initial} project={meta} onHome={onHome} onRename={onRename} initialRecipe={recipe} onRecipeConsumed={onRecipeConsumed} />
    </EditorLoadBoundary>
  );
}

export default function App() {
  const t = useT();
  const [accountReady, setAccountReady] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [projectLoadFailed, setProjectLoadFailed] = useState(false);
  const [route, setRoute] = useState<Route>(parseHash());
  const [pendingRecipe, setPendingRecipe] = useState<QuickRecipeInput | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/niannian-auth/session', { cache: 'no-store' })
      .then((response) => {
        if (response.status === 401) {
          const returnTo = window.location.href;
          window.location.assign(`https://ai.cau.fun/api/editor/sso?returnTo=${encodeURIComponent(returnTo)}`);
          return null;
        }
        return response.json().catch(() => null);
      })
      .then(() => { if (alive) setAccountReady(true); })
      .catch(() => { if (alive) setAccountReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Resolve both server status channels before applying either one. API-backed settings
  // are applied first so cold-start backend selection cannot depend on response timing.
  useEffect(() => {
    let alive = true;
    void syncAgentBackends(() => alive);
    return () => { alive = false; };
  }, []);

  const refresh = useCallback(async () => {
    setProjectLoadFailed(false);
    try {
      setProjects(await withProjectListTimeout(listProjects()));
    } catch {
      setProjectLoadFailed(true);
    }
  }, []);

  const initializeProjects = useCallback(async () => {
    setProjectLoadFailed(false);
    try {
      let list = await withProjectListTimeout(listProjects());
      if (list.length === 0 && !(await withProjectListTimeout(hasProjectHistory()))) {
        list = [await createProject('示例工程', await seedDoc())];
      }
      setProjects(list);
    } catch (error) {
      console.error('Project list initialization failed', error);
      setProjectLoadFailed(true);
    }
  }, []);

  useEffect(() => { void initializeProjects(); }, [initializeProjects]);

  if (!accountReady) return <Splash text={t('加载中…')} />;
  if (projectLoadFailed) return <StartupFailure onRetry={() => { void initializeProjects(); }} />;
  if (!projects) return <Splash text={t('加载中…')} />;

  if (route.name === 'editor') {
    const meta = projects.find((p) => p.id === route.id);
    if (!meta) { go('#/'); return <Splash text={t('工程不存在，返回…')} />; }
    return (
      <EditorLoader
        key={meta.id}
        meta={meta}
        onHome={() => go('#/')}
        onRename={async (name) => { await renameProject(meta.id, name); refresh(); }}
        recipe={pendingRecipe ?? undefined}
        onRecipeConsumed={() => setPendingRecipe(null)}
      />
    );
  }

  if (route.name === 'quick') {
    return (
      <QuickHome
        projects={projects}
        onOpen={(id) => go(`#/editor/${id}`)}
        onNew={async () => {
          const m = await createProject(randomProjectName(), emptyDoc());
          await refresh();
          go(`#/editor/${m.id}`);
        }}
        onStartRecipe={async (input) => {
          const platformLabel = input.platform === 'douyin' ? '抖音' : input.platform === 'kuaishou' ? '快手' : '视频号';
          const workflowRunId = crypto.randomUUID();
          const m = await createProject('短剧片段精修', emptyDoc(), {
            description: `recipeId=short-drama-refine; recipeVersion=2; styleId=complete-conflict; workflowRunId=${workflowRunId}; platform=${platformLabel}; requestedDurationSeconds=${input.durationSeconds}; sourceClipCount=${input.files.length}; status=importing`,
          });
          setPendingRecipe({ ...input, workflowRunId });
          // Enter the real project as soon as its document is committed.  A
          // slow shared-index refresh must not leave the quick recipe dialog
          // stuck on "正在打开工程…".
          setProjects((current) => [m, ...(current ?? []).filter((item) => item.id !== m.id)]);
          go(`#/editor/${m.id}`);
        }}
      />
    );
  }

  return (
    <Dashboard
      projects={projects}
      onOpen={(id) => go(`#/editor/${id}`)}
      onNew={async () => { const m = await createProject(randomProjectName(), emptyDoc()); await refresh(); go(`#/editor/${m.id}`); }}
      onRename={async (id, name) => { await renameProject(id, name); refresh(); }}
      onDuplicate={async (id) => { await duplicateProject(id); refresh(); }}
      onDelete={async (id) => { await purgeProjectCascade(id); refresh(); }}  // Cascade: delete the project + clear its exclusive assets
      onExport={async (id, name) => {
        const r = await buildProjectExport(id, name);
        downloadBlob(r.blob, r.filename);
        return r.mediaMissing.length
          ? t('已导出「{name}」;{n} 个素材两端都取不到,未随包', { name, n: r.mediaMissing.length })
          : t('已导出「{name}」(含 {n} 个素材)', { name, n: r.mediaTotal });
      }}
      onImport={async (file) => {
        try {
          const r = await importProjectPackage(file);
          await refresh();
          return r.mediaMissing.length
            ? t('已导入「{name}」;缺 {n} 个素材({list})', { name: r.meta.name, n: r.mediaMissing.length, list: r.mediaMissing.map((s: string) => s.split('/').pop()).join('、') })
            : t('已导入「{name}」(素材 {a}/{b})', { name: r.meta.name, a: r.mediaRestored, b: r.mediaTotal });
        } catch (error) {
          return t('导入失败:{error}', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }}
    />
  );
}

// Blob download: Synchronous revoke will interrupt the Chrome download (plugin export is ignored), and DOM + delayed recycling must be installed.
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
