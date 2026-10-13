import type { MediaAsset } from './editor/types';

/** Keep quick-mode source coverage strict without making one-clip recipes impossible. */
export function quickAssetCoverageInstruction(assets: readonly Pick<MediaAsset, 'id'>[]): string {
  if (assets.length <= 1) {
    return '当前只有一段实际素材，beats 可以只引用这个实际 assetId，并可从其中选择一个或多个真实时间段；不得因只有一个 assetId 而拒绝生成粗剪。';
  }
  return `当前有 ${assets.length} 段实际素材，beats 必须覆盖这 ${assets.length} 个实际 assetId；不得遗漏任一段，也不得引用不存在的素材。`;
}
