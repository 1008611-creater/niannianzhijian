'use strict';

const assert = require('assert');
const broker = require('./bridge/niannian_step01_artifact_broker');

const binding = {
  project_id:'NN-20260715083045-8120F5',
  analysis_run_id:'analysis-1-0123456789abcdef',
  phase_key:'step01phase-' + 'a'.repeat(64),
  package_manifest_sha256:'b'.repeat(64)
};

async function main() {
  const body = Buffer.from('exact phase package', 'utf8');
  const bodySha = broker.sha256(body);
  const packageKey = broker.packageObjectKey(binding, 'source', bodySha);
  assert.equal(packageKey, 'phase-packages/NN-20260715083045-8120F5/analysis-1-0123456789abcdef/step01phase-' + 'a'.repeat(64) + '/source/' + bodySha);
  assert.throws(() => broker.packageObjectKey(binding, '../source.mp4', bodySha), error => error.code === 'ARTIFACT_BROKER_BINDING_INVALID');
  assert.throws(() => broker.returnObjectKey({...binding,request_id:'return-00000001'}, 'return-manifest', 'not-a-sha'), error => error.code === 'ARTIFACT_BROKER_BINDING_INVALID');
  assert.equal(broker.configuredCosBroker({}).code, 'ARTIFACT_BROKER_NOT_CONFIGURED');

  const memory = broker.createMemoryBroker();
  const write = memory.issue({operation:'PUT',object_key:broker.packageObjectKey(binding, 'phase-package', bodySha),sha256:bodySha,bytes:body.length,binding});
  await memory.put(write.url, body);
  assert.equal(Object.hasOwn(memory.receipt(write), 'url'), false);
  assert.equal(JSON.stringify(memory.receipt(write)).includes('memory://'), false);
  const diagnostic=broker.sanitizeDiagnostic(Object.assign(new Error('ARTIFACT_RETURN_UPLOAD_FAILED'),{code:'ARTIFACT_RETURN_UPLOAD_FAILED',http_status:403,provider_code:'AccessDenied',provider_request_id_sha256:'a'.repeat(64),provider_body_sha256:'b'.repeat(64),provider_body_bytes:128}),'synthetic_probe');
  assert.deepEqual({http_status:diagnostic.http_status,provider_code:diagnostic.provider_code,provider_request_id_sha256:diagnostic.provider_request_id_sha256,provider_body_sha256:diagnostic.provider_body_sha256,provider_body_bytes:diagnostic.provider_body_bytes,secret_redacted:diagnostic.secret_redacted},{http_status:403,provider_code:'AccessDenied',provider_request_id_sha256:'a'.repeat(64),provider_body_sha256:'b'.repeat(64),provider_body_bytes:128,secret_redacted:true});
  const read = memory.issue({operation:'GET',object_key:write.object_key,sha256:write.sha256,bytes:write.bytes,binding});
  assert.deepEqual(await memory.get(read.url), body);
  const published = await broker.publishExactArtifacts(memory, binding, [{role:'manifest',body:Buffer.from('manifest')},{role:'source',body}], {ttl_seconds:60});
  assert.equal(published.artifacts.length,2);
  assert.equal(published.artifacts.every(item => item.object_key.startsWith('phase-packages/NN-20260715083045-8120F5/analysis-1-0123456789abcdef/step01phase-') && item.object_key.endsWith('/' + item.sha256)),true);
  assert.equal(JSON.stringify(published).includes('memory://'),false);
  await assert.rejects(() => broker.publishExactArtifacts(memory,binding,[{role:'bad',body,sha256:'0'.repeat(64)}]), error => error.code === 'ARTIFACT_BROKER_BINDING_INVALID');
  await assert.rejects(() => memory.put(write.url, body), error => error.code === 'ARTIFACT_RETURN_UPLOAD_FAILED');
  assert.throws(() => memory.issue({operation:'GET',object_key:'phase-packages/NN-other/other/' + write.sha256,sha256:write.sha256,bytes:write.bytes,binding}), error => error.code === 'ARTIFACT_BROKER_OBJECT_KEY_INVALID');

  const probe = await broker.runSyntheticProbe(memory, binding, {request_id:'probe-00000001'});
  assert.equal(probe.status, 'ready');
  assert.equal(probe.provider_requested, false);
  assert.equal(probe.project_media_processed, false);
  assert.equal(JSON.stringify(probe).includes('memory://'), false);
  assert.equal(probe.put_grant.request_id, 'probe-00000001');
  assert.notEqual(probe.get_grant.grant_id, probe.put_grant.grant_id);

  const incompleteConfig=broker.configuredCosBroker({NIANNIAN_COS_ENDPOINT:'https://bucket.cos.ap-beijing.myqcloud.com',NIANNIAN_COS_BUCKET:'bucket',NIANNIAN_COS_REGION:'ap-beijing',NIANNIAN_COS_SECRET_ID:'AKIDEXAMPLE',NIANNIAN_COS_SECRET_KEY:'secret'});
  assert.equal(incompleteConfig.reason,'mac_grant_protocol_not_installed');
  const readbackMissing=broker.configuredCosBroker({NIANNIAN_COS_ENDPOINT:'https://bucket.cos.ap-beijing.myqcloud.com',NIANNIAN_COS_BUCKET:'bucket',NIANNIAN_COS_REGION:'ap-beijing',NIANNIAN_COS_SECRET_ID:'AKIDEXAMPLE',NIANNIAN_COS_SECRET_KEY:'secret',NIANNIAN_STEP01_COS_GRANT_PROTOCOL_VERSION:'v1'});
  assert.equal(readbackMissing.reason,'mac_grant_protocol_readback_missing');
  const browserImportEnv={NIANNIAN_WEB_MEDIA_COS_ENDPOINT:'https://bucket.cos.ap-beijing.myqcloud.com',NIANNIAN_WEB_MEDIA_COS_BUCKET:'bucket',NIANNIAN_WEB_MEDIA_COS_REGION:'ap-beijing',NIANNIAN_WEB_MEDIA_COS_SECRET_ID:'AKIDEXAMPLE',NIANNIAN_WEB_MEDIA_COS_SECRET_KEY:'secret'};
  assert.equal(broker.configuredCosBroker(browserImportEnv).reason,'cos_configuration_missing');
  const browserImportConfig=broker.configuredCosBroker(browserImportEnv,{purpose:'browser_authority_import'});
  assert.equal(browserImportConfig.ready,true);
  assert.equal(browserImportConfig.grant_protocol_version,broker.BROWSER_AUTHORITY_IMPORT_PROTOCOL);
  assert.equal(browserImportConfig.grant_protocol_readback_sha256,broker.BROWSER_AUTHORITY_IMPORT_PROTOCOL_SHA256);
  const config = broker.configuredCosBroker({NIANNIAN_COS_ENDPOINT:'https://bucket.cos.ap-beijing.myqcloud.com',NIANNIAN_COS_BUCKET:'bucket',NIANNIAN_COS_REGION:'ap-beijing',NIANNIAN_COS_SECRET_ID:'AKIDEXAMPLE',NIANNIAN_COS_SECRET_KEY:'secret',NIANNIAN_STEP01_COS_GRANT_PROTOCOL_VERSION:'v1',NIANNIAN_STEP01_COS_GRANT_PROTOCOL_READBACK_SHA256:'c'.repeat(64)});
  const presigned = broker.presignCosObject(config,{operation:'GET',object_key:packageKey,sha256:broker.sha256(body),bytes:body.length,binding,now_ms:Date.UTC(2026,6,19)});
  assert.match(presigned.url, /^https:\/\/bucket\.cos\.ap-beijing\.myqcloud\.com\//);
  assert.match(presigned.url, /X-Amz-Signature=/);
  assert.equal(JSON.stringify(broker.redactedGrant(presigned)).includes('AKIDEXAMPLE'), false);
  assert.equal(JSON.stringify(broker.redactedGrant(presigned)).includes('secret'), false);
  const cosClient=broker.createCosBroker(config,async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}));
  assert.equal(cosClient.kind,'tencent-cos-s3-compatible');
  assert.equal(JSON.stringify(cosClient.receipt(cosClient.issue({operation:'GET',object_key:packageKey,sha256:broker.sha256(body),bytes:body.length,binding,now_ms:Date.UTC(2026,6,19)}))).includes('secret'),false);
  process.stdout.write(JSON.stringify({ok:true,verified:['exact COS-compatible object key bindings','unconfigured broker typed block','single object grants cannot list/delete or escape phase','replay upload rejected','grant receipts redact URL and credentials','synthetic upload/download probe is non-project and provider-free','S3-compatible COS presign is exact-object only','browser authority import reuses only the existing web-media COS identity without weakening Mac grant gates']}) + '\n');
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
