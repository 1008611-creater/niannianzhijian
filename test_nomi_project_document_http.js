const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn} = require('child_process');

const root = __dirname;
let port;
let baseUrl;
const dataRoot = path.join(os.tmpdir(), `niannian-nomi-project-document-${process.pid}-${Date.now()}`);
let child;
let output = '';

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function headers(token, extra = {}) { return {cookie:`niannian_session=${token}`,accept:'application/json',...extra}; }

async function seed() {
  await fsp.mkdir(dataRoot, {recursive:true});
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const userA = {id:'USR-NOMI-DOC-A',email:'nomi-doc-a@example.test',status:'active'};
  const userB = {id:'USR-NOMI-DOC-B',email:'nomi-doc-b@example.test',status:'active'};
  await Promise.all([
    fsp.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([userA,userB])),
    fsp.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:hash('nomi-doc-token-a'),userId:userA.id,expiresAt},{tokenHash:hash('nomi-doc-token-b'),userId:userB.id,expiresAt}])),
    fsp.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([{id:'NN-NOMI-DOC-A',ownerId:userA.id,name:'项目文档测试',status:'draft'}])),
    fsp.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-documents.json'), JSON.stringify({'redraw:NN-NOMI-DOC-A':{ownerId:userA.id,projectId:'NN-NOMI-DOC-A',projectKind:'redraw',revision:9,document:{nodes:[{id:'legacy-only'}]}}})),
    fsp.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'website-idempotency.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]')
  ]);
}

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => probe.close(resolve));
  if (!port) throw new Error('unable to allocate a local test port');
  baseUrl = `http://127.0.0.1:${port}`;
}

async function waitForServer() {
  for (let retry = 0; retry < 100; retry += 1) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${output.slice(-1000)}`);
}

async function run() {
  await seed();
  await reservePort();
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { output += chunk.toString('utf8'); });
  await waitForServer();
  const endpoint = `${baseUrl}/api/studio/projects/NN-NOMI-DOC-A`;

  const emptyResponse = await fetch(endpoint, {headers:headers('nomi-doc-token-a',{'x-niannian-project-kind':'redraw'})});
  const empty = await emptyResponse.json();
  assert.equal(emptyResponse.status, 200);
  assert.equal(empty.revision, 0);
  assert.deepEqual(empty.document, {generationCanvas:{nodes:[],edges:[]}});
  assert.equal(emptyResponse.headers.get('etag'), '"nomi-rev-0"');

  const document = {
    workbenchDocument:{contentJson:{type:'doc',content:[]}},
    timeline:{tracks:[]},
    generationCanvas:{
      nodes:[{id:'h3-node',kind:'video',title:'H3',position:{x:0,y:0},meta:{modelKey:'niannian/minimax-h3',archetype:{id:'minimax-h3',modeId:'t2v'},unsafeUrl:'blob:do-not-persist'}}],
      edges:[],viewport:{x:0,y:0,zoom:1}
    }
  };
  const savedResponse = await fetch(endpoint, {method:'PUT',headers:headers('nomi-doc-token-a',{'x-niannian-project-kind':'redraw','content-type':'application/json','if-match':'"nomi-rev-0"'}),body:JSON.stringify({document})});
  const saved = await savedResponse.json();
  assert.equal(savedResponse.status, 200);
  assert.equal(saved.revision, 1);
  assert.equal(saved.document.generationCanvas.nodes[0].meta.unsafeUrl, '');
  assert.equal(savedResponse.headers.get('etag'), '"nomi-rev-1"');

  const staleResponse = await fetch(endpoint, {method:'PUT',headers:headers('nomi-doc-token-a',{'x-niannian-project-kind':'redraw','content-type':'application/json','if-match':'"nomi-rev-0"'}),body:JSON.stringify({document})});
  const stale = await staleResponse.json();
  assert.equal(staleResponse.status, 409);
  assert.equal(stale.code, 'CANVAS_REVISION_CONFLICT');

  const rereadResponse = await fetch(endpoint, {headers:headers('nomi-doc-token-a',{'x-niannian-project-kind':'redraw'})});
  const reread = await rereadResponse.json();
  assert.equal(reread.revision, 1);
  assert.equal(reread.document.generationCanvas.nodes[0].id, 'h3-node');
  const documents = JSON.parse(await fsp.readFile(path.join(dataRoot, 'canvas-documents.json'), 'utf8'));
  assert.equal(documents['redraw:NN-NOMI-DOC-A'].revision, 9);
  assert.equal(documents['nomi:redraw:NN-NOMI-DOC-A'].revision, 1);

  const foreign = await fetch(endpoint, {headers:headers('nomi-doc-token-b',{'x-niannian-project-kind':'redraw'})});
  assert.equal(foreign.status, 404);
  console.log('NOMI_PROJECT_DOCUMENT_HTTP_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && !child.killed) child.kill();
  await fsp.rm(dataRoot, {recursive:true,force:true});
});
