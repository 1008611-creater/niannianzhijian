(function migrateLegacyCanvasGroups() {
  'use strict';

  const projectPrefix = 'tapcanvas-open-workbench-project-v1:';

  function normalizedGroups(groups) {
    if (Array.isArray(groups)) return groups;
    if (!groups || typeof groups !== 'object') return [];
    return Object.values(groups).filter((group) => group && typeof group === 'object' && !Array.isArray(group));
  }

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(projectPrefix)) continue;

      const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
      const canvas = saved?.payload?.generationCanvas || saved?.generationCanvas;
      if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) continue;

      const groups = normalizedGroups(canvas.groups);
      const selectedNodeIds = Array.isArray(canvas.selectedNodeIds) ? canvas.selectedNodeIds : [];
      if (canvas.groups === groups && canvas.selectedNodeIds === selectedNodeIds) continue;

      canvas.groups = groups;
      canvas.selectedNodeIds = selectedNodeIds;
      window.localStorage.setItem(key, JSON.stringify(saved));
    }
  } catch (_) {
    // Loading the canvas must remain available even if a browser blocks local storage.
  }
}());
