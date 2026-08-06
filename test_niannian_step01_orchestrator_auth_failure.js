'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const fsp=fs.promises;
const http=require('http');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');

function run(script,args,env){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{cwd:__dirname,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});}
async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});}
async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-step01-orchestrator-auth-'));
  const server=http.createServer((request,response)=>{response.writeHead(401,{'content-type':'application/json'});response.end(JSON.stringify({code:'CONTROLLER_AUTH_REQUIRED',error:'控制器凭据无效'}));});
  try{
    const port=await listen(server),projectId='NN-TEST-CONTROLLER-AUTH-001',script=path.join(__dirname,'bridge','niannian_step01_orchestrator.js');
    const tokenFile=path.join(root,'bridge-token.txt');await fsp.writeFile(tokenFile,'x'.repeat(64));
    const invalidResult=path.join(root,'invalid-result.json');
    const invalid=await run(script,[projectId],{NIANNIAN_BASE_URL:'http://127.0.0.1:'+port,NIANNIAN_BRIDGE_TOKEN_FILE:tokenFile,NIANNIAN_BRIDGE_STATE_DIR:path.join(root,'invalid-state'),NIANNIAN_STEP01_RESULT_PATH:invalidResult});
    assert.equal(invalid.code,1);
    const invalidReceipt=JSON.parse(await fsp.readFile(invalidResult,'utf8'));
    assert.equal(invalidReceipt.status,'failed');
    assert.equal(invalidReceipt.blocker_code,'CONTROLLER_AUTH_REQUIRED');
    assert.equal(invalidReceipt.controller_http_status,401);
    assert.equal(invalidReceipt.blocker_class,'infrastructure_failure');
    assert.equal(invalidReceipt.provider_submission_requested,false);
    assert.equal(invalidReceipt.package_send_requested,false);

    const missingResult=path.join(root,'missing-result.json');
    const missing=await run(script,[projectId],{NIANNIAN_BASE_URL:'http://127.0.0.1:'+port,NIANNIAN_BRIDGE_TOKEN:'',NIANNIAN_BRIDGE_TOKEN_FILE:path.join(root,'missing-token.txt'),NIANNIAN_BRIDGE_STATE_DIR:path.join(root,'missing-state'),NIANNIAN_STEP01_RESULT_PATH:missingResult});
    assert.equal(missing.code,1);
    const missingReceipt=JSON.parse(await fsp.readFile(missingResult,'utf8'));
    assert.equal(missingReceipt.status,'failed');
    assert.equal(missingReceipt.blocker,'bridge_token_missing_or_short');
    assert.equal(missingReceipt.blocker_class,'infrastructure_failure');
    assert.equal(JSON.stringify(invalidReceipt).includes('x'.repeat(32)),false);
    process.stdout.write(JSON.stringify({ok:true,verified:['invalid controller bearer persists typed HTTP auth failure','missing token persists typed infrastructure failure','no token appears in result receipt','zero provider/package side effect']})+'\n');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await fsp.rm(root,{recursive:true,force:true});
  }
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
