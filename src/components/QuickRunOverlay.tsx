import type { MediaAsset, TimelineItem } from '../editor/types';
import type { QuickRecipeInput } from './QuickHome';
import './quickRunOverlay.css';

export type QuickRunStage = 'importing' | 'understanding' | 'selecting' | 'assembling' | 'ready' | 'error';

interface QuickRunOverlayProps {
  stage: QuickRunStage;
  recipe: QuickRecipeInput;
  asset?: MediaAsset;
  assets: MediaAsset[];
  importedRatio: number;
  createdItems: TimelineItem[];
  analyzedAssetCount: number;
  roughCutSourceCount: number;
  fps: number;
  error?: string;
  onRetry: () => void;
  onEnterProfessional: () => void;
  onBack: () => void;
}

const STEPS = [
  ['importing', '导入素材'],
  ['understanding', '理解剧情'],
  ['selecting', '选择片段'],
  ['assembling', '生成粗剪'],
] as const;

const STAGE_INDEX: Record<QuickRunStage, number> = {
  importing: 0,
  understanding: 1,
  selecting: 2,
  assembling: 3,
  ready: 4,
  error: -1,
};

function timeLabel(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function platformLabel(platform: QuickRecipeInput['platform']): string {
  if (platform === 'douyin') return '抖音';
  if (platform === 'kuaishou') return '快手';
  return '视频号';
}

export function QuickRunOverlay({
  stage,
  recipe,
  asset,
  assets,
  importedRatio,
  createdItems,
  analyzedAssetCount,
  roughCutSourceCount,
  fps,
  error,
  onRetry,
  onEnterProfessional,
  onBack,
}: QuickRunOverlayProps) {
  const stageIndex = STAGE_INDEX[stage];
  const scenes = assets.flatMap((item) => (item.intelligence?.scenes ?? []).map((scene) => ({
    ...scene,
    assetName: item.name,
  }))).slice(0, 4);
  const durationFrames = createdItems.reduce((maximum, item) => Math.max(maximum, item.startFrame + item.durationInFrames), 0);
  const resultSeconds = Math.round(durationFrames / Math.max(1, fps));
  const targetSeconds = stage === 'ready' && resultSeconds > 0 ? resultSeconds : recipe.durationSeconds;
  const percent = stage === 'ready' ? 100
    : stage === 'importing' ? Math.max(8, Math.round(importedRatio * 25))
      : stage === 'understanding' ? 44
        : stage === 'selecting' ? 68
          : stage === 'assembling' ? 86
            : 0;

  return (
    <div className="qrun-shell" role="dialog" aria-modal="true" aria-label="快速成片制作进度">
      <header className="qrun-topbar">
        <button type="button" className="qrun-back" onClick={onBack}>返回成片方案</button>
        <div className="qrun-brand"><span className="qrun-brand-dot" />念念智剪</div>
        <button type="button" className="qrun-pro-link" onClick={onEnterProfessional}>进入专业模式</button>
      </header>

      <main className="qrun-main">
        <section className="qrun-heading">
          <div>
            <span className="qrun-kicker">短剧片段精修</span>
            <h1>{stage === 'ready' ? '发布版粗剪已生成' : stage === 'error' ? '本次制作没有完成' : '正在制作发布版'}</h1>
          </div>
          <div className="qrun-target">
            <span>{platformLabel(recipe.platform)}</span>
            <strong>{targetSeconds} 秒</strong>
            <span>9:16</span>
          </div>
        </section>

        <section className="qrun-workspace">
          <div className="qrun-media">
            {asset?.src ? (
              <video src={asset.src} controls preload="metadata" playsInline aria-label={asset.name} />
            ) : (
              <div className="qrun-media-pending">
                <span>{stage === 'error' ? '!' : `${Math.round(importedRatio * 100)}%`}</span>
                <p>{stage === 'error' ? '素材仍保留在本地工程' : '正在安全导入素材'}</p>
              </div>
            )}
            <div className="qrun-media-caption">
              <strong>{asset?.name ?? recipe.files[0]?.name ?? '短剧片段'}</strong>
              <span>{recipe.files.length > 1 ? `共 ${recipe.files.length} 段素材，按剧情顺序导入` : asset ? '原素材已进入当前工程' : '不会上传到公开素材库'}</span>
            </div>
          </div>

          <div className="qrun-status">
            <div className="qrun-progress-line"><span style={{ width: `${percent}%` }} /></div>
            <div className="qrun-steps">
              {STEPS.map(([key, label], index) => {
                const done = stage === 'ready' || stageIndex > index;
                const active = stage !== 'error' && stageIndex === index;
                return (
                  <div className={`qrun-step${done ? ' done' : ''}${active ? ' active' : ''}`} key={key}>
                    <span>{done ? '✓' : index + 1}</span>
                    <div><strong>{label}</strong><small>{active ? '正在处理' : done ? '已完成' : '等待中'}</small></div>
                  </div>
                );
              })}
            </div>

            {scenes.length > 0 && (
              <div className="qrun-scenes">
                <div className="qrun-section-title"><strong>已找到的剧情段落</strong><span>来自真实源时间</span></div>
                {scenes.map((scene) => (
                  <div className="qrun-scene" key={scene.id}>
                    <time>{timeLabel(scene.startMs)} - {timeLabel(scene.endMs)}</time>
                    <span>{scene.label || '剧情片段'} · {scene.assetName}</span>
                  </div>
                ))}
              </div>
            )}

            {stage === 'ready' && (
              <div className="qrun-result">
                <div><strong>{analyzedAssetCount}/{assets.length}</strong><span>段已理解素材</span></div>
                <div><strong>{roughCutSourceCount}</strong><span>段真实来源</span></div>
                <div><strong>{resultSeconds || recipe.durationSeconds}s</strong><span>当前成片时长</span></div>
                <div><strong>真实</strong><span>素材时间轴</span></div>
              </div>
            )}

            {stage === 'error' && <div className="qrun-error" role="alert">{error || 'Agent 没有生成可编辑片段，原素材和工程均已保留。'}</div>}

            <div className="qrun-actions">
              {stage === 'ready' ? (
                <button type="button" className="qrun-primary" onClick={onEnterProfessional}>查看并继续精修</button>
              ) : stage === 'error' ? (
                <><button type="button" className="qrun-primary" onClick={onRetry}>重新制作</button><button type="button" className="qrun-secondary" onClick={onEnterProfessional}>保留素材进入编辑</button></>
              ) : (
                <span className="qrun-wait">可随时进入专业模式，当前任务会继续保留</span>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
