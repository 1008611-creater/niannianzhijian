'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const importer = require('./tools/import_exact_step01_project');

function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step01-import-'));
  try {
    const source = Buffer.from('exact source fixture');
    const expected = {projectId:'NN-TEST-STEP01',analysisRunId:'analysis-test',sourceSha256:hash(source),sourceBytes:source.length,evidenceId:'NN-TEST-STEP01-EP001'};
    const sourcePath = path.join(root, 'source.mp4');
    const evidenceRoot = path.join(root, 'evidence');
    const remoteSource = '/var/lib/niannian-test/uploads/source.mp4';
    const remoteEvidence = '/var/lib/niannian-test/evidence/EP001';
    const installedSource = path.join(root, 'production', 'uploads', 'source.mp4');
    const installedEvidence = path.join(root, 'production', 'evidence');
    const projectsPath = path.join(root, 'projects.json');
    const usersPath = path.join(root, 'users.json');
    const manifestPath = path.join(root, 'import.json');
    await fsp.mkdir(path.join(evidenceRoot, 'artifacts'), {recursive:true});
    await fsp.writeFile(sourcePath, source);
    await fsp.writeFile(path.join(evidenceRoot, 'step01-evidence-manifest.json'), JSON.stringify({projectId:expected.projectId,analysisRunId:expected.analysisRunId,source:{sha256:expected.sourceSha256,bytes:expected.sourceBytes},status:'completed'}));
    await fsp.writeFile(path.join(evidenceRoot, 'artifacts', 'one.json'), '{"ok":true}\n');
    const project = {id:expected.projectId,ownerId:'local-owner',source:{storedPath:sourcePath,sha256:expected.sourceSha256,bytes:expected.sourceBytes},analysis:{runId:expected.analysisRunId,sourceSha256:expected.sourceSha256,sourceBytes:expected.sourceBytes},runtime:{referenceEvidenceId:expected.evidenceId}};
    await fsp.writeFile(projectsPath, JSON.stringify([project]));
    await fsp.writeFile(usersPath, JSON.stringify([{id:'production-owner',email:'owner@example.com'}]));
    const prepared = await importer.prepareImport({projectStore:projectsPath,source:sourcePath,evidenceRoot,remoteSource,remoteEvidenceRoot:remoteEvidence,accountEmail:'owner@example.com',output:manifestPath}, expected);
    assert.equal(prepared.evidenceFiles, 2);
    await fsp.mkdir(path.dirname(installedSource), {recursive:true});
    await fsp.mkdir(path.dirname(installedEvidence), {recursive:true});
    await fsp.copyFile(sourcePath, installedSource);
    await fsp.cp(evidenceRoot, installedEvidence, {recursive:true});
    await fsp.writeFile(projectsPath, '[]\n');
    if (process.platform !== 'win32') await fsp.chmod(projectsPath, 0o640);
    const backup = path.join(root, 'backup', 'projects.json');
    const applied = await importer.applyImport({manifest:manifestPath,source:installedSource,evidenceRoot:installedEvidence,users:usersPath,projects:projectsPath,backup}, expected);
    assert.equal(applied.status, 'imported');
    const stored = JSON.parse(await fsp.readFile(projectsPath, 'utf8'));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].ownerId, 'production-owner');
    assert.equal(stored[0].source.storedPath, remoteSource);
    assert.deepEqual(JSON.parse(await fsp.readFile(backup, 'utf8')), []);
    if (process.platform !== 'win32') assert.equal((await fsp.stat(projectsPath)).mode & 0o777, 0o640);
    const replay = await importer.applyImport({manifest:manifestPath,source:installedSource,evidenceRoot:installedEvidence,users:usersPath,projects:projectsPath,backup:path.join(root, 'unused-backup.json')}, expected);
    assert.equal(replay.status, 'already_imported');
    const tampered = path.join(installedEvidence, 'artifacts', 'one.json');
    await fsp.writeFile(tampered, '{"ok":false}\n');
    await assert.rejects(() => importer.verifyAssets(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), installedSource, installedEvidence, expected), error => error.code.startsWith('import_evidence_file_mismatch'));
    const duplicateUsers = JSON.parse(await fsp.readFile(usersPath, 'utf8'));
    duplicateUsers.push({id:'other-owner',email:'owner@example.com'});
    await fsp.writeFile(usersPath, JSON.stringify(duplicateUsers));
    await fsp.writeFile(tampered, '{"ok":true}\n');
    await fsp.writeFile(projectsPath, '[]\n');
    await assert.rejects(() => importer.applyImport({manifest:manifestPath,source:installedSource,evidenceRoot:installedEvidence,users:usersPath,projects:projectsPath,backup:path.join(root, 'duplicate-backup.json')}, expected), error => error.code === 'import_owner_not_unique');
    process.stdout.write(JSON.stringify({ok:true,verified:['server-side owner resolution','asset inventory and SHA validation','atomic project append with backup','idempotent replay','tampered evidence rejected','ambiguous owner rejected']}) + '\n');
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
