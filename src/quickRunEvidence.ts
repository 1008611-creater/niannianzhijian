import type { TimelineItem } from './editor/types';

export function roughCutSourceCount(items: readonly TimelineItem[]): number {
  return new Set(items.map((item) => item.sourceAssetId).filter((assetId): assetId is string => !!assetId)).size;
}

export function isCompleteQuickRoughCut(items: readonly TimelineItem[], expectedSourceCount: number): boolean {
  if (!items.length) return false;
  return expectedSourceCount < 2 || roughCutSourceCount(items) >= 2;
}
