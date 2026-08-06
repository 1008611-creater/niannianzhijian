const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const FORMATS = Object.freeze({
  png: Object.freeze({mimeType:'image/png', extension:'.png'}),
  jpeg: Object.freeze({mimeType:'image/jpeg', extension:'.jpg'}),
  webp: Object.freeze({mimeType:'image/webp', extension:'.webp'}),
  mp3: Object.freeze({mimeType:'audio/mpeg', extension:'.mp3'}),
  wav: Object.freeze({mimeType:'audio/wav', extension:'.wav'}),
  ogg: Object.freeze({mimeType:'audio/ogg', extension:'.ogg'}),
  m4a: Object.freeze({mimeType:'audio/mp4', extension:'.m4a'}),
  mp4: Object.freeze({mimeType:'video/mp4', extension:'.mp4'}),
  mov: Object.freeze({mimeType:'video/quicktime', extension:'.mov'}),
  webm: Object.freeze({mimeType:'video/webm', extension:'.webm'})
});

const KIND_FORMATS = Object.freeze({
  reference_image: Object.freeze(['png','jpeg','webp']),
  generated_image: Object.freeze(['png','jpeg','webp']),
  reference_audio: Object.freeze(['mp3','wav','ogg','m4a']),
  reference_video: Object.freeze(['mp4','mov','webm']),
  generated_video: Object.freeze(['mp4','mov','webm'])
});

function assetError(code, message, httpStatus = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function clean(value, limit = 200) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, limit);
}

function safeOriginalName(value) {
  const name = clean(value, 160).replace(/[^A-Za-z0-9._-\u4e00-\u9fff]+/g, '_');
  return name || 'reference-image';
}

