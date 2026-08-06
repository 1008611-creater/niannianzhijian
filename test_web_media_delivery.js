'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const delivery = require('./bridge/niannian_web_media_delivery');

const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert.ok(serverSource.includes("entries.push({category, localPath:filePath, mime, revision})"), 'server migration list must pass localPath to the delivery bridge');

const projectId = 'NN-20260715083045-8120F5';
const config = {ready:true, endpoint:'https://cos.example.test', bucket:'bucket-123', region:'ap-guangzhou', secret_id:'AKIDTESTONLY', secret_key:'test-secret-not-production'};

const dedicated = delivery.configuredCosDelivery({
  NIANNIAN_COS_ENDPOINT:'https://step01.example.test',
  NIANNIAN_COS_BUCKET:'step01-bucket',
  NIANNIAN_COS_REGION:'ap-beijing',
  NIANNIAN_COS_SECRET_ID:'generic-id',
  NIANNIAN_COS_SECRET_KEY:'generic-key',
  NIANNIAN_WEB_MEDIA_COS_ENDPOINT:'https://media.example.test',
  NIANNIAN_WEB_MEDIA_COS_BUCKET:'media-bucket',
  NIANNIAN_WEB_MEDIA_COS_REGION:'ap-guangzhou',
  NIANNIAN_WEB_MEDIA_COS_SECRET_ID:'media-id',
  NIANNIAN_WEB_MEDIA_COS_SECRET_KEY:'media-key'
});
assert.equal(dedicated.ready, true);
assert.equal(dedicated.endpoint, 'https://media.example.test');
assert.equal(dedicated.bucket, 'media-bucket');
assert.equal(dedicated.region, 'ap-guangzhou');

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-web-media-'));
  try {
    const image = path.join(root, 'frame.png');
    const body = Buffer.from('verified-private-media');
    const evidence = {sha256:crypto.createHash('sha256').update(body).digest('hex'), bytes:body.length};
    await fsp.writeFile(image, body);
    const objectKey = delivery.objectKeyFor({projectId, category:'step01-ledger-frame', sha256:evidence.sha256, mime:'image/png', localPath:image, revision:'analysis-r1'});
    assert.match(objectKey, /^website-media\/NN-20260715083045-8120F5\/analysis-r1\/step01-ledger-frame\/[a-f0-9]{64}\.png$/);
    assert.throws(() => delivery.objectKeyFor({projectId:'../bad', category:'step01-ledger-frame', sha256:evidence.sha256, mime:'image/png', localPath:image}), error => error.code === 'WEB_MEDIA_DELIVERY_BINDING_INVALID');
    const signed = delivery.signUrl(config, {method:'GET', objectKey, nowMs:Date.UTC(2026, 6, 27)});
    const url = new URL(signed);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.pathname, '/' + objectKey);
    assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
    assert.ok(url.searchParams.get('X-Amz-Signature'));
    const remote = new Map(); let puts = 0;
    const fetchImpl = async (requestUrl, init = {}) => {
      const remoteKey = new URL(requestUrl).pathname;
      if (init.method === 'PUT') {
        const chunks = [];
        for await (const chunk of init.body) chunks.push(chunk);
        remote.set(remoteKey, {body:Buffer.concat(chunks), headers:init.headers}); puts += 1;
        return new Response(null, {status:200});
      }
      if (init.method === 'HEAD') {
        const stored = remote.get(remoteKey);
        return new Response(null, {status:stored ? 200 : 404, headers:stored ? {'content-length':String(stored.body.length),'content-type':stored.headers['content-type'],'x-cos-meta-niannian-sha256':stored.headers['x-cos-meta-niannian-sha256'],'x-cos-meta-niannian-bytes':stored.headers['x-cos-meta-niannian-bytes']} : {}});
      }
      if (init.method === 'GET') {
        const stored = remote.get(remoteKey);
        return new Response(stored?.body || null, {status:stored ? 200 : 404, headers:stored ? {'content-length':String(stored.body.length),'content-type':stored.headers['content-type']} : {}});
      }
      throw new Error('unexpected_request');
    };
    const migrated = await delivery.migrateFile({root, projectId, category:'step01-evidence-frame', localPath:image, mime:'image/png', revision:'analysis-r1', config, fetchImpl});
    assert.equal(migrated.status, 'verified');
    await delivery.migrateFile({root, projectId, category:'step01-evidence-frame', localPath:image, mime:'image/png', revision:'analysis-r1', config, fetchImpl});
    assert.equal(puts, 1, 'the verified manifest makes retry idempotent');
    const manifest = {schema_version:'niannian_web_media_manifest_v1', project_id:projectId, objects:{['step01-evidence-frame:' + evidence.sha256 + ':' + evidence.bytes]:{object_key:objectKey, sha256:evidence.sha256, bytes:evidence.bytes, mime:'image/png', category:'step01-evidence-frame', revision:'analysis-r1', status:'verified'}}};
    const manifestPath = path.join(root, 'v1', 'projects', projectId, 'manifest.json');
    await fsp.mkdir(path.dirname(manifestPath), {recursive:true});
    await fsp.writeFile(manifestPath, JSON.stringify(manifest));
    const redirect = await delivery.redirectForVerifiedFile({root, projectId, category:'step01-ledger-frame', localPath:image, mime:'image/png', revision:'analysis-r1', config});
    assert.ok(redirect?.url);
    await fsp.writeFile(image, Buffer.from('tampered'));
    assert.equal(await delivery.redirectForVerifiedFile({root, projectId, category:'step01-ledger-frame', localPath:image, mime:'image/png', revision:'analysis-r1', config}), null);
    process.stdout.write(JSON.stringify({ok:true, verified:['project/version-isolated COS object keys','five-minute exact-object GET signatures','only SHA-and-byte-verified manifest entries can receive a browser redirect','tampered local media loses COS eligibility']}) + '\n');
  } finally { await fsp.rm(root, {recursive:true, force:true}); }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
