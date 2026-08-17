'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const auth = require('./bridge/niannian_controller_auth');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function freePort() { return 32000 + Math.floor(Math.random() * 20000); }
async function waitForHealth(baseUrl) {
  for (let i=0;i<80;i+=1) {
    try { const response=await fetch(baseUrl+'/api/health'); if(response.ok)return; } catch {}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('controller_auth_test_server_timeout');
}
async function main() {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-controller-auth-'));
  let child;
  try {
    const token='focused-controller-token-'+crypto.randomBytes(24).toString('hex');
    const tokenHash=sha256(token);
    const tokenFile=path.join(root,'bridge-token.txt');
    const hashFile=path.join(root,'bridge-token.sha256');
    const dataRoot=path.join(root,'data');
    await fsp.writeFile(tokenFile,token,{mode:0o600});
    await fsp.writeFile(hashFile,tokenHash);
    assert.equal(auth.resolveBridgeTokenHash({NIANNIAN_BRIDGE_TOKEN_HASH_FILE:hashFile}),tokenHash);
    let linuxDefaultRead = false;
    assert.equal(auth.resolveBridgeTokenHash({},() => { linuxDefaultRead = true; return tokenHash; },'linux'),'');
    assert.equal(linuxDefaultRead,false);
    assert.equal(auth.resolveBridgeTokenHash({NIANNIAN_BRIDGE_TOKEN_HASH_FILE:hashFile},() => tokenHash,'linux'),tokenHash);
    assert.equal(auth.resolveBridgeTokenHash({BRIDGE_TOKEN_HASH:tokenHash,NIANNIAN_BRIDGE_TOKEN_HASH_FILE:path.join(root,'missing')}),tokenHash);
    assert.equal(auth.resolveBridgeTokenHash({BRIDGE_TOKEN_HASH:'invalid',NIANNIAN_BRIDGE_TOKEN_HASH_FILE:hashFile}),'');
    const childEnv=auth.buildStep01ControllerEnv({UNRELATED_SENTINEL:'present'},{NIANNIAN_BRIDGE_TOKEN_FILE:tokenFile,NIANNIAN_BRIDGE_TOKEN_HASH_FILE:hashFile});
    assert.equal(childEnv.NIANNIAN_BRIDGE_TOKEN_FILE,path.resolve(tokenFile));
    assert.equal(childEnv.NIANNIAN_BRIDGE_TOKEN_HASH_FILE,path.resolve(hashFile));
    assert.equal(childEnv.NIANNIAN_BRIDGE_TOKEN,undefined);
    assert.equal(childEnv.UNRELATED_SENTINEL,'present');

    const port=freePort();
    const baseUrl='http://127.0.0.1:'+port;
    child=spawn(process.execPath,[path.join(__dirname,'server.js')],{
      cwd:__dirname,
      env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_MEDIA_PREFLIGHT:'off',NIANNIAN_STEP01_AUTO_EXECUTE:'off',BRIDGE_TOKEN_HASH:'',NIANNIAN_BRIDGE_TOKEN_HASH_FILE:hashFile},
      stdio:['ignore','ignore','pipe']
    });
    let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
    await waitForHealth(baseUrl);
    const valid=await fetch(baseUrl+'/api/controller/jobs',{headers:{Authorization:'Bearer '+token,'X-NianNian-Controller-Id':'focused-auth-test'}});
    assert.equal(valid.status,200,stderr);
    const invalid=await fetch(baseUrl+'/api/controller/jobs',{headers:{Authorization:'Bearer invalid-token','X-NianNian-Controller-Id':'focused-auth-test'}});
    assert.equal(invalid.status,401);
    const missing=await fetch(baseUrl+'/api/controller/jobs',{headers:{'X-NianNian-Controller-Id':'focused-auth-test'}});
    assert.equal(missing.status,401);
    process.stdout.write(JSON.stringify({ok:true,verified:['hash-only file fallback authenticates controller','invalid and missing bearer fail closed','environment hash overrides file','invalid explicit hash does not fall back','child receives credential paths but no raw token']})+'\n');
  } finally {
    if(child&&!child.killed)child.kill();
    await fsp.rm(root,{recursive:true,force:true});
  }
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
