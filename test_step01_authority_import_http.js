'use strict';
const assert = require('assert/strict');
const crypto = require('crypto');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const projectId = 'NN-20260715083045-8120F5';
const revisionId = 'analysis-20260727-full-evidence-r1';
const declaration = {
  schema_version:'niannian.step01_authority_import_declaration.v1',
  project_id:projectId,
  revision_id:revisionId,
  source_revision:1,
  counts:{frames:254,shots:37,triad_frames:111},
  strict_manifest_sha256:'2f8bc4b4147e7b4eeab1ff5870c2a0c535eac6174a0ef1c26546c808ea5aa1d2',
  full_evidence_index_sha256:'38b3cf07f49a5050c7ea9b09994d4f0e2dc609e6c2412e065640ae02cf189d3d',
  archive_bytes:504967275,
  archive_sha256:'92418503b70a51c63e80c5681fc524c6e13f2e8059bad9835a0440152a0b5edb'
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(url, options = {}) {
  const response = await fetch(url, options);
  return {response, body:await response.json().catch(() => ({}))};
}
async function register(base, label) {
  const result = await request(base + '/api/auth/register', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:label + '-' + Date.now() + '@example.com',password:'correct-horse-battery-staple'})});
  assert.equal(result.response.status, 200);
  return {user:result.body.user, cookie:result.response.headers.get('set-cookie').split(';')[0]};
}
async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'step01-import-http-'));
  const data = path.join(root, 'data');
  const authority = path.join(root, 'authority');
  const port = 28000 + crypto.randomInt(1000);
  const base = 'http://127.0.0.1:' + port;
  let child;
  try {
    const env = {...process.env,PORT:String(port),DATA_DIR:data,NIANNIAN_STEP01_AUTHORITY_REVISION_ROOT:authority,NIANNIAN_MEDIA_PREFLIGHT:'off',NIANNIAN_STEP01_AUTO_EXECUTE:'off',NIANNIAN_COS_ENDPOINT:'',NIANNIAN_COS_BUCKET:'',NIANNIAN_COS_REGION:'',NIANNIAN_COS_SECRET_ID:'',NIANNIAN_COS_SECRET_KEY:'',NIANNIAN_WEB_MEDIA_COS_ENDPOINT:'',NIANNIAN_WEB_MEDIA_COS_BUCKET:'',NIANNIAN_WEB_MEDIA_COS_REGION:'',NIANNIAN_WEB_MEDIA_COS_SECRET_ID:'',NIANNIAN_WEB_MEDIA_COS_SECRET_KEY:'',NIANNIAN_STEP01_COS_GRANT_PROTOCOL_VERSION:'',NIANNIAN_STEP01_COS_GRANT_PROTOCOL_READBACK_SHA256:''};
    child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {cwd:__dirname,env,stdio:'ignore'});
    for (let index = 0; index < 80; index += 1) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await delay(50); }
    const owner = await register(base, 'import-owner');
    const stranger = await register(base, 'import-stranger');
    await fsp.mkdir(data, {recursive:true});
    await fsp.writeFile(path.join(data, 'projects.json'), JSON.stringify([
      {id:projectId,name:'Exact authority import',ownerId:owner.user.id,source:{sha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',bytes:145897161}},
      {id:'NN-ARBITRARY-UPLOAD',name:'Must reject',ownerId:owner.user.id,source:{sha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',bytes:145897161}}
    ]));
    const route = '/api/projects/' + projectId + '/step01/authority-revisions/' + revisionId + '/import-grant';
    const options = cookie => ({method:'POST',headers:{'content-type':'application/json','idempotency-key':'authority-import-http-test',...(cookie ? {cookie} : {})},body:JSON.stringify(declaration)});
    assert.equal((await request(base + route, options())).response.status, 401);
    assert.equal((await request(base + route, options(stranger.cookie))).response.status, 404);
    const malicious = await request(base + route, {...options(owner.cookie),body:JSON.stringify({...declaration,archive_sha256:'f'.repeat(64)})});
    assert.equal(malicious.response.status, 409);
    assert.equal(malicious.body.code, 'STEP01_AUTHORITY_IMPORT_SCOPE_FORBIDDEN');
    const arbitrary = await request(base + '/api/projects/NN-ARBITRARY-UPLOAD/step01/authority-revisions/' + revisionId + '/import-grant', options(owner.cookie));
    assert.equal(arbitrary.response.status, 409);
    assert.equal(arbitrary.body.code, 'STEP01_AUTHORITY_IMPORT_SCOPE_FORBIDDEN');
    const exact = await request(base + route, options(owner.cookie));
    assert.equal(exact.response.status, 409);
    assert.equal(exact.body.code, 'STEP01_AUTHORITY_IMPORT_BROKER_UNAVAILABLE');
    process.stdout.write(JSON.stringify({ok:true,authenticated:true,owner_scoped:true,exact_allowlist:true,arbitrary_upload_rejected:true,no_cos_write:true}) + '\n');
  } finally {
    if (child) { child.kill(); await delay(80); if (child.exitCode === null) child.kill('SIGKILL'); }
    await fsp.rm(root, {recursive:true,force:true});
  }
}
main().catch(error => { process.stderr.write((error.stack || error.message) + '\n'); process.exitCode = 1; });
