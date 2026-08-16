const CATALOG_ENDPOINT = "/api/canvas/model-catalog";

async function readCatalog() {
  const response = await fetch(CATALOG_ENDPOINT, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`model catalog ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.catalog?.models) ? payload.catalog.models : [];
}

function kindOf(model) {
  return String(model?.kind || model?.type || "").trim().toLowerCase();
}

export async function webCatalogModels(kind) {
  const normalized = kind === "imageEdit" ? "image" : kind;
  const models = await readCatalog();
  return models
    .filter((model) => {
      const modelKind = kindOf(model);
      return model?.enabled !== false && (normalized === "image"
        ? modelKind === "image" || modelKind === "image_edit" || modelKind === "image-edit"
        : modelKind === normalized);
    })
    .map((model) => {
      const modelKey = String(model?.id || model?.modelKey || model?.model || "").trim();
      const modelAlias = String(model?.alias || model?.modelAlias || modelKey).trim();
      const labelZh = String(model?.label || model?.labelZh || model?.name || modelAlias || modelKey).trim();
      const vendorKey = String(model?.providerId || model?.providerKey || model?.provider || model?.vendorKey || "").trim();
      return {
        modelKey: modelKey || modelAlias,
        modelAlias: modelAlias || modelKey,
        labelZh,
        vendorKey: vendorKey || undefined,
        pricing: {
          cost: Number(model?.priceCredits ?? model?.cost ?? 0) || 0,
          enabled: model?.enabled !== false,
        },
        meta: {
          transportTaskKind: normalized === "video" ? "text_to_video" : normalized === "image" ? "image_generation" : undefined,
          supportedResolutions: model?.resolutions || model?.supportedResolutions || [],
          supportedAspectRatios: model?.aspectRatios || model?.supportedAspectRatios || [],
          outputSizes: model?.outputSizes || {},
        },
      };
    });
}

export async function webCatalogHealth() {
  const models = await readCatalog();
  return {
    byKind: ["text", "image", "video"].map((kind) => ({
      kind,
      enabledModels: models.filter((model) => model?.enabled !== false && kindOf(model) === kind).length,
    })),
    issues: [],
  };
}

export async function webCatalogVendors() {
  const models = await readCatalog();
  const vendors = new Map();
  for (const model of models) {
    const key = String(model?.providerId || model?.providerKey || model?.provider || model?.vendorKey || "").trim().toLowerCase();
    const name = String(model?.providerLabel || model?.providerName || key).trim();
    if (key) vendors.set(key, name || key);
  }
  return [...vendors].map(([key, name]) => ({ key, name, enabled: true, authType: "none", hasApiKey: true }));
}
