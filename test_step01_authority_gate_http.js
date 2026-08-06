'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const authority=require('./bridge/niannian_step01_authority_revision');
const fixture=require('./test_step01_promotion_gate');
const project={id:'NN-20260715083045-8120F5',name:'Gate HTTP',ownerId:null,source:{sha256:'a'.repeat(64),bytes:145897161},sourceRevision:1};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url,options={}){const response=await fetch(url,options);return{response,body:await response.json().catch(()=>({}))};}
async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'step01-gate-http-'));
  const data=path.join(root,'data'),authorityRoot=path.join(root,'authority'),port=27000+crypto.randomInt(1000),base='http://127.0.0.1:'+port;let child;
  try{
    child=spawn(process.execPath,[path.join(__dirname,'server.js')],{cwd:__dirname,env:{...process.env,PORT:String(port),DATA_DIR:data,NIANNIAN_STEP01_AUTHORITY_REVISION_ROOT:authorityRoot,NIANNIAN_MEDIA_PREFLIGHT:'off',NIANNIAN_STEP01_AUTO_EXECUTE:'off'},stdio:'ignore'});
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await delay(50);}
    const registered=await request(base+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'gate-http-'+Date.now()+'@example.com',password:'correct-horse-battery-staple'})});
    assert.equal(registered.response.status,200);const cookie=registered.response.headers.get('set-cookie').split(';')[0];project.ownerId=registered.body.user.id;
    await fsp.mkdir(data,{recursive:true});await fsp.writeFile(path.join(data,'projects.json'),JSON.stringify([project]));
    const r1=await fixture.create(authorityRoot,'analysis-20260727-http-r1');await fixture.fixtures(authorityRoot,r1);
    const gate1=await request(base+'/api/projects/'+project.id+'/step01/authority-revisions/'+r1.revision_id+'/promotion-gates/reconcile',{method:'POST',headers:{Cookie:cookie}});assert.equal(gate1.response.status,200);assert.equal(gate1.body.revision.status,'ready_for_promotion');
    const p1=await request(base+'/api/projects/'+project.id+'/step01/authority-revisions/'+r1.revision_id+'/promote',{method:'POST',headers:{Cookie:cookie,'If-Match':authority.etag(null)}});assert.equal(p1.response.status,200);const e1=p1.response.headers.get('etag');
    const r2=await fixture.create(authorityRoot,'analysis-20260727-http-r2');await fixture.fixtures(authorityRoot,r2);
    assert.equal((await request(base+'/api/projects/'+project.id+'/step01/authority-revisions/'+r2.revision_id+'/promotion-gates/reconcile',{method:'POST',headers:{Cookie:cookie}})).response.status,200);
    const p2=await request(base+'/api/projects/'+project.id+'/step01/authority-revisions/'+r2.revision_id+'/promote',{method:'POST',headers:{Cookie:cookie,'If-Match':e1}});assert.equal(p2.response.status,200);const e2=p2.response.headers.get('etag');
    assert.equal((await request(base+'/api/projects/'+project.id+'/step01/authority/rollback',{method:'POST',headers:{Cookie:cookie,'If-Match':'W/'+e2}})).response.status,409);
    const rolled=await request(base+'/api/projects/'+project.id+'/step01/authority/rollback',{method:'POST',headers:{Cookie:cookie,'If-Match':e2}});assert.equal(rolled.response.status,200);assert.equal(rolled.body.current_authority.revision_id,r1.revision_id);
    console.log(JSON.stringify({ok:true,gate_route:true,promote_route:true,rollback_route:true,strong_etag:true}));
  }finally{if(child){child.kill();await delay(80);if(child.exitCode===null)child.kill('SIGKILL');}await fsp.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{process.stderr.write((error.stack||error.message)+'\n');process.exitCode=1;});
