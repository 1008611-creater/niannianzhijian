import { sourceRevisionOf } from '../editor/mediaSourceRevision';
import type { AssetIntelligence, MediaAsset } from '../editor/types';

export function isCurrentAssetIntelligence(asset: MediaAsset): asset is MediaAsset & { intelligence: AssetIntelligence } {
  return asset.intelligence?.version === 1
    && asset.intelligence.sourceRevision === sourceRevisionOf(asset);
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, '');
}

export interface AssetMetadataDocument {
  assetId: string;
  sourceRevision: string;
  text: string;
  field: 'ocr' | 'transcript' | 'tag' | 'entity' | 'scene';
  startMs: number;
  endMs: number;
}

/** Flatten current source-bound intelligence into searchable, source-locatable documents. */
export function assetMetadataDocuments(assets: readonly MediaAsset[]): AssetMetadataDocument[] {
  const documents: AssetMetadataDocument[] = [];
  for (const asset of assets) {
    if (!isCurrentAssetIntelligence(asset)) continue;
    const sourceRevision = sourceRevisionOf(asset);
    const endMs = Math.max(1, Math.round((asset.durationInFrames / 30) * 1000));
    const add = (text: string | undefined, field: AssetMetadataDocument['field'], startMs = 0, end = endMs) => {
      const value = text?.trim();
      if (!value || !normalized(value)) return;
      documents.push({ assetId: asset.id, sourceRevision, text: value, field,
        startMs: Math.max(0, Math.round(startMs)), endMs: Math.max(Math.round(startMs) + 1, Math.round(end)) });
    };
    add(asset.intelligence.ocrText, 'ocr');
    add(asset.intelligence.transcriptText, 'transcript');
    for (const tag of asset.intelligence.tags ?? []) add(tag, 'tag');
    for (const entity of asset.intelligence.entities ?? []) add(entity.label, 'entity', entity.startMs, entity.endMs);
    for (const scene of asset.intelligence.scenes ?? []) add(scene.label, 'scene', scene.startMs, scene.endMs);
  }
  return documents;
}

export function metadataDocumentsForQuery(query: string, assets: readonly MediaAsset[], limit = 24): AssetMetadataDocument[] {
  const needle = normalized(query);
  if (!needle) return [];
  return assetMetadataDocuments(assets)
    .filter((document) => normalized(document.text).includes(needle))
    .slice(0, Math.max(0, limit));
}
