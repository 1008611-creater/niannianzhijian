const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {createRunningHubAdapter,ENDPOINTS} = require('./bridge/niannian_runninghub_image_adapter');

const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(2048)]);
function json(value,status=200){return{ok:status>=200&&status<300,status,async json(){return value;}};}

async function run(){
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'runninghub-adapter-'));
  const reference=path.join(temp,'reference.png');
  await fsp.writeFile(reference,png);
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    calls.push({url,method:init.method||'GET',body:init.body,headers:init.headers});
    if(url.endsWith(ENDPOINTS.upload))return json({data:{url:'https://media.example/reference.png'}});
    if(url.endsWith(ENDPOINTS.text))return json({data:{taskId:'rh-text-001'}});
    if(url.endsWith(ENDPOINTS.image))return json({taskId:'rh-image-001'});
    if(url.endsWith(ENDPOINTS.query))return json({status:'success',outputs:['https://media.example/output.png']});
    if(url==='https://media.example/output.png')return{ok:true,status:200,async arrayBuffer(){return png;}};
    throw new Error('unexpected:'+url);
  };
  const adapter=createRunningHubAdapter({baseUrl:'https://runninghub.example',apiKey:'test-only',fetchImpl});
  const textTask={prompt:'目标地区场景',prompt_sha256:'1'.repeat(64),aspect_ratio:'9:16'};
  const imageTask={prompt:'锁定人物身份与构图',prompt_sha256:'2'.repeat(64),aspect_ratio:'9:16',resolution:'4k'};
  assert.equal(adapter.dryRun(textTask).payload.resolution,'1k');
  assert.equal(adapter.dryRun({...textTask,resolution:'2k'}).payload.resolution,'2k');
  assert.throws(()=>adapter.dryRun({...textTask,resolution:'8k'}),error=>error.code==='RUNNINGHUB_RESOLUTION_INVALID');
  assert.equal((await adapter.submit(textTask,[])).taskId,'rh-text-001');
  assert.equal((await adapter.submit(imageTask,[reference])).taskId,'rh-image-001');
  const textBody=JSON.parse(calls.find(row=>row.url.endsWith(ENDPOINTS.text)).body);
  const imageBody=JSON.parse(calls.find(row=>row.url.endsWith(ENDPOINTS.image)).body);
  assert.equal(textBody.imageUrls,undefined);
  assert.equal(textBody.resolution,'1k');
  assert.deepEqual(imageBody.imageUrls,['https://media.example/reference.png']);
  assert.equal(imageBody.aspectRatio,'9:16');
  assert.equal(imageBody.resolution,'4k');
  const queried=await adapter.query('rh-image-001');
  assert.equal(queried.status,'completed');
  const downloaded=await adapter.download(queried.imageUrls[0]);
  assert.equal(downloaded.mime,'image/png');
  assert.equal(downloaded.bytes.length,png.length);
  assert.doesNotMatch(JSON.stringify(calls.map(row=>({url:row.url,method:row.method}))),/test-only/);
  await fsp.rm(temp,{recursive:true,force:true});
  process.stdout.write(JSON.stringify({ok:true,text_to_image:true,image_to_image_real_imageUrls:true,aspect_ratio:'9:16',default_resolution:'1k',explicit_resolutions:['2k','4k'],download_magic_checked:true})+'\n');
}

run().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
