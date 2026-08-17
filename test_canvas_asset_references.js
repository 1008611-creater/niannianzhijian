const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createCanvasAssetService} = require('./bridge/niannian_canvas_assets');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-canvas-asset-reference-'));
  try {
    const service = createCanvasAssetService({indexPath:path.join(root, 'assets.json'),storageRoot:path.join(root, 'assets')});
    const source = await service.registerBuffer({
      ownerId:'USR-test', projectId:'NN-web-source', projectKind:'redraw', kind:'reference_video',
      originalName:'source.mp4', format:'mp4', bytes:Buffer.from('video reference bytes')
    });
    const reference = await service.referenceOwned({
      ownerId:'USR-test', projectId:'NN-web-target', projectKind:'redraw',
      sourceProjectId:'NN-web-source', sourceAssetId:source.asset.id
    });
    assert.equal(reference.created, true);
    assert.equal(reference.asset.sourceProjectId, 'NN-web-source');
    assert.equal(reference.asset.sourceAssetId, source.asset.id);
    assert.equal(reference.asset.storageKey, source.asset.storageKey);

    const duplicate = await service.referenceOwned({
      ownerId:'USR-test', projectId:'NN-web-target', projectKind:'redraw',
      sourceProjectId:'NN-web-source', sourceAssetId:source.asset.id
    });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.asset.id, reference.asset.id);

    const targetAssets = await service.listOwned('USR-test', 'NN-web-target', 'redraw');
    assert.equal(targetAssets.length, 1);
    assert.equal(service.publicAsset(targetAssets[0]).sourceAsset.assetId, source.asset.id);
    assert.equal((await service.listByOwner('USR-test')).length, 2);
    assert.equal((await service.listByOwner('USR-other')).length, 0);

    const readableReference = await service.getOwned('USR-test', 'NN-web-target', reference.asset.id);
    assert.equal(fs.readFileSync(readableReference.storedPath, 'utf8'), 'video reference bytes');

    const sourceRemoved = await service.removeOwned('USR-test', 'NN-web-source', source.asset.id);
    assert.equal(sourceRemoved.deleteStoredFile, false);
    assert.equal(fs.existsSync(sourceRemoved.storedPath), true);

    const referenceRemoved = await service.removeOwned('USR-test', 'NN-web-target', reference.asset.id);
    assert.equal(referenceRemoved.deleteStoredFile, true);
  } finally {
    fs.rmSync(root, {recursive:true, force:true});
  }
}

main().then(() => console.log('canvas asset references: PASS')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
