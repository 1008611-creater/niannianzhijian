'use strict';

// A canvas category is the durable top-level bucket. Storyboard groups are
// explicit children of that bucket and are the only place generation nodes
// may live. Keeping the taxonomy in the document lets every client rebuild
// the same view after refresh without copying an asset or a provider result.
const TOP_LEVEL_GROUPS = Object.freeze([
  Object.freeze({id:'shots', name:'分镜'}),
  Object.freeze({id:'characters', name:'角色'}),
  Object.freeze({id:'scenes', name:'场景'}),
  Object.freeze({id:'props', name:'道具'}),
  Object.freeze({id:'audio', name:'声音'})
]);

const TOP_LEVEL_IDS = new Set(TOP_LEVEL_GROUPS.map(group => group.id));
const STORYBOARD_CATEGORY = 'shots';
const DEFAULT_STORYBOARD_GROUP_ID = 'storyboard-unassigned';

function text(value, limit = 160) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim().slice(0, limit);
}

function safeId(value, fallback) {
  const id = text(value, 120);
  return /^[A-Za-z0-9_-]{3,120}$/.test(id) ? id : fallback;
}

function shotIdFor(group) {
  const explicit = text(group?.shotId, 120);
  if (explicit) return explicit;
  const title = text(group?.name, 240);
  const matched = title.match(/(?:^|\D)(E\d{2,3}-G\d{1,3})(?:\D|$)/i);
  return matched ? matched[1].toUpperCase() : null;
}

function defaultStoryboardGroup(now) {
  return {
    id:DEFAULT_STORYBOARD_GROUP_ID,
    name:'分镜·未分配',
    categoryId:STORYBOARD_CATEGORY,
    parentGroupId:'shots',
    shotId:'UNASSIGNED',
    nodeIds:[],
    createdAt:now,
    updatedAt:now
  };
}

function normalizeGroup(group, index, now) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return null;
  const categoryId = TOP_LEVEL_IDS.has(text(group.categoryId, 40)) ? text(group.categoryId, 40) : STORYBOARD_CATEGORY;
  const normalized = {
    ...group,
    id:safeId(group.id, 'group-' + (index + 1)),
    name:text(group.name, 160) || ('组 ' + (index + 1)),
    categoryId,
    nodeIds:[...new Set((Array.isArray(group.nodeIds) ? group.nodeIds : []).map(value => safeId(value, '')).filter(Boolean))].slice(0, 300),
    assetIds:[...new Set((Array.isArray(group.assetIds) ? group.assetIds : []).map(value => safeId(value, '')).filter(Boolean))].slice(0, 300),
    parentGroupId:safeId(group.parentGroupId, '') || null,
    createdAt:Number.isFinite(Number(group.createdAt)) ? Number(group.createdAt) : now,
    updatedAt:Number.isFinite(Number(group.updatedAt)) ? Number(group.updatedAt) : now
  };
  if (categoryId === STORYBOARD_CATEGORY && normalized.id !== 'shots') normalized.shotId = shotIdFor(normalized) || normalized.id;
  else delete normalized.shotId;
  return normalized;
}

function assetIdsForNode(node) {
  const metadata = node?.meta && typeof node.meta === 'object' && !Array.isArray(node.meta) ? node.meta : {};
  const values = [
    ...(Array.isArray(metadata.assetIds) ? metadata.assetIds : []),
    ...(Array.isArray(metadata.inputAssetIds) ? metadata.inputAssetIds : []),
    metadata.canvasAssetId,
    metadata.firstFrameAssetId,
    node?.result?.assetId
  ];
  return [...new Set(values.map(value => safeId(value, '')).filter(Boolean))];
}

function preferredStoryboardGroup(groups, requestedGroupId, now) {
  const requested = text(requestedGroupId, 120);
  const existing = groups.find(group => group.id === requested && group.id !== 'shots' && group.categoryId === STORYBOARD_CATEGORY)
    || groups.find(group => group.id !== 'shots' && group.categoryId === STORYBOARD_CATEGORY && group.shotId && group.shotId !== 'UNASSIGNED')
    || groups.find(group => group.id !== 'shots' && group.categoryId === STORYBOARD_CATEGORY);
  if (existing) return existing;
  const created = defaultStoryboardGroup(now);
  groups.push(created);
  return created;
}

function isGenerationNode(node) {
  if (node?.kind === 'asset' || node?.type === 'asset') return false;
  return node?.kind === 'image' || node?.kind === 'video' || node?.type === 'image' || node?.type === 'video';
}

