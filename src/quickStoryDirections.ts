import type { MediaAsset } from './editor/types';

export type QuickStoryDirectionId = 'chronological' | 'hook-first' | 'suspense-ending';

export interface QuickStoryDirection {
  id: QuickStoryDirectionId;
  title: string;
  description: string;
  agentInstruction: string;
  requiredOpening?: { assetId: string; startMs: number; endMs: number };
  requiredEnding?: { assetId: string; startMs: number; endMs: number };
}

interface StoryScene {
  assetId: string;
  startMs: number;
  endMs: number;
  label: string;
}

function storyScenes(assets: readonly MediaAsset[]): StoryScene[] {
  return assets.flatMap((asset) => (asset.intelligence?.scenes ?? []).map((scene) => ({
    assetId: asset.id,
    startMs: scene.startMs,
    endMs: scene.endMs,
    label: scene.label?.trim() || '这一段剧情',
  })));
}

function required(scene: StoryScene) {
  return { assetId: scene.assetId, startMs: scene.startMs, endMs: scene.endMs };
}

/** Directions only cite the persisted video-analysis ranges shown to the user. */
export function quickStoryDirections(assets: readonly MediaAsset[]): QuickStoryDirection[] {
  const scenes = storyScenes(assets);
  if (!scenes.length) return [];
  const first = scenes[0]!;
  const last = scenes[scenes.length - 1]!;
  const hook = scenes[Math.min(scenes.length - 1, Math.max(1, Math.floor(scenes.length / 2)))]!;
  return [
    {
      id: 'chronological',
      title: '顺着故事讲',
      description: `从「${first.label}」开始，顺着剧情讲到「${last.label}」。`,
      agentInstruction: `按素材原有剧情顺序组织，先交代「${first.label}」，再推进到「${last.label}」。`,
    },
    {
      id: 'hook-first',
      title: '先放关键一幕',
      description: `开头先看「${hook.label}」，再回到「${first.label}」讲清经过。`,
      agentInstruction: `第一段必须使用「${hook.label}」的真实时间范围，再回到「${first.label}」交代前因；不能伪造未发生的转折。`,
      requiredOpening: required(hook),
    },
    {
      id: 'suspense-ending',
      title: '结尾留在这里',
      description: `前面压缩铺垫，把「${last.label}」留到最后收住。`,
      agentInstruction: `保留必要铺垫，并把「${last.label}」的真实时间范围作为最后一个叙事段落；不要编造后续剧情。`,
      requiredEnding: required(last),
    },
  ];
}

function overlaps(beat: { assetId: string; sourceStartMs: number; sourceDurationMs: number }, range: { assetId: string; startMs: number; endMs: number }): boolean {
  const beatEnd = beat.sourceStartMs + beat.sourceDurationMs;
  return beat.assetId === range.assetId && beat.sourceStartMs < range.endMs && beatEnd > range.startMs;
}

export function quickStoryDirectionError(
  beats: readonly { assetId: string; sourceStartMs: number; sourceDurationMs: number }[],
  direction?: QuickStoryDirection,
): string | undefined {
  if (!direction || !beats.length) return undefined;
  if (direction.requiredOpening && !overlaps(beats[0]!, direction.requiredOpening)) return '粗剪没有按你选择的方向从指定剧情段开始。';
  if (direction.requiredEnding && !overlaps(beats[beats.length - 1]!, direction.requiredEnding)) return '粗剪没有按你选择的方向以指定剧情段收尾。';
  return undefined;
}
