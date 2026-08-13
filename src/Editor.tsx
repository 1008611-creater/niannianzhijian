import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PlayerRef } from '@remotion/player';
import { theme } from './theme';
import { ExportDialog } from './export/ExportDialog';
import { createExportJobStore } from './export/backgroundExportStore';
import { resumePersistedServerExports } from './export/serverExportOperation';
import { TopBar } from './components/TopBar';
import { ChatPanel, type AgentRunState } from './components/chat/ChatPanel';
import { LibraryPanel } from './library/LibraryPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { Timeline } from './components/timeline/Timeline';
import { TimelineTabs } from './components/timeline/TimelineTabs';
import { Divider } from './components/Divider';
import { DesignStylePanel } from './components/settings/DesignStylePanel';
import { VersionHistory } from './components/VersionHistory';
import { usePersistedState } from './hooks/usePersistedState';
import { useEditorPanelLayout } from './hooks/useEditorPanelLayout';
import { useEditor } from './editor/store';
import type { ProjectDoc, TimelineItem, TimelineState, TrackId } from './editor/types';
import { captionsOnTrack, defaultTrackId, selectedIdsOf, timelineTrackIds, trackAlias, trackKind } from './editor/types';
import { TEMPLATES } from './editor/initial';
import { sourceWindowForTimelineRange } from './editor/sourceLimit';
import { planSlip, type SlipPreview } from './editor/slip';
import { resolveTimelineRenderPlan, sequenceReferenceError } from './editor/sequenceGraph';
import { planInspectorBatch, selectedInspectorItems } from './editor/inspectorBatch';
import { captureTimelineItemSource, sourceRevisionOf, validateTimelineItemSourceBatch } from './editor/mediaSourceRevision';
import { usedMediaAssetIds } from './editor/mediaAssetUsage';
import { supportsKeyframeProperty } from './editor/keyframeRegistry';
import {
  flushProjectSaves,
  hasPendingProjectSaves,
  hasProjectSaveFailure,
  loadCreativeMode,
  refreshProject,
  saveCreativeMode,
  saveProject,
  type ProjectMeta,
  type ProjectSaveResult,
} from './persist/projectStore';
import { recoverFailedAutosave } from './persist/autosaveRecovery';
import { loadChatAutoApply } from './persist/sessionPrefs';
import { useAutomaticVersions } from './persist/useAutomaticVersions';
import {
  createMediaAssetsChatSeed,
  createImportTranscriptionGate,
  importMedia,
  readyMediaAssetsForPaste,
} from './media/upload';
import { findMediaNameConflict, MediaImportCancelledError } from './media/mediaImportConflict';
import { importUploadedMedia } from './media/mobileImport';
import type { MobileUploadRecord } from './media/mobileUploadApi';
import { acknowledgeIngestedGenerationResults, resumeOpenGenerationJobs } from './persist/jobRegistryStore';
import {
  enqueueTranscription,
  getTranscribeJob,
  shouldTranscribe,
  untranscribedTimelineItemIdsForRevision,
} from './transcript/transcribe-jobs';
import { enqueueVisualAnalysis, refreshVisualAnalysis } from './agent/progress/visual-analysis-jobs';
import type { MediaAsset } from './editor/types';
import { AUDIO_ASSETS } from './audio/library';
import type { Tpl } from './types';
import type { AgentReference } from './agent/context';
import { serializableDefsFor } from './gl/fx/effects';
import type { SelectedPreviewStatus } from './gl/previewAdapter';
import { useEditorActions } from './shortcuts/useEditorActions';
import { useT } from './i18n/locale';
import { pluginTemplates, usePluginPacks } from './library/pluginResources';
import type { TimelineShortcutApi } from './shortcuts/timelineApi';
import { ShortcutsDialog } from './shortcuts/ShortcutsDialog';
import { AppToastHost } from './ui/AppToastHost';
import { showAppToast } from './ui/appToast';
import { isolateVoiceOnSrc } from './audio/isolateVoice';
import { analyzeClipLoudness, gainForTarget } from './audio/loudness';
import { analyzeAutoGrade, type AutoGradeResponse } from './color/autoGrade';
import { useOfflineMedia } from './media/useOfflineMedia';
import { duplicateAssetName } from './media/assetMenuSelection';
import { keyframeResetBatch } from './editor/keyframeReset';
import { classifyExternalFile, parseDroppedCaptions } from './media/externalFileDrop';
import { appendManualLane, isManualCaptionEntry, newManualCaptions } from './captions/manualCaptions';
import { placeMediaAssets, reflowPlacedMediaItems } from './editor/mediaAssetPlacement';
import {
  allCaptionSelections,
  captionSelectionKey,
  resolveCaptionSelection,
  type CaptionSelectOptions,
  type CaptionSelectionRef,
} from './captions/captionSelection';
import { updateCaptionSelections } from './captions/captionSelectionInteraction';
import type { QuickRecipeInput } from './components/QuickHome';
import { QuickRunOverlay, type QuickRunStage } from './components/QuickRunOverlay';

interface EditorProps {
  initial: ProjectDoc;
  project: ProjectMeta;
  onHome: () => void;
  onRename: (name: string) => void;
  initialRecipe?: QuickRecipeInput;
  onRecipeConsumed?: () => void;
}


interface AutoGradeRecommendation {
  itemId: string;
  itemName: string;
  analysis: AutoGradeResponse;
}

interface AutoGradeSession {
  recommendations: AutoGradeRecommendation[];
  failedCount: number;
}

interface QuickRunRuntime {
  recipe: QuickRecipeInput;
  importedRatio: number;
  assetId?: string;
  asset?: MediaAsset;
  assetReady: boolean;
  error?: string;
  dismissed: boolean;
}

const QUICK_RUN_STAGE_ORDER: Record<Exclude<QuickRunStage, 'ready' | 'error'>, number> = {
  importing: 0,
  understanding: 1,
  selecting: 2,
  assembling: 3,
};


function isAutoGradeTarget(item: TimelineItem, state: TimelineState): boolean {
  if (item.kind !== 'video' && item.kind !== 'image' && item.kind !== 'gif') return false;
  if (state.tracks?.[item.track]?.locked) return false;
  return /^\/media\/uploads\/[^/]+(?:\?.*)?$/.test(item.src ?? '');
}