function h3SpecSource(node) {
  const meta = node?.meta && typeof node.meta === 'object' && !Array.isArray(node.meta) ? node.meta : {};
  const data = node?.data && typeof node.data === 'object' && !Array.isArray(node.data) ? node.data : {};
  const parameters = node?.parameters && typeof node.parameters === 'object' && !Array.isArray(node.parameters) ? node.parameters : {};
  return {meta, data, parameters};
}

function isLegacyH3Node(node) {
  if (!node || (node.kind !== 'video' && node.type !== 'video')) return false;
  const {meta, data, parameters} = h3SpecSource(node);
  const values = [
    node.skillKey, node.modelKey, node.modelAlias, node.model,
    meta.skillKey, meta.modelKey, meta.modelAlias, meta.model,
    data.skillKey, data.modelKey, data.modelAlias, data.model,
    parameters.modelKey, parameters.modelAlias, parameters.model
  ].map(value => text(value, 160).toLowerCase());
  return values.some(value => ['minimaxh3skill', 'minimax-h3', 'niannian/minimax-h3', 'minimax-h3-fl2va', 'minimax_h3_fl2va'].includes(value))
    || values.some(value => value.includes('minimaxh3'))
    || values.some(value => /h3/.test(value) && /video|视频/.test(value));
}

function isFirstEntranceSegment(node) {
  const {meta, data, parameters} = h3SpecSource(node);
  const prompt = [
    node.prompt, node.videoPrompt, node.video_prompt,
    meta.prompt, meta.videoPrompt, meta.video_prompt,
    data.prompt, data.videoPrompt, data.video_prompt,
    parameters.prompt, parameters.videoPrompt, parameters.video_prompt
  ].map(value => text(value, 2000)).join('\n');
  return prompt.includes('只完成第1组的0.0-5.0秒进门子段');
}

function normalizeLegacyH3Node(node, options = {}) {
  if (!isLegacyH3Node(node)) return node;
  const {meta, data, parameters} = h3SpecSource(node);
  const source = options.generationDefaults && typeof options.generationDefaults === 'object'
    ? options.generationDefaults : {};
  const candidate = (...values) => values.map(value => text(value, 32)).find(Boolean) || '';
  const entranceSegment = isFirstEntranceSegment(node);
  const aspectRatio = !entranceSegment && /^\d{1,2}:\d{1,2}$/.test(candidate(
    meta.aspectRatio, meta.aspect_ratio, data.aspectRatio, data.aspect_ratio,
    parameters.aspectRatio, parameters.aspect_ratio, node.aspectRatio, node.aspect_ratio
  )) ? candidate(
    meta.aspectRatio, meta.aspect_ratio, data.aspectRatio, data.aspect_ratio,
    parameters.aspectRatio, parameters.aspect_ratio, node.aspectRatio, node.aspect_ratio
  ) : (/^\d{1,2}:\d{1,2}$/.test(text(source.aspectRatio, 16)) ? text(source.aspectRatio, 16) : '9:16');
  const rawResolution = candidate(meta.resolution, data.resolution, parameters.resolution, node.resolution).toLowerCase();
  const resolution = entranceSegment ? '2k' : (['1k', '2k', '4k'].includes(rawResolution) ? rawResolution : '2k');
  const rawDuration = Number(meta.durationSeconds ?? data.durationSeconds ?? parameters.durationSeconds ?? node.durationSeconds);
  const durationSeconds = entranceSegment ? 5 : (Number.isFinite(rawDuration) && rawDuration >= 4 && rawDuration <= 15 ? rawDuration : 5);
  const canonical = {model:'minimax-h3', modelKey:'minimax-h3', modelAlias:'minimax-h3', aspectRatio, resolution, durationSeconds};
  node.meta = {...meta, ...canonical, generationSpecVersion:'h3.v1'};
  node.data = {...data, ...canonical, generationSpecVersion:'h3.v1'};
  node.parameters = {...parameters, ...canonical};
  node.aspectRatio = aspectRatio;
  node.resolution = resolution;
  node.durationSeconds = durationSeconds;
  return node;
}

