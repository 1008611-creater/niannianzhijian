const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const importer = require('./bridge/niannian_step01_authority_import');
const ledger = require('./bridge/niannian_step01_source_ledger');

async function main() {
  const candidate = path.join(__dirname, 'data-local', 'step01-evidence-candidates', 'NN-20260715083045-8120F5', 'analysis-20260727-full-evidence-r1');
  const archive = path.join(os.tmpdir(), 'niannian-authority-import-' + process.pid + '.tar.gz');
  const packed = spawnSync('tar', ['-czf', archive, '-C', candidate, 'artifacts'], {windowsHide:true});
  assert.equal(packed.status, 0);
  const body = await fsp.readFile(archive);
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-authority-import-'));
  const project = {id:'NN-20260715083045-8120F5',source:{sha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',bytes:145897161}};
  try {
    const result = await importer.importArchive({root, project, revisionId:'analysis-20260727-full-evidence-r1', archive:{filename:'evidence.tar.gz',body,bytes:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')}, expected:{frames:254,shots:37,triad_frames:111}});
    assert.deepEqual(result.counts, {frames:254,shots:37,triad_frames:111});
    assert.equal(result.index.index_sha256, '38b3cf07f49a5050c7ea9b09994d4f0e2dc609e6c2412e065640ae02cf189d3d');
    const importedLedger = await ledger.readLedger({
      evidenceRoot:result.evidence_root,
      overlayRoot:path.join(root, 'ledger-overlays'),
      project:{...project, analysis:{runId:'analysis-20260727-full-evidence-r1', authorityRevisionId:'analysis-20260727-full-evidence-r1'}}
    });
    assert.equal(importedLedger.counts.shots, 37);
    assert.equal(importedLedger.counts.frame_evidence, 111);
    await assert.rejects(() => importer.verifyEvidence({evidenceRoot:result.evidence_root,project,expected:{frames:254,shots:53,triad_frames:159}}), error => error.code === 'STEP01_AUTHORITY_IMPORT_COUNTS_MISMATCH');
    process.stdout.write(JSON.stringify({ok:true,frames:254,shots:37,triad_frames:111}) + '\n');
  } finally {
    await fsp.rm(root,{recursive:true,force:true});
    await fsp.rm(archive,{force:true});
  }
}
main().catch(error => { process.stderr.write((error.stack || error.message) + '\n'); process.exitCode = 1; });