export default function Editor({ initial, project, onHome, onRename, initialRecipe, onRecipeConsumed }: EditorProps) {
  const t = useT();
  const { state, doc, commands, canUndo, canRedo, getUndoTarget, getRedoTarget } = useEditor(initial);
  const selectedItem = state.items.find((it) => it.id === state.selectedId) ?? null;
  const selectedIds = selectedIdsOf(state);
  const selectedItems = selectedInspectorItems(state, selectedIds);
  const selectedTransition = state.transitions?.find((transition) => transition.incomingItemId === state.selectedId) ?? null;
  const captionSelectionScopeKey = `${project.id}\u0000${doc.activeTimelineId}`;
  const [captionSelections, setCaptionSelections] = useState<CaptionSelectionRef[]>([]);
  const captionSelection = captionSelections.at(-1) ?? null;
  const selectedCaption = useMemo(
    () => resolveCaptionSelection(state, captionSelection),
    [state, captionSelection],
  );
  const preserveCaptionWithItemsRef = useRef(false);
  const captionSelectionScopeRef = useRef(captionSelectionScopeKey);
  const selectedItemIdsKey = selectedIdsOf(state).join('\u0000');
  const [timelineHoverPreviewFrame, setTimelineHoverPreviewFrame] = useState<number | null>(null);
  useEffect(() => {
    const scopeChanged = captionSelectionScopeRef.current !== captionSelectionScopeKey;
    captionSelectionScopeRef.current = captionSelectionScopeKey;
    if (scopeChanged) {
      setCaptionSelections([]);
      preserveCaptionWithItemsRef.current = false;
      setTimelineHoverPreviewFrame(null);
      return;
    }
    setCaptionSelections((current) => {
      const valid = current.filter((selection) => resolveCaptionSelection(state, selection));
      return valid.length === current.length ? current : valid;
    });
  }, [captionSelectionScopeKey, state]);
  useEffect(() => {
    if (!state.selectedId) {
      preserveCaptionWithItemsRef.current = false;
      return;
    }
    if (preserveCaptionWithItemsRef.current) {
      preserveCaptionWithItemsRef.current = false;
      return;
    }
    setCaptionSelections([]);
  }, [selectedItemIdsKey, state.selectedId]);
  const selectCaption = useCallback((
    selection: CaptionSelectionRef | null,
    options: CaptionSelectOptions = {},
  ) => {
    if (!selection) {
      setCaptionSelections([]);
      return;
    }
    if (options.additive) {
      preserveCaptionWithItemsRef.current = options.preserveWithItems === true;
      setCaptionSelections((current) => updateCaptionSelections(
        current,
        selection,
        options.toggle ? 'toggle' : 'add',
      ));
      return;
    }
    setCaptionSelections([selection]);
    commands.selectItem(null);
  }, [commands]);
  const selectAllTimelineContent = useCallback(() => {
    const selections = allCaptionSelections(state);
    preserveCaptionWithItemsRef.current = selections.length > 0 && state.items.length > 0;
    setCaptionSelections(selections);
    commands.selectAll();
  }, [commands, state]);
  const selectMarqueeCaptions = useCallback((
    selections: CaptionSelectionRef[],
    options: { additive: boolean; preserveWithItems: boolean },
  ) => {
    preserveCaptionWithItemsRef.current = options.preserveWithItems
      && (selections.length > 0 || (options.additive && captionSelections.length > 0));
    setCaptionSelections((current) => {
      if (!options.additive) return selections;
      const byKey = new Map(current.map((selection) => [captionSelectionKey(selection), selection]));
      for (const selection of selections) byKey.set(captionSelectionKey(selection), selection);
      return [...byKey.values()];
    });
  }, [captionSelections.length]);
  const [reviewRequest, setReviewRequest] = useState<{
    itemId: string; frame: number; clientX: number; clientY: number; nonce: number;
  } | null>(null);
  const [activeSlipPreview, setActiveSlipPreview] = useState<SlipPreview | null>(null);
  const selectedSlipPlan = useMemo(() => {
    if (!selectedItem || selectedItems.length !== 1) return null;
    const result = planSlip(state, selectedItem.id, 0);
    return result.ok ? result : null;
  }, [selectedItem, selectedItems.length, state]);
  useEffect(() => setActiveSlipPreview(null), [project.id, doc.activeTimelineId]);
  const trackOptions = useMemo(
    () => timelineTrackIds(state).map((id) => ({
      id,
      alias: trackAlias(state, id),
      name: state.tracks?.[id]?.name,
      kind: trackKind(state, id),
    })),
    [state],
  );
  const captionTracks = trackOptions
    .filter((option) => option.kind === 'caption')
    .map((option) => ({ ...option, captions: captionsOnTrack(state, option.id) }));
  const sequenceOptions = useMemo(() => [...doc.timelines]
    .sort((a, b) => a.order - b.order)
    .map((timeline) => {
      const referenceError = sequenceReferenceError(doc, doc.activeTimelineId, timeline.id);
      return {
        id: timeline.id,
        name: timeline.name,
        durationInFrames: resolveTimelineRenderPlan(doc, timeline.id).durationInFrames,
        disabledReason: referenceError?.message,
      };
    }), [doc]);
  const usedAssetIds = useMemo(() => usedMediaAssetIds(doc), [doc]);

  // keep live refs so agent tools always read the latest timeline/project
  // All changes made during dragging of the slider/color picker are merged into an undo record (see gesture of historyReduce).
  const historyGesture = useMemo(
    () => ({ begin: commands.beginHistoryGesture, end: commands.endHistoryGesture }),
    [commands],
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const applyInspectorSelection = (
    makeActions: Parameters<typeof planInspectorBatch>[2],
    supports?: Parameters<typeof planInspectorBatch>[3],
    label = 'Inspector multi-edit',
  ): boolean => {
    const snapshot = stateRef.current;
    const ids = selectedIdsOf(snapshot);
    const plan = supports
      ? planInspectorBatch(snapshot, ids, makeActions, supports)
      : planInspectorBatch(snapshot, ids, makeActions);
    if (!plan.ok) {
      showAppToast(t('无法将此属性应用到全部选中片段。'));
      return false;
    }
    commands.batch(plan.actions, label);
    return true;
  };
  const docRef = useRef(doc);
  docRef.current = doc;
  const flushBeforeLeaveRef = useRef<() => Promise<boolean>>(async () => true);
  const { offlineSrcs, offlineSrcsRef, offlineAssetIds, markOffline: markMediaOffline } = useOfflineMedia(doc);
// Creative mode: The selected skill id is injected into the system prompt and stored in the IDB (without entering the undo history).
  const [creativeMode, setCreativeMode] = useState<string | null>(null);
  const creativeModeRef = useRef(creativeMode);
  creativeModeRef.current = creativeMode;
  useEffect(() => { loadCreativeMode(project.id).then(setCreativeMode); }, [project.id]);
  const changeCreativeMode = useCallback((id: string | null) => {
    setCreativeMode(id);
    saveCreativeMode(project.id, id);
  }, [project.id]);
  const playerRef = useRef<PlayerRef | null>(null);
  const [selectedPreviewStatuses, setSelectedPreviewStatuses] = useState<SelectedPreviewStatus[]>([]);
  const handleSelectedPreviewStatus = useCallback((status: SelectedPreviewStatus) => {
    const expectedTargetId = status.kind === 'effect' ? selectedItem?.id : selectedTransition?.id;
    if (status.phase !== 'inactive' && status.targetId !== expectedTargetId) return;
    setSelectedPreviewStatuses((current) => {
      const withoutTarget = current.filter((entry) => entry.kind !== status.kind || entry.targetId !== status.targetId);
      if (status.phase === 'inactive') return withoutTarget;
      const previous = current.find((entry) => entry.kind === status.kind && entry.targetId === status.targetId);
      if (previous?.adapter === status.adapter
        && previous.phase === status.phase
        && previous.fallbackReason === status.fallbackReason) return current;
      return [...withoutTarget, status];
    });
  }, [selectedItem?.id, selectedTransition?.id]);
  useEffect(() => setSelectedPreviewStatuses([]), [project.id, selectedItem?.id, selectedTransition?.id]);
  // Built-in + plugin MG template: agent (browse_library/plus MG) shares the same copy with the resource library
  const pluginPacks = usePluginPacks();
  const allTemplates = useMemo(
    () => (pluginPacks.length ? [...TEMPLATES, ...pluginTemplates(pluginPacks)] : TEMPLATES),
    [pluginPacks],
  );
  const allTemplatesRef = useRef(allTemplates);
  allTemplatesRef.current = allTemplates;
  const agentCtx = useMemo(
    () => ({
      commands,
      getState: () => stateRef.current,
      getDoc: () => docRef.current,
      getOfflineMediaSrcs: () => offlineSrcsRef.current,
      getCreativeMode: () => creativeModeRef.current,
      getUndoTarget,
      getRedoTarget,
      getApprovalMode: () => (loadChatAutoApply(project.id) ? 'auto' : 'manual'),
      setCreativeMode: changeCreativeMode,
      get templates() { return allTemplatesRef.current; },
      audio: AUDIO_ASSETS,
      getProjectId: () => project.id,
      openProject: async (projectId: string) => {
        if (!(await flushBeforeLeaveRef.current())) {
          return { ok: false, error: '当前工程保存失败，已阻止切换工程' };
        }
        if (projectId === project.id) return { ok: true };
        window.location.hash = `#/editor/${projectId}`;
        return { ok: true };
      },
      onProjectRenamed: onRename,
    }),
    [commands, project.id, onRename, changeCreativeMode, offlineSrcsRef, getUndoTarget, getRedoTarget],
  );
  // a pending proposal's draft result, previewed in the player (null = committed)
  const [previewState, setPreviewState] = useState<TimelineState | null>(null);
  // Automatic color correction always previews first. Applying the complete
  // session uses one reducer batch, so multi-clip correction is one undo step.
  const [autoGradeBusy, setAutoGradeBusy] = useState(false);
  const [autoGradeSession, setAutoGradeSession] = useState<AutoGradeSession | null>(null);
  const autoGradeRequestRef = useRef(0);
  const autoGradeSelectionKey = selectedIdsOf(state).join('\u0000');
  const autoGradeTargets = useMemo(() => {
    const selected = new Set(selectedIdsOf(state));
    return state.items.filter((item) => selected.has(item.id) && isAutoGradeTarget(item, state));
  }, [state]);
  useEffect(() => {
    autoGradeRequestRef.current += 1;
    setAutoGradeBusy(false);
    setAutoGradeSession(null);
  }, [autoGradeSelectionKey, project.id]);

  const cancelAutoGrade = useCallback(() => {
    autoGradeRequestRef.current += 1;
    setAutoGradeBusy(false);
    setAutoGradeSession(null);
  }, []);

  const analyzeSelectedColor = useCallback(async () => {
    const snapshot = stateRef.current;
    const selected = new Set(selectedIdsOf(snapshot));
    const targets = snapshot.items.filter((item) => selected.has(item.id) && isAutoGradeTarget(item, snapshot));
    if (!targets.length) {
      showAppToast(t('请选择已导入媒体池的视频、图片或 GIF 片段'), { error: true });
      return;
    }
    const requestId = ++autoGradeRequestRef.current;
    setPreviewState(null);
    setAutoGradeSession(null);
    setAutoGradeBusy(true);
    const recommendations: AutoGradeRecommendation[] = [];
    const cache = new Map<string, Promise<AutoGradeResponse>>();
    let firstError: unknown = null;
    for (const item of targets) {
      if (autoGradeRequestRef.current !== requestId) return;
      const sourceWindow = sourceWindowForTimelineRange(item, 0, item.durationInFrames);
      const startSeconds = sourceWindow.startFrame / snapshot.fps;
      const durationSeconds = Math.max(1 / snapshot.fps, (sourceWindow.endFrame - sourceWindow.startFrame) / snapshot.fps);
      const cacheKey = `${item.src}\u0000${startSeconds.toFixed(3)}\u0000${durationSeconds.toFixed(3)}`;
      try {
        let pending = cache.get(cacheKey);
        if (!pending) {
          pending = analyzeAutoGrade({ src: item.src!, startSeconds, durationSeconds });
          cache.set(cacheKey, pending);
        }
        recommendations.push({ itemId: item.id, itemName: item.name, analysis: await pending });
      } catch (error) {
        firstError ??= error;
      }
    }
    if (autoGradeRequestRef.current !== requestId) return;
    try {
      if (!recommendations.length) throw firstError ?? new Error(t('未获得可用的校色结果'));
      const failedCount = targets.length - recommendations.length;
      setAutoGradeSession({ recommendations, failedCount });
      showAppToast(failedCount
        ? t('已预览 {n} 个片段，{failed} 个分析失败', { n: recommendations.length, failed: failedCount })
        : t('自动校色预览已生成，可确认应用或取消'));
    } catch (error) {
      showAppToast(t('自动校色分析失败：{error}', {
        error: error instanceof Error ? error.message : String(error),
      }), { error: true });
    } finally {
      if (autoGradeRequestRef.current === requestId) setAutoGradeBusy(false);
    }
  }, [t]);

  const applyAutoGrade = useCallback(() => {
    if (!autoGradeSession?.recommendations.length) return;
    commands.batch(autoGradeSession.recommendations.map((recommendation) => ({
      type: 'setFilters' as const,
      id: recommendation.itemId,
      patch: recommendation.analysis.filters,
    })), 'Apply automatic color correction');
    const applied = autoGradeSession.recommendations.length;
    setAutoGradeSession(null);
    showAppToast(t('已将自动校色应用到 {n} 个片段', { n: applied }));
  }, [autoGradeSession, commands, t]);

  const autoGradePreviewState = useMemo<TimelineState | null>(() => {
    if (!autoGradeSession) return null;
    const filters = new Map(autoGradeSession.recommendations.map((entry) => [entry.itemId, entry.analysis.filters]));
    return {
      ...state,
      items: state.items.map((item) => {
        const patch = filters.get(item.id);
        return patch ? { ...item, filters: { ...item.filters, ...patch } } : item;
      }),
    };
  }, [autoGradeSession, state]);
  const selectedAutoGrade = autoGradeSession?.recommendations.find((entry) => entry.itemId === state.selectedId) ?? null;
  // library「Generated with AI」→ prefill the chat composer (nonce forces re-seed of the same text)
  const [chatSeed, setChatSeed] = useState<{ text: string; nonce: number; references?: AgentReference[]; autoSubmit?: boolean; autoApply?: boolean } | null>(null);
  const quickInitialItemIdsRef = useRef(new Set(
    initialRecipe ? initial.timelines.flatMap((timeline) => timeline.items.map((item) => item.id)) : [],
  ));
  const quickRecipeRef = useRef(initialRecipe);
  const quickAgentStartedRef = useRef(false);
  const [quickRun, setQuickRun] = useState<QuickRunRuntime | null>(() => initialRecipe ? {
    recipe: initialRecipe,
    importedRatio: 0,
    assetReady: false,
    dismissed: false,
  } : null);
  const [quickAgentState, setQuickAgentState] = useState<AgentRunState>({ running: false, proposalPending: false });
  const [quickProgressStage, setQuickProgressStage] = useState<Exclude<QuickRunStage, 'ready' | 'error'>>('importing');
  // Design style (brand) editor pop-up window.
  const [showDesign, setShowDesign] = useState(false);
  // Version history pop-up window.
  const [showVersions, setShowVersions] = useState(false);
  // Shortcut key help.
  const [showShortcuts, setShowShortcuts] = useState(false);
  /** Timeline fills this; Editor binds the global shortcut dispatcher to it. */
  const shortcutApiRef = useRef<TimelineShortcutApi | null>(null);

  // Read the playhead only when an edit needs it. Continuous visual updates are
  // painted inside Timeline so playback does not re-render the whole editor.
  const getPlayhead = useCallback(() => playerRef.current?.getCurrentFrame() ?? 0, []);

  useAutomaticVersions(project.id, doc);

  // Autosave captures an immutable snapshot inside SaveCoordinator. Explicit
  // navigation awaits the queue; browser navigation is blocked while a write is
  // pending or the latest write failed.
  const unsavedRef = useRef<{ projectId: string; doc: ProjectDoc } | null>(null);
  const latestSaveAttemptRef = useRef(0);
  const saveFailureShownRef = useRef(false);
  const observeSave = useCallback((result: ProjectSaveResult): void => {
    if (result.status === 'failed') {
      if (!saveFailureShownRef.current) {
        showAppToast(t('工程保存失败。请重试；在保存成功前不会关闭或切换工程。'), { error: true });
        saveFailureShownRef.current = true;
      }
      return;
    }
    saveFailureShownRef.current = false;
  }, [t]);
  const enqueuePendingSave = useCallback((): Promise<ProjectSaveResult> | null => {
    const pending = unsavedRef.current;
    if (!pending) return null;
    unsavedRef.current = null;
    const attempt = ++latestSaveAttemptRef.current;
    const saving = saveProject(pending.projectId, pending.doc);
    void saving.then((result) => {
      if (result.status === 'failed') {
        unsavedRef.current = recoverFailedAutosave({
          currentUnsaved: unsavedRef.current,
          failedSnapshot: pending,
          failedAttempt: attempt,
          latestEnqueuedAttempt: latestSaveAttemptRef.current,
        });
      }
      else if (result.status === 'saved') {
        void acknowledgeIngestedGenerationResults(pending.projectId, pending.doc.assets ?? []);
      }
      observeSave(result);
    });
    return saving;
  }, [observeSave]);

  // A different OpenChatCut tab can commit Agent edits to the shared project
  // store while this tab is backgrounded.  Refresh only after this tab has no
  // unsaved local document, so returning to it never overwrites an in-progress
  // edit but also never lets the Agent reason from an old timeline snapshot.
  useEffect(() => {
    let cancelled = false;
    const refreshAfterFocus = () => {
      if (document.visibilityState !== 'visible'
        || unsavedRef.current
        || hasPendingProjectSaves(project.id)) return;
      void refreshProject(project.id).then((latest) => {
        if (cancelled || !latest || unsavedRef.current || hasPendingProjectSaves(project.id)) return;
        const current = docRef.current;
        if (JSON.stringify(latest) !== JSON.stringify(current)) commands.applyDoc(latest);
      });
    };
    window.addEventListener('focus', refreshAfterFocus);
    document.addEventListener('visibilitychange', refreshAfterFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshAfterFocus);
      document.removeEventListener('visibilitychange', refreshAfterFocus);
    };
  }, [commands, project.id]);

  useEffect(() => {
    unsavedRef.current = { projectId: project.id, doc };
    const timer = setTimeout(() => { enqueuePendingSave(); }, 500);
    return () => clearTimeout(timer);
  }, [doc, enqueuePendingSave, project.id]);

  const flushBeforeLeave = useCallback(async (): Promise<boolean> => {
    enqueuePendingSave();
    const result = await flushProjectSaves(project.id);
    if (!result.ok) {
      showAppToast(t('工程仍未保存，已阻止离开。请继续编辑以重试保存。'), { error: true });
      return false;
    }
    return true;
  }, [enqueuePendingSave, project.id, t]);
  flushBeforeLeaveRef.current = flushBeforeLeave;

  useEffect(() => {
    const flushWithoutWaiting = (): void => {
      enqueuePendingSave();
      void flushProjectSaves(project.id);
    };
    const blockUnfinishedSave = (event: BeforeUnloadEvent): void => {
      enqueuePendingSave();
      if (!hasPendingProjectSaves(project.id) && !hasProjectSaveFailure(project.id)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', blockUnfinishedSave);
    window.addEventListener('pagehide', flushWithoutWaiting);
    return () => {
      window.removeEventListener('beforeunload', blockUnfinishedSave);
      window.removeEventListener('pagehide', flushWithoutWaiting);
      flushWithoutWaiting();
    };
  }, [enqueuePendingSave, project.id]);

  const handleHome = useCallback(async (): Promise<void> => {
    if (await flushBeforeLeave()) onHome();
  }, [flushBeforeLeave, onHome]);

  // Rehydrate missing /media/uploads files from IDB blob cache (disk wipe / new clone).
  // Also resume any open generation jobs so refresh mid-generate still lands assets.
  useEffect(() => {
    let alive = true;
    void (async () => {
      await acknowledgeIngestedGenerationResults(project.id, docRef.current.assets ?? []).catch(() => undefined);
      if (!alive) return;
      await resumeOpenGenerationJobs(project.id, {
        getState: () => stateRef.current,
        onAsset: (asset) => {
          if (!alive) return;
          // Avoid dup if agent already ingested before refresh.
          if ((docRef.current.assets ?? []).some((a) => a.id === asset.id || a.src === asset.src)) return;
          commands.addAsset(asset);
        },
        timeoutSeconds: 180,
      });
    })();
    return () => { alive = false; };
  }, [project.id, commands]); // only on open / project switch

  // Switching timelines: seek the shared Player so it doesn't show a stale frame.
  // Skip mounting the first run - otherwise the playback head just restored from sessionPrefs on the Timeline side will be reset to 0
  //(The parent effect is later than the child effect, and recovery will be overwritten).
  const firstTimelineRef = useRef(true);
  useEffect(() => {
    if (firstTimelineRef.current) { firstTimelineRef.current = false; return; }
    playerRef.current?.seekTo(0);
  }, [doc.activeTimelineId]);

  const [chatCollapsed, setChatCollapsed] = usePersistedState('cc.chatCollapsed', false);
  const panelLayout = useEditorPanelLayout(chatCollapsed);
  const [inspectorCollapsed, setInspectorCollapsed] = usePersistedState('cc.inspectorCollapsed', false);
  const addTemplate = useCallback((tpl: Tpl) => commands.addMotionGraphic(tpl), [commands]);
  // Add an asset to the pool AND kick off "upload-and-transcribe" ASR for audio-bearing media.
  // On completion the transcript is written onto the asset (so later placements inherit
  // it) and backfilled onto any clip already placed from this asset (drag-to-canvas /
  // voiceover), so the voiceover is editable as soon as ASR lands.
  // Kick ASR. Prefer race-ahead asrPath (extract started right after master upload).
  const startAssetTranscription = useCallback((
    asset: Pick<MediaAsset, 'id' | 'src' | 'kind' | 'sourceRevision'> & { name?: string },
    asrPath?: string | null | Promise<string | null>,
    markRunning = true,
  ) => {
    if (!shouldTranscribe(asset.kind)) return;
    if (markRunning) {
      commands.setAssetTranscription(asset.id, { transcribeStatus: 'running', transcribeError: undefined });
    }
    enqueueTranscription(project.id, asset, {
      asrPath,
      getCurrentAsset: () => docRef.current.assets.find((candidate) => candidate.id === asset.id),
      onComplete: (job) => {
        const currentAsset = docRef.current.assets.find((candidate) => candidate.id === job.assetId);
        const currentJob = getTranscribeJob(project.id, job.assetId);
        if (
          !currentAsset
          || sourceRevisionOf(currentAsset) !== job.sourceRevision
          || !currentJob
          || currentJob.generation !== job.generation
          || currentJob.sourceRevision !== job.sourceRevision
        ) return;
        if (job.status === 'done' && job.words?.length) {
          commands.setAssetTranscription(job.assetId, { transcript: job.words, transcribeStatus: 'done', transcribeError: undefined });
          for (const itemId of untranscribedTimelineItemIdsForRevision(stateRef.current.items, job.sourceRevision)) {
            commands.setItemTranscript(itemId, job.words);
          }
        } else if (job.status === 'failed') {
          commands.setAssetTranscription(job.assetId, { transcribeStatus: 'failed', transcribeError: job.error });
        }
      },
    });
  }, [commands, project.id]);

  // A provider checkpoint survives reload; resume every asset that was persisted
  // as running instead of uploading or submitting a second AssemblyAI job.
  useEffect(() => {
    for (const asset of doc.assets) {
      if ((asset.kind === 'audio' || asset.kind === 'video')
        && asset.src
        && asset.transcribeStatus === 'running') {
        startAssetTranscription(asset, undefined, false);
      }
    }
  }, [doc.assets, startAssetTranscription]);

  /** Full ingest for already-ready assets (generated media, voice, etc.). */
  const ingestToPool = useCallback((asset: MediaAsset) => {
    commands.addAsset(shouldTranscribe(asset.kind) ? { ...asset, transcribeStatus: 'running' } : asset);
    startAssetTranscription(asset);
    if (asset.kind !== 'audio') enqueueVisualAnalysis(asset);
  }, [commands, startAssetTranscription]);

  const importMobileUpload = useCallback(async (record: MobileUploadRecord) => {
    ingestToPool(await importUploadedMedia(record, stateRef.current.fps));
  }, [ingestToPool]);

  // Progressive import: blob placeholder → upload → (ASR extract || normalize race) → relink.
  const importToPool = useCallback(async (
    file: File,
    onProgress?: (ratio: number) => void,
    lifecycle?: {
      onPlaceholder?: (asset: MediaAsset) => void;
      onAssetUpdated?: (asset: MediaAsset) => void;
      onFailure?: (asset: MediaAsset | null, error: unknown) => void;
    },
  ) => {
    const existing = findMediaNameConflict(stateRef.current.assets ?? [], file.name);
    if (existing && !window.confirm(t('素材「{name}」已存在。覆盖会同步替换已在时间线中使用的该素材。', { name: existing.name }))) {
      throw new MediaImportCancelledError();
    }
    const targetId = existing?.id;
    let placeholderId: string | null = null;
    let placeholder: MediaAsset | null = null;
    const transcriptionGate = createImportTranscriptionGate(targetId);
    try {
      const imported = await importMedia(file, stateRef.current.fps, {
        onProgress,
        onPlaceholder: (asset) => {
          if (targetId) return;
          placeholderId = asset.id;
          placeholder = asset;
          // A live blob preview is not a resumable ASR job. Mark it running only
          // after the authoritative uploaded descriptor is available.
          commands.addAsset(asset);
          lifecycle?.onPlaceholder?.(asset);
        },
        onUploaded: (info) => {
          const start = transcriptionGate.uploaded(info);
          if (start) startAssetTranscription(start.asset, start.asrPath);
        },
        onReady: (asset) => {
          const ready = targetId ? { ...asset, id: targetId } : asset;
          commands.relinkMediaAsset(ready.id, {
            src: ready.src,
            name: ready.name,
            durationInFrames: ready.durationInFrames,
            width: ready.width,
            height: ready.height,
            kind: ready.kind,
            sourceRevision: ready.sourceRevision,
            sourceSize: ready.sourceSize,
            sourceModifiedAt: ready.sourceModifiedAt,
            sourceFilename: ready.sourceFilename,
            originalFilePath: ready.originalFilePath,
          });
          // Replacements start ASR only after the new ready source has relinked.
          const start = transcriptionGate.ready(ready);
          if (start) startAssetTranscription(start.asset, start.asrPath);
          if (ready.kind !== 'audio') refreshVisualAnalysis(ready);
        },
      });
      const ready = targetId ? { ...imported, id: targetId } : imported;
      lifecycle?.onAssetUpdated?.(ready);
      return ready;
    } catch (err) {
      if (placeholderId) commands.removeMediaAsset(placeholderId);
      lifecycle?.onFailure?.(placeholder, err);
      throw err;
    }
  }, [commands, startAssetTranscription, t]);

  // Quick mode hands the selected source into the same professional project and
  // seeds the existing Agent workflow; no second timeline is created.
  const quickRecipeStartedRef = useRef(false);
  useEffect(() => {
    if (!initialRecipe || quickRecipeStartedRef.current) return;
    quickRecipeStartedRef.current = true;
    void (async () => {
      try {
        const asset = await importToPool(
          initialRecipe.file,
          (ratio) => {
            setQuickRun((current) => current ? { ...current, importedRatio: ratio } : current);
          },
          {
            onPlaceholder: (placeholder) => {
              setQuickRun((current) => current ? { ...current, assetId: placeholder.id, asset: placeholder } : current);
            },
          },
        );
        setQuickRun((current) => current ? {
          ...current,
          assetId: asset.id,
          asset,
          assetReady: true,
          importedRatio: 1,
          error: undefined,
        } : current);
        const platform = initialRecipe.platform === 'douyin' ? '抖音' : initialRecipe.platform === 'kuaishou' ? '快手' : '视频号';
        const sourceDurationSeconds = Math.max(1, Math.floor(asset.durationInFrames / stateRef.current.fps));
        const targetDurationSeconds = Math.min(initialRecipe.durationSeconds, sourceDurationSeconds);
        const durationConstraint = sourceDurationSeconds < initialRecipe.durationSeconds
          ? `素材真实时长只有约${sourceDurationSeconds}秒，无法做成${initialRecipe.durationSeconds}秒；请只制作约${targetDurationSeconds}秒的真实片段，绝不补帧、重复或伪造时长。`
          : `目标时长严格为${targetDurationSeconds}秒。`;
        // A quick recipe is a single-source short-form edit, not a blank chat.
        // This narrows the Agent toolset to the workflow that preserves source ranges.
        changeCreativeMode('11111111-1240-4000-8000-000000000004');
        setChatCollapsed(false);
        setChatSeed({
          nonce: Date.now(),
          references: [{ id: asset.id, name: asset.name, kind: asset.kind }],
          autoSubmit: true,
          autoApply: true,
          text: `制作一条短剧片段精修发布版。运行编号为${initialRecipe.workflowRunId ?? '未记录'}。只使用刚上传素材「${asset.name}」（assetId=${asset.id}），目标平台为${platform}，${durationConstraint} 输出竖屏 9:16。第一步必须调用 search_media(query="${asset.name}", modalities=["metadata"], limit=1)，只接受返回 assetId=${asset.id} 的 filename 命中；没有这个精确命中就停止并报告“未找到刚上传的素材”，不得分析、粗剪或改动其他素材。确认后才调用 analyze_asset(kind=video) 理解完整视频并取得真实源时间段，再用 view_asset_frames 核对画面。若视频有剧情，必须选择能看懂起因/钩子、冲突/升级、结果/收尾的 2-6 段连续源区间，优先去掉空镜、重复和无效停顿，不要把整段原片当成粗剪；若视频只是连续展示或没有叙事冲突，必须如实保留完整展示序列并将粗剪命名为“展示精修”，不要伪造剧情。然后调用 assemble_rough_cut 创建新的可编辑粗剪，不能用 edit_item 把素材直接放进当前时间线。粗剪创建后，先调用 edit_track(action=list) 查出新序列中承载该视频片段的真实视频轨别名；若视频有声音，只能对这个视频轨调用 transcribe_track(provider=mimo-qwen-asr)，不能猜测或使用不存在的 A1。MiMo 返回 no-audio/no-speech 时停止转写并标注“原声无可用字幕”，绝不切换其他 ASR。只有真实词级时间戳可用时才调用 edit_captions(action=enable) 开启字幕；不要按文案长度伪造时间。若项目已有可用 BGM 素材，可调用 place_rough_cut_bgm 放置低音量音乐床；不要自动生成付费音乐。保留原声，不要覆盖用户手工修改，最后调用 check_rough_cut_ready 并检查真实时长、片段数量和画面结构，只报告真实完成的步骤。`,
        });
        onRecipeConsumed?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : '短剧素材导入失败';
        setQuickRun((current) => current ? { ...current, error: message } : current);
        showAppToast(message, { error: true });
      }
    })();
  }, [changeCreativeMode, importToPool, initialRecipe, onRecipeConsumed, setChatCollapsed]);

  const quickAsset = quickRun?.assetId
    ? (state.assets ?? []).find((asset) => asset.id === quickRun.assetId) ?? quickRun.asset
    : quickRun?.asset;
  const quickCreatedItems = quickRun
    ? doc.timelines
        .flatMap((timeline) => timeline.items)
        .filter((item) => !quickInitialItemIdsRef.current.has(item.id))
    : [];
  const quickObservedStage: Exclude<QuickRunStage, 'ready' | 'error'> = !quickRun?.assetReady ? 'importing'
    : quickAgentState.liveTool === 'assemble_rough_cut'
        || quickAgentState.liveTool === 'check_rough_cut_ready'
        || quickAgentState.proposalPending ? 'assembling'
      : quickAgentState.liveTool === 'view_asset_frames'
          || !!quickAsset?.intelligence?.videoSummary
          || !!quickAsset?.intelligence?.scenes?.length ? 'selecting'
        : 'understanding';
  useEffect(() => {
    setQuickProgressStage((current) => QUICK_RUN_STAGE_ORDER[quickObservedStage] > QUICK_RUN_STAGE_ORDER[current]
      ? quickObservedStage
      : current);
  }, [quickObservedStage]);
  const quickStage: QuickRunStage = quickRun?.error || quickAgentState.error ? 'error'
    : quickCreatedItems.length > 0 ? 'ready'
      : quickProgressStage;

  useEffect(() => {
    if (!quickRun || quickRun.dismissed) return;
    if (quickAgentState.running) {
      quickAgentStartedRef.current = true;
      return;
    }
    if (!quickAgentStartedRef.current || quickAgentState.proposalPending || quickCreatedItems.length > 0 || quickRun.error) return;
    const timer = window.setTimeout(() => {
      setQuickRun((current) => current ? {
        ...current,
        error: quickAgentState.error || '没有生成可编辑片段。素材已经保留，可以重新制作或进入专业模式检查。',
      } : current);
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [quickAgentState.error, quickAgentState.proposalPending, quickAgentState.running, quickCreatedItems.length, quickRun]);

  const retryQuickRun = useCallback(() => {
    const recipe = quickRecipeRef.current;
    const asset = quickAsset;
    if (!recipe || !asset) return;
    const platform = recipe.platform === 'douyin' ? '抖音' : recipe.platform === 'kuaishou' ? '快手' : '视频号';
    const sourceDurationSeconds = Math.max(1, Math.floor(asset.durationInFrames / stateRef.current.fps));
    const targetDurationSeconds = Math.min(recipe.durationSeconds, sourceDurationSeconds);
    quickAgentStartedRef.current = false;
    setQuickProgressStage('understanding');
    setQuickAgentState({ running: false, proposalPending: false });
    setQuickRun((current) => current ? { ...current, error: undefined, dismissed: false } : current);
    setChatSeed({
      nonce: Date.now(),
      references: [{ id: asset.id, name: asset.name, kind: asset.kind }],
      autoSubmit: true,
      autoApply: true,
      text: `重新制作短剧片段精修发布版。只使用刚上传素材「${asset.name}」（assetId=${asset.id}），目标平台${platform}，成片不超过${targetDurationSeconds}秒，竖屏 9:16。第一步必须调用 search_media(query="${asset.name}", modalities=["metadata"], limit=1)，只接受返回 assetId=${asset.id} 的 filename 命中；没有这个精确命中就停止并报告“未找到刚上传的素材”，不得分析、粗剪或改动其他素材。确认后复用或更新整段视频理解，核对真实源画面：有剧情就选钩子/冲突/结果的多段连续区间，无剧情就命名为“展示精修”并保留完整展示序列。调用 assemble_rough_cut 创建新的可编辑粗剪；随后先用 edit_track(action=list) 查出承载该视频片段的真实视频轨，再对该轨调用 transcribe_track(provider=mimo-qwen-asr) 获取真实时间戳，不能猜测 A1；再按真实字幕状态开启字幕。已有 BGM 才放置，不生成付费音乐。不要伪造字幕或时长，不要覆盖用户手工修改。`,
    });
  }, [quickAsset]);

  const dropExternalFilesToTimeline = useCallback(async (
    files: File[],
    trackId: TrackId,
    startFrame: number,
  ) => {
    const batchStartFrame = Math.max(0, Math.round(startFrame));
    const placedItems: Array<{
      assetId: string;
      itemId: string;
      kind: 'video' | 'audio';
      startFrame: number;
      durationInFrames: number;
      autoManaged: boolean;
      pendingAutoWrite?: { fromStartFrame: number; toStartFrame: number };
    }> = [];
    const stoppedReflowKinds = new Set<'video' | 'audio'>();
    const pendingDurations = new Map<string, number>();
    const nextStartForKind = (kind: 'video' | 'audio') => placedItems
      .filter((item) => item.kind === kind)
      .reduce((frame, item) => frame + Math.max(1, item.durationInFrames), batchStartFrame);
    const stopAutoReflowFrom = (kind: 'video' | 'audio', itemId: string) => {
      let stop = false;
      for (const candidate of placedItems) {
        if (candidate.kind !== kind) continue;
        if (candidate.itemId === itemId) stop = true;
        if (!stop) continue;
        candidate.autoManaged = false;
        delete candidate.pendingAutoWrite;
      }
      stoppedReflowKinds.add(kind);
    };
    const reflowPlacedBatch = () => {
      for (const placement of reflowPlacedMediaItems(placedItems, batchStartFrame)) {
        const item = placedItems.find((candidate) => candidate.itemId === placement.itemId);
        if (!item || !item.autoManaged) continue;
        const live = stateRef.current.items.find((candidate) => candidate.id === item.itemId);
        if (!live) {
          stopAutoReflowFrom(item.kind, item.itemId);
          continue;
        }
        const pending = item.pendingAutoWrite;
        if (live.startFrame === item.startFrame) {
          delete item.pendingAutoWrite;
        } else if (!pending
          || pending.toStartFrame !== item.startFrame
          || live.startFrame !== pending.fromStartFrame) {
          stopAutoReflowFrom(item.kind, item.itemId);
          continue;
        }
        if (item.startFrame === placement.startFrame) continue;
        const fromStartFrame = item.pendingAutoWrite?.fromStartFrame ?? live.startFrame;
        item.startFrame = placement.startFrame;
        item.pendingAutoWrite = { fromStartFrame, toStartFrame: placement.startFrame };
        commands.setItemTiming(item.itemId, { startFrame: placement.startFrame });
      }
    };
    const updatePlacedAsset = (asset: MediaAsset) => {
      pendingDurations.set(asset.id, asset.durationInFrames);
      const item = placedItems.find((candidate) => candidate.assetId === asset.id);
      if (!item) return;
      item.durationInFrames = Math.max(1, asset.durationInFrames);
      reflowPlacedBatch();
    };
    const removePlacedAsset = (assetId: string) => {
      const index = placedItems.findIndex((candidate) => candidate.assetId === assetId);
      if (index < 0) return;
      const [{ itemId }] = placedItems.splice(index, 1);
      commands.removeItem(itemId);
      commands.removeMediaAsset(assetId);
      reflowPlacedBatch();
    };
    const awaitTimelinePlaceholder = (file: File) => new Promise<MediaAsset>((resolve, reject) => {
      let placeholderId: string | null = null;
      void importMedia(file, stateRef.current.fps, {
        onPlaceholder: (asset) => {
          placeholderId = asset.id;
          commands.addAsset(asset);
          resolve(asset);
        },
        onUploaded: (info) => startAssetTranscription(info, info.asrPath),
        onReady: (asset) => {
          commands.relinkMediaAsset(asset.id, {
            src: asset.src, name: asset.name, durationInFrames: asset.durationInFrames,
            width: asset.width, height: asset.height, kind: asset.kind,
            sourceRevision: asset.sourceRevision, sourceSize: asset.sourceSize,
            sourceModifiedAt: asset.sourceModifiedAt, sourceFilename: asset.sourceFilename,
            originalFilePath: asset.originalFilePath,
          });
          if (asset.kind !== 'audio') refreshVisualAnalysis(asset);
          updatePlacedAsset(asset);
        },
      }).catch((error) => {
        if (!placeholderId) reject(error);
        else removePlacedAsset(placeholderId);
        showAppToast(error instanceof Error ? error.message : t('导入失败'), { error: true });
      });
    });
    const addedIds: string[] = [];
    for (const file of files) {
      const target = classifyExternalFile(file);
      if (!target) {
        showAppToast(t('不支持导入「{name}」', { name: file.name }), { error: true });
        continue;
      }
      if (target.type === 'caption') {
        try {
          const snapshot = stateRef.current;
          const captionTrackId = trackKind(snapshot, trackId) === 'caption'
            ? trackId
            : defaultTrackId(snapshot, 'caption');
          if (!captionTrackId) throw new Error(t('请先创建字幕轨道'));
          const words = parseDroppedCaptions(
            file.name,
            await file.text(),
            Math.max(0, startFrame) * 1000 / snapshot.fps,
          );
          if (!words.length) throw new Error(t('字幕文件没有可用内容'));
          const current = captionsOnTrack(snapshot, captionTrackId) ?? newManualCaptions();
          const withLane = current.sourceEntries?.some(isManualCaptionEntry)
            ? current
            : { ...current, ...appendManualLane(current, snapshot.items) };
          const lane = withLane.sourceEntries?.find(isManualCaptionEntry);
          if (!lane) throw new Error(t('无法创建字幕轨道'));
          commands.setCaptions({
            ...withLane,
            enabled: true,
            sourceEntries: withLane.sourceEntries?.map((entry) => entry.id === lane.id
              ? { ...entry, words: [...(entry.words ?? []), ...words] }
              : entry),
          }, captionTrackId);
        } catch (error) {
          showAppToast(error instanceof Error ? error.message : t('读取字幕文件失败'), { error: true });
        }
        continue;
      }
      try {
        const asset = await awaitTimelinePlaceholder(file);
        const kind = target.mediaKind === 'audio' ? 'audio' : 'video';
        const snapshot = stateRef.current;
        const destination = trackKind(snapshot, trackId) === kind
          ? trackId
          : defaultTrackId(snapshot, kind);
        const itemStartFrame = nextStartForKind(kind);
        const itemId = commands.addMediaItem(asset, {
          track: destination ?? undefined,
          startFrame: itemStartFrame,
        });
        addedIds.push(itemId);
        placedItems.push({
          assetId: asset.id, itemId, kind,
          startFrame: itemStartFrame,
          durationInFrames: pendingDurations.get(asset.id) ?? asset.durationInFrames,
          autoManaged: !stoppedReflowKinds.has(kind),
        });
      } catch (error) {
        showAppToast(error instanceof Error ? error.message : t('导入失败'), { error: true });
      }
    }
    if (addedIds.length) commands.selectItems(addedIds);
  }, [commands, startAssetTranscription, t]);
  const addMediaAssetsToTimeline = useCallback((assets: MediaAsset[]) => {
    placeMediaAssets({
      assetIds: assets.map((asset) => asset.id),
      assets,
      startFrame: getPlayhead(),
      add: (asset, frame) => commands.addMediaItem(asset, { startFrame: frame }),
      select: commands.selectItems,
    });
  }, [commands, getPlayhead]);

  const importToCanvas = useCallback(async (file: File, onProgress?: (ratio: number) => void) => {
    const asset = await importToPool(file, onProgress);
    commands.addMediaItem(asset);
  }, [commands, importToPool]);
  const pasteMediaAssets = useCallback((assets: MediaAsset[], folderId?: string) => {
    const readyAssets = readyMediaAssetsForPaste(assets, stateRef.current.assets ?? []);
    if (!readyAssets.length) return;
    commands.batch(readyAssets.map((asset) => ({
      type: 'addAsset' as const,
      asset: {
        ...asset,
        id: `asset_${crypto.randomUUID()}`,
        name: duplicateAssetName(asset.name, t('副本')),
        folderId,
      },
    })), t('粘贴素材'));
  }, [commands, t]);
  const useMediaAI = useCallback((assets: MediaAsset[]) => {
    const seed = createMediaAssetsChatSeed(assets);
    if (!seed) return;
    setChatCollapsed(false);
    setChatSeed(seed);
  }, [setChatCollapsed]);
  const useTemplateAI = useCallback((tpl: Tpl) => {
    setChatCollapsed(false);
    setChatSeed({ text: t('参考模板「{name}」，用 create_motion_graphic 生成一个类似风格的动画： @{name} ', { name: tpl.name }), nonce: Date.now(), references: [{ id: tpl.id, name: tpl.name, kind: 'template' }] });
  }, [setChatCollapsed, t]);

  // Export: POST the current timeline to the dev-server /export endpoint (which
  // renders it in headless Chrome via @remotion/renderer) and download the MP4.
  const exportJobs = useMemo(() => createExportJobStore(), []);
  const activeExportJobs = useSyncExternalStore(
    exportJobs.subscribeActive,
    exportJobs.getActiveCount,
    exportJobs.getActiveCount,
  );
  useEffect(() => {
    void resumePersistedServerExports({ exportJobs, projectId: project.id, t }).catch((error) => {
      console.warn('[export] failed to restore interrupted server exports', error);
    });
  }, [exportJobs, project.id, t]);
  const [exportOpen, setExportOpen] = useState(false);
  // Export the settings dialog box, with a total of 5 tabs: video/audio/MG animation/captions/XML.
  const onExport = useCallback(() => setExportOpen(true), []);
  useEditorActions({
    commands,
    docRef,
    fps: state.fps,
    projectId: project.id,
    timelineRef: shortcutApiRef,
    openExport: onExport,
    openDesign: () => setShowDesign(true),
    openHistory: () => setShowVersions(true),
    openShortcuts: () => setShowShortcuts(true),
    toggleLayout: () => setChatCollapsed((value) => !value),
    focusAgent: () => {
      setChatCollapsed(false);
      requestAnimationFrame(() => {
        document.querySelector<HTMLTextAreaElement>('[data-cc-chat-composer]')?.focus();
      });
    },
    selectAll: selectAllTimelineContent,
  });

  return (
    <div
      className="cc-editor-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: panelLayout.gridTemplateColumns,
        gridTemplateRows: panelLayout.gridTemplateRows,
        height: '100vh',
        overflow: 'hidden',
        background: theme.bg,
        color: theme.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <TopBar
        projectId={project.id}
        projectName={project.name}
        exporting={activeExportJobs > 0}
        exportJobCount={activeExportJobs}
        canUndo={canUndo}
        canRedo={canRedo}
        onHome={handleHome}
        onRename={onRename}
        onResumeGeneration={() => resumeOpenGenerationJobs(project.id, {
          getState: () => stateRef.current,
          onAsset: (asset) => {
            if ((docRef.current.assets ?? []).some((item) => item.id === asset.id || item.src === asset.src)) return;
            commands.addAsset(asset);
          },
          timeoutSeconds: 180,
        }).then(() => undefined)}
      />
      {quickRun && !quickRun.dismissed && (
        <QuickRunOverlay
          stage={quickStage}
          recipe={quickRun.recipe}
          asset={quickAsset}
          importedRatio={quickRun.importedRatio}
          createdItems={quickCreatedItems}
          fps={state.fps}
          error={quickRun.error || quickAgentState.error}
          onRetry={retryQuickRun}
          onEnterProfessional={() => setQuickRun((current) => current ? { ...current, dismissed: true } : current)}
          onBack={() => { window.location.hash = '#/quick'; }}
        />
      )}
      {exportOpen && (
        <ExportDialog state={state} project={doc} projectId={project.id} projectName={project.name} exportJobs={exportJobs}
          onClose={() => setExportOpen(false)} />
      )}

      {showDesign && (
        <DesignStylePanel style={doc.designStyle} onApply={commands.setDesignStyle} onClose={() => setShowDesign(false)} />
      )}

      {showVersions && (
        <VersionHistory projectId={project.id} currentDoc={doc}
          onRestore={(d) => { commands.applyDoc(d); setShowVersions(false); }}
          onClose={() => setShowVersions(false)} />
      )}

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      <ChatPanel ctx={agentCtx} projectId={project.id} collapsed={chatCollapsed} onToggleCollapse={() => setChatCollapsed((v) => !v)} onPreviewState={setPreviewState} seed={chatSeed} creativeMode={creativeMode} onCreativeModeChange={changeCreativeMode} onImportMedia={importToPool} onRunStateChange={setQuickAgentState} />

      <div style={{ gridColumn: 2, gridRow: '2 / 5' }}>
        {!chatCollapsed && <Divider onResize={panelLayout.resizeChat} />}
      </div>

      <div style={{ gridColumn: 3, gridRow: 2, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        <LibraryPanel semanticScopeId={project.id} templates={allTemplates} onAddTemplate={addTemplate} onAddAudio={(a) => commands.addAudio(a)} playerRef={playerRef} fps={state.fps} items={state.items} trackOptions={trackOptions} captionTracks={captionTracks} onSetCaptions={commands.setCaptions} onUpdateCaptions={commands.updateCaptions} onSetItemTranscript={commands.setItemTranscript} onToggleWord={commands.toggleWord} onCleanScript={commands.cleanScript} onSetGapCap={commands.setGapCap} onSetTranscriptPlayOrder={commands.setTranscriptPlayOrder} onReorderTrackItems={commands.reorderTrackItems} onClearEdits={commands.clearEdits} assets={state.assets ?? []} mediaFolders={doc.mediaFolders} usedAssetIds={usedAssetIds} offlineAssetIds={offlineAssetIds} onAssetLoadError={(asset) => markMediaOffline(asset.src)} onImportMedia={importToPool} onImportMobileMedia={importMobileUpload} onAddMediaItem={(asset) => commands.addMediaItem(asset)} onAddMediaAssetsToTimeline={addMediaAssetsToTimeline} onUseMediaAI={useMediaAI} onPasteMediaAssets={pasteMediaAssets} onCreateMediaFolder={commands.createMediaFolder} onRenameMediaFolder={commands.renameMediaFolder} onDeleteMediaFolder={commands.deleteMediaFolder} onMoveMediaAssets={commands.moveMediaAssets} onRenameMediaAsset={commands.renameMediaAsset} onRenameMediaAssets={commands.renameMediaAssets} onSetMediaAssetFavorite={commands.setMediaAssetFavorite} onSetMediaAssetsFavorite={commands.setMediaAssetsFavorite} onRemoveMediaAsset={commands.removeMediaAsset} onRemoveMediaAssets={commands.removeMediaAssets}
          onCreateCaptionTrack={commands.createCaptionTrack}
          sequenceOptions={sequenceOptions}
          onAddSequence={(timelineId) => {
            const result = commands.addSequence(timelineId, { startFrame: getPlayhead() });
            if (!result.ok) showAppToast(t(result.error), { error: true });
          }}
          onRelinkMediaAsset={(id, next) => commands.relinkMediaAsset(id, next)}
          onAddSolid={() => commands.addSolidItem({ startFrame: getPlayhead() })}
          creativeMode={creativeMode}
          onCreativeModeChange={changeCreativeMode}
          onUseTemplateAI={useTemplateAI}
          selectedItem={selectedItem}
          onApplyTransition={(type, custom) => state.selectedId && commands.addTransition(state.selectedId, type, undefined, custom)}
          onApplyFx={(assetId) => {
            if (!state.selectedId) return;
            const it = state.items.find((x) => x.id === state.selectedId);
            if (!it) return;
            const prev = it.effects ?? [];
            const next = [
              ...prev.filter((e) => e.assetId !== assetId),
              { id: `fx_${assetId}`, assetId, overrides: {} },
            ];
            commands.setItemEffects(state.selectedId, next, serializableDefsFor(next));
          }}
          onApplyZoom={(zoom) => state.selectedId && commands.setItemZoom(state.selectedId, zoom)}
 />
      </div>
      <div style={{ gridColumn: 4, gridRow: 2 }}>
        <Divider onResize={panelLayout.resizeLibrary} />
      </div>
      <div className="cc-preview-workspace" style={{ gridColumn: 5, gridRow: 2 }}>
        <PreviewPanel state={autoGradePreviewState ?? previewState ?? state} project={doc} playerRef={playerRef} onImport={importToCanvas}
          hoverPreviewFrame={timelineHoverPreviewFrame}
          projectId={project.id} timelineId={doc.activeTimelineId} reviewState={state} selectedItem={selectedItem}
          reviewRequest={reviewRequest}
          offlineSrcs={offlineSrcs}
          onUpdateCaptions={previewState || autoGradePreviewState ? undefined : commands.updateCaptions}
          onSelectCaption={previewState || autoGradePreviewState ? undefined : selectCaption}
          activeCaptionSelection={captionSelection}
          {...(!previewState && !autoGradePreviewState ? {
            onSelectItem: commands.selectItem,
            onSetItemTransform: commands.setItemTransform,
            onSetItemKeyframe: commands.setItemKeyframe,
            onBeginHistoryGesture: commands.beginHistoryGesture,
            onEndHistoryGesture: commands.endHistoryGesture,
            onItemPropChange: (id, key, value) => commands.updateItemProps(id, { [key]: value }),
          } : {})}
          onSeedChat={(text) => setChatSeed({ text, nonce: Date.now() })}
          inspectorOpen={!!(selectedItem || selectedCaption) && !inspectorCollapsed}
          selectedPreviewStatuses={selectedPreviewStatuses}
          onSelectedPreviewStatus={handleSelectedPreviewStatus}
          slipPreview={activeSlipPreview}
          onToggleInspector={() => setInspectorCollapsed((collapsed) => !collapsed)} />
        {(selectedItem || selectedCaption) && !inspectorCollapsed && (
          <InspectorPanel
            playerRef={playerRef}
            historyGesture={historyGesture}
            templates={allTemplates}
            selectedItem={selectedItem}
            selectedCaption={selectedCaption}
            onCaptionUpdate={(patch) => selectedCaption && commands.updateCaptions(patch, selectedCaption.trackId)}
            selectedIds={selectedIds}
            selectedItems={selectedItems}
            fps={state.fps}
            collapsed={inspectorCollapsed}
            onCollapsedChange={setInspectorCollapsed}
            onItemPropChange={(key, value) => applyInspectorSelection(
              (item) => ({ type: 'updateProps', id: item.id, patch: { [key]: value } }),
              (item) => selectedItem ? item.kind === selectedItem.kind : false,
            )}
            onItemVolumeChange={(volume) => applyInspectorSelection(
              (item) => ({ type: 'setVolume', id: item.id, volume }),
              (item) => item.kind === 'audio' || item.kind === 'video',
            )}
            onItemFadeChange={(fade) => applyInspectorSelection(
              (item) => ({ type: 'setFade', id: item.id, ...fade }),
            )}
            onItemTransformChange={(patch) => applyInspectorSelection(
              (item) => ({ type: 'setTransform', id: item.id, patch }),
              (item) => item.kind !== 'audio',
            )}
            onItemFiltersChange={(patch) => {
              if (autoGradeBusy || autoGradeSession) cancelAutoGrade();
              applyInspectorSelection(
                (item) => ({ type: 'setFilters', id: item.id, patch }),
                (item) => item.kind !== 'audio',
              );
            }}
            autoGrade={{
              busy: autoGradeBusy,
              targetCount: autoGradeTargets.length,
              previewCount: autoGradeSession?.recommendations.length ?? 0,
              failedCount: autoGradeSession?.failedCount ?? 0,
              selectedPreview: selectedAutoGrade ? {
                filters: selectedAutoGrade.analysis.filters,
                bitDepth: selectedAutoGrade.analysis.profile.bitDepth,
                hdr: selectedAutoGrade.analysis.profile.hdr,
              } : null,
              onAnalyze: analyzeSelectedColor,
              onApply: applyAutoGrade,
              onCancel: cancelAutoGrade,
            }}
            onItemZoomChange={(patch) => applyInspectorSelection(
              (item) => ({ type: 'setZoom', id: item.id, patch }),
              (item) => item.kind !== 'audio',
            )}
            onItemEffectsChange={(effects) => {
              const defs = serializableDefsFor(effects);
              applyInspectorSelection(
                (item) => ({ type: 'setEffects', id: item.id, effects, defs }),
                (item) => item.kind === 'video' || item.kind === 'image',
              );
            }}
            selectedPreviewStatuses={selectedPreviewStatuses}
            onItemSpeedChange={(rate) => applyInspectorSelection(
              (item) => ({ type: 'setSpeed', id: item.id, rate }),
              (item) => item.kind === 'video' || item.kind === 'audio',
            )}
            slipPlan={selectedSlipPlan}
            onItemSlip={selectedSlipPlan && selectedItem ? (deltaInFrames) => commands.slipItem(selectedItem.id, deltaInFrames) : undefined}
            onNormalizeLoudness={async () => {
              const ids = [...selectedIds];
              const items = [...selectedItems];
              if (!items.length || items.some((item) => item.kind !== 'audio' || !item.src)) return;
              try {
                const gains = await Promise.all(items.map(async (item) => [
                  item.id,
                  gainForTarget(await analyzeClipLoudness(item.src!), -14),
                ] as const));
                const gainById = new Map(gains);
                const live = stateRef.current;
                const plan = planInspectorBatch(
                  live,
                  ids,
                  (item) => ({ type: 'setVolume', id: item.id, volume: gainById.get(item.id)! }),
                  (item) => item.kind === 'audio' && gainById.has(item.id),
                );
                if (plan.ok) commands.batch(plan.actions, 'Normalize selected loudness');
              } catch {
                showAppToast(t('响度分析失败，未修改任何片段。'));
              }
            }}
            onIsolateVoice={async (action, strength) => {
              const ids = [...selectedIds];
              const items = [...selectedItems];
              if (!items.length || items.some((item) => (item.kind !== 'video' && item.kind !== 'audio'))) return;
              if (action === 'clear') {
                const plan = planInspectorBatch(
                  stateRef.current,
                  ids,
                  (item) => ({ type: 'setItemDenoise', id: item.id, denoisedSrc: null }),
                  (item) => item.kind === 'video' || item.kind === 'audio',
                );
                if (plan.ok) commands.batch(plan.actions, 'Clear selected voice isolation');
                return;
              }
              if (items.some((item) => !item.src)) return;
              try {
                const sourceAssets = docRef.current.assets ?? [];
                const snapshots = items.map((item) => captureTimelineItemSource(item, sourceAssets));
                const isolated = await Promise.all(snapshots.map(async (snapshot, index) => {
                  const item = items[index]!;
                  return [
                    item.id,
                    await isolateVoiceOnSrc(
                      snapshot.src,
                      typeof strength === 'number' ? strength : (item.denoiseStrength ?? 70),
                      { force: true, sourceRevision: snapshot.sourceRevision },
                    ),
                  ] as const;
                }));
                const resultById = new Map(isolated);
                const live = stateRef.current;
                const validation = validateTimelineItemSourceBatch(
                  snapshots,
                  live.items,
                  docRef.current.assets ?? [],
                  resultById,
                );
                if (validation.status === 'stale') {
                  showAppToast(t('所选片段的源素材已变化，旧的人声分离结果已丢弃。请重试。'), { error: true });
                  return;
                }
                const plan = planInspectorBatch(
                  live,
                  ids,
                  (item) => {
                    const result = resultById.get(item.id);
                    return result
                      ? { type: 'setItemDenoise' as const, id: item.id, denoisedSrc: result.path, strength: result.strength }
                      : null;
                  },
                  (item) => (item.kind === 'video' || item.kind === 'audio') && resultById.has(item.id),
                );
                if (plan.ok) commands.batch(plan.actions, 'Isolate selected voices');
              } catch {
                showAppToast(t('人声分离失败，未修改任何片段。'));
              }
            }}
            getPlayhead={getPlayhead}
            onSetReframeKeyframe={(frame, fx, fy, mag) => applyInspectorSelection(
              (item) => ({ type: 'reframeKeyframe', id: item.id, frame, focalPointX: fx, focalPointY: fy, magnification: mag }),
              (item) => item.kind !== 'audio',
            )}
            onRemoveReframeKeyframe={(frame) => applyInspectorSelection(
              (item) => ({ type: 'removeReframeKeyframe', id: item.id, frame }),
              (item) => item.kind !== 'audio',
            )}
            onSetItemKeyframe={(prop, frame, value, easing) => applyInspectorSelection(
              (item) => ({ type: 'setKeyframe', id: item.id, prop, frame, value, easing }),
              (item) => supportsKeyframeProperty(item, prop),
            )}
            onRemoveItemKeyframe={(prop, frame) => applyInspectorSelection(
              (item) => ({ type: 'removeKeyframe', id: item.id, prop, frame }),
              (item) => supportsKeyframeProperty(item, prop),
            )}
            onResetItemKeyframes={(props) => applyInspectorSelection(
              (item) => keyframeResetBatch(item.id, props).actions,
              (item) => props.every((prop) => supportsKeyframeProperty(item, prop)),
              'Reset selected keyframes',
            )}
            onSeek={(frame) => shortcutApiRef.current?.seekTo(frame)}
            transition={selectedTransition}
            onAddTransition={(type) => state.selectedId && commands.addTransition(state.selectedId, type)}
            onSetTransition={(patch) => {
              const t = state.transitions?.find((x) => x.incomingItemId === state.selectedId);
              if (t) commands.setTransition(t.id, patch);
            }}
            onRemoveTransition={() => {
              const t = state.transitions?.find((x) => x.incomingItemId === state.selectedId);
              if (t) commands.removeTransition(t.id);
            }}
          />
        )}
      </div>
      <div style={{ gridColumn: '3 / -1', gridRow: 3 }}>
        <Divider orientation="horizontal" onResize={panelLayout.resizeTimeline} />
      </div>
      <div style={{ gridColumn: '3 / -1', gridRow: 4, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <TimelineTabs doc={doc} commands={commands} />
        <Timeline state={state} commands={commands} playerRef={playerRef}
          projectId={project.id}
          shortcutApiRef={shortcutApiRef}
          selectedCaptions={captionSelections}
          onSelectCaption={selectCaption}
          onMarqueeCaptionSelect={selectMarqueeCaptions}
          onHoverPreviewFrameChange={setTimelineHoverPreviewFrame}
          onDropExternalFiles={dropExternalFilesToTimeline}
          onReviewItem={(request) => setReviewRequest({ ...request, nonce: Date.now() })}
          onSlipPreview={setActiveSlipPreview}
          onRecordVoiceover={async (blob) => {
            const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
            const asset = await importMedia(new File([blob], `旁白.${ext}`, { type: blob.type }), state.fps);
            ingestToPool(asset); // Narration auto-transcribes; the placed A1 clip backfills on completion
            commands.addMediaItem(asset, { track: 'A1', startFrame: getPlayhead() });
          }} />
      </div>
      <AppToastHost />
    </div>
  );
}
