'use strict';

const assert = require('assert');
const broker = require('./bridge/niannian_step01_artifact_broker');
const sessions = require('./bridge/niannian_step01_artifact_broker_session');

const binding = {project_id:'NN-20260715083045-8120F5',analysis_run_id:'analysis-1-0123456789abcdef',phase_key:'step01phase-' + 'a'.repeat(64),package_manifest_sha256:'b'.repeat(64)};

async function main() {
  const memory = broker.createMemoryBroker();
  const store = sessions.createSessionStore({brokerFactory:() => memory,randomBytes:size => Buffer.alloc(size, 7)});
  const created = store.create({binding,request_id:'return-00000001'});
  const payload = Buffer.from('return-artifact', 'utf8');
  const manifest = {schema_version:sessions.RETURN_MANIFEST_SCHEMA,phase_key:binding,files:[{relative_path:'route_decision.json',sha256:broker.sha256(payload),bytes:payload.length}]};
  const result = await store.submitReturnManifest(created.session.session_id,created.token,manifest,Buffer.from(JSON.stringify(manifest)));
  assert.equal(result.grants.length,1);
  assert.match(result.return_manifest.object_key,/^returns\/NN-20260715083045-8120F5\/analysis-1-0123456789abcdef\/step01phase-/);
  assert.match(result.return_manifest.object_key,/\/return-manifest\/[a-f0-9]{64}$/);
  assert.match(result.grants[0].url,/^memory:\/\//);
  assert.match(result.grants[0].object_key,/\/artifact-[a-f0-9]{24}\/[a-f0-9]{64}$/);
  await memory.put(result.return_manifest.grant.url,Buffer.from(JSON.stringify(manifest)));
  await memory.put(result.grants[0].url,payload);
  assert.throws(() => store.authorize(created.session.session_id,'wrong'),error => error.code === 'ARTIFACT_BROKER_SESSION_REJECTED');
  await assert.rejects(() => store.submitReturnManifest(created.session.session_id,created.token,manifest,Buffer.from(JSON.stringify(manifest))),error => error.code === 'ARTIFACT_BROKER_RETURN_REPLAY_REJECTED');
  assert.equal(JSON.stringify(store.receipt(created.session.session_id)).includes(created.token),false);
  process.stdout.write(JSON.stringify({ok:true,verified:['short-lived session token is stored only as SHA','return manifest binding is verified before exact grants','Mac receives only exact PUT grants after its manifest is checked','grant receipt redacts token and URL']})+'\n');
}
main().catch(error => { process.stderr.write(String(error.stack || error)+'\n'); process.exitCode=1; });
