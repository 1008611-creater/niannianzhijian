const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {createCanvasAssetService} = require('./bridge/niannian_canvas_assets');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-generated-video-assets-'));

async function run() {
  const service = createCanvasAssetService({
    indexPath:path.join(root, 'assets.json'),
    storageRoot:path.join(root, 'assets'),
    maxBytes:1024 * 1024,
    maxOutputBytes:2 * 1024 * 1024
  });
  assert.equal(service.maxBytes, 1024 * 1024);
  assert.equal(service.maxOutputBytes, 2 * 1024 * 1024);
  const mp4 = Buffer.alloc(1536 * 1024);
  mp4.writeUInt32BE(32, 0);
  mp4.write('ftyp', 4, 'ascii');
  mp4.write('isom', 8, 'ascii');
  const generated = await service.registerBuffer({
    ownerId:'USR-VIDEO-A',projectId:'NN-VIDEO-A',projectKind:'redraw',kind:'generated_video',format:'mp4',originalName:'h3-result.mp4',bytes:mp4
  });
  assert.equal(generated.created, true);
  assert.equal(generated.asset.kind, 'generated_video');
  assert.equal(generated.asset.bytes, mp4.length);
  await assert.rejects(
    () => service.registerBuffer({ownerId:'USR-VIDEO-A',projectId:'NN-VIDEO-A',projectKind:'redraw',kind:'reference_video',format:'mp4',originalName:'too-big.mp4',bytes:mp4}),
    error => error && error.code === 'CANVAS_ASSET_METADATA_INVALID'
  );
  console.log('CANVAS_GENERATED_VIDEO_ASSET_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.rmSync(root, {recursive:true,force:true});
});
