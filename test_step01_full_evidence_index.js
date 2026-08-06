'use strict';

const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const indexer = require('./bridge/niannian_step01_full_evidence_index');

const project = {id:'NN-20260715083045-8120F5', analysis:{runId:'analysis-1-0dc5c5d751592e9fd0656a81'}, source:{sha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c', bytes:145897161}};

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-full-evidence-'));
  const source = path.join(__dirname, 'data-local', 'step01-evidence', project.id, 'EP001', 'artifacts');
  const artifacts = path.join(root, 'artifacts');
  await fs.mkdir(path.join(artifacts, 'reference_frames_original'), {recursive:true});
  await fs.mkdir(path.join(artifacts, 'transnet_shots'), {recursive:true});
  const shots = JSON.parse(await fs.readFile(path.join(source, 'transnet_shots', 'EP001_transnet_shots.json'), 'utf8'));
  await fs.writeFile(path.join(artifacts, 'transnet_shots', 'EP001_transnet_shots.json'), JSON.stringify(shots));
  const triad = JSON.parse(await fs.readFile(path.join(source, 'shotlevel_start_mid_end_manifest.json'), 'utf8'));
  for (const row of triad.slice(0, 6)) {
    const from = path.join(source, 'shotlevel_start_mid_end_frames', row.file);
    const to = path.join(artifacts, 'reference_frames_original', 'EP001_001_' + row.timecode.replace(/:/g, '-').replace('.', '.') + '_native_evidence.png');
    await fs.copyFile(from, to);
  }
  await fs.writeFile(path.join(artifacts, 'step01_evidence_manifest.json'), JSON.stringify({status:'verified', downstream_consumable:true, source:{sha256:project.source.sha256, bytes:project.source.bytes, ffprobe:{width:1080, height:1920}}}));
  const built = await indexer.build({evidenceRoot:root, project, outputPath:path.join(artifacts, 'full_evidence_index.json')});
  assert.equal(built.frames.length, 6);
  assert.ok(built.frames.every(frame => frame.storage_key.startsWith('reference_frames_original/')));
  const verified = await indexer.readVerified({evidenceRoot:root, project});
  assert.equal(verified.frames.length, 6);
  assert.ok(indexer.batches(verified, 2).every(batch => batch.frames.length <= 2));
  await fs.rm(root, {recursive:true, force:true});
  process.stdout.write(JSON.stringify({ok:true, full_evidence_index:true, frames:6}) + '\n');
}
run().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
