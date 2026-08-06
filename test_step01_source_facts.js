'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {buildSourceFactsPackage, validateSourceFactsPackage, LEGACY_STATUS} = require('./bridge/niannian_step01_source_facts');

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function evidence(root, relativePath) {
  const exactPath = path.join(root, relativePath);
  const bytes = await fsp.readFile(exactPath);
  return {relative_path:relativePath.replace(/\\/g, '/'), sha256:crypto.createHash('sha256').update(bytes).digest('hex'), bytes:bytes.length};
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-source-facts-'));
  try {
    const sourceRoot = path.join(root, 'return');
    const outputRoot = path.join(root, 'facts');
    await writeJson(path.join(sourceRoot, 'evidence', 'ffprobe.json'), {duration_seconds:12, width:1080, height:1920});
    await writeJson(path.join(sourceRoot, 'evidence', 'shots.json'), {status:'accepted', detector:'TransNetV2', shots:[{shot_id:'1',start_sec:0,end_sec:6},{shot_id:'2',start_sec:6,end_sec:12}]});
    for (const shot of ['1','2']) for (const point of ['start','mid','end']) await fsp.mkdir(path.join(sourceRoot, 'evidence', 'frames'), {recursive:true}).then(() => fsp.writeFile(path.join(sourceRoot, 'evidence', 'frames', shot + '-' + point + '.png'), Buffer.from('evidence-' + shot + '-' + point)));
    const frameRows = [];
    for (const shot of ['1','2']) for (const point of ['start','mid','end']) frameRows.push({shot_id:shot, point, ...(await evidence(sourceRoot, path.join('evidence','frames',shot + '-' + point + '.png')))});
    await writeJson(path.join(sourceRoot, 'evidence', 'supplement.json'), {rows:frameRows});
    await fsp.mkdir(path.join(sourceRoot, 'evidence'), {recursive:true});
    await fsp.writeFile(path.join(sourceRoot, 'evidence', 'audio.csv'), 'start_sec,end_sec,speaker,text\n0,3,A,hello\n7,9,B,reply\n');
    await fsp.writeFile(path.join(sourceRoot, 'evidence', 'ocr.csv'), 'start_sec,end_sec,text\n1,2,DOOR\n8,9,PHONE\n');
    const manifest = {
      schema_version:'step01_evidence_manifest_v1', status:'verified', downstream_consumable:true, test_only:false,
      source_sha256:'a'.repeat(64), source_bytes:123,
      source:{ffprobe:await evidence(sourceRoot, path.join('evidence','ffprobe.json'))},
      transnet:{accepted_shots:await evidence(sourceRoot, path.join('evidence','shots.json')), shot_supplement:await evidence(sourceRoot, path.join('evidence','supplement.json'))},
      audio:{event_ledger:await evidence(sourceRoot, path.join('evidence','audio.csv'))},
      ocr:{ledger:await evidence(sourceRoot, path.join('evidence','ocr.csv'))}
    };
    await writeJson(path.join(sourceRoot, 'step01_evidence_manifest.json'), manifest);
    const project = {id:'NN-FACTS-001',sourceRevision:1,source:{sha256:'a'.repeat(64),bytes:123},preflight:{durationSeconds:12}};
    const analysisRun = {id:'A01-test'};
    const packageValue = await buildSourceFactsPackage({sourceRoot, outputRoot, project, analysisRun});
    await assert.rejects(() => validateSourceFactsPackage({packagePath:packageValue.exact_path,expected:{projectId:project.id,analysisRunId:analysisRun.id,sourceSha256:project.source.sha256,sourceRevision:1}}), /package_contract_invalid/);
    const validated = await validateSourceFactsPackage({packagePath:packageValue.exact_path,allowLegacyOnly:true,expected:{projectId:project.id,analysisRunId:analysisRun.id,sourceSha256:project.source.sha256,sourceRevision:1}});
    assert.equal(validated.package.status, LEGACY_STATUS);
    assert.equal(validated.package.production_eligible, false);
    assert.equal(validated.timeline.shots.length, 2);
    assert.deepEqual(validated.timeline.shots[0].evidence.dialogue_ids, ['D0001']);
    assert.deepEqual(validated.timeline.shots[1].evidence.ocr_ids, ['O0002']);
    const timelinePath = path.join(outputRoot, 'source_facts_timeline.json');
    const tampered = JSON.parse(await fsp.readFile(timelinePath, 'utf8'));
    tampered.shots[0].end_ms = 999999;
    await writeJson(timelinePath, tampered);
    await assert.rejects(() => validateSourceFactsPackage({packagePath:packageValue.exact_path,allowLegacyOnly:true,expected:{projectId:project.id,analysisRunId:analysisRun.id,sourceSha256:project.source.sha256,sourceRevision:1}}), /artifact_hash_mismatch/);
    manifest.test_only = true;
    await writeJson(path.join(sourceRoot, 'step01_evidence_manifest.json'), manifest);
    await assert.rejects(() => buildSourceFactsPackage({sourceRoot, outputRoot:path.join(root, 'test-only-facts'), project, analysisRun}), /manifest_invalid/);
    process.stdout.write(JSON.stringify({ok:true,verified:['legacy source-facts derivation remains source-bound','legacy package cannot be consumed without explicit legacy-only opt-in','dialogue and OCR are bound to overlapping source shots','package SHA validation rejects tampering','test_only evidence cannot produce a legacy package']}) + '\n');
  } finally {
    await fsp.rm(root, {recursive:true, force:true});
  }
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