function createCanvasAssetService(options = {}) {
  const indexPath = path.resolve(options.indexPath);
  const storageRoot = path.resolve(options.storageRoot);
  const maxBytes = Math.max(1024 * 1024, Math.min(50 * 1024 * 1024, Number(options.maxBytes || 20 * 1024 * 1024)));
  const maxOutputBytes = Math.max(maxBytes, Math.min(500 * 1024 * 1024, Number(options.maxOutputBytes || 300 * 1024 * 1024)));
  let writeTail = Promise.resolve();

  async function ensureStore() {
    await fsp.mkdir(storageRoot, {recursive:true});
    await fsp.mkdir(path.dirname(indexPath), {recursive:true});
    try { await fsp.access(indexPath); } catch { await fsp.writeFile(indexPath, '[]\n', {flag:'wx'}); }
  }

  async function readAll() {
    await ensureStore();
    const value = JSON.parse(await fsp.readFile(indexPath, 'utf8'));
    return Array.isArray(value) ? value : [];
  }

  async function writeAll(value) {
    await ensureStore();
    const temporary = indexPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
    await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
    try { await fsp.rename(temporary, indexPath); }
    catch (error) { await fsp.rm(temporary, {force:true}).catch(() => {}); throw error; }
  }

  async function withWriteLock(operation) {
    const previous = writeTail;
    let release;
    writeTail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  function publicAsset(asset) {
    return {
      id:asset.id,
      projectId:asset.projectId,
      projectKind:asset.projectKind,
      kind:asset.kind,
      originalName:asset.originalName,
      mimeType:asset.mimeType,
      bytes:asset.bytes,
      sha256:asset.sha256,
      status:asset.status,
      createdAt:asset.createdAt,
      updatedAt:asset.updatedAt
    };
  }

  function validateAssetId(value) {
    const id = clean(value, 120);
    if (!/^CAS-[a-f0-9]{24}$/.test(id)) throw assetError('CANVAS_ASSET_ID_INVALID', '素材标识无效', 422);
    return id;
  }

  async function register(input) {
    const ownerId = clean(input.ownerId, 120);
    const projectId = clean(input.projectId, 160);
    const projectKind = clean(input.projectKind, 20);
    const sha256 = clean(input.sha256, 64).toLowerCase();
    const bytes = Number(input.bytes);
    const format = FORMATS[clean(input.format, 12).toLowerCase()];
    const kind = clean(input.kind || 'reference_image', 40);
    if (!ownerId || !projectId || !['redraw','script'].includes(projectKind) || !Object.prototype.hasOwnProperty.call(KIND_FORMATS, kind)) throw assetError('CANVAS_ASSET_INPUT_INVALID', '素材归属信息无效', 422);
    const maxAllowedBytes = kind.startsWith('reference_') ? maxBytes : maxOutputBytes;
    if (!format || !KIND_FORMATS[kind].includes(clean(input.format, 12).toLowerCase()) || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxAllowedBytes) throw assetError('CANVAS_ASSET_METADATA_INVALID', '素材完整性信息无效', 422);
    return withWriteLock(async () => {
      const assets = await readAll();
      const existing = assets.find(item => item.ownerId === ownerId && item.projectId === projectId && item.projectKind === projectKind && item.kind === kind && item.sha256 === sha256 && item.status === 'ready');
      if (existing) return {asset:existing, created:false};
      const id = clean(input.assetId, 40) || 'CAS-' + crypto.randomBytes(12).toString('hex');
      if (!/^CAS-[a-f0-9]{24}$/.test(id)) throw assetError('CANVAS_ASSET_ID_INVALID', '素材标识无效', 422);
      const storageKey = 'canvas-assets/' + id + format.extension;
      const storedPath = path.resolve(storageRoot, id + format.extension);
      if (!storedPath.startsWith(storageRoot + path.sep)) throw assetError('CANVAS_ASSET_STORAGE_INVALID', '素材存储位置无效', 500);
      const timestamp = new Date().toISOString();
      const asset = {schemaVersion:'niannian.canvas_asset.v1',id,ownerId,projectId,projectKind,kind,originalName:safeOriginalName(input.originalName),mimeType:format.mimeType,format:format === FORMATS.jpeg ? 'jpeg' : clean(input.format, 12).toLowerCase(),bytes,sha256,storageKey,storedPath,status:'ready',createdAt:timestamp,updatedAt:timestamp};
      assets.push(asset);
      await writeAll(assets);
      return {asset,created:true};
    });
  }

  async function registerBuffer(input) {
    const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes || []);
    const format = clean(input.format, 12).toLowerCase();
    const profile = FORMATS[format];
    if (!profile) throw assetError('CANVAS_ASSET_TYPE_UNSUPPORTED', '素材类型不受支持', 415);
    const kind = clean(input.kind || 'reference_image', 40);
    if (!Object.prototype.hasOwnProperty.call(KIND_FORMATS, kind) || !KIND_FORMATS[kind].includes(format)) throw assetError('CANVAS_ASSET_TYPE_UNSUPPORTED', '素材类型不支持当前用途', 415);
    const maxAllowedBytes = kind.startsWith('reference_') ? maxBytes : maxOutputBytes;
    if (!bytes.length || bytes.length > maxAllowedBytes) throw assetError('CANVAS_ASSET_METADATA_INVALID', '素材完整性信息无效', 422);
    const assetId = 'CAS-' + crypto.randomBytes(12).toString('hex');
    const storedPath = path.resolve(storageRoot, assetId + profile.extension);
    if (!storedPath.startsWith(storageRoot + path.sep)) throw assetError('CANVAS_ASSET_STORAGE_INVALID', '素材存储位置无效', 500);
    await ensureStore();
    await fsp.writeFile(storedPath, bytes, {flag:'wx'});
    try {
      const registered = await register({...input,assetId,format,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
      if (!registered.created) await fsp.rm(storedPath, {force:true});
      return registered;
    } catch (error) {
      await fsp.rm(storedPath, {force:true}).catch(() => {});
      throw error;
    }
  }

  async function listOwned(ownerId, projectId, projectKind) {
    const assets = await readAll();
    return assets.filter(item => item.ownerId === ownerId && item.projectId === projectId && (!projectKind || item.projectKind === projectKind) && item.status === 'ready').sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function getOwned(ownerId, projectId, assetId) {
    const id = validateAssetId(assetId);
    const asset = (await readAll()).find(item => item.id === id && item.ownerId === ownerId && item.projectId === projectId && item.status === 'ready');
    if (!asset) return null;
    const storedPath = path.resolve(storageRoot, path.basename(asset.storageKey));
    if (!storedPath.startsWith(storageRoot + path.sep)) throw assetError('CANVAS_ASSET_STORAGE_INVALID', '素材存储位置无效', 500);
    return {...asset, storedPath};
  }

  return {register,registerBuffer,listOwned,getOwned,publicAsset,formats:FORMATS,maxBytes,maxOutputBytes,constants:{indexPath,storageRoot}};
}

module.exports = {createCanvasAssetService,FORMATS};
