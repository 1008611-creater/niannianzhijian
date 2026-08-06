'use strict';

const fs=require('fs');
const fsp=fs.promises;
const http=require('http');
const os=require('os');
const path=require('path');
const gate=require('../bridge/niannian_video_batch_gate');
const {createHttpHandler}=require('../bridge/niannian_video_batch_http');

const root=path.resolve(__dirname,'..');
const port=Number(process.env.PORT||4198);
const host='127.0.0.1';
const dataRoot=path.resolve(process.env.VIDEO_BATCH_CANDIDATE_DATA||path.join(os.tmpdir(),'niannian-video-batch-candidate'));
const fixturePath=path.join(root,'docs','agent-team','video-batch-cost-gate','fixtures','minimal-first-video-batch.json');
const fixedProject={id:'project-001',ownerId:'owner-001'};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};

async function main(){
  const fixture=JSON.parse(await fsp.readFile(fixturePath,'utf8'));
  const adapter=gate.createFixtureAdapter();
  const service=gate.createService({root:dataRoot,adapter});
  await service.lockAndPreflight({projectId:fixedProject.id,ownerId:fixedProject.ownerId,input:fixture,now:Date.now()});
  const handler=createHttpHandler({service,authenticate:async()=>({id:fixedProject.ownerId}),resolveProject:async id=>id===fixedProject.id?fixedProject:null});
  const allowed=new Map([
    ['/video-batch-candidate',path.join(root,'video-batch-gate','candidate.html')],
    ['/video-batch-gate/video-batch-panel.css',path.join(root,'video-batch-gate','video-batch-panel.css')],
    ['/video-batch-gate/video-batch-panel.js',path.join(root,'video-batch-gate','video-batch-panel.js')]
  ]);
  const server=http.createServer(async(request,response)=>{
    const pathname=new URL(request.url,'http://127.0.0.1').pathname;
    if(await handler(request,response,pathname))return;
    if(pathname==='/health'){response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({status:'ok',fixture_only:true,provider_submit:false}));return;}
    const file=allowed.get(pathname);
    if(!file){response.writeHead(404);response.end('Not found');return;}
    const bytes=await fsp.readFile(file);response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});response.end(bytes);
  });
  server.listen(port,host,()=>process.stdout.write('VIDEO_BATCH_CANDIDATE_READY http://'+host+':'+port+'/video-batch-candidate\n'));
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
