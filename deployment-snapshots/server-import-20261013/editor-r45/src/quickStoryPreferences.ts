import type { MediaAsset } from './editor/types';

export type QuickStoryPreference = 'priority' | 'exclude';
export type QuickStoryPreferences = Record<string, QuickStoryPreference>;

export interface QuickStoryRange {
  assetId: string;
  sceneId: string;
  startMs: number;
  endMs: number;
  preference: QuickStoryPreference;
  order?: number;
}

export interface QuickStoryBeat {
  assetId: string;
  sourceStartMs: number;
  sourceDurationMs: number;
}

export function quickStorySceneKey(assetId: string, sceneId: string): string {
  return `${assetId}\u0000${sceneId}`;
}

export function selectedQuickStoryRanges(assets: readonly MediaAsset[], preferences: QuickStoryPreferences, priorityOrder: readonly string[] = []): QuickStoryRange[] {
  return assets.flatMap((asset) => (asset.intelligence?.scenes ?? []).flatMap((scene) => {
    const preference = preferences[quickStorySceneKey(asset.id, scene.id)];
    if (!preference) return [];
    const key = quickStorySceneKey(asset.id, scene.id);
    const order = preference === 'priority' ? priorityOrder.indexOf(key) : -1;
    return [{ assetId: asset.id, sceneId: scene.id, startMs: scene.startMs, endMs: scene.endMs, preference, ...(order >= 0 ? { order } : {}) }];
  })).sort((a, b) => a.preference === 'priority' && b.preference === 'priority'
    ? (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    : 0);
}

export function priorityStoryOrder(preferences: QuickStoryPreferences, currentOrder: readonly string[]): string[] {
  const selected = new Set(Object.entries(preferences).filter(([, preference]) => preference === 'priority').map(([key]) => key));
  return [...currentOrder.filter((key) => selected.has(key)), ...[...selected].filter((key) => !currentOrder.includes(key))];
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
  const required = ranges.filter((item) => item.preference === 'priority' && item.order !== undefined).sort((a, b) => a.order! - b.order!);
  let previousBeatIndex = -1;
  for (const range of required) {
    const beatIndex = beats.findIndex((beat) => overlaps(beat, range));
    if (beatIndex < previousBeatIndex) return '粗剪没有遵守用户设定的重点剧情顺序。';
    previousBeatIndex = beatIndex;
  }
  return undefined;
}
