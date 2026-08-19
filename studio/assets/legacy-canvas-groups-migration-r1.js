(function migrateLegacyCanvasGroups() {
  'use strict';

  const projectPrefix = 'tapcanvas-open-workbench-project-v1:';
  const appModule = './assets/index-M-8MrEH2-r28-19b89ec-r6.js?v=20260820-portal-cleanup-r1';

  function normalizedGroups(groups) {
    if (Array.isArray(groups)) return groups;
    if (!groups || typeof groups !== 'object') return [];
    return Object.values(groups).filter((group) => group && typeof group === 'object' && !Array.isArray(group));
  }

  function startStudio() {
    const script = document.createElement('script');
    script.type = 'module';
    script.crossOrigin = 'anonymous';
    script.src = appModule;
    document.head.appendChild(script);
  }

  async function migrate() {
    let projectId = '';
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

    try {
      const hashQuery = window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?') + 1) : '';
      projectId = new URLSearchParams(window.location.search).get('projectId') || new URLSearchParams(hashQuery).get('projectId') || '';
      const localKey = projectPrefix + projectId;
      const saved = JSON.parse(window.localStorage.getItem(localKey) || 'null');
      const localCanvas = saved?.payload?.generationCanvas || saved?.generationCanvas;
      if (!projectId || !localCanvas || !Array.isArray(localCanvas.nodes)) return;

      const response = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/canvas', {credentials:'same-origin', cache:'no-store'});
      if (!response.ok) return;
      const remote = await response.json();
      const remoteCanvas = remote?.canvas?.document?.generationCanvas || remote?.document?.generationCanvas;
      if (!remoteCanvas || !Array.isArray(remoteCanvas.nodes) || remoteCanvas.nodes.length === 0) return;

      let changed = false;
      if (localCanvas.nodes.length === 0) {
        localCanvas.nodes = remoteCanvas.nodes;
        localCanvas.edges = Array.isArray(remoteCanvas.edges) ? remoteCanvas.edges : [];
        localCanvas.groups = normalizedGroups(remoteCanvas.groups);
        localCanvas.selectedNodeIds = Array.isArray(remoteCanvas.selectedNodeIds) ? remoteCanvas.selectedNodeIds : [];
        changed = true;
      } else {
        const localById = new Map(localCanvas.nodes.map((node) => [node?.id, node]));
        for (const remoteNode of remoteCanvas.nodes) {
          const localNode = localById.get(remoteNode?.id);
          if (!localNode || remoteNode?.status !== 'success' || !remoteNode.result || localNode.status === 'success') continue;
          localNode.result = remoteNode.result;
          localNode.status = 'success';
          delete localNode.error;
          changed = true;
        }
      }
      if (changed) window.localStorage.setItem(localKey, JSON.stringify(saved));
    } catch (_) {
      // Loading the canvas must remain available when browser storage or recovery is unavailable.
    }
  }

  migrate().finally(startStudio);
}());
