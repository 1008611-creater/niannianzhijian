import type { MediaAsset } from './editor/types';

export type QuickStoryPreference = 'priority' | 'exclude';
export type QuickStoryPreferences = Record<string, QuickStoryPreference>;

export interface QuickStoryRange {
  assetId: string;
  sceneId: string;
  startMs: number;
  endMs: number;
  preference: QuickStoryPreference;
}

export interface QuickStoryBeat {
  assetId: string;
  sourceStartMs: number;
  sourceDurationMs: number;
}

export function quickStorySceneKey(assetId: string, sceneId: string): string {
  return `${assetId}\u0000${sceneId}`;
}

export function selectedQuickStoryRanges(assets: readonly MediaAsset[], preferences: QuickStoryPreferences): QuickStoryRange[] {
  return assets.flatMap((asset) => (asset.intelligence?.scenes ?? []).flatMap((scene) => {
    const preference = preferences[quickStorySceneKey(asset.id, scene.id)];
    return preference ? [{ assetId: asset.id, sceneId: scene.id, startMs: scene.startMs, endMs: scene.endMs, preference }] : [];
  }));
}

function overlaps(beat: QuickStoryBeat, range: QuickStoryRange): boolean {
  if (beat.assetId !== range.assetId) return false;
  const beatEndMs = beat.sourceStartMs + beat.sourceDurationMs;
  return beat.sourceStartMs < range.endMs && beatEndMs > range.startMs;
}

export function quickStoryPreferenceError(beats: readonly QuickStoryBeat[], ranges: readonly QuickStoryRange[]): string | undefined {
  for (const range of ranges.filter((item) => item.preference === 'exclude')) {
    if (beats.some((beat) => overlaps(beat, range))) return '粗剪引用了用户标记为“不要用”的剧情段落。';
  }
  for (const range of ranges.filter((item) => item.preference === 'priority')) {
    if (!beats.some((beat) => overlaps(beat, range))) return '粗剪没有包含用户标记为“重点保留”的剧情段落。';
  }
  return undefined;
}
