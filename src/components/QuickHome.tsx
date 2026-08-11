import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ProjectMeta } from '../persist/projectStore';
import './quickHome.css';

interface QuickHomeProps {
  projects: ProjectMeta[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onStartRecipe: (input: QuickRecipeInput) => Promise<void>;
}

export interface QuickRecipeInput {
  recipeId: 'short-drama-refine';
  file: File;
  platform: 'douyin' | 'kuaishou' | 'video-account';
  durationSeconds: 45 | 60 | 90;
  workflowRunId?: string;
}

const recipes = [
  {
    cover: '/quick-home/card1.png',
    alt: '短剧片段精修封面',
    duration: '01:28',
    title: '短剧片段精修',
    desc: '上传短剧素材，自动识别精彩片段，配上字幕、转场和节奏感音乐，生成短视频发布版。',
    specs: [
      { k: '适合场景', v: '短剧二创、精彩片段再发布' },
      { k: '所需素材', v: '短剧原片段（建议 1~5 分钟）' },
      { k: '预期时长/平台', v: '15~90 秒 / 抖音、快手、视频号' },
      { k: '预计效果', v: '去重增强、节奏紧凑、画面清晰' },
    ],
  },
  {
    cover: '/quick-home/card2.png',
    alt: '无声素材解说封面',
    duration: '02:15',
    title: '无声素材解说',
    desc: '没有旁白的视频？自动生成配音脚本并合成 AI 口播，添加字幕和背景音乐，让画面会讲故事。',
    specs: [
      { k: '适合场景', v: '纪录片解说、知识分享、素材盘活' },
      { k: '所需素材', v: '无声视频（建议 30 秒~10 分钟）' },
      { k: '预期时长/平台', v: '1~5 分钟 / B 站、抖音、视频号' },
      { k: '预计效果', v: '解说流畅、字幕同步、内容完整' },
    ],
  },
  {
    cover: '/quick-home/card3.png',
    alt: '商品种草短视频封面',
    duration: '00:48',
    title: '商品种草短视频',
    desc: '上传商品素材，自动生成带货口播、卖点字幕和节奏卡点，适配短视频平台直接发布。',
    specs: [
      { k: '适合场景', v: '商品推广、电商种草、直播预热' },
      { k: '所需素材', v: '商品图/视频 + 卖点文案' },
      { k: '预期时长/平台', v: '15~60 秒 / 抖音、快手、小红书' },
      { k: '预计效果', v: '突出卖点、吸引点击、提升转化' },
    ],
  },
] as const;

function BrandMark() {
  return (
    <div className="qk-logo" title="念念 AI">
      <svg width="24" height="24" viewBox="0 0 96 96">
        <g fill="none" stroke="#f7f7f3" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 50 48 12l29 38" />
          <path d="M29 40h38" />
          <path d="m25 57-7 9" />
          <path d="m71 57 7 9" />
          <path d="M31 71c0 9.4 7.6 17 17 17s17-7.6 17-17" />
        </g>
        <path d="M48 56v13" fill="none" stroke="#d7b36a" strokeWidth="7" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1.02-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
    </svg>
  );
}

function NavIcon({ name }: { name: 'folder' | 'message' | 'bell' | 'menu' }) {
  const paths: Record<typeof name, ReactNode> = {
    folder: (
      <>
        <path d="M3 7h6l2 2h10v10H3V7z" />
        <path d="M3 7V5h10" />
      </>
    ),
    message: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.2 0-2.4-.25-3.5-.7L3 21l1.7-6A8.5 8.5 0 1 1 21 11.5z" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#fff">
      <path d="M7 4.8v14.4c0 .9 1 1.5 1.8 1L20 13c.7-.5.7-1.6 0-2.1L8.8 3.9c-.8-.6-1.8 0-1.8 1z" />
    </svg>
  );
}

function ProjectActions() {
  return (
    <span className="qk-p-ops">
      <button type="button" title="编辑">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
      <button type="button" title="复制">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      </button>
      <button type="button" title="删除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
        </svg>
      </button>
    </span>
  );
}

export function QuickHome({ projects, onOpen, onNew, onStartRecipe }: QuickHomeProps) {
  const [mode, setMode] = useState<'quick' | 'pro'>('quick');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [projectThumbs, setProjectThumbs] = useState<Record<string, string>>({});
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeFile, setRecipeFile] = useState<File | null>(null);
  const [recipePlatform, setRecipePlatform] = useState<QuickRecipeInput['platform']>('douyin');
  const [recipeDuration, setRecipeDuration] = useState<QuickRecipeInput['durationSeconds']>(60);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [recipeError, setRecipeError] = useState<string | null>(null);

