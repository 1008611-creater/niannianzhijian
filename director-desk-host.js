(function initDirectorDeskHost() {
  const frame = document.getElementById("directorDeskFrame");
  if (!frame) return;
  const hostClose = document.getElementById("directorDeskHostClose");
  const frameSource = frame.getAttribute("src") || "/director-desk/?theme=dark";

  const storageKey = "niannian-director-desk-instance-id";
  const returnKey = "niannian-director-desk-return";
  let lastHash = "";
  let reloadAttempts = 0;

  function normalizeProjectId(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function projectIdFromHash(hash) {
    const match = String(hash || "").match(/^#workbench\/project\/([^/]+)/i);
    if (!match) return "";
    try {
      return normalizeProjectId(decodeURIComponent(match[1]));
    } catch {
      return "";
    }
  }

  function readInstanceId() {
    const requested = normalizeProjectId(new URL(window.location.href).searchParams.get("directorProject"));
    if (requested) {
      sessionStorage.setItem(storageKey, requested);
      return requested;
    }
    const fromHash = projectIdFromHash(window.location.hash);
    if (fromHash) {
      sessionStorage.setItem(storageKey, fromHash);
      return fromHash;
    }

    return normalizeProjectId(sessionStorage.getItem(storageKey)) || "workspace";
  }

  function readDirectorReturn() {
    const requested = new URL(window.location.href).searchParams.get("directorReturn") || "";
    if (/^\/studio\/#\/studio\?projectId=[^&]+(?:&kind=(?:redraw|script))?$/.test(requested)) {
      sessionStorage.setItem(returnKey, requested);
      return requested;
    }
    return sessionStorage.getItem(returnKey) || "";
  }

  function readProjectKind() {
    return new URL(window.location.href).searchParams.get("directorKind") === "script" ? "script" : "redraw";
  }

  function showImportStatus(message, tone) {
    let status = document.getElementById("directorDeskImportStatus");
    if (!status) {
      status = document.createElement("div");
      status.id = "directorDeskImportStatus";
      status.className = "director-desk-import-status";
      status.setAttribute("role", "status");
      document.querySelector(".director-desk-shell")?.appendChild(status);
    }
    status.className = "director-desk-import-status" + (tone ? " is-" + tone : "");
    status.textContent = message;
  }

  async function importCaptures(payload) {
    const projectId = readInstanceId();
    const captures = Array.isArray(payload?.captures) ? payload.captures : [];
    if (!projectId || projectId === "workspace" || !captures.length) throw new Error("没有可导入的导演台截图");
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/canvas/director-import`, {
      method: "POST",
      credentials: "same-origin",
      headers: {"Content-Type":"application/json", "X-Niannian-Project-Kind":readProjectKind()},
      body: JSON.stringify({projectKind:readProjectKind(), captures}),
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body.error || "导演台截图导入失败");
    return body;
  }

  function postSession() {
    if (!isDirectorDocument()) {
      reloadDirectorFrame();
      return;
    }
    frame.contentWindow?.postMessage(
      {
        type: "storyai:director-desk-session",
        payload: {
          instanceId: readInstanceId(),
          theme: "dark",
        },
      },
      window.location.origin
    );
  }

  function isDirectorDocument() {
    try {
      const documentRoot = frame.contentDocument?.querySelector("#root");
      const title = frame.contentDocument?.title || "";
      return Boolean(documentRoot) && /导演台/.test(title);
    } catch {
      return false;
    }
  }

  function reloadDirectorFrame() {
    if (reloadAttempts >= 2) return;
    reloadAttempts += 1;
    const url = new URL(frameSource, window.location.origin);
    url.searchParams.set("directorHostReload", String(Date.now()));
    frame.src = url.toString();
  }

  function syncDirectorFrame() {
    const hash = window.location.hash.toLowerCase();
    if (hash !== "#director-desk") {
      lastHash = hash;
      return;
    }
    if (lastHash === hash) return;
    lastHash = hash;
    reloadAttempts = 0;
    reloadDirectorFrame();
  }

  function openDirectorDesk() {
    const currentProjectId = projectIdFromHash(window.location.hash);
    if (currentProjectId) sessionStorage.setItem(storageKey, currentProjectId);
    window.location.hash = "director-desk";
  }

  hostClose?.addEventListener("click", () => {
    window.location.hash = "workbench";
  });

  frame.addEventListener("load", () => {
    if (isDirectorDocument()) reloadAttempts = 0;
    postSession();
  });

  window.addEventListener("hashchange", syncDirectorFrame);
  syncDirectorFrame();

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;

    if (event.data?.type === "storyai:director-desk-ready") {
      postSession();
      return;
    }

    if (event.data?.type === "storyai:director-desk-close") {
      window.location.hash = "workbench";
      return;
    }

    if (event.data?.type === "storyai:director-desk-captures-sent") {
      const payload = event.data.payload || {};
      showImportStatus("正在导入项目画布…");
      importCaptures(payload).then((result) => {
        window.dispatchEvent(new CustomEvent("niannian:director-desk-captures", {detail:{...payload, imports:result.imports || []}}));
        const importedCount = Array.isArray(result.imports) ? result.imports.length : 0;
        showImportStatus(`已导入 ${importedCount} 张镜头参考`, "success");
        const returnTo = readDirectorReturn();
        if (returnTo) {
          sessionStorage.removeItem(returnKey);
          window.setTimeout(() => { window.location.href = returnTo; }, 220);
        }
      }).catch((error) => {
        showImportStatus(error.message || "导演台截图导入失败", "error");
      });
    }
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.('[data-view="director-desk"]');
    if (!trigger) return;
    openDirectorDesk();
  }, true);
})();