function normalizeGenerationCanvas(canvas, options = {}) {
  const now = Number(options.now || Date.now());
  const raw = canvas && typeof canvas === 'object' && !Array.isArray(canvas) ? canvas : {};
  const groups = (Array.isArray(raw.groups) ? raw.groups : [])
    .map((group, index) => normalizeGroup(group, index, now))
    .filter(Boolean);
  // Materialize the durable category rows in every document.  `groupTaxonomy`
  // alone is not enough for clients that persist by group id; without these
  // rows a fresh project looks empty and generation nodes can be routed by the
  // currently selected sidebar group.
  const existingGroupIds = new Set(groups.map(group => group.id));
  for (const topLevel of TOP_LEVEL_GROUPS) {
    if (existingGroupIds.has(topLevel.id)) continue;
    groups.push({
      id:topLevel.id,
      name:topLevel.name,
      categoryId:topLevel.id,
      nodeIds:[],
      assetIds:[],
      parentGroupId:null,
      systemManaged:true,
      createdAt:now,
      updatedAt:now
    });
    existingGroupIds.add(topLevel.id);
  }
  for (const group of groups) {
    if (group.id !== 'shots' && group.categoryId === STORYBOARD_CATEGORY && !group.parentGroupId) {
      group.parentGroupId = 'shots';
    }
  }
  const nodes = Array.isArray(raw.nodes) ? raw.nodes.map(node => ({...node})) : [];
  const nodeIds = new Set(nodes.map(node => text(node?.id, 120)).filter(Boolean));
  const requestedByNode = options.requestedGroupByNode && typeof options.requestedGroupByNode === 'object'
    ? options.requestedGroupByNode
    : {};

  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    normalizeLegacyH3Node(node, options);
    const nodeId = text(node.id, 120);
    const existingCategory = text(node.categoryId, 40);
    if (!TOP_LEVEL_IDS.has(existingCategory)) node.categoryId = isGenerationNode(node) ? STORYBOARD_CATEGORY : existingCategory || STORYBOARD_CATEGORY;
    if (!isGenerationNode(node)) {
      // Existing confirmed assets keep their own category and become visible
      // in the corresponding durable top-level group without duplication.
      if ((node.kind === 'asset' || node.type === 'asset') && TOP_LEVEL_IDS.has(node.categoryId) && !node.groupId) {
        node.groupId = node.categoryId;
      }
      continue;
    }
    // Image/video generation is always part of the storyboard. Sidebar state
    // must never route a generation request into roles, scenes, props or audio.
    node.categoryId = STORYBOARD_CATEGORY;
    const group = preferredStoryboardGroup(groups, requestedByNode[nodeId] || node.groupId, now);
    node.groupId = group.id;
    node.shotId = group.shotId || group.id;
    node.meta = node.meta && typeof node.meta === 'object' && !Array.isArray(node.meta) ? {...node.meta} : {};
    node.meta.shotId = node.shotId;
    node.meta.storyboardGroupId = group.id;
  }

  for (const group of groups) {
    const nextNodeIds = nodes
      .filter(node => node?.groupId === group.id && nodeIds.has(text(node?.id, 120)))
      .map(node => node.id);
    const nextAssetIds = [...new Set(nodes
      .filter(node => node?.groupId === group.id && nodeIds.has(text(node?.id, 120)))
      .flatMap(assetIdsForNode))];
    if (JSON.stringify(group.nodeIds) !== JSON.stringify(nextNodeIds) || JSON.stringify(group.assetIds) !== JSON.stringify(nextAssetIds)) {
      group.nodeIds = nextNodeIds;
      group.assetIds = nextAssetIds;
      group.updatedAt = now;
    }
  }

  return {
    ...raw,
    nodes,
    groups,
    groupTaxonomy:{version:'niannian.storyboard_groups.v1',topLevel:TOP_LEVEL_GROUPS.map(group => ({...group}))}
  };
}

function resolveProjectGenerationDefaults(project) {
  const candidates = [
    project?.generationDefaults,
    project?.canvasGenerationDefaults,
    project?.metadata?.generationDefaults,
    project?.metadata?.canvasGenerationDefaults
  ].filter(value => value && typeof value === 'object' && !Array.isArray(value));
  const source = candidates[0] || {};
  const aspectRatio = /^\d{1,2}:\d{1,2}$/.test(text(source.aspectRatio || source.videoAspectRatio, 16))
    ? text(source.aspectRatio || source.videoAspectRatio, 16)
    : '9:16';
  const durationSeconds = Math.max(4, Math.min(15, Number(source.durationSeconds || source.videoDurationSeconds || 5)) || 5);
  return {aspectRatio, durationSeconds};
}

module.exports = {
  TOP_LEVEL_GROUPS,
  TOP_LEVEL_IDS,
  STORYBOARD_CATEGORY,
  DEFAULT_STORYBOARD_GROUP_ID,
  normalizeGenerationCanvas,
  normalizeLegacyH3Node,
  resolveProjectGenerationDefaults
};