  // Project cards reuse the recipe cover art as a visual placeholder until real posters render.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const thumbs: Record<string, string> = {};
      const covers = ['/quick-home/card1.png', '/quick-home/card2.png', '/quick-home/card3.png', '/quick-home/card1.png'];
      projects.forEach((m, index) => {
        if (!m.deletedAt) thumbs[m.id] = covers[index % covers.length] ?? covers[0];
      });
      if (alive) setProjectThumbs(thumbs);
    })();
    return () => { alive = false; };
  }, [projects]);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? projects.filter((p) => !p.deletedAt && p.name.toLocaleLowerCase().includes(normalized))
      : projects.filter((p) => !p.deletedAt);
  }, [projects, query]);

  const openRecipe = (title: string) => {
    if (title === '短剧片段精修') {
      setRecipeError(null);
      setRecipeOpen(true);
      return;
    }
    onNew();
  };

  const submitRecipe = async () => {
    if (!recipeFile || recipeBusy) return;
    setRecipeBusy(true);
    setRecipeError(null);
    try {
      await onStartRecipe({ recipeId: 'short-drama-refine', file: recipeFile, platform: recipePlatform, durationSeconds: recipeDuration });
    } catch (error) {
      setRecipeError(error instanceof Error ? error.message : '启动失败，请重试');
      setRecipeBusy(false);
    }
  };

  return (
    <div className="qk-shell">
      <div className="qk-container">
        <header className="qk-topbar">
          <div className="qk-brand">
            <BrandMark />
            <b>念念智剪</b>
            <span className="qk-sep" />
            <span className="qk-crumb">我的工程</span>
          </div>
          <div className="qk-nav">
            <button type="button" title="设置"><GearIcon /></button>
            <button type="button" title="素材库"><NavIcon name="folder" /></button>
            <button type="button" title="消息"><NavIcon name="message" /></button>
            <button type="button" title="通知"><NavIcon name="bell" /></button>
            <button type="button" title="菜单"><NavIcon name="menu" /></button>
          </div>
        </header>

        <section className="qk-hero">
          <h1>你想做哪种视频？</h1>
          <p>选一个成片方案，生成后仍可进入专业剪辑继续修改。</p>
          <div className="qk-tabs" role="tablist">
            <button type="button" className={`qk-tab${mode === 'quick' ? ' on' : ''}`} onClick={() => setMode('quick')}>快速成片</button>
            <button type="button" className={`qk-tab${mode === 'pro' ? ' on' : ''}`} onClick={() => { setMode('pro'); window.location.hash = '#/'; }}>专业剪辑</button>
          </div>
        </section>

        <section className="qk-cards">
          {recipes.map((recipe) => (
            <article className="qk-card" key={recipe.title}>
              <div className="qk-cover">
                <img src={recipe.cover} alt={recipe.alt} />
                <button className="qk-play" type="button" aria-label="播放"><PlayIcon /></button>
                <span className="qk-duration">{recipe.duration}</span>
              </div>
              <div className="qk-body">
                <div className="qk-title">{recipe.title} <span className="qk-star">★</span></div>
                <div className="qk-desc">{recipe.desc}</div>
                <div className="qk-specs">
                  {recipe.specs.map((spec) => (
                    <div className="qk-spec" key={spec.k}>
                      <div className="k">{spec.k}</div>
                      <div className="v">{spec.v}</div>
                    </div>
                  ))}
                </div>
                <div className="qk-actions">
                  <button className="qk-ghost" type="button">看成片结构 <ArrowIcon /></button>
                  <button className="qk-cta" type="button" onClick={() => openRecipe(recipe.title)}>开始创作</button>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="qk-projects">
          <div className="qk-proj-head">
            <h2>我的工程</h2>
            <div className="qk-proj-tools">
              <div className="qk-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  aria-label="搜索工程"
                  placeholder="搜索工程"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <button className="qk-tool-btn" type="button">
                更新时间
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <button className="qk-tool-btn" type="button">
                导入工程
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 3v12M7 10l5 5 5-5" />
                </svg>
              </button>
              <div className="qk-view-toggle">
                <button type="button" className={view === 'grid' ? 'on' : ''} title="网格视图" onClick={() => setView('grid')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </button>
                <button type="button" className={view === 'list' ? 'on' : ''} title="列表视图" onClick={() => setView('list')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="qk-proj-list">
            <button className="qk-p-card qk-p-new" type="button" onClick={onNew}>
              <span className="qk-plus">+</span>
              <span>新建工程</span>
            </button>
            {visibleProjects.map((project, index) => (
              <article className="qk-p-card" key={project.id} onClick={() => onOpen(project.id)}>
                <div className="qk-p-cover">
                  <img src={projectThumbs[project.id] ?? '/quick-home/card1.png'} alt={project.name} />
                  <span className="qk-duration" style={{ right: 8, bottom: 7, fontSize: 10 }}>
                    {index % 2 === 0 ? '01:28' : '02:15'}
                  </span>
                </div>
                <div className="qk-p-body">
                  <div className="qk-p-name">{project.name}</div>
                  <div className="qk-p-meta">
                    <span className="qk-p-time">刚刚</span>
                    <ProjectActions />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      {recipeOpen && (
        <div className="qk-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !recipeBusy) setRecipeOpen(false); }}>
          <section className="qk-modal" role="dialog" aria-modal="true" aria-labelledby="qk-recipe-title">
            <div className="qk-modal-head">
              <div><span className="qk-eyebrow">快速成片 · 01</span><h2 id="qk-recipe-title">短剧片段精修</h2><p>上传一段短剧素材，念念智剪会先找出完整冲突，再生成可继续编辑的发布版。</p></div>
              <button className="qk-modal-close" type="button" aria-label="关闭" disabled={recipeBusy} onClick={() => setRecipeOpen(false)}>×</button>
            </div>
            <label className={`qk-upload-drop${recipeFile ? ' has-file' : ''}`}>
              <input type="file" accept="video/*" onChange={(event) => { setRecipeFile(event.target.files?.[0] ?? null); setRecipeError(null); }} />
              <span className="qk-upload-icon">↑</span>
              <strong>{recipeFile ? recipeFile.name : '选择短剧视频'}</strong>
              <small>{recipeFile ? `${(recipeFile.size / 1024 / 1024).toFixed(1)} MB · 已准备导入` : '支持 MP4、MOV、WebM，建议 1~5 分钟'}</small>
            </label>
            <div className="qk-form-row">
              <label><span>发布平台</span><select value={recipePlatform} onChange={(event) => setRecipePlatform(event.target.value as QuickRecipeInput['platform'])}><option value="douyin">抖音</option><option value="kuaishou">快手</option><option value="video-account">视频号</option></select></label>
              <label><span>目标时长</span><select value={recipeDuration} onChange={(event) => setRecipeDuration(Number(event.target.value) as QuickRecipeInput['durationSeconds'])}><option value={45}>约 45 秒</option><option value={60}>约 60 秒</option><option value={90}>约 90 秒</option></select></label>
            </div>
            <div className="qk-modal-note"><span>成片会保留原声</span><span>字幕仅使用真实时间戳</span><span>完成后进入专业编辑</span></div>
            {recipeError && <div className="qk-form-error" role="alert">{recipeError}</div>}
            <button className="qk-modal-submit" type="button" disabled={!recipeFile || recipeBusy} onClick={() => void submitRecipe()}>{recipeBusy ? '正在打开工程…' : '开始制作短剧发布版'}</button>
          </section>
        </div>
      )}
    </div>
  );
}
